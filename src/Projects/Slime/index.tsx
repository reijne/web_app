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

import { hslToRgb } from '../../utils/colors';
import { clamp } from '../../utils/number';
import { SessionStorage } from '../../utils/session';
import { useWakeLock } from '../../utils/wake';

import './Slime.css';

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

// ==============
// Autoscaler: hold a fixed 60fps and spend whatever is left on slimes.
//
// Per-frame cost splits in two, and both halves are linear:
//   pixel work    = decayAndBlit + texture upload, linear in width * height
//   particle work = updateSlimes + simulateTrailFollowing, linear in count
//
// Measuring frame *rate* cannot see this. requestAnimationFrame is vsync-locked,
// so a frame using 4ms of work and one using 16ms both report 60fps -- the signal
// saturates and only ever reports failure, never headroom. We measure work time
// instead, derive a cost per pixel and a cost per particle, and solve the budget.
// ==============
const TARGET_FPS = 60;
const FRAME_BUDGET_MS = 1000 / TARGET_FPS;
// Headroom for GC, the compositor and general browser overhead.
const BUDGET_SAFETY = 0.7;
const WORK_BUDGET_MS = FRAME_BUDGET_MS * BUDGET_SAFETY;
// Share of the work budget resolution is allowed to claim. The rest buys slimes.
const PIXEL_SHARE = 0.4;

// Resolution is chosen once per display size and then locked. Changing it means
// reallocating the trail buffers, which wipes the field and pops visibly.
const RENDER_SCALE_STEPS = [1, 0.85, 0.7, 0.6, 0.5, 0.4];
const MIN_RENDER_WIDTH = 640;

const PARTICLE_FLOOR = 2_000;
const PARTICLE_CEILING = 250_000;
// Population used during calibration to measure cost per particle.
const PROBE_PARTICLES = 5_000;

const CALIBRATION_MS = 2_000;
const TRACK_WINDOW_MS = 1_000;
// Asymmetric smoothing. A cost going *up* threatens the 60fps floor, so react
// fast; a cost going down is only an opportunity, so grow slowly and stay stable.
// A single symmetric alpha of 0.1 would lag a thermal throttle by ~20s, spending
// all of it below 60fps.
const COST_EMA_ALPHA_RISING = 0.5;
const COST_EMA_ALPHA_FALLING = 0.1;
// Never derive a cost from a handful of frames. Also covers the gap after a pause
// or a hidden tab, where the window has aged but almost nothing was measured.
const MIN_WINDOW_FRAMES = 10;
// Cap steady-state moves so load changes glide instead of snapping. Asymmetric
// for the same reason as the EMA above: shrinking defends the 60fps floor and
// should be allowed to happen quickly, growing is only an optimisation.
const MAX_GROW_STEP = 0.25;
const MAX_SHRINK_STEP = 0.5;
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

// Hard ceiling on render resolution, independent of the autoscaler.
const MAX_RENDER_WIDTH = 1920;
const MAX_RENDER_HEIGHT = 1080;

function calcRenderSize(displayWidth: number, displayHeight: number, autoScale: number) {
    // Cap first: never render more than MAX_RENDER_WIDTH x MAX_RENDER_HEIGHT pixels.
    const capX = displayWidth > MAX_RENDER_WIDTH ? MAX_RENDER_WIDTH / displayWidth : 1;
    const capY = displayHeight > MAX_RENDER_HEIGHT ? MAX_RENDER_HEIGHT / displayHeight : 1;
    const cap = Math.min(capX, capY);

    // Then apply the autoscaler's choice, but never below MIN_RENDER_WIDTH.
    const minScale = Math.min(1, MIN_RENDER_WIDTH / displayWidth);
    const scale = clamp(cap * autoScale, minScale, 1);

    return {
        renderWidth: Math.max(1, Math.floor(displayWidth * scale)),
        renderHeight: Math.max(1, Math.floor(displayHeight * scale)),
        scale,
    };
}

