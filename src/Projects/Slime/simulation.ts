/**
 * Pure maths behind the slime simulation's autoscaler and resizing.
 *
 * Everything here is deliberately free of React, Three.js and the DOM, because
 * every one of these functions has been wrong at least once in a way that was
 * invisible without measuring. See `docs/slime-behaviour.md` for the contract and
 * `simulation.test.ts` for the regressions each one guards against.
 */
import { clamp } from '../../utils/number';

// ==============
// Frame budget
// ==============

export const TARGET_FPS = 60;
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

/**
 * Fixed simulation timestep. Movement is defined per step rather than per second,
 * so letting the step rate follow the frame rate makes the slimes race whenever
 * there is headroom and lurch the moment the population grows.
 */
export const SIM_STEP_MS = FRAME_BUDGET_MS;

/**
 * Work happening outside the timed span: rAF dispatch, compositing, GC. A flat 30%
 * reserve used to stand in for this and threw away a quarter of the frame; a real
 * reading was 12.35ms of frame against 11.67ms of work, so roughly 0.7ms.
 */
export const DEFAULT_OVERHEAD_MS = 1.2;
/** Margin beyond the measured overhead, so one GC pause does not drop a frame. */
export const FRAME_SAFETY_MS = 0.8;

// ==============
// Resolution
// ==============

export const RENDER_SCALE_STEPS = [1, 0.85, 0.7, 0.6, 0.5, 0.4];

/**
 * Resolution never falls below this. Under roughly 1920x1080 the cells read as
 * pixels, which defeats the premise that the image comes from many slimes blending
 * together. Resolution therefore outranks population and is not traded away for it.
 */
export const TARGET_MIN_PIXELS = 1920 * 1080;

/** Only step resolution up when the larger size fits with room to spare. */
export const SCALE_UP_HEADROOM = 0.85;

// ==============
// Population
// ==============

/**
 * A population too sparse to look like anything is not worth holding 60fps for. If
 * the machine cannot manage 60fps at this many slimes and the minimum resolution,
 * the frame rate is what gives.
 */
export const PARTICLE_FLOOR = 25_000;
export const PARTICLE_CEILING = 500_000;

/**
 * What resolution must leave room for. Reserving only PARTICLE_FLOOR is correct by
 * the priority order but awful to watch: a 4K display spent 24 seconds strangling
 * the population to the bare minimum before conceding a single resolution step.
 */
export const RESOLUTION_RESERVE_PARTICLES = 60_000;

/** Population always eases toward its target, so density blooms rather than pops. */
export const MAX_GROW_STEP = 0.25;
export const MAX_SHRINK_STEP = 0.5;

// ==============
// Measurement
// ==============

/**
 * Symmetric, deliberately. Reacting faster to a rising cost than a falling one looks
 * like prudence but makes a biased estimator: given noise around a steady value it
 * ratchets toward the upper tail and stays, until the controller believes the budget
 * is full while actually using half the frame. Asymmetry belongs in the control loop
 * below, not in the estimator.
 */
export const COST_EMA_ALPHA = 0.2;

/** Never derive a cost from a handful of frames. */
export const MIN_WINDOW_FRAMES = 10;

/**
 * Shader compilation, the first texture upload and JIT warm-up all land in the
 * opening frames and measure roughly 50% high.
 */
export const WARMUP_MS = 1_200;
export const WARMUP_FRAMES = 60;

/** A prior for cost per pixel, used only to pick the scale calibration starts at. */
export const ASSUMED_COST_PER_PX = 0.0000022;

export const CALIBRATION_MS = 1_500;
export const TRACK_WINDOW_MS = 1_000;
export const SCALE_COOLDOWN_MS = 4_000;
export const PROBE_PARTICLES = PARTICLE_FLOOR;

// ==============
// Resolution maths
// ==============

/**
 * Smallest scale allowed on this display: whatever still yields TARGET_MIN_PIXELS,
 * or native when the display is already smaller than that.
 */
export function renderScaleFloor(displayWidth: number, displayHeight: number): number {
    const displayPixels = displayWidth * displayHeight;
    if (displayPixels <= TARGET_MIN_PIXELS) {
        return 1;
    }
    return Math.sqrt(TARGET_MIN_PIXELS / displayPixels);
}

export interface RenderSize {
    renderWidth: number;
    renderHeight: number;
    scale: number;
}

/**
 * There is deliberately no fixed resolution ceiling. A hardcoded 1920x1080 cap used
 * to pin large displays to a blurry upscale even when the frame budget could afford
 * native, which is the judgement the autoscaler makes on evidence instead.
 */
export function calcRenderSize(
    displayWidth: number,
    displayHeight: number,
    autoScale: number
): RenderSize {
    const scale = clamp(autoScale, renderScaleFloor(displayWidth, displayHeight), 1);
    return {
        renderWidth: Math.max(1, Math.floor(displayWidth * scale)),
        renderHeight: Math.max(1, Math.floor(displayHeight * scale)),
        scale,
    };
}

