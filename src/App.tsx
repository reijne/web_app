import React, { useState } from 'react'
import Home from './Home'
import Projects from './Projects'
import Footer from './Footer'

function App() {
  const [currentPage, setCurrentPage] = useState('home')

  const renderPage = () => {
    switch (currentPage) {
      case 'projects':
        return <Projects />
      case 'home':
        return <Home setCurrentPage={setCurrentPage} />
      default:
        return <Home setCurrentPage={setCurrentPage} />
    }
  }

  return (
    <div className="App">
      {renderPage()}
      <Footer />
    </div>
  )
}

export default App
