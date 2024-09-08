import React from 'react'

interface NodePosition {
  row: number
  col: number
}

interface LineProps {
  start: NodePosition
  end: NodePosition
}

const Line: React.FC<LineProps> = ({ start, end }) => {
  const nodeWidth = 8
  const nodeMargin = 10
  const nodeSize = nodeWidth + nodeMargin * 2 // Node width (30px) + margin (2px * 2)
  const getCoordinates = (node: NodePosition) => {
    return {
      x: node.col * nodeSize + nodeSize / 2,
      y: node.row * nodeSize + nodeSize / 2,
    }
  }

  const startCoords = getCoordinates(start)
  const endCoords = getCoordinates(end)

  return (
    <line
      x1={startCoords.x}
      y1={startCoords.y}
      x2={endCoords.x}
      y2={endCoords.y}
      stroke="black"
      strokeWidth="2"
    />
  )
}

export default Line
