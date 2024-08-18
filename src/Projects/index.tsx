import React, { useState } from 'react'
import './Projects.css'

function Projects() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const renderProject = () => {
    switch (selectedProject) {
      case 'project1':
        return <Project1 />
      case 'project2':
        return <Project2 />
      default:
        return <DefaultProject />
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
        onClick={() => onSelectProject('project1')}
      >
        Project 1
      </button>
      <button
        className="sidebar-link"
        onClick={() => onSelectProject('project2')}
      >
        Project 2
      </button>
      {/* Add more project buttons here */}
    </div>
  )
}

function DefaultProject() {
  return <div>Select a project from the sidebar.</div>
}

function Project1() {
  return <div>Project 1 Content</div>
}

function Project2() {
  return <div>Project 2 Content</div>
}

export default Projects
