import React from 'react'
import './Home.css'
import { FaceLogo } from '../logos'

import './Home.css'

function Home({ setCurrentPage }: { setCurrentPage: (page: string) => void }) {
  return (
    <div className="Home">
      <div className="Home-main-content">
        <Header />
        <ProjectsButton setCurrentPage={setCurrentPage} />
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="Home-header">
      <FaceLogo />
      <HeaderText />
    </header>
  )
}

function HeaderText() {
  return (
    <div className="Home-text-container">
      <h1>Dev Reijne():</h1>
      <div className="Home-personal-description">
        <p>Hello! I'm Youri Reijne, a software developer.</p>
        <p>
          Welcome to my personal space, where you can find my contact
          information, projects and blog?
        </p>
      </div>
    </div>
  )
}

function ProjectsButton({
  setCurrentPage,
}: {
  setCurrentPage: (page: string) => void
}) {
  return (
    <div className="Home-projects-button-container">
      <button
        className="Home-projects-button"
        onClick={() => setCurrentPage('projects')}
      >
        View My Projects
      </button>
    </div>
  )
}

export default Home
