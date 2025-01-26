import React, { useEffect, useRef } from 'react';

import Controls from './Controls';
import './Grid.css';
import Line from './Line';
import Node from './Node';
import useGridActions from './useGridActions';

const Grid: React.FC = () => {
    const {
        gridSize,
        lines,
        selectedNodes,
        handleNodeClick,
        undoStack,
        redoStack,
        handleUndo,
        handleRedo,
        handleReset, // Include reset handler
        setGridSize,
    } = useGridActions();

    const gridRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (gridRef.current && svgRef.current) {
            const gridWidth = gridRef.current.offsetWidth;
            const gridHeight = gridRef.current.offsetHeight;
            svgRef.current.setAttribute('width', `${gridWidth}`);
            svgRef.current.setAttribute('height', `${gridHeight}`);
        }
    }, [gridSize, lines]);

    return (
        <div className="grid-container">
            {/* SVG for lines */}
            <svg ref={svgRef} className="line-canvas">
                {lines.map((line, index) => (
                    <Line key={index} start={line.start} end={line.end} />
                ))}
            </svg>

            {/* Render Grid Nodes */}
            <div className="grid" ref={gridRef}>
                {Array.from({ length: gridSize + 1 }, (_, row) => (
                    <div key={row} className="grid-row">
                        {Array.from({ length: gridSize + 1 }, (_, col) => {
                            const isSelected = selectedNodes.some(
                                (node) => node.row === row && node.col === col
                            );
                            return (
                                <Node
                                    key={`${row}-${col}`}
                                    row={row}
                                    col={col}
                                    isSelected={isSelected}
                                    onClick={() => handleNodeClick(row, col)}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Controls: Undo/Redo and Grid Size */}
            <Controls
                gridSize={gridSize}
                undoStack={undoStack}
                redoStack={redoStack}
                handleUndo={handleUndo}
                handleRedo={handleRedo}
                handleReset={handleReset}
                setGridSize={setGridSize}
            />
        </div>
    );
};

export default Grid;
