import React, { useEffect, useRef } from 'react';

import './Background.css';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

const SPEED = 0.002;
const PARTICALS = {
    count: 30,
    size: {
        min: 2,
        variance: 80,
    },
};

// Create a particle
function createParticle(canvas: HTMLCanvasElement): Particle {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
        radius: Math.random() * PARTICALS.size.variance + PARTICALS.size.min,
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
            particlesRef.current = Array.from({ length: PARTICALS.count }, () =>
                createParticle(canvas),
            );
        };
        createParticles();

        // Smooth draw function (Liquid blending)
        const drawParticles = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.globalCompositeOperation = 'lighter';
            particlesRef.current.forEach(particle => {
                ctx.beginPath();
                ctx.rect(particle.x, particle.y, particle.radius, particle.radius);
                // ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
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

            // Motion trail effect
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

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
