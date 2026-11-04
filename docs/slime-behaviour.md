# Slime simulation: behaviour contract

What the simulation must do, and the checks that catch it when it stops doing them.
Every item here is something that has actually broken at least once.

Code: `src/Projects/Slime/index.tsx`, with the maths in `src/Projects/Slime/simulation.ts`.
Tests: `src/Projects/Slime/simulation.test.ts`. Design history:
`docs/superpowers/specs/2026-11-03-slime-fps-autoscaler-design.md`.

`npm run deploy` runs the tests first and stops if any fail, so nothing below needs
remembering to run. The checklist at the end covers only what the tests cannot see.

## Invariants

**1. Motion speed never changes.** Movement is defined per simulation step, not per
second, so the step rate must stay at 60/s whatever the machine is doing. If the step
rate follows the frame rate, the slimes race during the sparse opening seconds and
lurch the moment the population grows. The accumulator in the render loop exists for
this; a plain `elapsed >= 16.67ms` gate is not good enough, because a 144Hz panel
ticks at 6.9, 13.9 and 20.8ms and the first tick past that threshold is already 25%
late.

**2. Resizing never distorts.** Both axes take one factor, `scale / prevScale`. Per
axis factors (`w/prevW`, `h/prevH`) are equal for a pure resolution change and
*unequal* the moment the window changes shape, which stretches the whole simulation.
Half a screen to fullscreen is the case that exposes it.

**3. Resizing never resets.** Toggling fullscreen keeps the trail field and the
particles. `resizeWorld` resamples the field and moves the particles with it. A reseed
is obvious on screen: the pattern restarts as a small disc in the centre.

**4. Resolution never drops below `TARGET_MIN_PIXELS` (1920x1080).** Below roughly
that, cells read as pixels and the image stops coming from many slimes blending
together, which is the whole point. Resolution outranks population, and population
outranks frame rate: if the machine cannot hold 60fps at minimum resolution and
`PARTICLE_FLOOR` slimes, the frame rate is what gives.

**5. The controller uses the whole frame.** Reaching a floor while the frame budget
sits half empty is always a bug, not a tuning problem. It means the cost estimates
have drifted above the truth.

**6. Cost estimation is unbiased.** The EMA must be symmetric. Reacting faster to a
rising cost than a falling one looks like prudence but is a biased estimator: with
noise around a steady value it ratchets toward the upper tail and stays. Asymmetry
belongs in the control loop (the grow/shrink step limits), never in the estimator.

**7. Nothing is decided once and frozen.** Resolution is re-solved every tracking
window. The opening seconds contain shader compilation, the first texture upload and
JIT warm-up, and measure roughly 50% high; anything locked on that reading stays wrong
for the session.

## What the tests cover

`simulation.ts` holds the maths with no React, Three.js or DOM in it, precisely so
invariants 1, 2, 4, 5 and 6 can be asserted. Each test names the symptom as it
appeared on screen, because that is how the next one will be reported too. Several
also pin the *old, broken* behaviour alongside the fix -- the naive `elapsed >=
16.67ms` gate yielding 48 steps/sec on 144Hz, and the asymmetric filter settling
about 12% above the truth -- so the tests fail if anyone reintroduces either.

One caveat worth knowing if a test ever needs changing: an unbiased EMA still has a
standard deviation of roughly `truth * noise * sqrt(a / (2 - a))` around its mean, so
asserting on a single final reading proves nothing about bias. The bias test averages
over the tail of the run instead. The first version of that test failed for exactly
this reason, on a correct implementation.

Invariant 3 (resizing never resets) and the feel of the thing are not covered, and
cannot cheaply be. That is what the checklist below is for.

## Before deploying

The tests run automatically. These are the ones that need eyes: run the simulation
for about 30 seconds and press `s` for the readout
(`slimes . render size . steps per second`).

- [ ] Steps per second reads 60 and stays there. A varying number means the machine
      cannot keep up, not that there is headroom going spare.
- [ ] Render size is at or above 1920x1080, unless the window itself is smaller.
- [ ] Slime count climbs and settles. It must not drift steadily downward, and it must
      not sit at `PARTICLE_FLOOR` while steps per second is comfortably above 60.
- [ ] Toggle fullscreen (`f`). The pattern carries across: same cell sizes, not
      stretched, not restarted from the centre.
- [ ] Resize to a clearly different *shape*, not just a different size. Cells stay
      round. This is the check that catches aspect-ratio bugs; a same-shape resize
      will not.
- [ ] Motion speed looks the same at second 2 as at second 30.

## Known, accepted

- **144Hz panels** present at roughly 72fps rather than 60, since the budget targets
  work time and not a refresh rate. Tracking a measured refresh rate is what caused
  the original collapse, so it is deliberately not done.
- **Changing resolution shifts the pattern's feature size.** `sensorDistance` and
  `moveSpeed` are in buffer pixels, so a resolution step changes what they mean in
  screen terms and the pattern re-equilibrates. This is the jump still visible when
  the canvas rescales. Fixing it means scaling those two with the resize factor, which
  collides with the evolver's min/max clamps; not yet attempted.
- **Pixel work is still over a third of the budget** at 2K. That ceiling is what a
  full GPU rewrite removes; the trail field already lives in a texture, so the path is
  open.
