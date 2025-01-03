import React, { useEffect, useRef, useState } from 'react';

import { hslToRgb } from '../../utils/colors';
import { SessionStorage } from '../../utils/session';

import './Slime.css';

interface ConfigValue {
    value: number;
    default: number;
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

// Default configuration
const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    particleCount: { value: 500, default: 500, min: 500, max: 20000 },
    trailDecay: { value: 0.99, default: 0.99, min: 0.94, max: 1 },
    moveSpeed: { value: 1.5, default: 1.5, min: 0.5, max: 3 },
    sensorAngle: { value: Math.PI / 4, default: Math.PI / 4, min: Math.PI / 8, max: Math.PI / 2 },
    sensorDistance: { value: 20, default: 20, min: 5, max: 40 },
    turnSpeed: { value: 0.2, default: 0.2, min: 0.05, max: 0.4 },
    jitter: { value: 2, default: 2, min: 0, max: 8 },
    ...SessionStorage.slimeConfig.get(),
};

const REPULSION = {
    minRadiusPercent: 0.001,
    maxRadiusPercent: 0.5,
    growPercentPerTick: 0.001,
};

const COLOR_FADE_SPEED = 1;

function createParticle(canvas: HTMLCanvasElement): SlimeParticle {
    return {
        x: canvas.width / 2 + ((Math.random() - 0.5) * canvas.width) / 20,
        y: canvas.height / 2 + ((Math.random() - 0.5) * canvas.height) / 20,
        angle: Math.random() * Math.PI * 2,
    };
}

function clampToCanvas(SlimeParticle: SlimeParticle, canvas: HTMLCanvasElement): SlimeParticle {
    const { width, height } = canvas;
    const { x, y, angle } = SlimeParticle;

    if (x < 0) {
        return { ...SlimeParticle, x: width };
    } else if (x > width) {
        return { ...SlimeParticle, x: 0 };
    }

    if (y < 0) {
        return { ...SlimeParticle, y: height };
    } else if (y > height) {
        return { ...SlimeParticle, y: 0 };
    }

    return { ...SlimeParticle, angle };
}

function getSlimeParticles(
    previousRef: SlimeParticle[],
    canvas: HTMLCanvasElement,
    slime: SlimeConfig,
): SlimeParticle[] {
    // Handle old boi;
    if (previousRef.length === slime.particleCount.value) {
        return previousRef.map(particle => clampToCanvas(particle, canvas));
    }

    const fromSession = SessionStorage.slimeParticles.get();
    if (fromSession?.length === slime.particleCount.value) {
        return fromSession.map(particle => clampToCanvas(particle, canvas));
    }

    return Array.from({ length: slime.particleCount.value }, () => createParticle(canvas));
}

function getTrailBuffer(
    previousBuffer: number[][] | null,
    width: number,
    height: number,
): number[][] {
    // Create a new buffer with the updated size
    const newBuffer = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));

    // If we have an old buffer, copy over valid overlapping cells
    if (previousBuffer) {
        // Limit y to the lesser of old/new heights
        const copyHeight = Math.min(previousBuffer.length, newBuffer.length);
        for (let y = 0; y < copyHeight; y++) {
            // Limit x to the lesser of old/new widths
            const copyWidth = Math.min(previousBuffer[y].length, newBuffer[y].length);
            for (let x = 0; x < copyWidth; x++) {
                newBuffer[y][x] = previousBuffer[y][x];
            }
        }
    }

    return newBuffer;
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
    pull: '⌾',
    push: '⧂',
    none: '⍉',
};

