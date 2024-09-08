import React, { useState } from 'react'
import './Projects.css'
import ColorWheel from './ColorWheel'
import Pong from './Pong'
import GridDrawer from './GridDrawer'

function Projects() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const renderProject = () => {
    switch (selectedProject) {
      case 'colorWheel':
        return <ColorWheel />
      case 'pong':
        return <Pong />
      case 'grid':
        return <GridDrawer />
      default:
        return <ColorWheel />
    }
  }

  return (
    <div className="projects-container">
      <Sidebar onSelectProject={setSelectedProject} />
      <div className="projects-content">{renderProject()}</div>
    </div>
  )
}

function Sidebar({
  onSelectProject,
}: {
  onSelectProject: (project: string) => void
}) {
  return (
    <div className="sidebar">
      <a href="/" className="sidebar-link home-link">
        <span className="icon">🏠</span> <h2>Home</h2>
      </a>
      <button
        className="sidebar-link"
        onClick={() => onSelectProject('colorWheel')}
      >
        <span className="icon">🎨</span> <h3>Color Wheel</h3>
      </button>
      <button className="sidebar-link" onClick={() => onSelectProject('pong')}>
        <span className="icon">║</span>
        <h3>Locking Pong</h3>
      </button>
      <button className="sidebar-link" onClick={() => onSelectProject('grid')}>
        <span className="icon">▦</span> <h3>Grid Drawer</h3>
      </button>
    </div>
  )
}

export default Projects
