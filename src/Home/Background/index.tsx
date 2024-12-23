import React, { useEffect, useRef } from 'react';

import './Background.css';

interface Location {
    x: number;
    y: number;
}

interface Creation {
    canvas: {
        width: number;
        height: number;
    };
    buildingCount: number;
}

interface Shape {
    type: 'rectangle';
    location: Location;
    width: number;
    height: number;
    color: string;
}

function getBuildingColor(height: number, maxHeight: number) {
    const ratio = height / maxHeight; // 0 (small) -> 1 (tall)
    const grey = Math.floor(ratio * 185 + 15); // Range from 30 (dark) to 200 (light)
    const alpha = 0.8; // Slight transparency for layering effect
    return `rgba(${grey}, ${grey}, ${grey}, ${alpha})`;
}

// Create a new building
function createBuilding(opts: Creation): Shape {
    const maxHeight = opts.canvas.height; // Full canvas height
    const baseHeight = Math.random() * maxHeight * 0.97; // Random height
    const minWidth = opts.canvas.width / opts.buildingCount;
    const baseWidth = Math.random() * minWidth + minWidth;
    const xOffset = Math.random() * opts.canvas.width;

    return {
        type: 'rectangle',
        location: {
            x: xOffset,
            y: opts.canvas.height - baseHeight,
        },
        width: baseWidth,
        height: baseHeight,
        color: getBuildingColor(baseHeight, maxHeight), // Color based on height
    };
}

const Background: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const shapesRef = useRef<Shape[]>([]); // Keep shapes persistent across renders

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Resize canvas and regenerate shapes
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            regenerateBuildings(canvas);
            drawBuildings(ctx, canvas);
        };

        const regenerateBuildings = (canvas: HTMLCanvasElement) => {
            shapesRef.current = [];
            const buildingCount = Math.floor(canvas.width / 10);

            for (let i = 0; i < buildingCount; i++) {
                shapesRef.current.push(createBuilding({ canvas, buildingCount }));
            }
        };

        // Initial canvas setup
        resizeCanvas();
        drawBuildings(ctx, canvas);

        // Debounce resize logic
        let resizeTimeout: number;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(resizeCanvas, 1);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, []);

    // Draw all buildings
    const drawBuildings = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        shapesRef.current.forEach(shape => {
            ctx.save();
            ctx.translate(shape.location.x, shape.location.y);
            ctx.fillStyle = shape.color;
            ctx.fillRect(0, 0, shape.width, shape.height);
            ctx.restore();
        });
    };

    return <canvas ref={canvasRef} className="background-canvas"></canvas>;
};

export default Background;
