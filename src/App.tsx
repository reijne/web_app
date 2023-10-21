import React from 'react'

import logo from './logo.svg'

import Home from './Home'

import './App.css'
import { AssertionError } from 'assert'
import { render } from 'react-dom'

function App() {
  const [page, setPage] = React.useState('home')

  const renderPage = () => {
    switch (page.toLowerCase()) {
      case 'home':
        return (
          <Home
            onExplore={() => {
              console.log('Explore clicked!')
              setPage('projects')
              console.log('page set:', page)
            }}
          />
        )
      case 'projects':
        return (
          <div>
            <h1>Projects</h1>
            <button onClick={() => setPage('home')}>Home</button>
          </div>
        )
      default:
        setPage('home')
    }
  }

  return <div className="App">{renderPage()}</div>
}

export default App
