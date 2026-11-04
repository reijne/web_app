/**
 * Each test here corresponds to a regression that actually shipped. The headings
 * name the symptom as it appeared on screen, because that is how the next one will
 * be reported too. See `docs/slime-behaviour.md` for the full contract.
 */
import {
    advanceStepAccumulator,
    calcRenderSize,
    calcResizeMapping,
    easeParticleCount,
    FRAME_BUDGET_MS,
    PARTICLE_CEILING,
    PARTICLE_FLOOR,
    renderScaleFloor,
    SIM_STEP_MS,
    smoothCost,
    solveParticleTarget,
    solvePixelLimit,
    solveRenderScale,
    solveWorkBudget,
    TARGET_MIN_PIXELS,
} from './simulation';

describe('resize keeps the aspect ratio', () => {
    // Symptom: going from half a screen to fullscreen stretched every cell
    // horizontally. Cause: x scaled by w/prevW and y by h/prevH, independently.
    it('uses one factor for both axes when the window changes shape', () => {
        const prev = { w: 760, h: 982, scale: 1 };
        const { factor, offX, offY } = calcResizeMapping(prev, { w: 1512, h: 982, scale: 1 });

        // The giveaway: per-axis factors here would be 1.99 and 1.0.
        expect(factor).toBe(1);
        // Old content centred, so the new width is empty ground either side.
        expect(offX).toBe(376);
        expect(offY).toBe(0);
    });

    it('matches the per-axis factor for a pure resolution change', () => {
        // Same display, resolution stepping 1.0 -> 0.85. Here the old per-axis maths
        // happened to be right, and the new maths must agree with it.
        const prev = { w: 2000, h: 1000, scale: 1 };
        const next = { w: 1700, h: 850, scale: 0.85 };
        const { factor, offX, offY } = calcResizeMapping(prev, next);

        expect(factor).toBeCloseTo(next.w / prev.w, 10);
        expect(factor).toBeCloseTo(next.h / prev.h, 10);
        // Content keeps its size on screen, so there is nothing to centre.
        expect(offX).toBe(0);
        expect(offY).toBe(0);
    });

    it('is a no-op on the very first sizing', () => {
        expect(calcResizeMapping(null, { w: 800, h: 600, scale: 1 })).toEqual({
            factor: 1,
            offX: 0,
            offY: 0,
        });
    });
});

describe('fixed timestep holds 60 steps per second', () => {
    // Symptom: the slimes raced during the sparse opening seconds then lurched as
    // the population grew. Movement is per step, so the step rate must not follow
    // the frame rate.
    const countSteps = (refreshHz: number, seconds = 10) => {
        const dt = 1000 / refreshHz;
        let acc = 0;
        let steps = 0;
        for (let i = 0; i < refreshHz * seconds; i++) {
            const d = advanceStepAccumulator(acc, dt);
            acc = d.accumulator;
            if (d.shouldStep) {
                steps++;
            }
        }
        return steps / seconds;
    };

    it.each([60, 120, 144, 165, 240])('holds ~60 steps/sec on a %iHz display', (hz) => {
        expect(countSteps(hz)).toBeGreaterThan(59);
        expect(countSteps(hz)).toBeLessThanOrEqual(60.5);
    });

    it('would have caught the naive threshold gate on 144Hz', () => {
        // A plain `elapsed >= SIM_STEP_MS` gate fires on the first tick past the
        // threshold. At 144Hz those land at 6.9, 13.9, 20.8ms, so it yields 48/sec.
        const dt = 1000 / 144;
        let since = 0;
        let steps = 0;
        for (let i = 0; i < 144 * 10; i++) {
            since += dt;
            if (since >= SIM_STEP_MS) {
                since = 0;
                steps++;
            }
        }
        expect(steps / 10).toBeLessThan(50); // the bug, documented
        expect(countSteps(144)).toBeGreaterThan(59); // the accumulator, fixed
    });

    it('never runs more than one step per frame after a stall', () => {
        // A long stall must not bank time and fire a burst to catch up.
        const d = advanceStepAccumulator(0, 5000);
        expect(d.shouldStep).toBe(true);
        expect(d.accumulator).toBeLessThanOrEqual(SIM_STEP_MS);
    });
});

