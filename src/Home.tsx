import React, { useEffect } from 'react'

import wolf from './wolf.svg'

import './Home.css'

const story = [
  'Hello!',
  "I'm",
  'Youri',
  'Reijne,',
  'a',
  'driven',
  'software',
  'engineer',
  'who',
  'loves',
  'a',
  'challenge.',
  'With',
  'enthousiasm',
  'for',
  'both',
  'learning',
  'and',
  'teaching,',
  'I',
  'aspire',
  'to',
  'make',
  'the',
  'world',
  'even',
  'more',
  'exciting',
  'to',
  'explore!',
  'I',
  'hope',
  'you',
  'enjoy',
  'your',
  'exploration',
  'through',
  'here.',
]

function getStory(storyIndex: number) {
  let slice = story.slice(0, Math.min(storyIndex, story.length))
  if (storyIndex < story.length) {
    slice = slice.concat('...')
  }
  return slice.join(' ')
}

function Home(props: { onExplore: () => void }) {
  let [storyIndex, setStoryIndex] = React.useState(0)

  let storyIncrementInterval: ReturnType<typeof setInterval> | undefined =
    undefined

  useEffect(() => {
    storyIncrementInterval = setInterval(() => {
      setStoryIndex((storyIndex) => storyIndex + 1)
      if (storyIndex === story.length) {
        clearInterval(storyIncrementInterval)
        storyIncrementInterval = undefined
      }
    }, 200)

    return () => {
      if (storyIncrementInterval != undefined) {
        clearInterval(storyIncrementInterval)
      }
    }
  })

  const exploreButtonClick = () => {
    props.onExplore()
  }

  return (
    <div className="Home">
      <div className="Col h-100">
        <div className="Home-main Row">
          <img src={wolf} className="Home-logo" alt="logo" />
          <div className="Col">
            <h1 className="w-100">Reijne</h1>
            <p className="Home-story">{getStory(storyIndex++)}</p>
          </div>
        </div>
        <button onClick={exploreButtonClick} className="Home-explore">
          <h2>Explore!</h2>
        </button>
      </div>
    </div>
  )
}

export default Home
