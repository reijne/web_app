import React, { useEffect, useRef } from 'react';

import './Background.css';

import { clamp } from '../../utils/number';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

const PARTICLES = {
    count: 100,
    speed: 0.25,
    size: {
        min: 1,
        variance: 2,
    },
    referenceResolution: {
        height: 1080,
        width: 1920,
    },
};

function createParticles(canvas: HTMLCanvasElement): Particle[] {
    const maxVy = (PARTICLES.speed * PARTICLES.referenceResolution.height) / canvas.height;
    const maxVx = (PARTICLES.speed * PARTICLES.referenceResolution.width) / canvas.width;
    const x = canvas.width / 2;
    const y = canvas.height / 2;

    const particles = Array.from({ length: PARTICLES.count }, () => ({
        x,
        y,
        vx: (Math.random() - 0.5) * maxVx + 0.01,
        vy: (Math.random() - 0.5) * maxVy + 0.01,
        radius: Math.random() * PARTICLES.size.variance + PARTICLES.size.min,
    }));

    // Create one particle that is bigger.
    particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * maxVx + 0.01,
        vy: (Math.random() - 0.5) * maxVy + 0.01,
        radius: 2 * (PARTICLES.size.min + PARTICLES.size.variance),
    });

    return particles;
}

const Background: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }

        // Resize canvas to full screen
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        particlesRef.current = createParticles(canvas);

        // Smooth draw function (Liquid blending)
        const drawParticles = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.globalCompositeOperation = 'lighter';
            particlesRef.current.forEach(particle => {
                ctx.beginPath();
                // For a square use this.
                // ctx.rect(particle.x, particle.y, particle.radius, particle.radius);
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                ctx.fill();
                ctx.closePath();
            });

            particlesRef.current.forEach(particle => {
                particle.x = clamp(particle.x + particle.vx, -2, canvas.width + 2);
                particle.y = clamp(particle.y + particle.vy, -2, canvas.height + 2);

                // Bounce off edges
                if (particle.x <= 0 || particle.x >= canvas.width) {
                    particle.vx *= -1;
                }
                if (particle.y < 0 || particle.y >= canvas.height) {
                    particle.vy *= -1;
                }
            });

            requestAnimationFrame(drawParticles);
        };
        drawParticles();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    return <canvas ref={canvasRef} className="background-canvas"></canvas>;
};

export default Background;
