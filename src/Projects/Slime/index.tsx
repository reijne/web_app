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
import { faVialVirus } from '@fortawesome/free-solid-svg-icons/faVialVirus';
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

// Fraction of the max FPS, used when we can actually reach that.
const FPS_MIN = Math.round(FPS_ABSOLUTE_MAX * 0.8);

type SlimeConfigKey = (typeof slimeConfigKeys)[number];

export type SlimeConfig = Record<SlimeConfigKey, ConfigValue>;

export interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    slimes: {
        value: 10_000,
        min: 100,
        max: 10_000,
    },
    moveSpeed: { value: 1.25, min: 0.5, max: 4 },
    turnSpeed: { value: 0.2, min: 0.1, max: 0.75 },
    jitter: { value: 0, min: 0, max: 2 },
    turnJitter: { value: 0.5, min: 0, max: 2 },
    sensorAngle: {
        value: Math.PI / 4,
        min: Math.PI / 6,
        max: Math.PI / 2,
    },
    sensorDistance: { value: 25, min: 25, max: 100 },
    trail: { value: 0.995, min: 0.95, max: 0.995 },
    ...SessionStorage.slimeConfig.get(),
};

// ===== Evolution for Slime Config =====
const EVOLVE = {
    periodMs: 500, // how often to evolve
    magnitude: 0.1, // fraction of (max - min) per nudge
    fieldsPerStep: 1, // how many fields to nudge each time
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

// Nudge one ConfigValue by a tiny random amount
function nudge(val: ConfigValue, mag = EVOLVE.magnitude): number {
    const range = val.max - val.min;
    // step in either direction
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
            return new THREE.Color(0x00aa00);
        case 'push':
            return new THREE.Color(0xff0000);
        case 'none':
            return new THREE.Color(0xaaaaaa);
        default:
            return new THREE.Color(0xaaaaaa);
    }
}

// ====== Perf buffers (Typed Arrays) ======
function buildHueLUT32(hueDeg: number) {
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = hslToRgb(hueDeg / 360, 1.0, i / 255);
        out[i] = (255 << 24) | (b << 16) | (g << 8) | r; // 0xAABBGGRR
    }
    return out;
}

