import React, { useEffect, useRef, useState } from 'react'
import './Pong.css'

const useFrameTime = () => {
  const [frameTime, setFrameTime] = useState(performance.now())
  useEffect(() => {
    let frameId: number
    const frame = (time: number) => {
      setFrameTime(time)
      frameId = requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [])
  return frameTime
}

const Pong: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [player1Y, setPlayer1Y] = useState(150)
  const [player2Y, setPlayer2Y] = useState(150)
  const [ballX, setBallX] = useState(400)
  const [ballY, setBallY] = useState(200)
  const [ballVelocityX, setBallVelocityX] = useState(4)
  const [ballVelocityY, setBallVelocityY] = useState(4)
  const [player1Score, setPlayer1Score] = useState(0)
  const [player2Score, setPlayer2Score] = useState(0)
  const [lastFrameTime, setLastFrameTime] = useState(performance.now())

  const paddleHeight = 100
  const paddleWidth = 10
  const ballSize = 10
  const canvasWidth = 800
  const canvasHeight = 400

  const frameTime = useFrameTime()

  const movePaddles = (e: KeyboardEvent) => {
    if (ballX < canvasWidth / 2) {
      if (e.key === 'w') {
        setPlayer1Y((y) => Math.max(y - 10, 0))
      }
      if (e.key === 's') {
        setPlayer1Y((y) => Math.min(y + 10, canvasHeight - paddleHeight))
      }
    }
    if (ballX > canvasWidth / 2) {
      if (e.key === 'ArrowUp') setPlayer2Y((y) => Math.max(y - 10, 0))
      if (e.key === 'ArrowDown')
        setPlayer2Y((y) => Math.min(y + 10, canvasHeight - paddleHeight))
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', movePaddles)
    return () => window.removeEventListener('keydown', movePaddles)
  }, [ballX])

  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    // Calculate elapsed time
    const deltaTime = (frameTime - lastFrameTime) / 1000 // in seconds
    setLastFrameTime(frameTime)

    // Update ball position based on time elapsed
    let nextBallX = ballX + ballVelocityX * deltaTime * 60 // 60 is a scaling factor for smoother speed
    let nextBallY = ballY + ballVelocityY * deltaTime * 60

    // Ball collision with top and bottom walls
    if (nextBallY <= 0 + ballSize) {
      nextBallY = ballSize + 1
      setBallVelocityY(-ballVelocityY)
    } else if (nextBallY >= canvasHeight - ballSize) {
      nextBallY = canvasHeight - ballSize - 1
      setBallVelocityY(-ballVelocityY)
    }

    // Ball collision with paddles
    if (
      (nextBallX - ballSize <= paddleWidth && // Check left paddle
        nextBallY >= player1Y &&
        nextBallY <= player1Y + paddleHeight) ||
      (nextBallX + ballSize >= canvasWidth - paddleWidth && // Check right paddle
        nextBallY >= player2Y &&
        nextBallY <= player2Y + paddleHeight)
    ) {
      setBallVelocityX((v) => -v)
      setBallVelocityY((v) => v + (Math.random() - 0.5) * 2)

      if (nextBallX - ballSize <= paddleWidth) {
        nextBallX = paddleWidth + ballSize + 1
      } else if (nextBallX + ballSize >= canvasWidth - paddleWidth) {
        nextBallX = canvasWidth - paddleWidth - ballSize - 1
      }
    }

    // Check if the ball has passed the left or right boundary
    if (nextBallX <= 0) {
      // Player 2 scores
      setPlayer2Score((score) => score + 1)
      resetBall()
      return
    } else if (nextBallX >= canvasWidth) {
      // Player 1 scores
      setPlayer1Score((score) => score + 1)
      resetBall()
      return
    }

    // Update ball position after collision checks
    setBallX(nextBallX)
    setBallY(nextBallY)

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Draw middle line
    ctx.strokeStyle = 'white'
    ctx.setLineDash([10, 15]) // Dashes of 10px and gaps of 15px
    ctx.beginPath()
    ctx.moveTo(canvasWidth / 2, 0)
    ctx.lineTo(canvasWidth / 2, canvasHeight)
    ctx.stroke()

    // Draw paddles
    ctx.fillStyle = ballX < canvasWidth / 2 ? 'white' : 'red'
    ctx.fillRect(0, player1Y, paddleWidth, paddleHeight)

    ctx.fillStyle = ballX > canvasWidth / 2 ? 'white' : 'red'
    ctx.fillRect(canvasWidth - paddleWidth, player2Y, paddleWidth, paddleHeight)

    // Draw ball
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(ballX, ballY, ballSize, 0, Math.PI * 2)
    ctx.fill()

    // Draw scores
    ctx.font = '30px Arial'
    ctx.fillText(`${player1Score}`, canvasWidth / 4, 50)
    ctx.fillText(`${player2Score}`, (3 * canvasWidth) / 4, 50)
  }, [frameTime, player1Y, player2Y, ballX, ballY])

  const resetBall = () => {
    setBallX(canvasWidth / 2)
    setBallY(canvasHeight / 2)
    setBallVelocityX((Math.random() > 0.5 ? 1 : -1) * 4) // Reset velocity with a random direction
    setBallVelocityY((Math.random() > 0.5 ? 1 : -1) * 4)
  }

  return (
    <div className="Pong-container">
      <div>
        <canvas
          className="Pong-canvas"
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
        />
      </div>

      <div>
        <p>
          <strong>Player 1:</strong> W (Up), S (Down) |{' '}
          <strong>Player 2:</strong> Up Arrow (Up), Down Arrow (Down)
        </p>
      </div>
      <button
        className="Pong-reset-score-button"
        onClick={() => {
          setPlayer1Score(0)
          setPlayer2Score(0)
        }}
      >
        Reset score
      </button>
    </div>
  )
}

export default Pong
