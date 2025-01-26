import React from 'react';

interface ControlsProps {
    gridSize: number;
    undoStack: unknown[];
    redoStack: unknown[];
    handleUndo: () => void;
    handleRedo: () => void;
    handleReset: () => void; // Add handleReset
    setGridSize: (size: number) => void;
}

const Controls: React.FC<ControlsProps> = ({
    gridSize,
    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    handleReset, // Add handleReset
    setGridSize,
}) => {
    return (
        <div className="controls">
            <div className="grid-size-input">
                <label>Grid Size:</label>
                <input
                    type="number"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                    min="5"
                    max="100"
                />
            </div>
            <button onClick={handleUndo} disabled={undoStack.length === 0} className="undo-btn">
                Undo
            </button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="redo-btn">
                Redo
            </button>
            <button onClick={handleReset} className="reset-btn">
                Reset
            </button>{' '}
        </div>
    );
};

export default Controls;
