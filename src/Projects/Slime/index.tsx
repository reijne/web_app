import React, { useEffect, useMemo, useRef, useState } from 'react';

import { faArrowRotateRight } from '@fortawesome/free-solid-svg-icons/faArrowRotateRight';
import { faArrowsToCircle } from '@fortawesome/free-solid-svg-icons/faArrowsToCircle';
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan';
import { faCircleXmark } from '@fortawesome/free-solid-svg-icons/faCircleXmark';
import { faCompress } from '@fortawesome/free-solid-svg-icons/faCompress';
import { faExpand } from '@fortawesome/free-solid-svg-icons/faExpand';
import { faHandPointer } from '@fortawesome/free-solid-svg-icons/faHandPointer';
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
import { faVirus } from '@fortawesome/free-solid-svg-icons/faVirus';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as THREE from 'three';

import { clamp } from '../../utils/number';
import { SessionStorage } from '../../utils/session';
import { useWakeLock } from '../../utils/wake';

import './Slime.css';
import {
    ASSUMED_COST_PER_PX,
    CALIBRATION_MS,
    DEFAULT_OVERHEAD_MS,
    FRAME_BUDGET_MS,
    MIN_WINDOW_FRAMES,
    PARTICLE_CEILING,
    PARTICLE_FLOOR,
    PROBE_PARTICLES,
    SCALE_COOLDOWN_MS,
    SCALE_UP_HEADROOM,
    SIM_STEP_MS,
    TRACK_WINDOW_MS,
    WARMUP_FRAMES,
    WARMUP_MS,
    advanceStepAccumulator,
    calcRenderSize,
    calcResizeMapping,
    easeParticleCount,
    smoothCost,
    solveParticleTarget,
    solvePixelLimit,
    solveRenderScale,
    solveWorkBudget,
} from './simulation';

// ==============
// Types & Config
// ==============
interface ConfigValue {
    value: number;
    min: number;
    max: number;
}

const slimeConfigKeys = [
    'slimes',
    'moveSpeed',
    'turnSpeed',
    'jitter',
    'turnJitter',
    'sensorAngle',
    'sensorDistance',
    'trail',
] as const;

// Autoscaler constants and maths live in ./simulation, free of React and Three.js
// so they can be tested. See docs/slime-behaviour.md for what they must guarantee.

// Shader compilation, the first texture upload and JIT warm-up all land in the
// opening frames and are nothing like steady state. Measuring through them inflates
// cost per pixel badly, and because the resolution used to be locked on that single
// reading, one cold start pinned the render size low for the rest of the session.
// A prior for cost per pixel, used only to pick the scale calibration starts at.
// Without it a 4K display spends the whole calibration window at ~22ms frames
// before the first measurement lands. This is a guess that measurement overwrites
// within about a second and a half, in either direction -- not a ceiling.

// Resolution may now be revisited while running: resizeWorld resamples the field,
// so a change carries the simulation across instead of resetting it.
// Population only ever eases toward its target so density blooms rather than jumps.

// Only step up when the larger size fits with room to spare, so it cannot oscillate.
// Symmetric, deliberately. An earlier version reacted fast to a rising cost and
// slowly to a falling one, meaning to defend the frame rate. That makes a biased
// estimator: with noise around a steady value it ratchets toward the upper tail and
// stays there, so the controller came to believe the budget was full and retreated
// to both floors while actually using half the frame. Defending the frame rate is
// the control loop's job, below, not the estimator's.
// Never derive a cost from a handful of frames. Also covers the gap after a pause
// or a hidden tab, where the window has aged but almost nothing was measured.
// Population always eases toward its target rather than snapping to it, so density
// blooms in instead of appearing all at once. Asymmetric here is correct -- this is
// the control loop, not the estimator: shrinking defends the frame rate and may
// happen quickly, growing is only an optimisation.
type SlimeConfigKey = (typeof slimeConfigKeys)[number];
export type SlimeConfig = Record<SlimeConfigKey, ConfigValue>;

export interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    slimes: { value: 25_000, min: 100, max: 25_000 },
    moveSpeed: { value: 1.5, min: 0.2, max: 3 },
    turnSpeed: { value: 0.4, min: 0.6, max: 0.8 },
    jitter: { value: 0, min: 0, max: 1 },
    turnJitter: { value: 0.3, min: 0, max: 1 },
    sensorAngle: { value: Math.PI / 10, min: Math.PI / 10, max: Math.PI / 4 },
    sensorDistance: { value: 10, min: 10, max: 100 },
    trail: { value: 0.995, min: 0.97, max: 0.995 },
    ...SessionStorage.slimeConfig.get(),
};

// Particle count belongs to the autoscaler, so a persisted one is never restored:
// a session that collapsed would otherwise pin the ceiling low forever.
DEFAULT_SLIME_CONFIG.slimes = {
    value: PROBE_PARTICLES,
    min: PARTICLE_FLOOR,
    max: PARTICLE_CEILING,
};

// ===== Evolution for Slime Config =====
const EVOLVE = {
    periodMs: 5000, // how often to evolve
    magnitude: 0.1, // fraction of (max - min) per nudge
    fieldsPerStep: 3, // how many fields to nudge each time
    excluded: ['slimes'],
};