// Largest scale step whose pixel cost fits the pixel share of the work budget.
function solveRenderScale(displayWidth: number, displayHeight: number, costPerPx: number) {
    const pixelBudgetMs = WORK_BUDGET_MS * PIXEL_SHARE;
    for (const step of RENDER_SCALE_STEPS) {
        const { renderWidth, renderHeight } = calcRenderSize(displayWidth, displayHeight, step);
        if (renderWidth * renderHeight * costPerPx <= pixelBudgetMs) {
            return step;
        }
    }
    return RENDER_SCALE_STEPS[RENDER_SCALE_STEPS.length - 1];
}

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

// ====== Perf: 32-bit LUT (AABBGGRR) ======
function buildHueLUT32(hueDeg: number) {
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = hslToRgb(hueDeg / 360, 1.0, i / 255);
        out[i] = (255 << 24) | (b << 16) | (g << 8) | r; // 0xAABBGGRR
    }
    return out;
}

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
    const texDataRef = useRef<Uint8Array | null>(null);
    const rgba32Ref = useRef<Uint32Array | null>(null);

    // Three texture
    const textureRef = useRef<THREE.DataTexture | null>(null);

    // Derived config cache
    const cfgRef = useRef<DerivedCfg | null>(null);
    const cfgDirtyRef = useRef(true);

    const isFullscreen = () => document.fullscreenElement != null;

    function allocBuffers(w: number, h: number) {
        const pixels = w * h;
        if (!texDataRef.current || texDataRef.current.length !== pixels * 4) {
            texDataRef.current = new Uint8Array(pixels * 4);
            rgba32Ref.current = new Uint32Array(texDataRef.current.buffer); // share memory
        }
        if (!trailsRef.current || trailsRef.current.length !== pixels) {
            trailsRef.current = new Uint8Array(pixels);
        }
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

            // buffers use render size (capped at 1920x1080)
            allocBuffers(width, height);

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

            const raw = texDataRef.current;
            const view = new Uint8Array(raw?.buffer as ArrayBuffer);

            const tex = new THREE.DataTexture(
                view,
                sceneSize.width,
                sceneSize.height,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            );
            tex.needsUpdate = true;
            // Use linear filtering for smoother upscaling on large displays
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.flipY = false;

            const mat = new THREE.MeshBasicMaterial({ map: tex });
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

            allocBuffers(width, height);

            // Particle coordinates live in render space, so a resolution change
            // invalidates them. The trail field is reallocated here anyway.
            particlesRef.current.length = 0;
            resizeParticles(slime.current.slimes.value, width, height);
        },
        [sceneSize, reset]
    );

    // LUT cache by integer hue
    const hueIntRef = useRef(-1);
    const lutRef = useRef<Uint32Array | null>(null);
    function getHueLUT32() {
        const hueInt = Math.floor(frameRef.current) % 360;
        if (hueInt !== hueIntRef.current || !lutRef.current) {
            hueIntRef.current = hueInt;
            lutRef.current = buildHueLUT32(hueInt);
        }
        return lutRef.current;
    }

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
        settled: false,
    });

    useEffect(
        function update() {
            if (!sceneSize || !rendererRef.current) {
                return;
            }
            let animId = 0;

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

            // hot loops use `cfg`
            const updateSlimes = (trails: Uint8Array, cfg: DerivedCfg) => {
                const w = sceneSize.width;
                const h = sceneSize.height;
                const screenSize = Math.min(w, h);
                const arr = particlesRef.current;

                const speed = cfg.speed;
                const jitter = cfg.jitter;
                const turnJitter = cfg.turnJitter;

                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];

                    if (clickBehavior !== 'none' && mouse.down) {
                        const dx = p.x - mouse.x;
                        const dy = p.y - mouse.y;
                        const r = mouse.size * screenSize;
                        const r2 = r * r;
                        const dist2 = dx * dx + dy * dy;
                        if (dist2 < r2) {
                            const ang = Math.atan2(dy, dx);
                            p.angle = clickBehavior === 'push' ? ang : ang + Math.PI;
                        }
                        if (mouse.size < REPULSION.maxRadiusPercent) {
                            mouse.size += REPULSION.growPercentPerTick;
                        }
                    }

                    p.angle += (Math.random() - 0.5) * turnJitter;
                    const ca = Math.cos(p.angle);
                    const sa = Math.sin(p.angle);
                    p.x += ca * speed + (Math.random() - 0.5) * jitter;
                    p.y += sa * speed + (Math.random() - 0.5) * jitter;
                    clampToBounds(p, w, h);

                    const xi = p.x | 0;
                    const yi = p.y | 0;
                    const idx = yi * w + xi;
                    if (idx >= 0 && idx < trails.length) {
                        trails[idx] = 255;
                    }
                }
            };

            const simulateTrailFollowing = (trails: Uint8Array, cfg: DerivedCfg) => {
                const w = sceneSize.width;
                const h = sceneSize.height;
                const sd = cfg.sd;
                const turn = cfg.turn;
                const cosSA = cfg.cosSA;
                const sinSA = cfg.sinSA;

                const clampX = (x: number) => (x < 0 ? 0 : x >= w ? w - 1 : x);
                const clampY = (y: number) => (y < 0 ? 0 : y >= h ? h - 1 : y);

                const arr = particlesRef.current;
                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];
                    const ca = Math.cos(p.angle);
                    const sa_ = Math.sin(p.angle);

                    // forward
                    const fX = (p.x + ca * sd) | 0;
                    const fY = (p.y + sa_ * sd) | 0;

                    // rotate forward vector by ±sensorAngle using 2x2 rotation
                    const ldx = ca * cosSA + sa_ * sinSA; // left = -sa
                    const ldy = -ca * sinSA + sa_ * cosSA;
                    const rdx = ca * cosSA - sa_ * sinSA; // right = +sa
                    const rdy = ca * sinSA + sa_ * cosSA;

                    const lX = (p.x + ldx * sd) | 0;
                    const lY = (p.y + ldy * sd) | 0;
                    const rX = (p.x + rdx * sd) | 0;
                    const rY = (p.y + rdy * sd) | 0;

                    const fIdx = clampY(fY) * w + clampX(fX);
                    const lIdx = clampY(lY) * w + clampX(lX);
                    const rIdx = clampY(rY) * w + clampX(rX);

                    const fI = trails[fIdx];
                    const lI = trails[lIdx];
                    const rI = trails[rIdx];

                    if (lI > fI && lI > rI) {
                        p.angle -= turn;
                    } else if (rI > fI && rI > lI) {
                        p.angle += turn;
                    }
                }
            };

            const decayAndBlit = (
                trails: Uint8Array,
                tex: THREE.DataTexture,
                rgba32: Uint32Array,
                cfg: DerivedCfg
            ) => {
                const lut32 = getHueLUT32();
                const decay256 = cfg.decay256;
                const len = trails.length;
                const zeroColor = lut32[0];
                const needsFloorFix = decay256 < 256;

                // Process 4 pixels at a time for better CPU cache utilization
                const len4 = len - (len % 4);
                let i = 0;

                for (; i < len4; i += 4) {
                    // Pixel 0
                    let oldI = trails[i];
                    if (oldI === 0) {
                        rgba32[i] = zeroColor;
                    } else {
                        let newI = (oldI * decay256) >> 8;
                        if (needsFloorFix && newI === oldI) {
                            newI = oldI - 1;
                        }
                        trails[i] = newI;
                        rgba32[i] = lut32[newI];
                    }

                    // Pixel 1
                    oldI = trails[i + 1];
                    if (oldI === 0) {
                        rgba32[i + 1] = zeroColor;
                    } else {
                        let newI = (oldI * decay256) >> 8;
                        if (needsFloorFix && newI === oldI) {
                            newI = oldI - 1;
                        }
                        trails[i + 1] = newI;
                        rgba32[i + 1] = lut32[newI];
                    }

                    // Pixel 2
                    oldI = trails[i + 2];
                    if (oldI === 0) {
                        rgba32[i + 2] = zeroColor;
                    } else {
                        let newI = (oldI * decay256) >> 8;
                        if (needsFloorFix && newI === oldI) {
                            newI = oldI - 1;
                        }
                        trails[i + 2] = newI;
                        rgba32[i + 2] = lut32[newI];
                    }

                    // Pixel 3
                    oldI = trails[i + 3];
                    if (oldI === 0) {
                        rgba32[i + 3] = zeroColor;
                    } else {
                        let newI = (oldI * decay256) >> 8;
                        if (needsFloorFix && newI === oldI) {
                            newI = oldI - 1;
                        }
                        trails[i + 3] = newI;
                        rgba32[i + 3] = lut32[newI];
                    }
                }

                // Handle remaining pixels
                for (; i < len; i++) {
                    const oldI = trails[i];
                    if (oldI === 0) {
                        rgba32[i] = zeroColor;
                    } else {
                        let newI = (oldI * decay256) >> 8;
                        if (needsFloorFix && newI === oldI) {
                            newI = oldI - 1;
                        }
                        trails[i] = newI;
                        rgba32[i] = lut32[newI];
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
                c.settled = false;
                applyParticleCount(PROBE_PARTICLES);
            };

            const ema = (prev: number, next: number, samples: number) => {
                if (samples === 0) {
                    return next;
                }
                const alpha = next > prev ? COST_EMA_ALPHA_RISING : COST_EMA_ALPHA_FALLING;
                return prev + (next - prev) * alpha;
            };

            const autoscale = (partMs: number, pixMs: number, now: number) => {
                const c = ctrlRef.current;

                // New display size (or a reset): measure from scratch at full scale.
                if (c.key !== displayKey) {
                    beginCalibration(now);
                    return;
                }

                c.frames++;
                c.partMs += partMs;
                c.pixMs += pixMs;

                const windowMs = c.phase === 'calibrating' ? CALIBRATION_MS : TRACK_WINDOW_MS;
                if (now - c.windowStart < windowMs || c.frames < MIN_WINDOW_FRAMES) {
                    return;
                }

                const count = Math.max(1, particlesRef.current.length);
                c.costPerPx = ema(c.costPerPx, c.pixMs / c.frames / pixelCount, c.samples);
                c.costPerParticle = ema(c.costPerParticle, c.partMs / c.frames / count, c.samples);
                c.samples++;
                c.frames = 0;
                c.pixMs = 0;
                c.partMs = 0;
                c.windowStart = now;

                // A zero cost means the clock gave us nothing usable this window.
                if (c.costPerPx <= 0 || c.costPerParticle <= 0) {
                    return;
                }

                if (c.phase === 'calibrating') {
                    c.phase = 'tracking';
                    // Changing the scale rebuilds the scene and re-runs this effect.
                    // The key is unchanged, so the controller resumes in tracking.
                    setAutoScale(
                        solveRenderScale(
                            sceneSize.displayWidth,
                            sceneSize.displayHeight,
                            c.costPerPx
                        )
                    );
                    return;
                }

                // Resolution is locked now, so slimes get the whole remainder of the
                // budget -- not just the 1 - PIXEL_SHARE slice. PIXEL_SHARE only ever
                // decided which scale step to pick.
                const particleBudgetMs = Math.max(0, WORK_BUDGET_MS - pixelCount * c.costPerPx);
                const target = particleBudgetMs / c.costPerParticle;

                const current = slime.current.slimes.value;
                // First solve after calibration jumps straight to the answer; after
                // that, clamp. A raw spike cannot drive this on its own -- the window
                // averages at least MIN_WINDOW_FRAMES frames and the EMA smooths again.
                const next = c.settled
                    ? clamp(target, current * (1 - MAX_SHRINK_STEP), current * (1 + MAX_GROW_STEP))
                    : target;
                c.settled = true;
                applyParticleCount(next);
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
                const rgba32 = rgba32Ref.current;

                if (!trails || !tex || !rgba32) {
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
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                showMouseDown();

                // Time the two halves separately: the autoscaler needs a cost per
                // particle and a cost per pixel, not a combined frame time. The
                // texture upload is triggered by tex.needsUpdate inside render(),
                // so render() counts as pixel work.
                const tStart = performance.now();
                updateSlimes(trails, cfg);
                simulateTrailFollowing(trails, cfg);
                const tParticlesDone = performance.now();

                decayAndBlit(trails, tex, rgba32, cfg);
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
                <span>{isShowingSlimeCount ? slime.current.slimes.value : undefined}</span>

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
