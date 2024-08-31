import React, { useRef, useEffect, useState } from 'react'

import './ColorWheel.css'

const SIZE_MULTIPLIER = 0.3

class RGB {
  constructor(public r: number, public g: number, public b: number) {}

  toString(): string {
    return `rgb(${this.r}, ${this.g}, ${this.b})`
  }

  public toHex() {
    const toHex = (component: number) => {
      const hex = component.toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    return new HEX(`${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`)
  }

  public toHSL() {
    // Convert RGB to the range 0-1
    const r = this.r / 255
    const g = this.g / 255
    const b = this.b / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0,
      s = 0,
      l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / d + 2
          break
        case b:
          h = (r - g) / d + 4
          break
      }

      h /= 6
    }

    // Convert h, s, l to percentage/formatted form
    h = Math.round(h * 360)
    s = Math.round(s * 100)
    l = Math.round(l * 100)

    return new HSL(h, s, l)
  }
}

class HSL {
  constructor(public h: number, public s: number, public l: number) {}

  toString(): string {
    return `hsl(${this.h}, ${this.s}%, ${this.l}%)`
  }
}

class HEX {
  constructor(public hex: string) {}

  toString(): string {
    if (this.hex.startsWith('#')) {
      return this.hex
    }
    return `#${this.hex}`
  }
}

// Draw the color wheel on the canvas
const drawColorWheel = (canvas: HTMLCanvasElement, radius: number) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const toRadians = (angle: number) => (angle * Math.PI) / 180

  // Draw the hue and saturation circle
  for (let angle = 0; angle < 720; angle += 1) {
    for (let sat = 0; sat <= 100; sat += 1) {
      const startAngle = toRadians(angle)
      const endAngle = toRadians(angle + 1)

      ctx.beginPath()
      ctx.moveTo(radius, radius)
      ctx.arc(radius, radius, (sat / 100) * radius, startAngle, endAngle)
      ctx.closePath()

      ctx.fillStyle = `hsl(${angle}, ${sat}%, 50%)`
      ctx.fill()
    }
  }

  // Overlay radial gradient for lightness (brightness)
  const gradient = ctx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius
  )
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

// Get the color at a specific point on the canvas
const getColorAtPoint = (canvas: HTMLCanvasElement, x: number, y: number) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return new RGB(255, 255, 255)
  }

  const { data } = ctx.getImageData(x, y, 1, 1)
  return new RGB(data[0], data[1], data[2])
}

// Calculate distance between two points
const distance = (x1: number, y1: number, x2: number, y2: number) => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// Main ColorWheel component
const ColorWheel: React.FC = () => {
  const [color, setColor] = useState<RGB>(new RGB(0, 0, 0))
  const [selectedPosition, setSelectedPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [canvasSize, setCanvasSize] = useState<number>(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDragging = useRef<boolean>(false)

  useEffect(() => {
    // Calculate canvas size as % of the window's width
    const handleResize = () => {
      const size = Math.min(
        window.innerWidth * SIZE_MULTIPLIER,
        window.innerHeight * SIZE_MULTIPLIER
      )
      setCanvasSize(size)
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (canvasRef.current && canvasSize > 0) {
      canvasRef.current.width = canvasSize * 2
      canvasRef.current.height = canvasSize * 2
      drawColorWheel(canvasRef.current, canvasSize)
    }
  }, [canvasSize])

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    selectColorAtMousePosition(event)
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true
    selectColorAtMousePosition(event)
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      selectColorAtMousePosition(event)
    }
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  const selectColorAtMousePosition = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const radius = canvasSize
      if (distance(x, y, radius, radius) <= radius) {
        const selectedColor = getColorAtPoint(canvasRef.current, x, y)
        setColor(selectedColor)
        setSelectedPosition({ x, y })
      }
    }
  }

  return (
    <div className="color-wheel-container">
      <div
        className="color-wheel-wrapper"
        style={{
          position: 'relative',
          width: canvasSize * 2,
          height: canvasSize * 2,
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          style={{ borderRadius: '50%', cursor: 'pointer' }}
        />
        {selectedPosition && (
          <div
            className="selected-color-indicator"
            style={{
              position: 'absolute',
              top: selectedPosition.y - 5,
              left: selectedPosition.x - 5,
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              border: '2px solid black',
              backgroundColor: 'transparent',
              pointerEvents: 'none',
            }}
          ></div>
        )}
      </div>
      <ColorDisplay color={color} canvasSize={canvasSize} />
    </div>
  )
}

interface subProps {
  color: RGB
  canvasSize: number
}

function SelectedColorCircle({ color, canvasSize }: subProps) {
  return (
    <div
      className="selected-color-circle"
      style={{
        backgroundColor: color.toHex().toString(),
        width: canvasSize / 2,
        height: canvasSize / 2,
      }}
    ></div>
  )
}

function ColorDisplayValues({ color }: { color: RGB }) {
  return (
    <div className="color-display-values">
      <div>
        <strong>HEX:</strong> {color.toHex().toString()}
      </div>
      <div>
        <strong>RGB:</strong> {color.toString()}
      </div>
      <div>
        <strong>HSL:</strong> {color.toHSL().toString()}
      </div>
      <div className="color-display-value-hidden">
        <strong>HSL:</strong> {new HSL(360, 100, 100).toString()}
      </div>
    </div>
  )
}

function ColorDisplay({ color, canvasSize }: subProps) {
  return (
    <div className="color-display">
      <SelectedColorCircle color={color} canvasSize={canvasSize} />
      <ColorDisplayValues color={color} />
    </div>
  )
}

export default ColorWheel