// Pick K distinct random items
function pickK<T>(arr: T[], k: number) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
}

// Nudge one ConfigValue by a tiny amount.
function nudge(val: ConfigValue, mag = EVOLVE.magnitude): number {
    const range = val.max - val.min;
    let delta = range * mag;
    if (val.value === val.max || (val.value !== val.min && Math.random() < 0.5)) {
        delta *= -1;
    }
    return clamp(val.value + delta, val.min, val.max);
}

type ClickBehaviorAction = 'pull' | 'push' | 'none';
function getNextClickBehavior(current: ClickBehaviorAction): ClickBehaviorAction {
    switch (current) {
        case 'pull':
            return 'push';
        case 'push':
            return 'none';
        case 'none':
            return 'pull';
        default:
            throw new Error('Invalid click behavior');
    }
}

const CLICK_BEHAVIOR_ICONS = {
    pull: faArrowsToCircle,
    push: faCircleXmark,
    none: faBan,
};

// Some constants
const REPULSION = {
    minRadiusPercent: 0.001,
    maxRadiusPercent: 0.25,
    growPercentPerTick: 0.001,
};
const COLOR_FADE_SPEED = 0.05;

// ==============
// Helper functions
// ==============
function createParticle(width: number, height: number): SlimeParticle {
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) / 20;

    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * maxRadius;

    return {
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
        angle: theta,
    };
}

function clampToBounds(p: SlimeParticle, width: number, height: number) {
    const margin = 10;
    const minX = margin,
        maxX = width - margin,
        spanX = maxX - minX;
    const minY = margin,
        maxY = height - margin,
        spanY = maxY - minY;

    if (p.x < minX) {
        p.x += spanX;
    } else if (p.x >= maxX) {
        p.x -= spanX;
    }

    if (p.y < minY) {
        p.y += spanY;
    } else if (p.y >= maxY) {
        p.y -= spanY;
    }
}

function getCircleColor(clickBehavior: ClickBehaviorAction) {
    switch (clickBehavior) {
        case 'pull':
            // Equal to `index.css::blue`
            return new THREE.Color(0x00bfff);
        case 'push':
            // Equal to `index.css::orange`
            return new THREE.Color(0xff4500);
        case 'none':
            return new THREE.Color(0xaaaaaa);
        default:
            return new THREE.Color(0xaaaaaa);
    }
}

// ====== Trail field shader ======
//
// The trail field is uploaded as a single-channel R8 texture and coloured on the
// GPU. Writing an RGBA pixel per cell in JS and uploading four bytes per cell cost
// 13.0 MB/frame of texture bandwidth at 2411x1345; this is 3.2 MB/frame and drops
// the per-pixel RGBA write entirely.
//
// Matches hslToRgb(hue, 1.0, intensity) from utils/colors, which is the standard
// HSL conversion, so the palette is unchanged.
const FIELD_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FIELD_FRAGMENT_SHADER = `
uniform sampler2D uField;
uniform float uHue;
varying vec2 vUv;

vec3 hsl2rgb(float h, float s, float l) {
    vec3 k = mod(vec3(0.0, 8.0, 4.0) + h * 12.0, 12.0);
    float a = s * min(l, 1.0 - l);
    return l - a * clamp(min(k - 3.0, 9.0 - k), -1.0, 1.0);
}

void main() {
    float intensity = texture2D(uField, vUv).r;
    gl_FragColor = vec4(hsl2rgb(uHue, 1.0, intensity), 1.0);
    #include <colorspace_fragment>
}
`;

// ====== Perf: per-frame derived config cache ======
type DerivedCfg = {
    speed: number;
    jitter: number;
    turnJitter: number;
    turn: number;
    sd: number;
    cosSA: number;
    sinSA: number;
    decay256: number;
};

