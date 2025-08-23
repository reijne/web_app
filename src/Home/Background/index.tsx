import React, { useEffect, useRef } from 'react';

import { clamp } from '../../utils/number';

import './Background.css';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

const PARTICLES = {
    count: 100,
    speed: 1,
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

const STEER = {
    force: 0.1, // how aggressively we steer toward desired velocity (0..1)
    maxSpeed: 8, // pixels per frame when seeking
    slowRadius: 120, // start slowing when close to mouse
    damping: 0.9999, // mild damping so velocities don't explode over time
};

const Background: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }

        const mouse = {
            x: 0,
            y: 0,
            down: false,
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

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

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
            particlesRef.current.forEach((particle) => {
                ctx.beginPath();
                // For a square use this.
                // ctx.rect(particle.x, particle.y, particle.radius, particle.radius);
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                ctx.fill();
                ctx.closePath();
            });

            particlesRef.current.forEach((particle) => {
                if (mouse.down) {
                    // Vector from particle to mouse
                    const dx = mouse.x - particle.x;
                    const dy = mouse.y - particle.y;
                    const dist = Math.hypot(dx, dy) || 1;

                    // "Arrive": go fast when far, slower when close
                    const speedScale = clamp(dist / STEER.slowRadius, 0, 1);
                    const max = STEER.maxSpeed * (0.2 + 0.8 * speedScale); // don't go to zero

                    // Desired velocity toward mouse
                    const desiredVx = (dx / dist) * max;
                    const desiredVy = (dy / dist) * max;

                    // Steering = (desired - current) * force
                    particle.vx += (desiredVx - particle.vx) * STEER.force;
                    particle.vy += (desiredVy - particle.vy) * STEER.force;
                }

                // Mild damping always (prevents runaway speeds)
                particle.vx *= STEER.damping;
                particle.vy *= STEER.damping;
            });

            particlesRef.current.forEach((particle) => {
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
