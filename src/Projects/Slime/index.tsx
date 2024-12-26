import React, { useEffect, useRef } from 'react';

import './Slime.css';

// Constants for simulation
const SLIME = {
    particleCount: 500,
    trailDecay: 0.98,
    speed: 1.5,
    sensorAngle: Math.PI / 4,
    sensorDistance: 20,
    turnSpeed: 0.2,
};

const trailColor = `rgba(0, 0, 0, ${1 - SLIME.trailDecay})`;

// Particle definition
interface SlimeParticle {
    x: number;
    y: number;
    angle: number;
}

// Create particle at random location
function createParticle(canvas: HTMLCanvasElement): SlimeParticle {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        angle: Math.random() * Math.PI * 2,
    };
}

// Slime Simulation Component
const SlimeScene: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<SlimeParticle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) return;

        // Resize canvas to full screen
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initializeParticles(canvas);
        };

        // Initialize Particles
        const initializeParticles = (canvas: HTMLCanvasElement) => {
            particlesRef.current = Array.from({ length: SLIME.particleCount }, () =>
                createParticle(canvas),
            );
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Drawing Particles (Trail Effect)
        const drawParticles = () => {
            // ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
            ctx.fillStyle = trailColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height); // Fading effect (Decay)

            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            particlesRef.current.forEach(p => {
                // Move particle
                p.x += Math.cos(p.angle) * SLIME.speed;
                p.y += Math.sin(p.angle) * SLIME.speed;

                // Wrap around screen edges
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                // Leave a trail
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
                ctx.fill();
            });

            // Simulate Particle Attraction to Trails
            particlesRef.current.forEach(p => {
                const sensorX = p.x + Math.cos(p.angle) * SLIME.sensorDistance;
                const sensorY = p.y + Math.sin(p.angle) * SLIME.sensorDistance;

                const leftSensorX =
                    p.x + Math.cos(p.angle - SLIME.sensorAngle) * SLIME.sensorDistance;
                const leftSensorY =
                    p.y + Math.sin(p.angle - SLIME.sensorAngle) * SLIME.sensorDistance;

                const rightSensorX =
                    p.x + Math.cos(p.angle + SLIME.sensorAngle) * SLIME.sensorDistance;
                const rightSensorY =
                    p.y + Math.sin(p.angle + SLIME.sensorAngle) * SLIME.sensorDistance;

                const centerBrightness = getTrailIntensity(ctx, sensorX, sensorY);
                const leftBrightness = getTrailIntensity(ctx, leftSensorX, leftSensorY);
                const rightBrightness = getTrailIntensity(ctx, rightSensorX, rightSensorY);

                // Attraction logic
                if (leftBrightness > centerBrightness && leftBrightness > rightBrightness) {
                    p.angle -= SLIME.turnSpeed;
                } else if (rightBrightness > centerBrightness && rightBrightness > leftBrightness) {
                    p.angle += SLIME.turnSpeed;
                }
            });

            requestAnimationFrame(drawParticles);
        };

        // Get Trail Intensity (Reading pixel brightness)
        const getTrailIntensity = (ctx: CanvasRenderingContext2D, x: number, y: number): number => {
            const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            return pixel[0];
            // return (pixel[0] / 255 + pixel[1] / 255 + pixel[2] / 255) / 3;
        };

        drawParticles();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    return <canvas ref={canvasRef} className="slime-scene"></canvas>;
};

export default SlimeScene;
