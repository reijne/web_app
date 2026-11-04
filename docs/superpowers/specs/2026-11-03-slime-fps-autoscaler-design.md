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
`PIXEL_SHARE` has done its job by this point -- it only decided which scale step to
pick -- so particles get the entire remainder of the budget, not merely the
`1 - PIXEL_SHARE` slice. Enforce a hard floor of 2,000 particles so the population
can never collapse to nothing again.

Both smoothing stages are deliberately asymmetric, because a rising cost threatens
the 60fps floor while a falling cost is only an opportunity:

- EMA alpha is 0.5 when a measured cost rises, 0.1 when it falls. A single symmetric
  alpha of 0.1 would lag a thermal throttle by roughly twenty seconds and spend all
  of it below 60fps.
- Per-window change is capped at +25% when growing and -50% when shrinking.

A window is also required to contain at least 10 frames before it yields a sample.
That keeps a handful of frames from defining a cost, and it covers the gap left by a
pause or a hidden tab, where the window has aged but almost nothing was measured.

Re-calibration is triggered only by a `sceneSize` change (resize or fullscreen),
where the trail field is already reset. This is why resolution is locked after
calibration: changing it mid-run requires reallocating `trailsRef`, `texDataRef` and
the `DataTexture`, which wipes the trail field and produces a visible pop.

### Expected outcome

Replaying the controller against the measured cost constants (4.20 ns/px,
74 ns/particle):

| Display          | Render size | Slimes at 60fps | Settles |
| ---------------- | ----------- | --------------- | ------- |
| MacBook 1512x982 | 1285x834    | ~96,800         | ~3s     |
| 2K 2560x1440     | 1343x755    | ~100,100        | ~3s     |
| 4K 3840x2160     | 1344x756    | ~100,000        | ~3s     |

Steady-state work lands at 11.66-11.67ms against the 11.67ms budget in every case,
inside a 16.67ms frame. Against the current behaviour, which collapses to the
100-particle floor, and against the present hard cap of 25,000, this is roughly 4x
more particles.

Injecting a 1.6x slowdown at t=20s (standing in for thermal throttling) drops the
population from ~96,800 to ~37,700 and is back inside budget within about four
seconds, peaking at 12.19ms of work.

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

## Known characteristics

**144Hz displays.** The controller targets 11.67ms of work regardless of refresh
rate. On a 144Hz panel the vsync interval is 6.94ms, so the simulation presents on
every second vsync at roughly 72fps. If a frame drifts past 13.89ms it presents on
the third instead, briefly showing 48fps. This is well above the 60fps floor that was
asked for and far better than the present collapse, but it is judder that a
refresh-aware budget would avoid. Deliberately not done here: targeting a measured
refresh rate is what root cause 3 was. `BUDGET_SAFETY` is the single knob if this
proves annoying in practice.

**Resolution is measured at whatever scale happens to be active.** Cost per pixel is
flat across buffer sizes in the benchmark (4.20, 4.25 and 4.17 ns/px at 2.07M, 1.48M
and 0.52M pixels), so solving for a different scale than the one measured is sound.

## Follow-up round, measured in a real browser

The first implementation was tuned against a Node benchmark that did not faithfully
model the real code. Three corrections came out of measuring in Chromium instead.

**The 1920x1080 cap was the blurry upscale, not the autoscaler.** At a 2560x1440
viewport the render buffer came out at exactly 1920x1071, pinned by
`MAX_RENDER_WIDTH`, and CSS-upscaled 1.26x. The controller had budget for native --
pixels were using only 4.3ms of 11.67ms. The cap is a fixed guess that the measured
controller supersedes, so it is removed; `calcRenderSize` now clamps only to
`MIN_RENDER_WIDTH` and native. `PIXEL_SHARE` moves from 0.4 to 0.6, biasing toward
sharpness, because an upscaled field reads as blurry and that matters more than raw
count.

**Fusing the two particle passes was worth far less than the microbenchmark claimed.**
In isolation, merging `updateSlimes` and `simulateTrailFollowing` into one loop
measured 77.7ns -> 43.2ns per particle, a 1.8x win. In the running simulation the
cost barely moved, from ~87ns to ~72ns, because the loop is bound by scattered reads
into a multi-megabyte trail field rather than by array traversal or trig. The fusion
is kept -- it is strictly less work and simpler -- but it is not the lever.

**The texture upload was the lever.** The trail field is now a single-channel R8
texture coloured by a fragment shader rather than an RGBA buffer composed in JS.
That removes the per-pixel 32-bit write, removes the 256-entry hue LUT and its
rebuild, and cuts texture bandwidth from 13.0 MB/frame to 3.2 MB/frame at 2411x1345.
The GLSL `hsl2rgb` is the same conversion as `hslToRgb` in `utils/colors`, so the
palette is unchanged.

Measured at a 2560x1440 viewport, scene 2411x1345, through all three changes:

| State                        | Render buffer | Upscale | Pixel ms | Slimes |
| ---------------------------- | ------------- | ------- | -------- | ------ |
| Shipped first round          | 1920x1071     | 1.26x   | 4.32     | 86,100 |
| Cap removed, PIXEL_SHARE 0.6 | 2411x1345     | 1.0     | 8.08     | 39,500 |
| Plus R8 texture and shader   | 2411x1345     | 1.0     | 6.15     | 75,000 |

Native resolution and roughly 75k slimes, against a capped, upscaled 1920x1071 at
86k. A resize now carries the trail field and the particles across rather than
reseeding: `resizeWorld` nearest-neighbour resamples the field and rescales particle
coordinates, which fixes a regression where toggling fullscreen restarted the
simulation.

The particle count, render size and measured fps are now shown on screen behind the
existing `s` toggle, so the controller's state can be read off the running
simulation rather than inferred.

