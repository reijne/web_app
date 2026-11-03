# Slime Simulation: Deterministic 60fps Autoscaler

Date: 2026-11-03
Status: Approved, ready for implementation
File touched: `src/Projects/Slime/index.tsx`

## Problem

The slime simulation's automatic particle scaling collapses to its minimum on every
display tested (MacBook ProMotion 120Hz, external monitors, a 2K 144Hz PC). The
simulation ends up running a few hundred particles instead of tens of thousands.

## Root causes

### 1. The controller tunes the wrong knob

The autoscaler only adjusts particle count. But the dominant per-frame cost is
per-pixel and independent of particle count:

- `decayAndBlit` is an `O(W*H)` JavaScript loop run every frame.
- The `THREE.DataTexture` is re-uploaded in full every frame (`W*H*4` bytes).

Measured (Node 22, same loop shapes as the real code):

```
=== 1920x1080 (2.07M px) ===
decayAndBlit (current, 4x unrolled)        8.70 ms/frame
decayAndBlit (simple loop, pre-f79568b)   13.91 ms/frame
particles move+sense N=25000               2.06 ms/frame
particles move+sense N=100000              7.44 ms/frame

=== 1512x982 (1.48M px) ===
decayAndBlit (current, 4x unrolled)        6.29 ms/frame
particles move+sense N=25000               2.15 ms/frame

=== 960x540 (0.52M px) ===
decayAndBlit (current, 4x unrolled)        2.17 ms/frame
particles move+sense N=25000               1.82 ms/frame
particles move+sense N=100000              6.36 ms/frame
```

At 1920x1080 the pixel loop alone costs 8.70ms. The 120fps frame budget is 8.33ms.
The fixed cost exceeds the entire budget with zero particles, so the controller
shrinks the population forever and never recovers.

Two secondary facts from the same measurements:

- The 4x unroll introduced in commit `f79568b` is a genuine improvement
  (8.70ms vs 13.91ms). It is not the regression.
- Particle cost is roughly 70ns each and barely varies with resolution. It is
  bound by `Math.cos`/`Math.sin`/`Math.random`, not by cache misses. Resolution is
  therefore a pure pixel-cost knob that does not affect particle cost.

### 2. Stale closure on the FPS bounds

The render-loop effect has dependencies `[clickBehavior, isRunning, sceneSize, reset]`
but its body reads the `fpsMin` and `fpsMax` state values. `detectDisplayHz` resolves
roughly 600ms after mount, normally after `ResizeObserver` has already set `sceneSize`.
The loop therefore keeps the initial 55/59 bounds until some unrelated event
(resize, fullscreen, pause, reset) re-runs the effect, at which point it suddenly
adopts the 100/115 bounds and collapses. This makes the failure non-deterministic
and explains why the behaviour appeared to change over time.

### 3. The 120Hz bucket is unreachable

`bucketHz` maps any measured rate at or above 100 to the 120 bucket, which sets the
target band to 100-115fps. That is an 8.33ms budget, which root cause 1 shows is
impossible with a CPU-side full-resolution blit. A 144Hz display lands in the same
bucket, which is why the PC collapses too.

### 4. Frame rate is a saturating signal

`ensureFpsLimits` counts frames per second and compares against a band. Because
`requestAnimationFrame` is vsync-locked, a frame using 4ms of work and one using
16ms of work both report 60fps. The controller can only detect failure, never
headroom, so it gropes upward at +10% per second until it overshoots, then
oscillates. Measuring the actual work time makes the signal continuous.

### Not a cause

The 1920x1080 render cap added in `f79568b` did not cause the regression. On a
MacBook's ~1512x982 logical viewport the cap is a no-op (scale = 1). On a larger
external display it strictly reduces work compared to the previous behaviour.

## Design

### Fixed 60fps target

Remove `detectDisplayHz`, `bucketHz`, `SIXTY`, `ONE_TWENTY`, and the `fpsMin` /
`fpsMax` state. A single constant target of 60fps (16.67ms) replaces them.

This removes root causes 2 and 3 structurally rather than patching them: a stale
closure cannot exist if there is no state to go stale, and the 120 bucket cannot
fire if there is no bucket. On 120Hz and 144Hz displays the simulation runs at 60
and presents on alternate vsyncs.