/** Largest scale step whose pixel cost fits the budget resolution may claim. */
export function solveRenderScale(
    displayWidth: number,
    displayHeight: number,
    costPerPx: number,
    pixelBudgetMs: number
): number {
    const floor = renderScaleFloor(displayWidth, displayHeight);
    for (const step of RENDER_SCALE_STEPS) {
        if (step < floor) {
            break;
        }
        const { renderWidth, renderHeight } = calcRenderSize(displayWidth, displayHeight, step);
        if (renderWidth * renderHeight * costPerPx <= pixelBudgetMs) {
            return step;
        }
    }
    // Nothing fits. Hold the minimum resolution and let the frame rate give instead.
    return floor;
}

// ==============
// Budget maths
// ==============

/** Work the simulation may spend per step, once overhead and margin are taken out. */
export function solveWorkBudget(overheadMs: number): number {
    return Math.max(FRAME_BUDGET_MS * 0.4, FRAME_BUDGET_MS - overheadMs - FRAME_SAFETY_MS);
}

/**
 * How much of the budget resolution may claim: everything except what a population
 * worth looking at needs, and never less than half.
 */
export function solvePixelLimit(budgetMs: number, costPerParticle: number): number {
    return Math.max(budgetMs * 0.5, budgetMs - RESOLUTION_RESERVE_PARTICLES * costPerParticle);
}

/** Population that fits in whatever the pixels did not use. */
export function solveParticleTarget(
    budgetMs: number,
    pixelCount: number,
    costPerPx: number,
    costPerParticle: number
): number {
    if (costPerParticle <= 0) {
        return PARTICLE_FLOOR;
    }
    return Math.max(0, budgetMs - pixelCount * costPerPx) / costPerParticle;
}

/**
 * Ease toward the target rather than snapping to it. Asymmetric on purpose: this is
 * the control loop, not the estimator, so shrinking may happen quickly because it
 * defends the frame rate, while growing is only an optimisation.
 */
export function easeParticleCount(current: number, target: number): number {
    const eased = clamp(target, current * (1 - MAX_SHRINK_STEP), current * (1 + MAX_GROW_STEP));
    return clamp(Math.round(eased / 100) * 100, PARTICLE_FLOOR, PARTICLE_CEILING);
}

// ==============
// Measurement maths
// ==============

/** Symmetric exponential moving average. The first sample is taken as-is. */
export function smoothCost(prev: number, next: number, samples: number): number {
    if (samples === 0) {
        return next;
    }
    return prev + (next - prev) * COST_EMA_ALPHA;
}

// ==============
// Fixed timestep
// ==============

export interface StepDecision {
    accumulator: number;
    shouldStep: boolean;
}

/**
 * Accumulate elapsed time and decide whether this frame runs a simulation step.
 *
 * Gating on `elapsed >= SIM_STEP_MS` alone misfires on a 144Hz panel, where ticks
 * land at 6.9, 13.9 and 20.8ms and the first one past the threshold is already 25%
 * late, yielding 48 steps per second. Accumulating keeps the long-run rate at
 * exactly 60 on any refresh rate; only the spacing jitters, and spacing does not
 * matter when movement is defined per step.
 *
 * One tick's contribution is capped so a stall cannot bank time and then fire a
 * burst, and at most one step runs per frame, so a machine that cannot keep up runs
 * the simulation slower rather than spiralling trying to catch up.
 */
export function advanceStepAccumulator(accumulator: number, dtMs: number): StepDecision {
    const next = accumulator + Math.min(dtMs, SIM_STEP_MS * 2);
    if (next < SIM_STEP_MS) {
        return { accumulator: next, shouldStep: false };
    }
    return {
        accumulator: Math.min(next - SIM_STEP_MS, SIM_STEP_MS),
        shouldStep: true,
    };
}

// ==============
// Resizing
// ==============

export interface WorldSize {
    w: number;
    h: number;
    scale: number;
}

export interface ResizeMapping {
    /** Applied to BOTH axes. Per-axis factors stretch the simulation. */
    factor: number;
    offX: number;
    offY: number;
}

/**
 * How the old world maps into a new buffer.
 *
 * One factor for both axes, always. Scaling x by `w/prevW` and y by `h/prevH`
 * independently is equal for a pure resolution change and *unequal* the moment the
 * window changes shape, which stretches the whole simulation along one axis -- half
 * a screen to fullscreen widened every cell without making it taller.
 *
 * The buffer is always the display times `scale`, so `scale / prevScale` is exactly
 * the factor that leaves content the same size on screen: it reduces to `w/prevW`
 * for a pure resolution change and to 1 when only the shape changed. The old content
 * is then centred, so a wider window gains empty ground on either side for the
 * colony to spread into.
 */
export function calcResizeMapping(
    prev: WorldSize | null,
    next: { w: number; h: number; scale: number }
): ResizeMapping {
    if (!prev || prev.scale <= 0) {
        return { factor: 1, offX: 0, offY: 0 };
    }
    const factor = next.scale / prev.scale;
    return {
        factor,
        offX: Math.round((next.w - prev.w * factor) / 2),
        offY: Math.round((next.h - prev.h * factor) / 2),
    };
}
