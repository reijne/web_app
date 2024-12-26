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

const DEFAULT_SLIME_CONFIG: SlimeConfig = {
    particleCount: { value: 500, default: 500, min: 100, max: 2000 },
    trailDecay: { value: 0.98, default: 0.98, min: 0.9, max: 1 },
    speed: { value: 1.5, default: 1.5, min: 0.1, max: 3 },
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
    const animationRef = useRef<number | null>(null);

    const [slime, setSlime] = useState(DEFAULT_SLIME_CONFIG);
    const [isRunning, setIsRunning] = useState(true);
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // Fill the canvas with black at the start
            // ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            // ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        const initializeParticles = (canvas: HTMLCanvasElement) => {
            console.log('Initializing particles...');
            particlesRef.current = Array.from({ length: slime.particleCount.value }, () =>
                createParticle(canvas),
            );
        };

        console.log('Initializing canvas...');
        resizeCanvas();
        if (isRunning) {
            initializeParticles(canvas);
        }
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) return;

        const drawParticles = () => {
            if (!ctx || !canvas) return;

            console.log('Drawing particles and moving them...');
            // Draw particles at current positions
            ctx.fillStyle = 'rgba(255, 0, 0, 1)';
            particlesRef.current.forEach(p => {
                if (isRunning) {
                    p.x += Math.cos(p.angle) * slime.speed.value;
                    p.y += Math.sin(p.angle) * slime.speed.value;

                    if (p.x < 0) p.x = canvas.width;
                    if (p.x > canvas.width) p.x = 0;
                    if (p.y < 0) p.y = canvas.height;
                    if (p.y > canvas.height) p.y = 0;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
                ctx.fill();
            });

            // **Decay only if running (freeze trails on pause)**
            ctx.fillStyle = `rgba(0, 0, 0, ${1 - slime.trailDecay.value})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            simulateTrailFollowing(ctx);

            // Keep drawing the frame even when paused (no decay)
            if (isRunning) {
                animationRef.current = requestAnimationFrame(drawParticles);
            }
        };

        const simulateTrailFollowing = (ctx: CanvasRenderingContext2D) => {
            particlesRef.current.forEach(p => {
                const sensorX = p.x + Math.cos(p.angle) * slime.sensorDistance.value;
                const sensorY = p.y + Math.sin(p.angle) * slime.sensorDistance.value;

                const leftSensorX =
                    p.x + Math.cos(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value;
                const leftSensorY =
                    p.y + Math.sin(p.angle - slime.sensorAngle.value) * slime.sensorDistance.value;

                const rightSensorX =
                    p.x + Math.cos(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value;
                const rightSensorY =
                    p.y + Math.sin(p.angle + slime.sensorAngle.value) * slime.sensorDistance.value;

                const centerBrightness = getTrailIntensity(ctx, sensorX, sensorY);
                const leftBrightness = getTrailIntensity(ctx, leftSensorX, leftSensorY);
                const rightBrightness = getTrailIntensity(ctx, rightSensorX, rightSensorY);

                if (leftBrightness > centerBrightness && leftBrightness > rightBrightness) {
                    p.angle -= slime.turnSpeed.value;
                } else if (rightBrightness > centerBrightness && rightBrightness > leftBrightness) {
                    p.angle += slime.turnSpeed.value;
                }
            });
        };

        const getTrailIntensity = (ctx: CanvasRenderingContext2D, x: number, y: number): number => {
            const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            return pixel[0];
        };

        drawParticles();

        return () => {
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
                <button onClick={toggleSimulation}>{isRunning ? '⏸' : '▶'}</button>
                <button onClick={() => setShowConfig(!showConfig)}>⚙</button>
            </div>

            {showConfig && (
                <div className="config-panel">
                    <h3>Simulation Config</h3>
                    {Object.entries(DEFAULT_SLIME_CONFIG).map(([key, { min, max, value }]) => (
                        <div key={key}>
                            <label>{key}</label>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                value={value}
                                onChange={e => {
                                    // @ts-ignore I dont care about this type check man...
                                    console.log('Updating config', e.target.value, key, slime[key]);
                                    setSlime({
                                        ...slime,
                                        [key]: { value: parseFloat(e.target.value), min, max },
                                    });
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SlimeScene;