### Measure work, not frame rate

Instrument the simulation block with `performance.now()` and split the measurement
in two:

- `tPix` covers `decayAndBlit` and the texture upload. Linear in `W*H`.
- `tPart` covers `updateSlimes` and `simulateTrailFollowing`. Linear in `N`.

Divide each by its extent to get `costPerPx` and `costPerParticle`, each smoothed
with an exponential moving average (alpha = 0.1). These two numbers drive the whole
controller.

### Solve the budget rather than step toward it

```
BUDGET      = 16.67 * 0.70 = 11.7ms   (30% headroom for GC, compositor, browser)
PIXEL_SHARE = 0.40

pixels = (BUDGET * PIXEL_SHARE)       / costPerPx
N      = (BUDGET * (1 - PIXEL_SHARE)) / costPerParticle
```

Both quantities are solved directly from the measured costs instead of being stepped
by a fixed percentage. Convergence takes about two seconds rather than the roughly
sixty seconds the +10%/s ramp needs to climb from the floor.

### Two controller phases

**Calibrate.** For the first ~2 seconds after mount or after a `sceneSize` change,
run at scale 1.0 with a fixed probe population of 5,000 particles and collect
`costPerPx` and `costPerParticle`. Solve for `pixels`, snap to the nearest discrete
scale in `[1.0, 0.85, 0.7, 0.6, 0.5, 0.4]`, and clamp so that render width never
falls below 640px and never exceeds the existing 1920x1080 cap. Reallocate buffers
once, then lock the resolution.

**Track.** With resolution frozen, re-solve `N` once per second from the live EMA.
Clamp each change to +/-25% so that thermal throttling produces a glide rather than
a jump. Enforce a hard floor of 2,000 particles so the population can never collapse
to nothing again.

Re-calibration is triggered only by a `sceneSize` change (resize or fullscreen),
where the trail field is already reset. This is why resolution is locked after
calibration: changing it mid-run requires reallocating `trailsRef`, `texDataRef` and
the `DataTexture`, which wipes the trail field and produces a visible pop.

### Expected outcome

| Display            | Locked scale | Render size | Slimes at 60fps |
| ------------------ | ------------ | ----------- | --------------- |
| MacBook 1512x982   | 1.0          | 1512x982    | ~55k            |
| 2K 2560x1440       | 0.7          | 1792x1008   | ~50k            |
| 4K (1920x1080 cap) | 0.6          | 1152x648    | ~110k           |

Against the current behaviour, which collapses to the 100-particle floor. The present
hard cap is 25,000, so this is roughly 2-4x more particles even at full sharpness.

## Structural cleanups

These are in scope because the same code is being rewritten:

- `slimes.max` becomes a real ceiling (250,000). Only `value` moves. Today
  `resizeParticlesImmediate` assigns `max = value` on every call, which makes the
  growth gate `value === max` permanently true and strips `max` of meaning. That gate
  is removed.
- `resizeParticlesImmediate` no longer calls `setSlimeUI`. The particle count is not
  rendered except behind the `s` toggle, so the once-per-second React re-render is
  wasted work. The toggle reads the ref directly instead.
- Controller state moves into a `useRef` so it survives the effect re-runs that caused
  the original stale-closure bug.

## Out of scope

- **120fps.** Only reachable at 960x540 or below on the CPU path. Revisit after the
  GPU rewrite, where it is close to free.
- **GPU rewrite (WebGL2 GPGPU).** The real answer to "as much slime as possible", and
  the subject of a separate spec. The controller designed here (work-time measurement,
  solved allocation, hysteresis) carries over unchanged.
- **Further `decayAndBlit` optimisation.** The existing 4x unroll is already the fast
  version. No remaining CPU win justifies the risk.

## Verification

1. `npx tsc --noEmit` and `npx eslint` pass.
2. `npm run build-with-hash` succeeds.
3. Manual: open the simulation on the MacBook built-in display. Within ~3 seconds the
   particle count (press `s`) settles in the tens of thousands and stays there. It must
   not drift monotonically downward.
4. Manual: enter fullscreen (`f`). Re-calibration runs once, then the count settles
   again and holds.
5. Manual: on an external 2K display, confirm the count settles rather than collapsing
   to the floor.
