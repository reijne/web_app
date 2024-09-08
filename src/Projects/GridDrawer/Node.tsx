import React from 'react'

interface NodeProps {
  row: number
  col: number
  isSelected: boolean
  onClick: () => void
}

const Node: React.FC<NodeProps> = ({ isSelected, onClick }) => {
  return (
    <div
      className={`grid-node ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    ></div>
  )
}

export default Node