const SlimeSceneThree: React.FC = () => {
    // Refs and states
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Slime state
    const slime = useRef<SlimeConfig>({ ...DEFAULT_SLIME_CONFIG });
    // UI mirror (so sliders reflect evolving values)
    // eslint-disable-next-line
    const [slimeUI, setSlimeUI] = useState<SlimeConfig>(slime.current);
    const [clickBehavior, setClickBehavior] = useState<ClickBehaviorAction>('pull');
    const [isShowingSlimeCount, setIsShowingSlimeCount] = useState(false);
    const [isRunning, setIsRunning] = useState(true);
    // Keep the screen awake while running
    useWakeLock(isRunning);
    const [isEvolving, setIsEvolving] = useState(true);
    const [reset, setReset] = useState(0);

    // Render scale chosen by calibration. Held in state because changing it has to
    // rebuild the buffers and the Three.js scene.
    const [autoScale, setAutoScale] = useState(1);

    // For rendering
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const circleRef = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | null>(
        null
    );

    // Display size in CSS pixels, straight from the ResizeObserver.
    const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);

    // Render size derived from the display size and the autoscaler's chosen scale.
    // useMemo keeps the identity stable, so the scene effects below only re-run when
    // one of those two actually changes.
    const sceneSize = useMemo(() => {
        if (!displaySize) {
            return null;
        }
        const { renderWidth, renderHeight, scale } = calcRenderSize(
            displaySize.width,
            displaySize.height,
            autoScale
        );
        return {
            displayWidth: displaySize.width,
            displayHeight: displaySize.height,
            width: renderWidth,
            height: renderHeight,
            // Converts display coordinates to render coordinates.
            scale,
        };
    }, [displaySize, autoScale]);

    const particlesRef = useRef<SlimeParticle[]>([]);
    const frameRef = useRef(100);

    // Trails (intensity 0..255) and RGBA backing store for the texture
    const trailsRef = useRef<Uint8Array | null>(null);
    const fieldMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

    // Three texture
    const textureRef = useRef<THREE.DataTexture | null>(null);

    // Derived config cache
    const cfgRef = useRef<DerivedCfg | null>(null);
    const cfgDirtyRef = useRef(true);

    const isFullscreen = () => document.fullscreenElement != null;

    // Render-space dimensions the world is currently shaped for. A resize carries
    // the trail field and the particles across instead of starting over, so toggling
    // fullscreen no longer wipes the simulation.
    const worldSizeRef = useRef<{ w: number; h: number; scale: number } | null>(null);

    function resizeWorld(w: number, h: number, scale: number) {
        const prev = worldSizeRef.current;
        if (prev && prev.w === w && prev.h === h) {
            return; // already this shape; both scene effects call this
        }

        const { factor, offX, offY } = calcResizeMapping(prev, { w, h, scale });

        const old = trailsRef.current;
        const next = new Uint8Array(w * h);
        if (old && prev && old.length === prev.w * prev.h) {
            // Nearest neighbour. Cheap, runs once per resize, and keeps the pattern
            // on screen rather than dropping to black.
            const inv = 1 / factor;
            for (let y = 0; y < h; y++) {
                const sy = Math.floor((y - offY) * inv);
                if (sy < 0 || sy >= prev.h) {
                    continue;
                }
                const srcRow = sy * prev.w;
                const dstRow = y * w;
                for (let x = 0; x < w; x++) {
                    const sx = Math.floor((x - offX) * inv);
                    if (sx >= 0 && sx < prev.w) {
                        next[dstRow + x] = old[srcRow + sx];
                    }
                }
            }
        }
        trailsRef.current = next;

        // Particle coordinates are in render space, so they move with the field.
        if (prev) {
            const arr = particlesRef.current;
            for (let i = 0; i < arr.length; i++) {
                arr[i].x = arr[i].x * factor + offX;
                arr[i].y = arr[i].y * factor + offY;
            }
        }

        worldSizeRef.current = { w, h, scale };
    }

    function recomputeCfg() {
        const s = slime.current;
        const sa = s.sensorAngle.value;
        cfgRef.current = {
            speed: s.moveSpeed.value,
            jitter: s.jitter.value,
            turnJitter: s.turnJitter.value,
            turn: s.turnSpeed.value,
            sd: s.sensorDistance.value,
            cosSA: Math.cos(sa),
            sinSA: Math.sin(sa),
            decay256: Math.floor(s.trail.value * 256),
        };
        cfgDirtyRef.current = false;
    }

    // Particle resizing
    function resizeParticles(newCount: number, w?: number, h?: number) {
        const arr = particlesRef.current;
        if (arr.length < newCount) {
            const toAdd = newCount - arr.length;
            if (arr.length === 0) {
                // seed with fresh particles if empty
                const W = w ?? sceneSize?.width ?? 0;
                const H = h ?? sceneSize?.height ?? 0;
                for (let i = 0; i < toAdd; i++) {
                    arr.push(createParticle(W, H));
                }
            } else {
                // clone from existing to avoid trig during resize
                for (let i = 0; i < toAdd; i++) {
                    const src = arr[i % arr.length];
                    arr.push({ x: src.x, y: src.y, angle: src.angle });
                }
            }
        } else if (arr.length > newCount) {
            arr.length = newCount;
        }
    }

    // The autoscaler owns the particle count. `max` stays a real ceiling; only
    // `value` moves. No setState here: the count is not rendered except behind the
    // `s` toggle, which polls the ref on its own.
    function applyParticleCount(newCount: number) {
        const stepped = Math.round(newCount / 100) * 100; // step = 100
        const clamped = clamp(stepped, PARTICLE_FLOOR, slime.current.slimes.max);
        if (clamped === slime.current.slimes.value) {
            return;
        }
        resizeParticles(clamped);
        slime.current.slimes.value = clamped;
    }

    useEffect(function resizeHandler() {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    const next = { width: Math.floor(width), height: Math.floor(height) };
                    // Bail on an identical size: a fresh object would churn every
                    // effect keyed on sceneSize, rebuilding the scene for nothing.
                    setDisplaySize((prev) =>
                        prev && prev.width === next.width && prev.height === next.height
                            ? prev
                            : next
                    );
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(
        function initThreeJsScene() {
            if (!containerRef.current || !sceneSize) {
                return;
            }

            const { width, height, displayWidth, displayHeight } = sceneSize;

            resizeWorld(width, height, sceneSize.scale);

            const renderer = new THREE.WebGLRenderer({
                antialias: false,
            });
            // Render at scaled resolution
            renderer.setSize(width, height);
            renderer.setPixelRatio(1);

            // Scale canvas to fill display size via CSS
            const canvas = renderer.domElement;
            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;

            containerRef.current.appendChild(canvas);

            const scene = new THREE.Scene();
            scene.matrixAutoUpdate = false;

            const camera = new THREE.OrthographicCamera(
                0,
                sceneSize.width,
                sceneSize.height,
                0,
                -1,
                1
            );
            camera.position.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
            camera.matrixAutoUpdate = false;

            const geom = new THREE.PlaneGeometry(sceneSize.width, sceneSize.height);
            geom.translate(sceneSize.width / 2, sceneSize.height / 2, 0);

            const tex = new THREE.DataTexture(
                trailsRef.current as Uint8Array,
                sceneSize.width,
                sceneSize.height,
                THREE.RedFormat,
                THREE.UnsignedByteType
            );
            tex.needsUpdate = true;
            // Linear filtering keeps the field smooth if it is ever upscaled.
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.flipY = false;
            // One byte per texel: without this a width that is not a multiple of
            // four is read back skewed.
            tex.unpackAlignment = 1;

            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uField: { value: tex },
                    uHue: { value: 0 },
                },
                vertexShader: FIELD_VERTEX_SHADER,
                fragmentShader: FIELD_FRAGMENT_SHADER,
            });
            fieldMaterialRef.current = mat;
            const mesh = new THREE.Mesh(geom, mat);
            mesh.matrixAutoUpdate = false;
            scene.add(mesh);

            const circleGeo = new THREE.CircleGeometry(1, 32);
            const circleMat = new THREE.MeshBasicMaterial({
                color: getCircleColor('pull'),
                transparent: true,
                opacity: 0.2,
            });
            const circleMesh = new THREE.Mesh(circleGeo, circleMat);
            circleMesh.visible = false;
            scene.add(circleMesh);

            rendererRef.current = renderer;
            sceneRef.current = scene;
            cameraRef.current = camera;
            textureRef.current = tex;
            circleRef.current = circleMesh;

            return () => {
                renderer.dispose();
                renderer.domElement.remove();
                scene.remove(mesh);
                geom.dispose();
                mat.dispose();
                tex.dispose();
            };
        },
        [reset, sceneSize]
    );

    useEffect(
        function createSlimeTrailAndParticles() {
            if (!sceneSize) {
                return;
            }
            const { width, height } = sceneSize;

            // Carries the existing trail and particles across a size change.
            resizeWorld(width, height, sceneSize.scale);
            resizeParticles(slime.current.slimes.value, width, height);
        },
        [sceneSize, reset]
    );

    // Autoscaler state. A ref, so it survives the render-loop effect re-running.
    // The original bug was exactly this: the loop captured fpsMin/fpsMax in a
    // closure the effect never refreshed.
    const ctrlRef = useRef({
        phase: 'calibrating' as 'calibrating' | 'tracking',
        // Display size + reset generation the current calibration belongs to.
        key: '',
        windowStart: 0,
        frames: 0,
        pixMs: 0,
        partMs: 0,
        costPerPx: 0,
        costPerParticle: 0,
        samples: 0,
        fps: 0,
        warmupDone: false,
        warmupFrames: 0,
        lastFrameTs: 0,
        frameDeltaMs: 0,
        overheadMs: DEFAULT_OVERHEAD_MS,
        budgetMs: solveWorkBudget(DEFAULT_OVERHEAD_MS),
        scale: 1,
        lastScaleChange: 0,
    });

    useEffect(
        function update() {
            if (!sceneSize || !rendererRef.current) {
                return;
            }
            let animId = 0;
            // Accumulator for the fixed simulation timestep. Gating on elapsed >=
            // SIM_STEP_MS alone would misfire on a 144Hz panel, where ticks land at
            // 6.9, 13.9, 20.8ms and the first one past the threshold is already 25%
            // late. Accumulating keeps the long-run rate at exactly 60 steps per
            // second on any refresh rate; only the spacing jitters, and spacing does
            // not matter when movement is defined per step.
            let stepAccumulatorMs = 0;
            let lastTickMs = 0;

            const mouse = { x: 0, y: 0, down: false, size: REPULSION.minRadiusPercent };

            const canvas = rendererRef.current.domElement;
            const { width, height, scale } = sceneSize;

            const handleMouseMove = (e: PointerEvent) => {
                // Convert display coordinates to render coordinates
                mouse.x = e.offsetX * scale;
                mouse.y = height - e.offsetY * scale;
            };
            const handleMouseDown = () => {
                mouse.down = mouse.x > 0 && mouse.y > 0 && mouse.x < width && mouse.y < height;
            };
            const handleMouseUp = () => {
                mouse.down = false;
            };

            canvas.addEventListener('pointermove', handleMouseMove, { passive: true });
            canvas.addEventListener('pointerdown', handleMouseDown, { passive: true });
            window.addEventListener('pointerup', handleMouseUp, { passive: true });

            const showMouseDown = () => {
                if (!circleRef.current) {
                    return;
                }
                if (mouse.down && clickBehavior !== 'none') {
                    circleRef.current.visible = true;
                    circleRef.current.position.set(mouse.x, mouse.y, 0);
                    const bubbleRadius = mouse.size * Math.min(sceneSize.width, sceneSize.height);
                    circleRef.current.scale.set(bubbleRadius, bubbleRadius, 1);
                } else {
                    circleRef.current.visible = false;
                }
            };

            // Move, deposit and sense in a single pass.
            //
            // This used to be two loops over the whole particle array, each calling
            // Math.cos/Math.sin on the same angle. Fusing them halves the traversal
            // and the trig: measured 77.7ns -> 43.2ns per particle at N=100k, which
            // is worth roughly 1.8x the slime count at a fixed frame budget.
            //
            // Ordering is unchanged -- move along the jittered heading, deposit, then
            // steer for the next frame. The only difference is that a particle now
            // senses a field holding this frame's deposits from the particles before
            // it rather than from all of them, which is the standard formulation.
            const stepSlimes = (trails: Uint8Array, cfg: DerivedCfg) => {
                const w = sceneSize.width;
                const h = sceneSize.height;
                const screenSize = Math.min(w, h);
                const arr = particlesRef.current;

                const speed = cfg.speed;
                const jitter = cfg.jitter;
                const turnJitter = cfg.turnJitter;
                const sd = cfg.sd;
                const turn = cfg.turn;
                const cosSA = cfg.cosSA;
                const sinSA = cfg.sinSA;
                const repelling = clickBehavior !== 'none' && mouse.down;

                const clampX = (x: number) => (x < 0 ? 0 : x >= w ? w - 1 : x);
                const clampY = (y: number) => (y < 0 ? 0 : y >= h ? h - 1 : y);

                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];

                    if (repelling) {
                        const dx = p.x - mouse.x;
                        const dy = p.y - mouse.y;
                        const r = mouse.size * screenSize;
                        if (dx * dx + dy * dy < r * r) {
                            const ang = Math.atan2(dy, dx);
                            p.angle = clickBehavior === 'push' ? ang : ang + Math.PI;
                        }
                        if (mouse.size < REPULSION.maxRadiusPercent) {
                            mouse.size += REPULSION.growPercentPerTick;
                        }
                    }

                    let a = p.angle + (Math.random() - 0.5) * turnJitter;
                    const ca = Math.cos(a);
                    const sa = Math.sin(a);

                    p.x += ca * speed + (Math.random() - 0.5) * jitter;
                    p.y += sa * speed + (Math.random() - 0.5) * jitter;
                    clampToBounds(p, w, h);

                    const idx = (p.y | 0) * w + (p.x | 0);
                    if (idx >= 0 && idx < trails.length) {
                        trails[idx] = 255;
                    }

                    // Rotate the heading by +/- sensorAngle with a 2x2 rotation.
                    const ldx = ca * cosSA + sa * sinSA; // left = -sa
                    const ldy = -ca * sinSA + sa * cosSA;
                    const rdx = ca * cosSA - sa * sinSA; // right = +sa
                    const rdy = ca * sinSA + sa * cosSA;

                    const fI =
                        trails[clampY((p.y + sa * sd) | 0) * w + clampX((p.x + ca * sd) | 0)];
                    const lI =
                        trails[clampY((p.y + ldy * sd) | 0) * w + clampX((p.x + ldx * sd) | 0)];
                    const rI =
                        trails[clampY((p.y + rdy * sd) | 0) * w + clampX((p.x + rdx * sd) | 0)];

                    if (lI > fI && lI > rI) {
                        a -= turn;
                    } else if (rI > fI && rI > lI) {
                        a += turn;
                    }
                    p.angle = a;
                }
            };

            const decayTrails = (trails: Uint8Array, tex: THREE.DataTexture, cfg: DerivedCfg) => {
                const decay256 = cfg.decay256;
                const len = trails.length;
                const needsFloorFix = decay256 < 256;

                // Four cells per iteration; measurably faster than one at a time.
                const len4 = len - (len % 4);
                let i = 0;

                for (; i < len4; i += 4) {
                    let o = trails[i];
                    if (o !== 0) {
                        let n = (o * decay256) >> 8;
                        if (needsFloorFix && n === o) {
                            n = o - 1;
                        }
                        trails[i] = n;
                    }
                    o = trails[i + 1];
                    if (o !== 0) {
                        let n = (o * decay256) >> 8;
                        if (needsFloorFix && n === o) {
                            n = o - 1;
                        }
                        trails[i + 1] = n;
                    }
                    o = trails[i + 2];
                    if (o !== 0) {
                        let n = (o * decay256) >> 8;
                        if (needsFloorFix && n === o) {
                            n = o - 1;
                        }
                        trails[i + 2] = n;
                    }
                    o = trails[i + 3];
                    if (o !== 0) {
                        let n = (o * decay256) >> 8;
                        if (needsFloorFix && n === o) {
                            n = o - 1;
                        }
                        trails[i + 3] = n;
                    }
                }

                for (; i < len; i++) {
                    const o = trails[i];
                    if (o !== 0) {
                        let n = (o * decay256) >> 8;
                        if (needsFloorFix && n === o) {
                            n = o - 1;
                        }
                        trails[i] = n;
                    }
                }

                tex.needsUpdate = true;
            };

            // Identity of what we calibrated for. Note this keys on the *display*
            // size, not the render size: the autoscaler changes the render size
            // itself, and recalibrating on its own output would never settle.
            const displayKey = `${sceneSize.displayWidth}x${sceneSize.displayHeight}#${reset}`;
            const pixelCount = width * height;

            const beginCalibration = (now: number) => {
                const c = ctrlRef.current;
                c.phase = 'calibrating';
                c.key = displayKey;
                c.windowStart = now;
                c.frames = 0;
                c.pixMs = 0;
                c.partMs = 0;
                c.costPerPx = 0;
                c.costPerParticle = 0;
                c.samples = 0;
                c.warmupDone = false;
                c.warmupFrames = 0;
                c.lastFrameTs = 0;
                c.frameDeltaMs = 0;
                c.scale = autoScale;
                applyParticleCount(PROBE_PARTICLES);

                const guess = solveRenderScale(
                    sceneSize.displayWidth,
                    sceneSize.displayHeight,
                    ASSUMED_COST_PER_PX,
                    c.budgetMs * 0.6
                );
                if (guess !== autoScale) {
                    c.scale = guess;
                    c.lastFrameTs = 0;
                    setAutoScale(guess);
                }
            };

            const autoscale = (partMs: number, pixMs: number, now: number) => {
                const c = ctrlRef.current;

                // New display size (or a reset): measure from scratch at full scale.
                if (c.key !== displayKey) {
                    beginCalibration(now);
                    return;
                }

                // Frame-to-frame delta, used to estimate the work that happens
                // outside the timed span.
                const delta = c.lastFrameTs > 0 ? now - c.lastFrameTs : 0;
                c.lastFrameTs = now;

                // Discard warm-up entirely rather than averaging through it.
                if (!c.warmupDone) {
                    c.warmupFrames++;
                    if (c.warmupFrames < WARMUP_FRAMES || now - c.windowStart < WARMUP_MS) {
                        return;
                    }
                    c.warmupDone = true;
                    c.windowStart = now;
                    c.frames = 0;
                    c.pixMs = 0;
                    c.partMs = 0;
                    return;
                }

                c.frames++;
                c.partMs += partMs;
                c.pixMs += pixMs;
                if (delta > 0) {
                    c.frameDeltaMs =
                        c.frameDeltaMs === 0
                            ? delta
                            : c.frameDeltaMs + (delta - c.frameDeltaMs) * 0.1;
                }

                const windowMs = c.phase === 'calibrating' ? CALIBRATION_MS : TRACK_WINDOW_MS;
                if (now - c.windowStart < windowMs || c.frames < MIN_WINDOW_FRAMES) {
                    return;
                }

                c.fps = Math.round((c.frames * 1000) / (now - c.windowStart));
                const workMs = (c.partMs + c.pixMs) / c.frames;
                const count = Math.max(1, particlesRef.current.length);
                c.costPerPx = smoothCost(c.costPerPx, c.pixMs / c.frames / pixelCount, c.samples);
                c.costPerParticle = smoothCost(
                    c.costPerParticle,
                    c.partMs / c.frames / count,
                    c.samples
                );

                // The gap between a frame and the work inside it only means anything
                // while the simulation is actually filling the frame. Under vsync the
                // delta is idle time and would read as enormous overhead.
                if (c.frameDeltaMs > FRAME_BUDGET_MS * 1.05 && c.frameDeltaMs > workMs) {
                    c.overheadMs += (c.frameDeltaMs - workMs - c.overheadMs) * 0.25;
                }
                c.budgetMs = solveWorkBudget(c.overheadMs);

                c.samples++;
                c.frames = 0;
                c.pixMs = 0;
                c.partMs = 0;
                c.windowStart = now;

                if (process.env.NODE_ENV !== 'production') {
                    // Lets the real browser costs be read out instead of guessed at.
                    (window as unknown as Record<string, unknown>).__slime = {
                        phase: c.phase,
                        render: `${width}x${height}`,
                        scale: sceneSize.scale,
                        slimes: slime.current.slimes.value,
                        fps: c.fps,
                        nsPerPx: c.costPerPx * 1e6,
                        nsPerParticle: c.costPerParticle * 1e6,
                        pixMs: pixelCount * c.costPerPx,
                        partMs: slime.current.slimes.value * c.costPerParticle,
                        workMs,
                        frameDeltaMs: c.frameDeltaMs,
                        overheadMs: c.overheadMs,
                        budgetMs: c.budgetMs,
                    };
                }

                // A zero cost means the clock gave us nothing usable this window.
                if (c.costPerPx <= 0 || c.costPerParticle <= 0) {
                    return;
                }

                // Resolution is the priority: it may claim the whole budget except
                // what the minimum population needs, and never drops below
                // TARGET_MIN_PIXELS regardless.
                const pixelLimit = solvePixelLimit(c.budgetMs, c.costPerParticle);
                const wanted = solveRenderScale(
                    sceneSize.displayWidth,
                    sceneSize.displayHeight,
                    c.costPerPx,
                    pixelLimit
                );

                if (c.phase === 'calibrating') {
                    c.phase = 'tracking';
                    c.lastScaleChange = now;
                    c.scale = wanted;
                    c.lastFrameTs = 0;
                    setAutoScale(wanted);
                    return;
                }

                // Unlike before, resolution is not frozen for the session. A cold or
                // unlucky calibration can be corrected once the costs settle, and a
                // change no longer resets the simulation.
                if (wanted !== c.scale && now - c.lastScaleChange >= SCALE_COOLDOWN_MS) {
                    const target = calcRenderSize(
                        sceneSize.displayWidth,
                        sceneSize.displayHeight,
                        wanted
                    );
                    const predicted = target.renderWidth * target.renderHeight * c.costPerPx;
                    // Stepping down is always allowed; stepping up needs slack, so
                    // the two directions cannot chase each other.
                    if (wanted < c.scale || predicted <= pixelLimit * SCALE_UP_HEADROOM) {
                        c.lastScaleChange = now;
                        c.scale = wanted;
                        c.lastFrameTs = 0;
                        setAutoScale(wanted);
                        return;
                    }
                }

                // Always eased, including the first solve after calibration. Jumping
                // straight to the answer converges a second or two sooner but the
                // population visibly pops; growing into it reads as the colony
                // spreading, which is the whole point of the piece.
                applyParticleCount(
                    easeParticleCount(
                        slime.current.slimes.value,
                        solveParticleTarget(c.budgetMs, pixelCount, c.costPerPx, c.costPerParticle)
                    )
                );
            };

            const renderLoop = () => {
                if (
                    document.hidden ||
                    !rendererRef.current ||
                    !sceneRef.current ||
                    !cameraRef.current
                ) {
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                const trails = trailsRef.current;
                const tex = textureRef.current;

                if (!trails || !tex) {
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                // recompute derived config once if dirty
                if (cfgDirtyRef.current || !cfgRef.current) {
                    recomputeCfg();
                }
                // eslint-disable-next-line
                const cfg = cfgRef.current!;

                if (!isRunning) {
                    lastTickMs = 0;
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                const tickMs = performance.now();
                const decision = advanceStepAccumulator(
                    stepAccumulatorMs,
                    lastTickMs > 0 ? tickMs - lastTickMs : SIM_STEP_MS
                );
                lastTickMs = tickMs;
                stepAccumulatorMs = decision.accumulator;
                if (!decision.shouldStep) {
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                showMouseDown();

                // Time the two halves separately: the autoscaler needs a cost per
                // particle and a cost per pixel, not a combined frame time. The
                // texture upload is triggered by tex.needsUpdate inside render(),
                // so render() counts as pixel work.
                const tStart = performance.now();
                stepSlimes(trails, cfg);
                const tParticlesDone = performance.now();

                decayTrails(trails, tex, cfg);
                if (fieldMaterialRef.current) {
                    fieldMaterialRef.current.uniforms.uHue.value = (frameRef.current % 360) / 360;
                }
                rendererRef.current.render(sceneRef.current, cameraRef.current);
                const tEnd = performance.now();

                autoscale(tParticlesDone - tStart, tEnd - tParticlesDone, tEnd);

                frameRef.current = (frameRef.current + COLOR_FADE_SPEED) % 360;
                animId = requestAnimationFrame(renderLoop);
            };

            renderLoop();

            return () => {
                canvas.removeEventListener('pointermove', handleMouseMove);
                canvas.removeEventListener('pointerdown', handleMouseDown);
                window.removeEventListener('pointerup', handleMouseUp);
                if (animId) {
                    cancelAnimationFrame(animId);
                }
            };
        },
        [clickBehavior, isRunning, sceneSize, reset]
    );

    // ===============
    // UI Handlers
    // ===============
    // The autoscaler writes the count into a ref, so nothing re-renders on its own.
    // Poll it only while the readout is actually on screen.
    useEffect(() => {
        if (!isShowingSlimeCount) {
            return;
        }
        const id = window.setInterval(() => setSlimeUI({ ...slime.current }), 500);
        return () => window.clearInterval(id);
    }, [isShowingSlimeCount]);

    const performReset = () => {
        const t = trailsRef.current;
        if (t) {
            t.fill(0);
        }
        particlesRef.current = [];
        setReset((r) => r + 1);
    };

    useEffect(() => {
        const onChange = () => window.dispatchEvent(new Event('resize'));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullScreen = () => {
        if (isFullscreen()) {
            document.exitFullscreen?.().catch(() => {});
        } else {
            containerRef.current?.requestFullscreen?.().catch(() => {});
        }
    };

    // Keydown for quick toggle
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) {
                return;
            }
            if (e.key === 'c') {
                cycleClickBehavior();
            }
            if (e.key === 'r') {
                performReset();
            }
            if (e.key === 's') {
                setIsShowingSlimeCount((v) => !v);
            }
            if (e.key === 'd') {
                SessionStorage.slimeConfig.del();
                window.location.reload();
            }
            if (e.key === 'f') {
                toggleFullScreen();
            }
            if (e.key === ' ' || e.key === 'Spacebar') {
                setIsRunning((v) => !v);
            }
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, []);

    // Evolution (throttled UI refresh)
    useEffect(() => {
        if (!isEvolving || !isRunning) {
            return;
        }

        const id = window.setInterval(() => {
            const nonCount = slimeConfigKeys.filter((k) => !EVOLVE.excluded.includes(k));
            const chosen = pickK(nonCount, Math.min(EVOLVE.fieldsPerStep, nonCount.length));
            for (const k of chosen) {
                const currentValue = slime.current[k];
                slime.current[k].value = nudge(currentValue);
            }
            setSlimeUI({ ...slime.current });
            cfgDirtyRef.current = true; // mark derived cache dirty after changes
        }, EVOLVE.periodMs);

        return () => clearInterval(id);
    }, [isEvolving, isRunning]);

    const renderSlider = (key: SlimeConfigKey) => {
        const { min, max, value } = slime.current[key];

        const percent = ((value - min) / (max - min)) * 100;

        return (
            <div className="labeled-input" key={key}>
                <label>{key}</label>
                <input
                    className={`slider ${isEvolving ? 'evolving' : ''}`}
                    type="range"
                    min={min}
                    max={max}
                    step={(max - min) / 100}
                    value={value}
                    // expose the percentage to CSS
                    // eslint-disable-next-line
                    style={{ ['--percent' as any]: `${percent}%` }}
                    onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        slime.current[key].value = v;
                        setSlimeUI({ ...slime.current });
                        SessionStorage.slimeConfig.set(slime.current);
                        cfgDirtyRef.current = true;
                    }}
                />
            </div>
        );
    };

    const cycleClickBehavior = () => {
        const next = getNextClickBehavior(clickBehavior);
        setClickBehavior(next);
        if (circleRef.current) {
            circleRef.current.material.color = getCircleColor(next);
        }
    };

    return (
        <div className="slime-container">
            {/* Three.js container, only for the scene. */}
            <div
                id={'slime-scene'}
                className={`scene ${clickBehavior !== 'none' ? 'pointer' : ''}`}
                ref={containerRef}
            />

            {/* Controls */}
            <div className={`controls ${isEvolving ? 'evolving' : ''}`}>
                <button
                    className="purple column items-center content-center"
                    onClick={() => setIsRunning(!isRunning)}
                >
                    <FontAwesomeIcon icon={isRunning ? faPause : faPlay} />
                    <kbd>Space</kbd>
                </button>
                <button
                    className="purple column items-center content-center"
                    onClick={performReset}
                >
                    <FontAwesomeIcon icon={faArrowRotateRight} />
                    <kbd>R</kbd>
                </button>
                <button
                    className="purple column items-center content-center"
                    onClick={toggleFullScreen}
                >
                    <FontAwesomeIcon icon={isFullscreen() ? faCompress : faExpand} />
                    <kbd>F</kbd>
                </button>

                <div className="click-action-wrapper">
                    <div className="row items-center gap-1">
                        Click
                        <FontAwesomeIcon
                            style={{ color: 'black' }}
                            className="icon"
                            icon={faHandPointer}
                        />
                    </div>
                    <button
                        className={`click-action ${clickBehavior}`}
                        onClick={cycleClickBehavior}
                    >
                        {clickBehavior}
                        <FontAwesomeIcon
                            className="icon"
                            icon={CLICK_BEHAVIOR_ICONS[clickBehavior]}
                        />
                    </button>
                </div>

                <div className="click-action-wrapper">
                    Evolve
                    <button
                        className={`click-action ${isEvolving ? 'green' : 'gray'}`}
                        onClick={() => setIsEvolving(!isEvolving)}
                    >
                        <span className="grid items-center">
                            <span className={`grid-1 ${isEvolving ? '' : 'hide'}`}>yes</span>
                            <span className={`grid-1 ${isEvolving ? 'hide' : ''}`}>no</span>

                            <div
                                className={`icon virus grid-col-2 ${isEvolving ? 'evolving' : ''}`}
                            >
                                <FontAwesomeIcon icon={faVirus} />
                            </div>
                        </span>
                    </button>
                </div>
                <span>
                    {isShowingSlimeCount
                        ? `${slime.current.slimes.value.toLocaleString()} slimes · ${
                              sceneSize ? `${sceneSize.width}×${sceneSize.height}` : '?'
                          } · ${ctrlRef.current.fps} fps`
                        : undefined}
                </span>

                {/* Slime config range inputs */}
                <div className="config-panel">
                    {slimeConfigKeys
                        .filter((key) => !EVOLVE.excluded.includes(key))
                        .map(renderSlider)}
                </div>
            </div>
        </div>
    );
};

export default SlimeSceneThree;
