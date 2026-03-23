import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import MermaidDiagram from './MermaidDiagram'

/**
 * Fullscreen lightbox for Mermaid diagrams.
 *
 * Controls:
 *   - Mouse wheel  → zoom in/out
 *   - Drag         → pan
 *   - Reset button → back to 100%, centered
 *   - Esc / backdrop click → close
 */
export default function LightboxModal({ definition, title, onClose }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const canvasRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Wheel zoom — must be non-passive to call preventDefault
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setScale((s) => Math.min(Math.max(s * factor, 0.15), 10))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const onMouseDown = (e) => {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const onMouseMove = (e) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }

  const onMouseUp = () => { isDragging.current = false }

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-900 dark:text-white text-sm font-medium truncate pr-4">{title}</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            onClick={reset}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden flex items-center justify-center bg-white dark:bg-black cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            minWidth: '860px',
          }}
        >
          <MermaidDiagram definition={definition} />
        </div>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-400 dark:text-gray-600 pointer-events-none whitespace-nowrap">
        Scroll to zoom · Drag to pan · Esc to close
      </div>
    </div>,
    document.body
  )
}
