import { useCallback, useEffect, useRef, useState } from 'react';

import { faForwardStep } from '@fortawesome/free-solid-svg-icons/faForwardStep';
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './GameOfLife.css';
import { CATEGORIES, CATEGORY_LABELS, PATTERNS, Pattern } from './patterns';
import { cellKey, parseKey, useGameOfLife } from './useGameOfLife';

const CELL_SIZE = 12;
const GRID_COLOR = '#000';
const CELL_COLOR = '#dc143c'; // green
const PREVIEW_COLOR = '#f08080'; // light-green
const BACKGROUND_COLOR = '#fff';
const PREVIEW_CELL_SIZE = 4;
const PREVIEW_BG_COLOR = '#fff';
const PREVIEW_CELL_COLOR = '#dc143c';

// Component to render a small preview of a pattern
const PatternPreview = ({ pattern }: { pattern: Pattern }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const size = PREVIEW_CELL_SIZE;
        const width = pattern.width * size;
        const height = pattern.height * size;

        canvas.width = width;
        canvas.height = height;

        // Background
        ctx.fillStyle = PREVIEW_BG_COLOR;
        ctx.fillRect(0, 0, width, height);

        // Draw cells
        ctx.fillStyle = PREVIEW_CELL_COLOR;
        pattern.cells.forEach(([x, y]) => {
            ctx.fillRect(x * size, y * size, size - 1, size - 1);
        });
    }, [pattern]);

    return (
        <canvas
            ref={canvasRef}
            className="pattern-preview-canvas"
            style={{
                width: pattern.width * PREVIEW_CELL_SIZE,
                height: pattern.height * PREVIEW_CELL_SIZE,
            }}
        />
    );
};

const GameOfLife = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const {
        cells,
        generation,
        isRunning,
        speed,
        toggleCell,
        placePattern,
        step,
        play,
        pause,
        clear,
        setSpeed,
    } = useGameOfLife();

    const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
    const [viewportOffset] = useState({ x: 0, y: 0 });
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    // Handle canvas resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setCanvasSize({ width, height });

                const canvas = canvasRef.current;
                if (canvas) {
                    canvas.width = width;
                    canvas.height = height;
                }
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    // Render the grid
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        // Disable image smoothing for pixel-perfect rendering
        ctx.imageSmoothingEnabled = false;

        const { width, height } = canvas;

        // Clear canvas
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;

        const startX = -(viewportOffset.x % CELL_SIZE);
        const startY = -(viewportOffset.y % CELL_SIZE);

        for (let x = startX; x < width; x += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = startY; y < height; y += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw living cells
        ctx.fillStyle = CELL_COLOR;
        Array.from(cells).forEach((key) => {
            const [cellX, cellY] = parseKey(key);
            const screenX = cellX * CELL_SIZE - viewportOffset.x;
            const screenY = cellY * CELL_SIZE - viewportOffset.y;

            if (
                screenX > -CELL_SIZE &&
                screenX < width &&
                screenY > -CELL_SIZE &&
                screenY < height
            ) {
                ctx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
        });

        // Draw hover preview
        if (hoverPos) {
            ctx.fillStyle = PREVIEW_COLOR;
            const previewCells = selectedPattern
                ? selectedPattern.cells
                : ([[0, 0]] as [number, number][]);

            for (const [dx, dy] of previewCells) {
                const cellX = hoverPos.x + dx;
                const cellY = hoverPos.y + dy;
                const key = cellKey(cellX, cellY);

                // Only show preview for cells that don't already exist
                if (!cells.has(key)) {
                    const screenX = cellX * CELL_SIZE - viewportOffset.x;
                    const screenY = cellY * CELL_SIZE - viewportOffset.y;
                    ctx.fillRect(screenX + 1, screenY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                }
            }
        }
    }, [cells, hoverPos, selectedPattern, viewportOffset]);

    // Render on state changes
    useEffect(() => {
        render();
    }, [render, canvasSize]);

    // Convert screen coordinates to grid coordinates
    const screenToGrid = useCallback(
        (screenX: number, screenY: number): { x: number; y: number } => {
            return {
                x: Math.floor((screenX + viewportOffset.x) / CELL_SIZE),
                y: Math.floor((screenY + viewportOffset.y) / CELL_SIZE),
            };
        },
        [viewportOffset]
    );

    // Handle canvas click
    const handleCanvasClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }

            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const gridPos = screenToGrid(clickX, clickY);

            if (selectedPattern) {
                placePattern(selectedPattern, gridPos.x, gridPos.y);
            } else {
                toggleCell(gridPos.x, gridPos.y);
            }
        },
        [selectedPattern, screenToGrid, placePattern, toggleCell]
    );

    // Handle mouse move for hover preview
    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const gridPos = screenToGrid(mouseX, mouseY);

            setHoverPos(gridPos);
        },
        [screenToGrid]
    );

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
        setHoverPos(null);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (isRunning) {
                        pause();
                    } else {
                        play();
                    }
                    break;
                case 'KeyS':
                    if (!isRunning) {
                        step();
                    }
                    break;
                case 'KeyR':
                    clear();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRunning, play, pause, step, clear]);

    // Render pattern library
    const renderPatternLibrary = () => {
        const patternsByCategory = CATEGORIES.map((category) => ({
            category,
            label: CATEGORY_LABELS[category],
            patterns: PATTERNS.filter((p) => p.category === category),
        }));

        return (
            <div className="pattern-library">
                <button
                    className={`pattern-button single-cell ${selectedPattern === null ? 'selected' : ''}`}
                    onClick={() => setSelectedPattern(null)}
                >
                    <div className="single-cell-preview" />
                    <span>Single Cell</span>
                </button>

                {patternsByCategory.map(({ category, label, patterns }) => (
                    <div key={category}>
                        <div className="pattern-category">{label}</div>
                        {patterns.map((pattern) => (
                            <button
                                key={pattern.id}
                                className={`pattern-button ${selectedPattern?.id === pattern.id ? 'selected' : ''}`}
                                onClick={() => setSelectedPattern(pattern)}
                            >
                                <PatternPreview pattern={pattern} />
                                <span>{pattern.name}</span>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="gameoflife-container">
            <div className="main-area">
                <div className="canvas-wrapper" ref={containerRef}>
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    />
                </div>
                {renderPatternLibrary()}
            </div>

            <div className="controls">
                <div className="control-section">
                    <button
                        className={`column items-center content-center ${isRunning ? 'orange' : 'purple'}`}
                        onClick={() => (isRunning ? pause() : play())}
                    >
                        <FontAwesomeIcon icon={isRunning ? faPause : faPlay} />
                        <kbd>Space</kbd>
                    </button>
                    <button
                        className="blue column items-center content-center"
                        onClick={step}
                        disabled={isRunning}
                    >
                        <FontAwesomeIcon icon={faForwardStep} />
                        <kbd>S</kbd>
                    </button>
                    <button className="red column items-center content-center" onClick={clear}>
                        <FontAwesomeIcon icon={faTrash} />
                        <kbd>R</kbd>
                    </button>
                </div>

                <div className="speed-control">
                    <span className="speed-label">Speed</span>
                    <input
                        type="range"
                        className="speed-slider"
                        min="50"
                        max="500"
                        value={550 - speed}
                        onChange={(e) => setSpeed(550 - Number(e.target.value))}
                    />
                </div>

                <div className="generation-display">Gen: {generation}</div>
            </div>
        </div>
    );
};

export default GameOfLife;