const SlimeScene: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<SlimeParticle[]>([]);
    const trailBufferRef = useRef<number[][] | null>(null);
    const animationRef = useRef<number | null>(null);
    const frameRef = useRef<number>(0);

    const [clickBehavior, setClickBehavior] = useState<'pull' | 'push' | 'none'>('pull');
    const [isRunning, setIsRunning] = useState<boolean>(true);
    const [reset, setReset] = useState(1);
    const [slime, setSlime] = useState(DEFAULT_SLIME_CONFIG);
    const [fullScreen, setFullScreen] = useState(false);

    const initTrailBuffer = (width: number, height: number) => {
        trailBufferRef.current = getTrailBuffer(trailBufferRef.current, width, height);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (canvas == null || ctx == null) {
            return;
        }

        let freezeFrame: ImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let frame = frameRef.current;

        const mouse = { x: 0, y: 0, down: false, size: REPULSION.minRadiusPercent };

        const resizeCanvas = () => {
            const { width, height } = canvas.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            initTrailBuffer(canvas.width, canvas.height);
            initializeParticles(canvas);
        };

        const initializeParticles = (canvas: HTMLCanvasElement) => {
            const previousParticles = particlesRef.current;
            particlesRef.current = getSlimeParticles(previousParticles, canvas, slime);
        };

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        };

        const handleMouseDown = () => {
            mouse.down = true;
        };

        const handleMouseUp = () => {
            mouse.down = false;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        const draw = () => {
            if (ctx == null || canvas == null || trailBufferRef.current == null) {
                return;
            }

            if (!isRunning) {
                ctx.putImageData(freezeFrame, 0, 0);
                animationRef.current = requestAnimationFrame(draw);
                return;
            }

            const width = canvas.width;
            const height = canvas.height;
            const screenSize = Math.min(width, height);
            const trailBuffer = trailBufferRef.current;

            decayExistingTrails(width, height, trailBuffer);
            simulateTrailFollowing(width, height);
            drawTrails(width, height, trailBuffer, frame);

            moveAndDrawSlimes(screenSize, width, height, trailBuffer);
            drawMouseDownBubble(screenSize);

            animationRef.current = requestAnimationFrame(draw);
            frame = (frame + COLOR_FADE_SPEED) % 360;
        };

        const decayExistingTrails = (width: number, height: number, trailBuffer: number[][]) => {
            // Decay the trail buffer
            for (let y = 0; y < height - 1; y++) {
                for (let x = 0; x < width - 1; x++) {
                    trailBuffer[y][x] *= slime.trailDecay.value;
                }
            }
        };

        const drawMouseDownBubble = (screenSize: number) => {
            if (clickBehavior === ('none' as const)) {
                return;
            }
            if (mouse.down) {
                const limit =
                    clickBehavior === 'pull'
                        ? REPULSION.maxRadiusPercent
                        : REPULSION.maxRadiusPercent / 2;
                if (mouse.size < limit) {
                    mouse.size += REPULSION.growPercentPerTick;
                }
                ctx.fillStyle = 'rgba(0, 0, 255, 0.01)';
                ctx.beginPath();
                ctx.arc(mouse.x, mouse.y, mouse.size * screenSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(125, 125, 125, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        };

        const drawTrails = (
            width: number,
            height: number,
            trailBuffer: number[][],
            frame: number,
        ) => {
            const imageData = ctx.createImageData(width, height);
            for (let y = 0; y < height - 1; y++) {
                for (let x = 0; x < width - 1; x++) {
                    const index = (y * width + x) * 4;
                    const intensity = trailBuffer[y][x];

                    // Convert HSL to RGB for color application
                    const [r, g, b] = hslToRgb(
                        (frame % 360) / 360, // Hue depends on frame, so rainbow effect over time.
                        1, // Saturation always full.
                        intensity,
                    );

                    // Apply RGB to image data
                    imageData.data[index] = r;
                    imageData.data[index + 1] = g;
                    imageData.data[index + 2] = b;
                    imageData.data[index + 3] = 255; // Alpha channel
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };

        const moveAndDrawSlimes = (
            screenSize: number,
            width: number,
            height: number,
            trailBuffer: number[][],
        ) => {
            // Draw slime particles
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            particlesRef.current.forEach(p => {
                if (clickBehavior !== 'none' && mouse.down) {
                    // Angle away from mouse down.
                    const dx = p.x - mouse.x;
                    const dy = p.y - mouse.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < mouse.size * screenSize) {
                        if (clickBehavior === 'push') {
                            p.angle = Math.atan2(dy, dx);
                        }
                        if (clickBehavior === 'pull') {
                            p.angle = Math.atan2(dy, dx) + Math.PI;
                        }
                    }
                }

                p.x +=
                    Math.cos(p.angle) *
                    (slime.moveSpeed.value + Math.random() * slime.jitter.value);
                p.y +=
                    Math.sin(p.angle) *
                    (slime.moveSpeed.value + Math.random() * slime.jitter.value);

                if (p.x < 0) {
                    p.x = width;
                }
                if (p.x > width) {
                    p.x = 0;
                }
                if (p.y < 0) {
                    p.y = height;
                }
                if (p.y > height) {
                    p.y = 0;
                }
                // Mark the trail at the particle's position
                trailBuffer[Math.floor(p.y)][Math.floor(p.x)] = 1;

                // ctx.fillStyle = `hsl(${p.angle * (180 / Math.PI)}, 100%, 60%)`; // Hue based on angle
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
                ctx.fill();
            });
        };

        const simulateTrailFollowing = (width: number, height: number) => {
            const trailBuffer = trailBufferRef.current;
            if (trailBuffer == null) {
                return;
            }

            particlesRef.current.forEach(p => {
                // Sensor positions
                const forwardX = Math.floor(p.x + Math.cos(p.angle) * slime.sensorDistance.value);
                const forwardY = Math.floor(p.y + Math.sin(p.angle) * slime.sensorDistance.value);

                const leftX = Math.floor(
                    p.x + Math.cos(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value,
                );
                const leftY = Math.floor(
                    p.y + Math.sin(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value,
                );

                const rightX = Math.floor(
                    p.x + Math.cos(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value,
                );
                const rightY = Math.floor(
                    p.y + Math.sin(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value,
                );

                // Clamp sensor positions within canvas bounds
                const safeForwardX = Math.max(0, Math.min(width - 1, forwardX));
                const safeForwardY = Math.max(0, Math.min(height - 1, forwardY));

                const safeLeftX = Math.max(0, Math.min(width - 1, leftX));
                const safeLeftY = Math.max(0, Math.min(height - 1, leftY));

                const safeRightX = Math.max(0, Math.min(width - 1, rightX));
                const safeRightY = Math.max(0, Math.min(height - 1, rightY));

                // Sample trail intensities
                const forwardIntensity = trailBuffer[safeForwardY][safeForwardX];
                const leftIntensity = trailBuffer[safeLeftY][safeLeftX];
                const rightIntensity = trailBuffer[safeRightY][safeRightX];

                // Adjust direction based on trail detection
                if (leftIntensity > forwardIntensity && leftIntensity > rightIntensity) {
                    p.angle -= slime.turnSpeed.value;
                } else if (rightIntensity > forwardIntensity && rightIntensity > leftIntensity) {
                    p.angle += slime.turnSpeed.value;
                }
            });
        };

        // Starts the animation loop to update and draw the scene.
        draw();

        return () => {
            freezeFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            frameRef.current = frame;
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            if (animationRef.current != null) {
                cancelAnimationFrame(animationRef.current);
            }
            SessionStorage.slimeParticles.set(particlesRef.current);
        };
    }, [slime, isRunning, clickBehavior, reset, fullScreen]);

    const toggleSimulation = () => {
        setIsRunning(!isRunning);
    };

    const performReset = () => {
        SessionStorage.slimeParticles.del();
        particlesRef.current = [];
        trailBufferRef.current = [];
        setReset(reset + 1);
    };

    useEffect(() => {
        const handleKeydown = (keydown: KeyboardEvent) => {
            switch (keydown.key) {
                case 'r':
                    return performReset();
                case 'f':
                    return setFullScreen(!fullScreen);
                case ' ':
                    return toggleSimulation();
            }
        };

        window.addEventListener('keydown', handleKeydown);
        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [reset, fullScreen, isRunning]);

    return (
        <div className="slime-container">
            <button className="toggle-full-screen" onClick={() => setFullScreen(!fullScreen)}>
                {fullScreen ? '-' : '+'}
            </button>
            <canvas
                ref={canvasRef}
                className={`slime-scene ${fullScreen ? 'full-screen' : ''}`}
            ></canvas>

            <div className="controls">
                <button
                    className="play-pause secondary icon p-0"
                    onClick={() => toggleSimulation()}
                >
                    {isRunning ? '⏸' : '▶'}
                </button>
                <button className="reset red icon p-0" onClick={() => performReset()}>
                    ↻
                </button>
                <div className="click-action-wrapper">
                    Cursor:
                    <button
                        className={`click-action ${clickBehavior}`}
                        onClick={() => {
                            setClickBehavior(getNextClickBehavior(clickBehavior));
                        }}
                    >
                        {clickBehavior}
                        {CLICK_BEHAVIOR_ICONS[clickBehavior]}
                    </button>
                </div>

                <div className="config-panel">
                    {Object.entries(DEFAULT_SLIME_CONFIG).map(([key, { min, max, value }]) => (
                        <div className="labeled-input" key={key}>
                            <label>{key}</label>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={(max - min) / 5}
                                value={value.toFixed(2)}
                                onChange={e => {
                                    const newSlime = { ...slime }; // Create a shallow copy of the slime object
                                    newSlime[key as keyof SlimeConfig].value = parseFloat(
                                        e.target.value,
                                    ); // Update value directly
                                    // SessionStorage.slimeConfig.set(newSlime);
                                    setSlime(newSlime); // Update state with the modified object
                                }}
                            />
                            <small>{value.toFixed(2)}</small>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SlimeScene;
