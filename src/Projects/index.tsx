import React, { useState } from 'react'
import './Projects.css'
import ColorWheel from './ColorWheel'
import Pong from './Pong'

function Projects() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const renderProject = () => {
    switch (selectedProject) {
      case 'colorWheel':
        return <ColorWheel />
      case 'pong':
        return <Pong />
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
      <a href="/" className="sidebar-link">
        Home
      </a>
      <button
        className="sidebar-link"
        onClick={() => onSelectProject('colorWheel')}
      >
        Color Wheel
      </button>
      <button className="sidebar-link" onClick={() => onSelectProject('pong')}>
        Locking Pong
      </button>
      {/* Add more project buttons here */}
    </div>
  )
}

export default Projects