## Third round: the budget itself was wrong

A reading from the deployed site -- `13,300 slimes, 990x568, 81 fps` -- showed two
further faults, both in this design rather than in the old code.

**A quarter of the frame was being thrown away.** `BUDGET_SAFETY = 0.7` reserved 5ms
of every frame for overhead that was never measured. The reading showed 81fps against
an 11.67ms work budget, so the real overhead was about 0.7ms. The reserve is now
measured: frame-to-frame delta minus work time, sampled only while the simulation is
actually filling a frame, since below vsync the delta is idle time and would read as
enormous overhead. The budget became ~14.7ms instead of 11.67ms.

**Resolution was decided on the worst data available and then frozen.** Calibration
measured the opening two seconds, which contain shader compilation, the first texture
upload and JIT warm-up. Measured directly, the first window reads roughly 50% high
(8.67 vs 5.75 ns/px settled) and on a slower machine far worse, which is how a 990x568
render size got chosen. Three changes:

- The first 1.2s / 60 frames are discarded rather than averaged in.
- Resolution is no longer locked for the session. It is re-solved each tracking
  window, with a 4s cooldown and a requirement that a step up fits with 15% to spare.
  This is only safe because `resizeWorld` now carries the field across a resize.
- Calibration starts from a prior (`ASSUMED_COST_PER_PX`) instead of always at native,
  so a 4K display does not spend its calibration window at 22ms frames.

`PIXEL_SHARE` becomes `MAX_PIXEL_SHARE = 0.75`, a ceiling rather than a target.
Resolution now has priority and steps down only when pixels would leave nothing for
slimes, which is the stated preference: native resolution first, then as many slimes
as fit, holding 60fps.

Measured in Chromium, all at native resolution with no upscale:

| Viewport  | Scene     | Slimes  | fps   | Work / budget |
| --------- | --------- | ------- | ----- | ------------- |
| 1500x900  | 1351x805  | 180,900 | 68-84 | 14.5 / 14.67  |
| 2560x1440 | 2411x1345 | 116,100 | 73-81 | 13.6 / 14.67  |
| 3840x2160 | 3691x2065 | 62,800  | 66-71 | 14.1 / 14.67  |

The self-correcting path was verified by forcing a cold 4K load: the controller
stepped 1.0 -> 0.7 -> 0.6 while costs were still inflated, then back up to 0.7 once
they settled, and held. Under the previous design it would have stayed at 0.6 for the
session. `PARTICLE_CEILING` rises from 250,000 to 500,000, since the budget now
reaches it.

## Fourth round: a biased estimator, and motion tied to frame rate

A reading of `2,000 slimes, 1054x541, 130 fps` is self-contradictory: both floors
reached while half the frame budget sat unused. Three faults, all introduced by this
design rather than inherited.

**The cost estimator was biased upward.** `COST_EMA_ALPHA_RISING = 0.5` against
`FALLING = 0.1` was meant to defend the frame rate by reacting quickly to a rising
cost. An asymmetric filter is not an unbiased estimator: given noise around a steady
value it ratchets toward the upper tail and stays there. Over a session both
`costPerPx` and `costPerParticle` inflate without bound, so the controller believes
the budget is full, retreats to the particle floor and a low resolution, and runs at
130fps doing almost nothing. The filter is now symmetric at alpha 0.2. Defending the
frame rate belongs to the control loop -- which is still asymmetric, and correctly
so, since the step limits are control and not estimation.

**Motion was tied to frame rate.** Movement is defined per step (`p.x += ca * speed`)
with no reference to elapsed time, so the slimes moved as fast as the machine
happened to be drawing. During the opening seconds, at a small probe population, that
meant several hundred frames per second and visibly frantic motion; as the population
grew the rate fell to 60-70 and the motion abruptly slowed. Raising the budget in the
previous round widened that range and made it far more obvious. The simulation now
runs on a fixed timestep of one step per sixtieth of a second, accumulated rather
than thresholded so the long-run rate is exactly 60 on any refresh rate -- a plain
`elapsed >= 16.67ms` gate misfires on a 144Hz panel, where ticks land at 6.9, 13.9
and 20.8ms. Only the spacing jitters, and spacing is irrelevant when movement is
defined per step. Measured step rate held at 58-60 across every configuration tested.

**Resolution was being traded away for population.** It is now floored at
`TARGET_MIN_PIXELS` (1920x1080) and never goes below it, whatever that costs in frame
rate; below roughly that density the individual cells read as pixels, which defeats
the premise that the image comes from many slimes blending. The order is now
resolution, then population, then frame rate: resolution may claim the whole budget
except what `RESOLUTION_RESERVE_PARTICLES` (60,000) needs. Reserving only
`PARTICLE_FLOOR` was tried first and is correct by the priority order but awful to
watch -- a 4K display spent 24 seconds strangling the population to 26,000 before
conceding a single resolution step.

`PARTICLE_FLOOR` rises from 2,000 to 25,000: a population too sparse to look like
anything is not worth holding 60fps for, and the frame rate is allowed to fall toward
30 instead. Population is now always eased toward its target, including the first
solve after calibration, so density blooms in rather than popping.

Measured in Chromium:

| Viewport  | Render    | Slimes   | Steps/sec | Work / budget |
| --------- | --------- | -------- | --------- | ------------- |
| 2560x1440 | 2411x1345 | ~130,000 | 60        | 14.2 / 14.67  |
| 3840x2160 | 3137x1755 | ~86,000  | 58-60     | 15.0 / 14.67  |

The `s` readout now reports steps per second, which should sit at 60 and stay there.
A varying number means the machine cannot keep up, not that there is spare headroom.

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
