import React, { useEffect, useRef, useState } from 'react';

import './Slime.css';

interface ConfigValue {
    value: number;
    default: number;
    min: number;
    max: number;
}

interface SlimeConfig {
    particleCount: ConfigValue;
    trailDecay: ConfigValue;
    speed: ConfigValue;
    sensorAngle: ConfigValue;
    sensorDistance: ConfigValue;
    turnSpeed: ConfigValue;
}

interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

// Default configuration
const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    particleCount: { value: 500, default: 500, min: 100, max: 20000 },
    trailDecay: { value: 0.98, default: 0.98, min: 0.9, max: 1 },
    speed: { value: 1.5, default: 1.5, min: 0.5, max: 3 },
    sensorAngle: { value: Math.PI / 4, default: Math.PI / 4, min: Math.PI / 8, max: Math.PI / 2 },
    sensorDistance: { value: 20, default: 20, min: 5, max: 40 },
    turnSpeed: { value: 0.2, default: 0.2, min: 0.05, max: 0.4 },
};

function createParticle(canvas: HTMLCanvasElement): SlimeParticle {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        angle: Math.random() * Math.PI * 2,
    };
}

const SlimeScene: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<SlimeParticle[]>([]);
    const trailBufferRef = useRef<number[][] | null>(null);
    const animationRef = useRef<number | null>(null);

    const [slime, setSlime] = useState(DEFAULT_SLIME_CONFIG);
    const [isRunning, setIsRunning] = useState(true);
    const [showConfig, setShowConfig] = useState(true);

    const initTrailBuffer = (width: number, height: number) => {
        trailBufferRef.current = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

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
            particlesRef.current = Array.from({ length: slime.particleCount.value }, () =>
                createParticle(canvas),
            );
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        initializeParticles(canvas);

        const drawParticles = () => {
            if (ctx == null || canvas == null || trailBufferRef.current == null) {
                return;
            }

            const width = canvas.width;
            const height = canvas.height;
            const trailBuffer = trailBufferRef.current;

            // **Decay the trail buffer only if running**
            if (isRunning) {
                for (let y = 0; y < height - 1; y++) {
                    for (let x = 0; x < width - 1; x++) {
                        trailBuffer[y][x] *= slime.trailDecay.value;
                    }
                }
            }

            // **Simulate trail following**
            simulateTrailFollowing(ctx, width, height);

            // Render the trail buffer
            const imageData = ctx.createImageData(width, height);
            for (let y = 0; y < height - 1; y++) {
                for (let x = 0; x < width - 1; x++) {
                    const index = (y * width + x) * 4;
                    const intensity = trailBuffer[y][x] * 255;
                    imageData.data[index] = intensity;
                    imageData.data[index + 1] = intensity;
                    imageData.data[index + 2] = intensity;
                    imageData.data[index + 3] = 255; // Alpha
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // Draw slime particles
            ctx.fillStyle = 'rgb(134, 255, 188)';
            particlesRef.current.forEach(p => {
                if (isRunning) {
                    p.x += Math.cos(p.angle) * slime.speed.value;
                    p.y += Math.sin(p.angle) * slime.speed.value;

                    if (p.x < 0) p.x = width;
                    if (p.x > width) p.x = 0;
                    if (p.y < 0) p.y = height;
                    if (p.y > height) p.y = 0;
                }
                // Mark the trail at the particle's position
                trailBuffer[Math.floor(p.y)][Math.floor(p.x)] = 1;

                // ctx.fillStyle = `hsl(${p.angle * (180 / Math.PI)}, 100%, 60%)`; // Hue based on angle
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
                ctx.fill();
            });

            if (isRunning) {
                animationRef.current = requestAnimationFrame(drawParticles);
            }
        };

        const simulateTrailFollowing = (
            ctx: CanvasRenderingContext2D,
            width: number,
            height: number,
        ) => {
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

        drawParticles();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [slime, isRunning]);

    const toggleSimulation = () => {
        setIsRunning(!isRunning);
    };

    return (
        <div className="slime-container">
            <canvas
                ref={canvasRef}
                className={`slime-scene ${showConfig ? 'show-config' : ''}`}
            ></canvas>

            <div className="controls">
                <button className="play-pause" onClick={toggleSimulation}>
                    {isRunning ? '⏸' : '▶'}
                </button>
                <button className="config" onClick={() => setShowConfig(!showConfig)}>
                    ⚙
                </button>
                {showConfig && (
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
                                        setSlime(newSlime); // Update state with the modified object
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SlimeScene;
