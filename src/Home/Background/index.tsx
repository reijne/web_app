import React, { useEffect, useRef } from 'react';

import './Background.css';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

const PARTICLES = {
    count: 50,
    speed: 0.02,
    size: {
        min: 1,
        variance: 2,
    },
};

// Create a particle
function createParticle(canvas: HTMLCanvasElement): Particle {
    return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * PARTICLES.speed,
        vy: (Math.random() - 0.5) * PARTICLES.speed,
        radius: Math.random() * PARTICLES.size.variance + PARTICLES.size.min,
    };
}

const Background: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Resize canvas to full screen
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Create particles
        const createParticles = () => {
            const particles = Array.from({ length: PARTICLES.count }, () => createParticle(canvas));
            // Create one particle that is bigger.
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * PARTICLES.speed,
                vy: (Math.random() - 0.5) * PARTICLES.speed,
                radius: 2 * (PARTICLES.size.min + PARTICLES.size.variance),
            });

            particlesRef.current = particles;
        };
        createParticles();

        // Smooth draw function (Liquid blending)
        const drawParticles = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.globalCompositeOperation = 'lighter';
            particlesRef.current.forEach(particle => {
                ctx.beginPath();
                // ctx.rect(particle.x, particle.y, particle.radius, particle.radius);
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                ctx.fill();
                ctx.closePath();
            });

            particlesRef.current.forEach(particle => {
                particle.x += particle.vx;
                particle.y += particle.vy;

                // Bounce off edges
                if (particle.x <= 0 || particle.x >= canvas.width) particle.vx *= -1;
                if (particle.y <= 0 || particle.y >= canvas.height) particle.vy *= -1;
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
