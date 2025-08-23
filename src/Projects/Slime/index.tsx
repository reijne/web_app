import React, { useEffect, useRef, useState } from 'react';

import { faArrowRotateRight } from '@fortawesome/free-solid-svg-icons/faArrowRotateRight';
import { faArrowsToCircle } from '@fortawesome/free-solid-svg-icons/faArrowsToCircle';
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan';
import { faCircleXmark } from '@fortawesome/free-solid-svg-icons/faCircleXmark';
import { faCompress } from '@fortawesome/free-solid-svg-icons/faCompress';
import { faExpand } from '@fortawesome/free-solid-svg-icons/faExpand';
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
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

export interface SlimeConfig {
    particleCount: ConfigValue;
    trailStrength: ConfigValue;
    moveSpeed: ConfigValue;
    sensorAngle: ConfigValue;
    sensorDistance: ConfigValue;
    turnSpeed: ConfigValue;
    jitter: ConfigValue;
    turnJitter: ConfigValue;
}

export interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

let SLIME_CONFIG: SlimeConfig = {
    particleCount: {
        value: 30_000,
        min: 10_000,
        max: 100_000,
    },
    moveSpeed: { value: 1.25, min: 0.5, max: 4 },
    turnSpeed: { value: 0.2, min: 0.05, max: 0.5 },
    jitter: { value: 0, min: 0, max: 8 },
    turnJitter: { value: 0.5, min: 0, max: 1 },
    sensorAngle: {
        value: Math.PI / 4,
        min: Math.PI / 8,
        max: Math.PI / 2,
    },
    sensorDistance: { value: 8.5, min: 5, max: 40 },
    trailStrength: { value: 0.99, min: 0.9, max: 0.9999999999999 },
    ...SessionStorage.slimeConfig.get(),
};

// ===== Evolution for Slime Config =====
const EVOLVE = {
    enabled: true,
    periodMs: 500, // how often to evolve
    magnitude: 0.1, // fraction of (max - min) per nudge
    fieldsPerStep: 1, // how many fields to nudge each time
    excluded: ['particleCount'],
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
    const delta = (Math.random() * 2 - 1) * (range * mag);
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
const COLOR_FADE_SPEED = 0.5;

// ==============
// Helper functions
// ==============
function createParticle(width: number, height: number): SlimeParticle {
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) / 20;

    // Random angle (0..2π)
    const theta = Math.random() * Math.PI * 2;

    // Random radius, corrected for uniform distribution
    const r = Math.sqrt(Math.random()) * maxRadius;

    return {
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
        angle: theta,
    };
}

function clampToBounds(particle: SlimeParticle, width: number, height: number) {
    const offset = 10;
    if (particle.x <= offset) {
        particle.x = width - offset;
    }
    if (particle.x > width - offset) {
        particle.x = offset + 1;
    }
    if (particle.y <= offset) {
        particle.y = height - offset;
    }
    if (particle.y >= height - offset) {
        particle.y = offset + 1;
    }
}

