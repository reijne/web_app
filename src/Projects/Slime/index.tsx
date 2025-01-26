import React, { useEffect, useRef, useState } from 'react';

import { faArrowLeft } from '@fortawesome/free-solid-svg-icons/faArrowLeft';
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as THREE from 'three';

import { hslToRgb } from '../../utils/colors';
import { SessionStorage } from '../../utils/session';

import './Slime.css';

// ==============
// Types & Config
// ==============
interface ConfigValue {
    value: number;
    defaultValue: number;
    min: number;
    max: number;
}

export interface SlimeConfig {
    particleCount: ConfigValue;
    trailDecay: ConfigValue;
    moveSpeed: ConfigValue;
    sensorAngle: ConfigValue;
    sensorDistance: ConfigValue;
    turnSpeed: ConfigValue;
    jitter: ConfigValue;
}

export interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

// Default config (from your code)
const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    particleCount: {
        value: 20000,
        defaultValue: 20000,
        min: 5000,
        max: 100_000,
    },
    trailDecay: { value: 0.99, defaultValue: 1, min: 0.9, max: 1.003 },
    moveSpeed: { value: 1.5, defaultValue: 1.5, min: 0.5, max: 3 },
    sensorAngle: {
        value: Math.PI / 4,
        defaultValue: Math.PI / 4,
        min: Math.PI / 8,
        max: Math.PI / 2,
    },
    sensorDistance: { value: 20, defaultValue: 20, min: 5, max: 40 },
    turnSpeed: { value: 0.2, defaultValue: 0.2, min: 0.05, max: 0.4 },
    jitter: { value: 2, defaultValue: 2, min: 0, max: 8 },
    ...SessionStorage.slimeConfig.get(),
};

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
    pull: '⌾',
    push: '⧂',
    none: '⍉',
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
    return {
        x: width / 2 + ((Math.random() - 0.5) * width) / 20,
        y: height / 2 + ((Math.random() - 0.5) * height) / 20,
        angle: Math.random() * Math.PI * 2,
    };
}

function clampToBounds(p: SlimeParticle, width: number, height: number) {
    if (p.x <= 0) {
        p.x = width - 2;
    }
    if (p.x >= width - 1) {
        p.x = 1;
    }
    if (p.y <= 0) {
        p.y = height - 2;
    }
    if (p.y >= height - 1) {
        p.y = 1;
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
    const [slime, setSlime] = useState<SlimeConfig>(DEFAULT_SLIME_CONFIG);
    const [clickBehavior, setClickBehavior] = useState<ClickBehaviorAction>('pull');
    const [isRunning, setIsRunning] = useState(true);
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
        const handleResize = () => {
            if (!containerRef.current) {
                return;
            }
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            setSceneSize({ width, height });
        };
        window.addEventListener('resize', handleResize);
        handleResize(); // call once
        return () => window.removeEventListener('resize', handleResize);
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
    }, [reset, sceneSize, clickBehavior]);

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
        if (
            !particlesRef.current.length ||
            particlesRef.current.length !== slime.particleCount.value
        ) {
            // Create brand new set
            particlesRef.current = Array.from({ length: slime.particleCount.value }, () =>
                createParticle(sceneSize.width, sceneSize.height)
            );
        }
        frameRef.current = 0;
    }, [sceneSize, slime, reset]);

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
            mouse.y = sceneSize.height - e.clientY;
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

                // 2. Move
                p.x +=
                    Math.cos(p.angle) *
                    (slime.moveSpeed.value + Math.random() * slime.jitter.value);
                p.y +=
                    Math.sin(p.angle) *
                    (slime.moveSpeed.value + Math.random() * slime.jitter.value);
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
                const forwardX = Math.floor(p.x + Math.cos(p.angle) * slime.sensorDistance.value);
                const forwardY = Math.floor(p.y + Math.sin(p.angle) * slime.sensorDistance.value);

                const leftX = Math.floor(
                    p.x + Math.cos(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value
                );
                const leftY = Math.floor(
                    p.y + Math.sin(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value
                );

                const rightX = Math.floor(
                    p.x + Math.cos(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value
                );
                const rightY = Math.floor(
                    p.y + Math.sin(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value
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
                    p.angle -= slime.turnSpeed.value;
                } else if (rI > fI && rI > lI) {
                    p.angle += slime.turnSpeed.value;
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
                    data[idx + 3] = 1; // A
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
                        trailRef.current[y][x] *= slime.trailDecay.value;
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
    }, [clickBehavior, isRunning, slime, sceneSize, reset]);

    // ===============
    // UI Handlers
    // ===============
    const performReset = () => {
        SessionStorage.slimeParticles.del();
        trailRef.current = null;
        particlesRef.current = [];
        setReset(reset + 1);
    };

    // Keydown for quick toggle
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'r') {
                // performReset();
                // TODO: Figure out how to actually do this, remove code clone.
                SessionStorage.slimeParticles.del();
                trailRef.current = null;
                particlesRef.current = [];
                setReset(reset + 1);
            }
            if (e.key === ' ') {
                setIsRunning(!isRunning);
            }
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, [reset, isRunning]);

    return (
        <div className="slime-container">
            {/* Put your Three.js container ONLY for the scene */}
            <div className="scene" ref={containerRef} />

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
                    <FontAwesomeIcon icon={faArrowLeft} />
                    <kbd>R</kbd>
                </button>
                <div className="click-action-wrapper">
                    Cursor:
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
                        {CLICK_BEHAVIOR_ICONS[clickBehavior]}
                    </button>
                </div>

                {/* Slime config range inputs */}
                <div className="config-panel">
                    {Object.entries(DEFAULT_SLIME_CONFIG).map(([key, { min, max }]) => (
                        <div className="labeled-input" key={key}>
                            <label>{key}</label>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={(max - min) / 5}
                                value={slime[key as keyof SlimeConfig].value.toFixed(2)}
                                onChange={(e) => {
                                    const newSlime = { ...slime };
                                    newSlime[key as keyof SlimeConfig].value = parseFloat(
                                        e.target.value
                                    );
                                    setSlime(newSlime);
                                    SessionStorage.slimeConfig.set(newSlime);
                                }}
                            />
                            <small>{slime[key as keyof SlimeConfig].value.toFixed(2)}</small>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SlimeSceneThree;
