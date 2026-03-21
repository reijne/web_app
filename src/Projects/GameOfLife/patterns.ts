export interface Pattern {
    id: string;
    name: string;
    category: 'still' | 'oscillator' | 'spaceship' | 'methuselah';
    cells: [number, number][];
    width: number;
    height: number;
}

export const PATTERNS: Pattern[] = [
    // Still Lifes
    {
        id: 'block',
        name: 'Block',
        category: 'still',
        cells: [
            [0, 0], [1, 0],
            [0, 1], [1, 1],
        ],
        width: 2,
        height: 2,
    },
    {
        id: 'beehive',
        name: 'Beehive',
        category: 'still',
        cells: [
            [1, 0], [2, 0],
            [0, 1], [3, 1],
            [1, 2], [2, 2],
        ],
        width: 4,
        height: 3,
    },
    {
        id: 'loaf',
        name: 'Loaf',
        category: 'still',
        cells: [
            [1, 0], [2, 0],
            [0, 1], [3, 1],
            [1, 2], [3, 2],
            [2, 3],
        ],
        width: 4,
        height: 4,
    },
    {
        id: 'boat',
        name: 'Boat',
        category: 'still',
        cells: [
            [0, 0], [1, 0],
            [0, 1], [2, 1],
            [1, 2],
        ],
        width: 3,
        height: 3,
    },

    // Oscillators
    {
        id: 'blinker',
        name: 'Blinker',
        category: 'oscillator',
        cells: [
            [0, 0], [1, 0], [2, 0],
        ],
        width: 3,
        height: 1,
    },
    {
        id: 'toad',
        name: 'Toad',
        category: 'oscillator',
        cells: [
            [1, 0], [2, 0], [3, 0],
            [0, 1], [1, 1], [2, 1],
        ],
        width: 4,
        height: 2,
    },
    {
        id: 'beacon',
        name: 'Beacon',
        category: 'oscillator',
        cells: [
            [0, 0], [1, 0],
            [0, 1],
            [3, 2],
            [2, 3], [3, 3],
        ],
        width: 4,
        height: 4,
    },
    {
        id: 'pulsar',
        name: 'Pulsar',
        category: 'oscillator',
        cells: [
            // Top section
            [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
            [0, 2], [5, 2], [7, 2], [12, 2],
            [0, 3], [5, 3], [7, 3], [12, 3],
            [0, 4], [5, 4], [7, 4], [12, 4],
            [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
            // Bottom section (mirrored)
            [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
            [0, 8], [5, 8], [7, 8], [12, 8],
            [0, 9], [5, 9], [7, 9], [12, 9],
            [0, 10], [5, 10], [7, 10], [12, 10],
            [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12],
        ],
        width: 13,
        height: 13,
    },

    // Spaceships
    {
        id: 'glider',
        name: 'Glider',
        category: 'spaceship',
        cells: [
            [1, 0],
            [2, 1],
            [0, 2], [1, 2], [2, 2],
        ],
        width: 3,
        height: 3,
    },
    {
        id: 'lwss',
        name: 'LWSS',
        category: 'spaceship',
        cells: [
            [0, 0], [3, 0],
            [4, 1],
            [0, 2], [4, 2],
            [1, 3], [2, 3], [3, 3], [4, 3],
        ],
        width: 5,
        height: 4,
    },

    // Methuselahs
    {
        id: 'rpentomino',
        name: 'R-pentomino',
        category: 'methuselah',
        cells: [
            [1, 0], [2, 0],
            [0, 1], [1, 1],
            [1, 2],
        ],
        width: 3,
        height: 3,
    },
    {
        id: 'acorn',
        name: 'Acorn',
        category: 'methuselah',
        cells: [
            [1, 0],
            [3, 1],
            [0, 2], [1, 2], [4, 2], [5, 2], [6, 2],
        ],
        width: 7,
        height: 3,
    },
];

export const CATEGORIES = ['still', 'oscillator', 'spaceship', 'methuselah'] as const;

export const CATEGORY_LABELS: Record<typeof CATEGORIES[number], string> = {
    still: 'Still Lifes',
    oscillator: 'Oscillators',
    spaceship: 'Spaceships',
    methuselah: 'Methuselahs',
};