// For now, create a fresh imageData-like 2D array to store "trails"
function createTrailBuffer(prevBuf: number[][] | null, width: number, height: number) {
    // same logic you used
    const newBuf = Array.from({ length: height }, () => Array(width).fill(0));
    if (prevBuf) {
        const copyH = Math.min(prevBuf.length, newBuf.length);
        for (let y = 0; y < copyH; y++) {
            const copyW = Math.min(prevBuf[y].length, newBuf[y].length);
            for (let x = 0; x < copyW; x++) {
                newBuf[y][x] = prevBuf[y][x];
            }
        }
    }
    return newBuf;
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

// ==============
// Main component
// ==============
const SlimeSceneThree: React.FC = () => {
    // Refs and states
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Slime state
    const [clickBehavior, setClickBehavior] = useState<ClickBehaviorAction>('pull');
    const [isRunning, setIsRunning] = useState(true);
    const [isFullscreen, setIsFullScreen] = useState(false);
    const [reset, setReset] = useState(0);

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
    const [sceneSize, setSceneSize] = useState<{
        width: number;
        height: number;
    } | null>(null);

    const trailRef = useRef<number[][] | null>(null);
    const particlesRef = useRef<SlimeParticle[]>([]);
    const frameRef = useRef(0);

    // We'll store the texture that we draw onto a plane
    const textureRef = useRef<THREE.DataTexture | null>(null);

    // =============
    // Resize handler
    // =============
    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                // Only set when both are positive
                if (width > 0 && height > 0) {
                    setSceneSize({ width: Math.floor(width), height: Math.floor(height) });
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // =========================
    // Initialize Three.js scene
    // =========================
    useEffect(() => {
        if (containerRef.current == null || sceneSize == null) {
            return;
        }

        // Create Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(sceneSize.width, sceneSize.height);
        containerRef.current.appendChild(renderer.domElement);

        // Create Scene + Ortho Camera for a 2D-like approach
        const scene = new THREE.Scene();
        // OrthographicCamera "fills" the region from (0,0) to (width,height)
        // if we set left=0, right=width, etc. We'll just invert y for convenience.
        const camera = new THREE.OrthographicCamera(0, sceneSize.width, sceneSize.height, 0, -1, 1);
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        // Create a plane that matches the width/height in "virtual pixels"
        const geometry = new THREE.PlaneGeometry(sceneSize.width, sceneSize.height);
        // We'll shift it so that plane's center is at (width/2, height/2)
        geometry.translate(sceneSize.width / 2, sceneSize.height / 2, 0);

        // For the texture, we create a placeholder DataTexture, size = width×height
        // RGBA, each pixel 4 bytes
        const size = sceneSize.width * sceneSize.height;
        const data = new Uint8Array(size * 4); // fill with 0
        const tex = new THREE.DataTexture(
            data,
            sceneSize.width,
            sceneSize.height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        tex.needsUpdate = true;

        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(geometry, mat);
        scene.add(mesh);

        const circleGeo = new THREE.CircleGeometry(1, 32); // radius=1, 32 segments
        const circleMat = new THREE.MeshBasicMaterial({
            color: getCircleColor(clickBehavior),
            transparent: true,

            opacity: 0.2, // slightly see-through
        });
        const circleMesh = new THREE.Mesh(circleGeo, circleMat);
        circleMesh.visible = false; // start hidden
        scene.add(circleMesh);

        // Store references
        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        textureRef.current = tex;
        circleRef.current = circleMesh;

        // Cleanup
        return () => {
            // remove old canvas
            if (renderer != null) {
                renderer.dispose();
                renderer.domElement.remove();
            }
            scene.remove(mesh);
            geometry.dispose();
            mat.dispose();
            tex.dispose();
        };
    }, [reset, sceneSize]);

    // ===============================
    // Slime "simulation" re-initialize
    // ===============================
    useEffect(() => {
        if (sceneSize == null) {
            return;
        }

        // Re-init trail buffer
        trailRef.current = createTrailBuffer(trailRef.current, sceneSize.width, sceneSize.height);

        // Re-init particles
        if (particlesRef.current.length !== SLIME_CONFIG.particleCount.value) {
            // Create brand new set
            particlesRef.current = Array.from({ length: SLIME_CONFIG.particleCount.value }, () =>
                createParticle(sceneSize.width, sceneSize.height)
            );
        }
    }, [sceneSize, reset]);

    // ===============
    // Animation / Loop
    // ===============
    useEffect(() => {
        if (sceneSize == null) {
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
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) {
                return;
            }
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = rect.height - (e.clientY - rect.top);
        };
        const handleMouseDown = () => {
            mouse.down = true;
        };
        const handleMouseUp = () => {
            mouse.down = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        // ==============
        // Slime Updaters
        // ==============
        const updateSlimes = (mouse: { x: number; y: number; down: boolean; size: number }) => {
            if (sceneSize == null) {
                return;
            }
            const screenSize = Math.min(sceneSize.width, sceneSize.height);
            const particlesCurrent = particlesRef.current;
            const trailCurrent = trailRef.current;
            if (particlesCurrent == null || trailCurrent == null) {
                return;
            }

            particlesRef.current.forEach((p) => {
                // 1. If clicking, repel or attract
                if (clickBehavior !== 'none' && mouse.down) {
                    const dx = p.x - mouse.x;
                    const dy = p.y - mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < mouse.size * screenSize) {
                        if (clickBehavior === 'push') {
                            p.angle = Math.atan2(dy, dx);
                        }
                        if (clickBehavior === 'pull') {
                            p.angle = Math.atan2(dy, dx) + Math.PI;
                        }
                    }
                    // Expand bubble
                    if (mouse.size < REPULSION.maxRadiusPercent) {
                        mouse.size += REPULSION.growPercentPerTick;
                    }
                }

                // 1. Add jitter to the angle
                p.angle += (Math.random() - 0.5) * SLIME_CONFIG.turnJitter.value;
                // 2. Move the particle using the updated angle
                p.x +=
                    Math.cos(p.angle) * SLIME_CONFIG.moveSpeed.value +
                    (Math.random() - 0.5) * SLIME_CONFIG.jitter.value;
                p.y +=
                    Math.sin(p.angle) * SLIME_CONFIG.moveSpeed.value +
                    (Math.random() - 0.5) * SLIME_CONFIG.jitter.value;
                clampToBounds(p, sceneSize.width, sceneSize.height);

                // 3. Mark trail
                trailCurrent[Math.floor(p.y)][Math.floor(p.x)] = 1;
            });

            // 4. "Sensor" logic to follow trails (optional)
            simulateTrailFollowing();
        };

        const simulateTrailFollowing = () => {
            const trailCurrent = trailRef.current;
            if (trailCurrent == null || sceneSize == null) {
                return;
            }
            particlesRef.current.forEach((p) => {
                const forwardX = Math.floor(
                    p.x + Math.cos(p.angle) * SLIME_CONFIG.sensorDistance.value
                );
                const forwardY = Math.floor(
                    p.y + Math.sin(p.angle) * SLIME_CONFIG.sensorDistance.value
                );

                const leftX = Math.floor(
                    p.x +
                        Math.cos(p.angle - SLIME_CONFIG.sensorAngle.value) *
                            SLIME_CONFIG.sensorDistance.value
                );
                const leftY = Math.floor(
                    p.y +
                        Math.sin(p.angle - SLIME_CONFIG.sensorAngle.value) *
                            SLIME_CONFIG.sensorDistance.value
                );

                const rightX = Math.floor(
                    p.x +
                        Math.cos(p.angle + SLIME_CONFIG.sensorAngle.value) *
                            SLIME_CONFIG.sensorDistance.value
                );
                const rightY = Math.floor(
                    p.y +
                        Math.sin(p.angle + SLIME_CONFIG.sensorAngle.value) *
                            SLIME_CONFIG.sensorDistance.value
                );

                // clamp
                const safeForwardX = Math.max(0, Math.min(sceneSize.width - 1, forwardX));
                const safeForwardY = Math.max(0, Math.min(sceneSize.height - 1, forwardY));
                const safeLeftX = Math.max(0, Math.min(sceneSize.width - 1, leftX));
                const safeLeftY = Math.max(0, Math.min(sceneSize.height - 1, leftY));
                const safeRightX = Math.max(0, Math.min(sceneSize.width - 1, rightX));
                const safeRightY = Math.max(0, Math.min(sceneSize.height - 1, rightY));

                const fI = trailCurrent[safeForwardY][safeForwardX];
                const lI = trailCurrent[safeLeftY][safeLeftX];
                const rI = trailCurrent[safeRightY][safeRightX];

                if (lI > fI && lI > rI) {
                    p.angle -= SLIME_CONFIG.turnSpeed.value;
                } else if (rI > fI && rI > lI) {
                    p.angle += SLIME_CONFIG.turnSpeed.value;
                }
            });
        };

        // =======================
        // Convert trails → texture
        // =======================
        const updateTextureFromTrail = () => {
            if (textureRef.current == null || trailRef.current == null || sceneSize == null) {
                return;
            }

            const data = textureRef.current.image.data as Uint8Array;
            // frameRef is used for rainbow hue offset
            const hueOffset = frameRef.current;

            let idx = 0;
            for (let y = 0; y < sceneSize.height; y++) {
                for (let x = 0; x < sceneSize.width; x++) {
                    const intensity = trailRef.current[y][x];
                    const [r, g, b] = hslToRgb((hueOffset % 360) / 360, 1.0, intensity);
                    data[idx + 0] = r; // R
                    data[idx + 1] = g; // G
                    data[idx + 2] = b; // B
                    data[idx + 3] = 255; // A
                    idx += 4;
                }
            }
            textureRef.current.needsUpdate = true;
        };

        const renderLoop = () => {
            if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
                animId = requestAnimationFrame(renderLoop);
                return;
            }

            if (!isRunning) {
                // If paused, just re-render the existing frame
                rendererRef.current.render(sceneRef.current, cameraRef.current);
                animId = requestAnimationFrame(renderLoop);
                return;
            }

            // 1. Decay the existing trails
            if (trailRef.current) {
                for (let y = 0; y < sceneSize.height; y++) {
                    for (let x = 0; x < sceneSize.width; x++) {
                        trailRef.current[y][x] *= SLIME_CONFIG.trailStrength.value;
                    }
                }
            }

            // 2.5: Update the circle visuals
            if (circleRef.current) {
                if (mouse.down && clickBehavior !== 'none') {
                    circleRef.current.visible = true;
                    // Position the circle in your 2D scene
                    circleRef.current.position.set(mouse.x, mouse.y, 0);

                    // Scale the mesh by the bubble radius.
                    // (CircleGeometry has radius=1 by default, so we scale).
                    const bubbleRadius = mouse.size * Math.min(sceneSize.width, sceneSize.height);
                    circleRef.current.scale.set(bubbleRadius, bubbleRadius, 1);
                } else {
                    circleRef.current.visible = false;
                }
            }

            // 2. Move the slimes
            updateSlimes(mouse);

            // 3. Convert the numeric "trail buffer" to a texture image
            updateTextureFromTrail();

            // 4. Render
            rendererRef.current.render(sceneRef.current, cameraRef.current);

            // 5. Next frame
            frameRef.current = (frameRef.current + COLOR_FADE_SPEED) % 360;

            let str = '';
            for (const key in SLIME_CONFIG) {
                str = `${str} | ${key} | ${SLIME_CONFIG[key as keyof SlimeConfig].value}`;
            }
            console.log(str);

            animId = requestAnimationFrame(renderLoop);
        };

        // Start
        renderLoop();

        // Cleanup
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            if (animId) {
                cancelAnimationFrame(animId);
            }
        };
    }, [clickBehavior, isRunning, sceneSize, reset]);

    // ===============
    // UI Handlers
    // ===============
    const performReset = () => {
        trailRef.current = null;
        particlesRef.current = [];
        setReset(reset + 1);
    };

    useEffect(() => {
        const onChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
            // kick layout-dependent effects that rely on ResizeObserver
            window.dispatchEvent(new Event('resize'));
        };
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullScreen = () => {
        if (document.fullscreenElement) {
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
            // TODO: Make dev only?
            if (e.key === 'd') {
                SessionStorage.slimeConfig.del();
                window.location.reload();
            }
            if (e.key === 'f') {
                toggleFullScreen();
            }
            if (e.key === ' ') {
                setIsRunning(!isRunning);
            }
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, [reset, isRunning, isFullscreen]);

    useEffect(() => {
        if (!EVOLVE.enabled) {
            return;
        }

        const id = window.setInterval(() => {
            // Decide which keys to touch
            const keys = Object.keys(SLIME_CONFIG) as (keyof SlimeConfig)[];
            // Keep particleCount rare, and only a tiny step
            const nonCount = keys.filter((k) => !EVOLVE.excluded.includes(k));
            const chosen = pickK(nonCount, Math.min(EVOLVE.fieldsPerStep, nonCount.length));

            const next: SlimeConfig = { ...SLIME_CONFIG };

            // Nudge chosen fields
            for (const k of chosen) {
                const cv = next[k];
                next[k] = { ...cv, value: nudge(cv) };
            }

            // Persist
            SessionStorage.slimeConfig.set(next);
            SLIME_CONFIG = next;
        }, EVOLVE.periodMs);

        return () => clearInterval(id);
    }, []);

    return (
        <div className="slime-container">
            {/* Put your Three.js container ONLY for the scene */}
            <div id={'slime-scene'} className="scene" ref={containerRef} />

            {/* Controls */}
            <div className="controls">
                <button
                    className="primary flex-column align-items-center justify-content-center"
                    onClick={() => setIsRunning(!isRunning)}
                >
                    <FontAwesomeIcon icon={isRunning ? faPause : faPlay} />
                    <kbd>space</kbd>
                </button>
                <button
                    className="primary flex-column align-items-center justify-content-center"
                    onClick={performReset}
                >
                    <FontAwesomeIcon icon={faArrowRotateRight} />
                    <kbd>R</kbd>
                </button>
                <button
                    className="primary flex-column align-items-center justify-content-center"
                    onClick={toggleFullScreen}
                >
                    <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
                    <kbd>F</kbd>
                </button>
                <div className="click-action-wrapper">
                    Click
                    <button
                        className={`click-action ${clickBehavior}`}
                        onClick={() => {
                            const newClickBehavior = getNextClickBehavior(clickBehavior);
                            setClickBehavior(newClickBehavior);
                            if (circleRef.current != null) {
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

                {/* Slime config range inputs */}
                <div className="config-panel">
                    {Object.entries(SLIME_CONFIG).map(([key, { min, max, value }]) => (
                        <div className="labeled-input" key={key}>
                            <label>{key}</label>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={(max - min) / 100}
                                value={value.toFixed(2)}
                                onChange={(e) => {
                                    const newValue = parseFloat(e.target.value);
                                    SLIME_CONFIG[key as keyof SlimeConfig].value = newValue;
                                    SessionStorage.slimeConfig.set(SLIME_CONFIG);
                                }}
                            />
                            <small>{SLIME_CONFIG[key as keyof SlimeConfig].value.toFixed(2)}</small>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SlimeSceneThree;
