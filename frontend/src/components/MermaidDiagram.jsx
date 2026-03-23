import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

/**
 * Renders a Mermaid diagram string as an SVG.
 *
 * Light mode: mermaid 'default' theme.
 * Dark mode:  mermaid 'base' theme with custom high-contrast variables —
 *             light text, bright indigo arrows, coloured nodes — so diagrams
 *             are readable on the dark card / black lightbox background.
 *
 * The SVG background rect is stripped after render so the surrounding
 * container colour shows through instead of an opaque white rect.
 */

let idCounter = 0

// Custom theme variables for dark mode — indigo/slate palette
const DARK_THEME_VARS = {
  background: 'transparent',
  // Nodes
  primaryColor: '#1e3a5f',
  primaryTextColor: '#e2e8f0',
  primaryBorderColor: '#4d90d4',
  secondaryColor: '#1a3a2a',
  secondaryTextColor: '#e2e8f0',
  secondaryBorderColor: '#3a8a5a',
  tertiaryColor: '#3d1f5a',
  tertiaryTextColor: '#e2e8f0',
  tertiaryBorderColor: '#8b5cf6',
  // Edges / arrows
  lineColor: '#7eb8ff',
  edgeLabelBackground: '#1e293b',
  // Subgraph clusters
  clusterBkg: '#111827',
  clusterBorder: '#374151',
  titleColor: '#f1f5f9',
  // Flowchart node text
  nodeTextColor: '#e2e8f0',
  // Sequence diagram actors
  actorBkg: '#1e3a5f',
  actorTextColor: '#e2e8f0',
  actorBorder: '#4d90d4',
  actorLineColor: '#4d90d4',
  // Sequence diagram signals / arrows
  signalColor: '#7eb8ff',
  signalTextColor: '#e2e8f0',
  // Sequence diagram notes
  noteBkgColor: '#2d3748',
  noteTextColor: '#e2e8f0',
  noteBorderColor: '#4a5568',
  // Sequence diagram loop / alt boxes
  labelBoxBkgColor: '#1e293b',
  labelTextColor: '#e2e8f0',
  loopTextColor: '#e2e8f0',
  // Sequence diagram activation bar
  activationBkgColor: '#2d4a7a',
  activationBorderColor: '#4d90d4',
}

function useDomDarkMode() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])
  return dark
}

export default function MermaidDiagram({ definition, className = '' }) {
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const dark = useDomDarkMode()

  useEffect(() => {
    if (!containerRef.current) return

    setError(null)

    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'base' : 'default',
      themeVariables: dark ? DARK_THEME_VARS : {},
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    })

    const id = `mermaid-${++idCounter}`

    mermaid
      .render(id, definition)
      .then(({ svg }) => {
        if (!containerRef.current) return
        containerRef.current.innerHTML = svg
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
          svgEl.style.background = 'transparent'
          const bgRect = svgEl.querySelector('rect.background')
          if (bgRect) bgRect.remove()
        }
      })
      .catch((err) => {
        console.error('Mermaid render error:', err)
        setError('Diagram failed to render.')
      })
  }, [definition, dark])

  if (error) {
    return (
      <p className="text-sm text-red-500 dark:text-red-400 py-2">{error}</p>
    )
  }

  return <div ref={containerRef} className={`overflow-x-auto ${className}`} />
}
