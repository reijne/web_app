import { useState, useCallback, useEffect, useRef } from 'react';
import { Pattern } from './patterns';

export type CellSet = Set<string>;

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export const parseKey = (key: string): [number, number] => {
    const [x, y] = key.split(',').map(Number);
    return [x, y];
};

const countNeighbors = (cells: CellSet, x: number, y: number): number => {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) {
                continue;
            }
            if (cells.has(cellKey(x + dx, y + dy))) {
                count++;
            }
        }
    }
    return count;
};

const computeNextGeneration = (current: CellSet): CellSet => {
    const next = new Set<string>();
    const candidates = new Set<string>();

    // Collect all cells that need evaluation (alive + their neighbors)
    Array.from(current).forEach((key) => {
        const [x, y] = parseKey(key);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                candidates.add(cellKey(x + dx, y + dy));
            }
        }
    });

    // Apply Conway's rules to each candidate
    Array.from(candidates).forEach((key) => {
        const [x, y] = parseKey(key);
        const neighbors = countNeighbors(current, x, y);
        const alive = current.has(key);

        // Conway's rules:
        // 1. Live cell with 2-3 neighbors survives
        // 2. Dead cell with exactly 3 neighbors becomes alive
        if (alive && (neighbors === 2 || neighbors === 3)) {
            next.add(key);
        } else if (!alive && neighbors === 3) {
            next.add(key);
        }
    });

    return next;
};

export interface UseGameOfLifeReturn {
    cells: CellSet;
    generation: number;
    isRunning: boolean;
    speed: number;
    toggleCell: (x: number, y: number) => void;
    placePattern: (pattern: Pattern, x: number, y: number) => void;
    step: () => void;
    play: () => void;
    pause: () => void;
    clear: () => void;
    setSpeed: (speed: number) => void;
}

export function useGameOfLife(): UseGameOfLifeReturn {
    const [cells, setCells] = useState<CellSet>(new Set());
    const [generation, setGeneration] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [speed, setSpeed] = useState(200);

    const cellsRef = useRef(cells);
    cellsRef.current = cells;

    const toggleCell = useCallback((x: number, y: number) => {
        setCells((prev) => {
            const next = new Set(prev);
            const key = cellKey(x, y);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const placePattern = useCallback((pattern: Pattern, x: number, y: number) => {
        setCells((prev) => {
            const next = new Set(prev);
            for (const [dx, dy] of pattern.cells) {
                next.add(cellKey(x + dx, y + dy));
            }
            return next;
        });
    }, []);

    const step = useCallback(() => {
        setCells((prev) => computeNextGeneration(prev));
        setGeneration((g) => g + 1);
    }, []);

    const play = useCallback(() => setIsRunning(true), []);
    const pause = useCallback(() => setIsRunning(false), []);

    const clear = useCallback(() => {
        setCells(new Set());
        setGeneration(0);
        setIsRunning(false);
    }, []);

    // Animation loop using setInterval
    useEffect(() => {
        if (!isRunning) {
            return;
        }

        const intervalId = setInterval(() => {
            setCells((prev) => computeNextGeneration(prev));
            setGeneration((g) => g + 1);
        }, speed);

        return () => clearInterval(intervalId);
    }, [isRunning, speed]);

    return {
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
    };
}
