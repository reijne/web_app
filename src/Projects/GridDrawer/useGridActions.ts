import { useCallback, useEffect, useState } from 'react';

interface NodePosition {
    row: number;
    col: number;
}

interface GridState {
    lines: { start: NodePosition; end: NodePosition }[];
    selectedNodes: NodePosition[];
}

// Key for localStorage
const LOCAL_STORAGE_KEY = 'gridState';

const useGridActions = () => {
    const [gridSize, setGridSize] = useState<number>(15);

    // The current state of the grid
    const [lines, setLines] = useState<{ start: NodePosition; end: NodePosition }[]>([]);
    const [selectedNodes, setSelectedNodes] = useState<NodePosition[]>([]);

    // Undo and Redo stacks that store the entire state of the grid
    const [undoStack, setUndoStack] = useState<GridState[]>([]);
    const [redoStack, setRedoStack] = useState<GridState[]>([]);

    // Save grid state to localStorage
    const saveStateToLocalStorage = useCallback(() => {
        const gridState: GridState = { lines, selectedNodes };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gridState));
    }, [lines, selectedNodes]);

    // Restore grid state from localStorage when the app initializes
    useEffect(() => {
        const savedGridState = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedGridState != null) {
            const parsedState: GridState = JSON.parse(savedGridState);
            setLines(parsedState.lines ?? []);
            setSelectedNodes(parsedState.selectedNodes ?? []);
        }
    }, []);

    // Listen for page reload/unload and save state to localStorage before leaving the page
    useEffect(() => {
        const handleBeforeUnload = () => {
            saveStateToLocalStorage();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [saveStateToLocalStorage]);

    // Helper to save the current state to the undo stack
    const saveStateToUndoStack = useCallback(() => {
        setUndoStack([...undoStack, { lines, selectedNodes }]);
        setRedoStack([]); // Clear redo stack on new action
    }, [lines, selectedNodes, undoStack]);

    // Handle node click, adding lines between nodes
    const handleNodeClick = (row: number, col: number) => {
        const newNode = { row, col };

        if (selectedNodes.length === 0) {
            setSelectedNodes([newNode]);
        } else if (selectedNodes.length === 1) {
            const [firstNode] = selectedNodes;
            const newLine = { start: firstNode, end: newNode };

            saveStateToUndoStack(); // Save the current state before drawing a line

            setLines((prevLines) => [...prevLines, newLine]); // Update state with new line
            setSelectedNodes([]); // Reset after drawing a line
        }
    };

    // Undo the last action by restoring the previous state from the undo stack
    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) {
            return;
        }

        const previousState = undoStack[undoStack.length - 1];
        setUndoStack(undoStack.slice(0, -1));
        setRedoStack([...redoStack, { lines, selectedNodes }]);
        setLines(previousState.lines);
        setSelectedNodes(previousState.selectedNodes);
    }, [undoStack, redoStack, lines, selectedNodes]);

    // Redo the last undone action by restoring the next state from the redo stack
    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) {
            return;
        }

        const nextState = redoStack[redoStack.length - 1];
        setRedoStack(redoStack.slice(0, -1));
        setUndoStack([...undoStack, { lines, selectedNodes }]);
        setLines(nextState.lines);
        setSelectedNodes(nextState.selectedNodes);
    }, [undoStack, redoStack, lines, selectedNodes]);

    // Reset the grid by saving the current state and clearing the grid
    const handleReset = useCallback(() => {
        if (lines.length > 0 || selectedNodes.length > 0) {
            saveStateToUndoStack(); // Save the current state before resetting
        }
        setLines([]);
        setSelectedNodes([]);
    }, [lines, selectedNodes, saveStateToUndoStack]);

    // Handle keyboard shortcuts for undo/redo
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
                if (event.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }
        },
        [handleUndo, handleRedo]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    return {
        gridSize,
        setGridSize,
        lines,
        selectedNodes,
        handleNodeClick,
        undoStack,
        redoStack,
        handleUndo,
        handleRedo,
        handleReset,
    };
};

export default useGridActions;