describe('cost smoothing is unbiased', () => {
    // Symptom: 2,000 slimes at 130fps -- both floors reached with half the frame
    // budget unused. Cause: an asymmetric EMA (fast up, slow down) is a biased
    // estimator and ratchets toward the upper tail of the noise.
    const feedNoise = (
        smooth: (prev: number, next: number, samples: number) => number,
        truth: number
    ) => {
        // Deterministic pseudo-noise, +/-30% around the truth, zero mean.
        //
        // Averaged over the tail, not sampled at the end: an unbiased EMA still has
        // a standard deviation of truth * 0.3 * sqrt(a / (2 - a)) around the mean, so
        // any single reading swings by ~10% and says nothing about bias either way.
        let seed = 42;
        let value = 0;
        let sum = 0;
        let counted = 0;
        for (let i = 0; i < 4000; i++) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            const noise = (seed / 2147483648) * 0.6 - 0.3;
            value = smooth(value, truth * (1 + noise), i);
            if (i >= 2000) {
                sum += value;
                counted++;
            }
        }
        return sum / counted;
    };

    it('converges to the mean of a noisy signal', () => {
        const settled = feedNoise(smoothCost, 100);
        expect(settled).toBeGreaterThan(97);
        expect(settled).toBeLessThan(103);
    });

    it('would have caught the asymmetric filter that shipped', () => {
        const biased = (prev: number, next: number, samples: number) =>
            samples === 0 ? next : prev + (next - prev) * (next > prev ? 0.5 : 0.1);

        // Same signal through both filters. The asymmetric one settles ~12% above the
        // truth and stays there, which is how the controller came to believe the
        // frame was full while running at 130fps.
        const unbiased = feedNoise(smoothCost, 100);
        const ratchets = feedNoise(biased, 100);

        expect(ratchets).toBeGreaterThan(108);
        expect(ratchets).toBeGreaterThan(unbiased * 1.05);
    });

    it('takes the first sample as-is', () => {
        expect(smoothCost(0, 7, 0)).toBe(7);
    });
});

describe('resolution never drops below 1920x1080', () => {
    // Symptom: 1054x541 on an external monitor -- the cells read as pixels.
    it('floors the scale so the buffer keeps TARGET_MIN_PIXELS', () => {
        const [dw, dh] = [3840, 2160];
        const floor = renderScaleFloor(dw, dh);
        const { renderWidth, renderHeight } = calcRenderSize(dw, dh, 0.1);
        expect(renderWidth * renderHeight).toBeGreaterThanOrEqual(TARGET_MIN_PIXELS * 0.99);
        expect(calcRenderSize(dw, dh, 0.1).scale).toBeCloseTo(floor, 10);
    });

    it('never scales a small display below native', () => {
        // Nothing should be upscaled, and a display under the target is left alone.
        expect(renderScaleFloor(1280, 800)).toBe(1);
        expect(calcRenderSize(1280, 800, 0.4).scale).toBe(1);
        expect(calcRenderSize(1280, 800, 5).scale).toBe(1);
    });

    it('holds the floor rather than the frame rate when nothing fits', () => {
        // An absurd cost per pixel must still not produce a blurrier canvas.
        const scale = solveRenderScale(3840, 2160, 1, 1);
        expect(scale).toBeCloseTo(renderScaleFloor(3840, 2160), 10);
    });

    it('picks native when the budget allows it', () => {
        // Symptom this guards: a hardcoded 1920x1080 cap pinned a 2560x1440 display
        // to a 1.26x upscale while pixels used only 4.3ms of an 11.67ms budget.
        expect(solveRenderScale(2411, 1345, 0.0000019, 11)).toBe(1);
    });
});

describe('budget and population', () => {
    it('spends nearly the whole frame, not a flat 70% of it', () => {
        // Symptom: 81fps against a 60fps target -- a quarter of the frame discarded.
        const budget = solveWorkBudget(1.2);
        expect(budget).toBeGreaterThan(FRAME_BUDGET_MS * 0.85);
        expect(budget).toBeLessThan(FRAME_BUDGET_MS);
    });

    it('leaves resolution room for a viable population, not the bare floor', () => {
        const budget = solveWorkBudget(1.2);
        const costPerParticle = 0.00007;
        const limit = solvePixelLimit(budget, costPerParticle);
        expect(limit).toBeLessThan(budget);
        expect(limit).toBeGreaterThanOrEqual(budget * 0.5);
    });

    it('clamps population to the floor and ceiling', () => {
        expect(easeParticleCount(PARTICLE_FLOOR, 0)).toBe(PARTICLE_FLOOR);
        expect(easeParticleCount(PARTICLE_CEILING, 10_000_000)).toBe(PARTICLE_CEILING);
    });

    it('eases rather than jumping, and shrinks faster than it grows', () => {
        // Growth is capped tighter than shrinkage: shrinking defends the frame rate,
        // growing is only an optimisation. This asymmetry is control, not estimation.
        const grown = easeParticleCount(100_000, 10_000_000);
        const shrunk = easeParticleCount(100_000, 0);
        expect(grown).toBe(125_000);
        expect(shrunk).toBe(50_000);
    });

    it('falls back to the floor when the cost is not yet known', () => {
        expect(solveParticleTarget(14.7, 1000, 0.000002, 0)).toBe(PARTICLE_FLOOR);
    });

    it('gives slimes whatever the pixels did not use', () => {
        const target = solveParticleTarget(14.7, 2_073_600, 0.000002, 0.00007);
        expect(target).toBeCloseTo((14.7 - 2_073_600 * 0.000002) / 0.00007, 5);
    });
});