// ==============
// Main component
// ==============
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
    const circleRef = useRef<THREE.Mesh<
        THREE.CircleGeometry,
        THREE.MeshBasicMaterial,
        THREE.Object3DEventMap
    > | null>(null);

    // Data for our 2D logic
    const [sceneSize, setSceneSize] = useState<{ width: number; height: number } | null>(null);

    const particlesRef = useRef<SlimeParticle[]>([]);
    const frameRef = useRef(0);

    // Trails (intensity 0..255) and RGBA backing store for the texture
    const trailsRef = useRef<Uint8Array | null>(null);
    const texDataRef = useRef<Uint8Array | null>(null);

    // Three texture
    const textureRef = useRef<THREE.DataTexture | null>(null);

    const isFullscreen = () => document.fullscreenElement != null;

    // Allocate/resize typed arrays
    const rgba32Ref = useRef<Uint32Array | null>(null);
    function allocBuffers(w: number, h: number) {
        const pixels = w * h;
        if (!texDataRef.current || texDataRef.current.length !== pixels * 4) {
            texDataRef.current = new Uint8Array(pixels * 4); // zeroed by default
            rgba32Ref.current = new Uint32Array(texDataRef.current.buffer); // same memory
        }
        if (!trailsRef.current || trailsRef.current.length !== pixels) {
            trailsRef.current = new Uint8Array(pixels);
        }
    }

    /**
     * Resize the amount of actual slime particles we have.
     * @param newCount WARNING: Must be in line with the step amount in slider.
     *
     */
    function resizeParticles(newCount: number) {
        const arr = particlesRef.current;
        if (arr.length < newCount) {
            const toAdd = newCount - arr.length;
            for (let i = 0; i <= toAdd; i++) {
                arr.push({ ...arr[i % arr.length] });
            }
        } else if (arr.length > newCount) {
            arr.length = newCount;
        }
    }

    /** Resize particles and force re-render by updating dependencies. */
    function resizeParticlesImmediate(newCount: number) {
        newCount = Math.round(newCount / 100) * 100;

        resizeParticles(newCount);

        // reflect in config + UI (so the slider shows the change)
        slime.current.slimes.max = newCount;
        slime.current.slimes.value = newCount;
        setSlimeUI({ ...slime.current });
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
            if (containerRef.current == null || sceneSize == null) {
                return;
            }

            // ensure buffers exist before binding DataTexture
            allocBuffers(sceneSize.width, sceneSize.height);

            // Create Renderer
            const renderer = new THREE.WebGLRenderer({
                antialias: false,
                preserveDrawingBuffer: true,
            });
            renderer.setSize(sceneSize.width, sceneSize.height);
            renderer.setPixelRatio(1);
            containerRef.current.appendChild(renderer.domElement);

            // Scene + Ortho Camera
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

            // Full-screen plane
            const geometry = new THREE.PlaneGeometry(sceneSize.width, sceneSize.height);
            geometry.translate(sceneSize.width / 2, sceneSize.height / 2, 0);

            const raw = texDataRef.current;
            const view = new Uint8Array(raw?.buffer as ArrayBuffer); // ensure ArrayBuffer (not SharedArrayBuffer)

            const tex = new THREE.DataTexture(
                view,
                sceneSize.width,
                sceneSize.height,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            );
            tex.needsUpdate = true;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter; // add
            tex.generateMipmaps = false; // add
            tex.flipY = false; // harmless explicit

            const mat = new THREE.MeshBasicMaterial({ map: tex });
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.matrixAutoUpdate = false;
            scene.add(mesh);

            const circleGeo = new THREE.CircleGeometry(1, 32);
            const circleMat = new THREE.MeshBasicMaterial({
                color: getCircleColor(clickBehavior),
                transparent: true,
                opacity: 0.2,
            });
            const circleMesh = new THREE.Mesh(circleGeo, circleMat);
            circleMesh.visible = false;
            scene.add(circleMesh);

            // Store references
            rendererRef.current = renderer;
            sceneRef.current = scene;
            cameraRef.current = camera;
            textureRef.current = tex;
            circleRef.current = circleMesh;

            // Cleanup
            return () => {
                if (renderer != null) {
                    renderer.dispose();
                    renderer.domElement.remove();
                }
                scene.remove(mesh);
                geometry.dispose();
                mat.dispose();
                tex.dispose();
            };
        },
        [reset, sceneSize]
    );

    // Mirror count for particle (re)alloc deps without poking .current in deps
    const slimesCount = slime.current.slimes.value;

    useEffect(
        function createSlimeTrailAndParticles() {
            if (!sceneSize) {
                return;
            }

            const width = sceneSize.width;
            const height = sceneSize.height;
            // (Re)alloc typed arrays for this size
            allocBuffers(width, height);

            // Re-init particles only if the count actually changed
            const arr = particlesRef.current;
            if (arr.length === 0) {
                for (let i = 0; i <= slimesCount; i++) {
                    arr.push(createParticle(width, height));
                }
            } else if (arr.length !== slimesCount) {
                resizeParticles(slimesCount);
            }
        },
        [sceneSize, slimesCount, reset]
    );

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
            if (!sceneSize || rendererRef.current == null) {
                return;
            }
            let animId: number;

            const mouse = {
                x: 0,
                y: 0,
                down: false,
                size: REPULSION.minRadiusPercent,
            };

            // Mouse events on the DOM element
            const handleMouseMove = (e: PointerEvent) => {
                mouse.x = e.offsetX;
                mouse.y = sceneSize.height - e.offsetY;
            };
            const handleMouseDown = () => {
                mouse.down =
                    true &&
                    mouse.x > 0 &&
                    mouse.y > 0 &&
                    mouse.x < sceneSize.width &&
                    mouse.y < sceneSize.height;
            };
            const handleMouseUp = () => {
                mouse.down = false;
            };

            const canvas = rendererRef.current.domElement;
            canvas.addEventListener('pointermove', handleMouseMove, { passive: true });
            canvas.addEventListener('pointerdown', handleMouseDown, { passive: true });
            window.addEventListener('pointerup', handleMouseUp, { passive: true }); // keep this global

            const showMouseDown = () => {
                // Update interaction gizmo
                if (circleRef.current) {
                    if (mouse.down && clickBehavior !== 'none') {
                        circleRef.current.visible = true;
                        circleRef.current.position.set(mouse.x, mouse.y, 0);
                        const bubbleRadius =
                            mouse.size * Math.min(sceneSize.width, sceneSize.height);
                        circleRef.current.scale.set(bubbleRadius, bubbleRadius, 1);
                    } else {
                        circleRef.current.visible = false;
                    }
                }
            };

            // ==============
            // Slime Updaters
            // ==============
            const updateSlimes = (trails: Uint8Array) => {
                const w = sceneSize.width;
                const h = sceneSize.height;
                const screenSize = Math.min(w, h);
                const arr = particlesRef.current;
                const speed = slime.current.moveSpeed.value;
                const jitter = slime.current.jitter.value;
                const turnJitter = slime.current.turnJitter.value;

                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];

                    // 1. repel/attract when clicking — use squared distance
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

                    // 2. Move (cache trig once)
                    p.angle += (Math.random() - 0.5) * turnJitter;
                    const ca = Math.cos(p.angle);
                    const sa = Math.sin(p.angle);
                    p.x += ca * speed + (Math.random() - 0.5) * jitter;
                    p.y += sa * speed + (Math.random() - 0.5) * jitter;
                    clampToBounds(p, w, h);

                    // 3. Mark trail at full intensity
                    const xi = p.x | 0;
                    const yi = p.y | 0;
                    const idx = yi * w + xi;
                    if (idx >= 0 && idx < trails.length) {
                        trails[idx] = 255;
                    }
                }
            };

            const simulateTrailFollowing = (trails: Uint8Array, slimeCurrent: SlimeConfig) => {
                const w = sceneSize.width;
                const h = sceneSize.height;
                const sd = slimeCurrent.sensorDistance.value;
                const sa = slimeCurrent.sensorAngle.value;
                const turn = slimeCurrent.turnSpeed.value;

                const cosSA = Math.cos(sa);
                const sinSA = Math.sin(sa);

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

                    // LEFT = rotate forward by -sa
                    const ldx = ca * cosSA + sa_ * sinSA;
                    const ldy = -ca * sinSA + sa_ * cosSA;

                    // RIGHT = rotate forward by +sa
                    const rdx = ca * cosSA - sa_ * sinSA;
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
                        p.angle -= turn; // turn left
                    } else if (rI > fI && rI > lI) {
                        p.angle += turn; // turn right
                    }
                }
            };

            // Decay + colorize to texture in ONE pass using a hue LUT
            const decayAndBlit = (
                trails: Uint8Array,
                tex: THREE.DataTexture,
                rgba: Uint8Array,
                rgba32: Uint32Array
            ) => {
                if (tex == null || rgba == null || trails == null || rgba32 == null) {
                    return;
                }

                const lut32 = getHueLUT32();

                // integer decay: floor(old * decay), but with a 256 scale so we can bitshift
                const decay256 = Math.floor(slime.current.trail.value * 256); // 0..256
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

            /**
             * Scale down the amount of slime particles if we do not reach lower limit,
             * scale up if we can afford more.
             */
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
                const slimeCurrent = slime.current;
                const tex = textureRef.current;
                const rgba = texDataRef.current;
                const rgba32 = rgba32Ref.current;

                if (!isRunning || !trails || !tex || !rgba || !rgba32) {
                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                    animId = requestAnimationFrame(renderLoop);
                    return;
                }

                ensureFpsLimits();
                showMouseDown();
                // move + stamp trails, then decay+blit
                updateSlimes(trails);
                simulateTrailFollowing(trails, slimeCurrent);
                decayAndBlit(trails, tex, rgba, rgba32);

                // render
                rendererRef.current.render(sceneRef.current, cameraRef.current);

                // next frame hue
                frameRef.current = (frameRef.current + COLOR_FADE_SPEED) % 360;

                animId = requestAnimationFrame(renderLoop);
            };

            renderLoop();

            // Cleanup
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
        // clear trails/particles but keep buffers allocated
        const t = trailsRef.current;
        if (t) {
            t.fill(0);
        }
        particlesRef.current = [];
        setReset((r) => r + 1);
    };

    useEffect(() => {
        const onChange = () => {
            window.dispatchEvent(new Event('resize'));
        };
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
                slime.current[k] = { ...currentValue, value: nudge(currentValue) };
            }
            // refresh sliders occasionally (not every single nudge if you speed up)
            setSlimeUI({ ...slime.current });
            SessionStorage.slimeConfig.set(slime.current);
        }, EVOLVE.periodMs);

        return () => clearInterval(id);
    }, [isEvolving, isRunning]);

    const renderSlider = (key: SlimeConfigKey) => {
        const { min, max, value } = slime.current[key];
        return (
            <div className="labeled-input" key={key}>
                <label>{key}</label>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={(max - min) / 100}
                    value={value}
                    onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        slime.current[key].value = v; // update sim (ref)
                        setSlimeUI({ ...slime.current }); // update UI
                        SessionStorage.slimeConfig.set(slime.current);
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
                className={`scene ${clickBehavior != 'none' ? 'pointer' : ''}`}
                ref={containerRef}
            />

            {/* Controls */}
            <div className="controls">
                <button
                    className="primary column items-center content-center"
                    onClick={() => setIsRunning(!isRunning)}
                >
                    <FontAwesomeIcon icon={isRunning ? faPause : faPlay} />
                    <kbd>Space</kbd>
                </button>
                <button
                    className="primary column items-center content-center"
                    onClick={performReset}
                >
                    <FontAwesomeIcon icon={faArrowRotateRight} />
                    <kbd>R</kbd>
                </button>
                <button
                    className="primary column items-center content-center"
                    onClick={toggleFullScreen}
                >
                    <FontAwesomeIcon icon={isFullscreen() ? faCompress : faExpand} />
                    <kbd>F</kbd>
                </button>

                <div className="click-action-wrapper">
                    <div className="row items-center">
                        Click
                        <FontAwesomeIcon
                            style={{ color: 'gray', paddingLeft: '.25rem' }}
                            className="icon"
                            icon={faHandPointer}
                        />
                    </div>
                    <button
                        className={`click-action ${clickBehavior}`}
                        onClick={() => {
                            const newClickBehavior = getNextClickBehavior(clickBehavior);
                            setClickBehavior(newClickBehavior);
                            if (circleRef.current) {
                                circleRef.current.material.color = getCircleColor(newClickBehavior);
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
                        {isEvolving ? 'yes' : 'no'}
                        <FontAwesomeIcon className="icon" icon={isEvolving ? faVialVirus : faBan} />
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
