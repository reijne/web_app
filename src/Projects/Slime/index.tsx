import React, { useEffect, useRef, useState } from 'react';

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

const FPS_ABSOLUTE_MIN = 55; // Scale to minimum 60hz
const FPS_ABSOLUTE_MAX = 115; // Scale to 120hz
const FPS_MIN = Math.round(FPS_ABSOLUTE_MAX * 0.8);

type SlimeConfigKey = (typeof slimeConfigKeys)[number];
export type SlimeConfig = Record<SlimeConfigKey, ConfigValue>;

export interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    slimes: { value: 10_000, min: 100, max: 10_000 },
    moveSpeed: { value: 0.5, min: 0.2, max: 2 },
    turnSpeed: { value: 0.4, min: 0.4, max: 0.8 },
    jitter: { value: 0, min: 0, max: 1 },
    turnJitter: { value: 0.5, min: 0, max: 1 },
    sensorAngle: { value: Math.PI / 6, min: Math.PI / 10, max: Math.PI / 4 },
    sensorDistance: { value: 25, min: 10, max: 100 },
    trail: { value: 0.995, min: 0.97, max: 0.995 },
    ...SessionStorage.slimeConfig.get(),
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
    const offset = 10;
    if (p.x <= offset) {
        p.x = width - offset;
    }
    if (p.x > width - offset) {
        p.x = offset + 1;
    }
    if (p.y <= offset) {
        p.y = height - offset;
    }
    if (p.y >= height - offset) {
        p.y = offset + 1;
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
    const [isRunning, setIsRunning] = useState(true);
    const [isEvolving, setIsEvolving] = useState(true);
    const [reset, setReset] = useState(0);
    const [fpsMin, setFpsMin] = useState(FPS_ABSOLUTE_MIN);

    // For rendering
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const circleRef = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | null>(
        null
    );

    // Data for our 2D logic
    const [sceneSize, setSceneSize] = useState<{ width: number; height: number } | null>(null);

    const particlesRef = useRef<SlimeParticle[]>([]);
    const frameRef = useRef(0);

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

    function resizeParticlesImmediate(newCount: number) {
        newCount = Math.round(newCount / 100) * 100; // step = 100
        resizeParticles(newCount);
        slime.current.slimes.max = newCount; // cap slider to safe ceiling
        slime.current.slimes.value = newCount; // reflect immediately
        setSlimeUI({ ...slime.current });
        cfgDirtyRef.current = true; // config changed
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
                    setSceneSize({ width: Math.floor(width), height: Math.floor(height) });
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

            // buffers before texture
            allocBuffers(sceneSize.width, sceneSize.height);

            const renderer = new THREE.WebGLRenderer({
                antialias: false,
                preserveDrawingBuffer: true,
            });
            renderer.setSize(sceneSize.width, sceneSize.height);
            renderer.setPixelRatio(1);
            containerRef.current.appendChild(renderer.domElement);

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

    // mirror count
    const slimesCount = slime.current.slimes.value;

    useEffect(
        function createSlimeTrailAndParticles() {
            if (!sceneSize) {
                return;
            }
            const { width, height } = sceneSize;

            allocBuffers(width, height);

            const arr = particlesRef.current;
            if (arr.length === 0) {
                resizeParticles(slimesCount, width, height);
            } else if (arr.length !== slimesCount) {
                resizeParticles(slimesCount, width, height);
            }
        },
        [sceneSize, slimesCount, reset]
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

    const fpsRef = useRef({ last: performance.now(), frames: 0, fps: 0 });

    useEffect(
        function update() {
            if (!sceneSize || !rendererRef.current) {
                return;
            }
            let animId = 0;

            const mouse = { x: 0, y: 0, down: false, size: REPULSION.minRadiusPercent };

            const canvas = rendererRef.current.domElement;
            const handleMouseMove = (e: PointerEvent) => {
                mouse.x = e.offsetX;
                mouse.y = sceneSize.height - e.offsetY;
            };
            const handleMouseDown = () => {
                mouse.down =
                    mouse.x > 0 &&
                    mouse.y > 0 &&
                    mouse.x < sceneSize.width &&
                    mouse.y < sceneSize.height;
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

                for (let i = 0; i < trails.length; i++) {
                    const oldI = trails[i];
                    let newI = (oldI * decay256) >> 8;
                    if (newI === oldI && oldI > 0 && decay256 < 256) {
                        newI = oldI - 1;
                    }
                    trails[i] = newI;
                    rgba32[i] = lut32[newI]; // single 32-bit write
                }
                tex.needsUpdate = true;
            };

            const ensureFpsLimits = () => {
                fpsRef.current.frames++;
                const now = performance.now();
                if (now - fpsRef.current.last >= 1000) {
                    fpsRef.current.fps = fpsRef.current.frames;
                    fpsRef.current.frames = 0;
                    fpsRef.current.last = now;

                    if (fpsRef.current.fps < fpsMin) {
                        const next = slime.current.slimes.value * 0.9;
                        resizeParticlesImmediate(next);
                    } else if (
                        fpsRef.current.fps > FPS_ABSOLUTE_MAX &&
                        slime.current.slimes.value === slime.current.slimes.max
                    ) {
                        if (fpsMin !== FPS_MIN) {
                            setFpsMin(FPS_MIN);
                        }
                        const next = slime.current.slimes.value * 1.1;
                        resizeParticlesImmediate(next);
                    }
                }
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

                ensureFpsLimits();
                showMouseDown();

                updateSlimes(trails, cfg);
                simulateTrailFollowing(trails, cfg);
                decayAndBlit(trails, tex, rgba32, cfg);

                rendererRef.current.render(sceneRef.current, cameraRef.current);

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
            if (e.key === 'r') {
                performReset();
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
                        onClick={() => {
                            const next = getNextClickBehavior(clickBehavior);
                            setClickBehavior(next);
                            if (circleRef.current) {
                                circleRef.current.material.color = getCircleColor(next);
                            }
                        }}
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
