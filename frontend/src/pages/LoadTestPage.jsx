import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Link } from 'react-router-dom'
import InfoPageLayout from '../components/InfoPageLayout'
import useDarkMode from '../hooks/useDarkMode'

// ── Real data from Prometheus exports (2026-03-25) ────────────────────────
// All times are seconds from the start of the upload phase (t=0).
// Source: Grafana CSV exports, 5-second Prometheus scrape interval.

const DRAIN_DATA = {
  qos2:  [[0,114],[15,547],[30,945],[45,930],[60,911],[75,887],[90,865],[105,849],[120,825],[135,801],[150,788],[165,776],[180,765],[195,756],[210,734],[225,710],[240,694],[255,671],[270,648],[285,624],[300,608],[315,584],[330,562],[345,539],[360,525],[375,505],[390,484],[405,462],[420,440],[435,416],[450,401],[465,378],[480,355],[495,333],[510,317],[525,293],[540,271],[555,249],[570,235],[585,212],[600,190],[615,166],[630,150],[645,126],[660,103],[675,87],[690,63],[705,40],[720,16],[735,0]],
  qos5:  [[0,107],[15,491],[30,870],[45,817],[60,768],[75,717],[90,659],[105,605],[120,549],[135,496],[150,460],[165,401],[180,341],[195,286],[210,229],[225,172],[240,138],[255,85],[270,30],[280,0]],
  qos10: [[0,92],[15,418],[30,710],[45,637],[60,534],[75,425],[90,316],[105,206],[120,95],[135,0]],
  qos25: [[0,5],[15,90],[20,30],[25,0]],
  qos50: [[0,0],[15,8],[30,0]],
}

// Average end-to-end duration per document (upload → result saved) during QOS=2.
// Shows how queue-wait time accumulates as the run progresses.
// First documents: ~13s. Last documents: ~672s.
const E2E_QOS2 = [[25,13],[45,20],[65,38],[85,57],[105,71],[125,100],[145,115],[165,126],[185,156],[205,175],[225,190],[245,215],[265,230],[285,244],[305,272],[325,287],[345,301],[365,329],[385,344],[405,359],[425,388],[445,401],[465,416],[485,444],[505,458],[525,473],[545,502],[565,517],[585,530],[605,559],[625,573],[645,601],[665,616],[685,630],[705,658],[720,672]]

// E2E during QOS=10 — much shorter run, max ~96s
const E2E_QOS10 = [[20,13],[30,14],[40,20],[50,27],[60,30],[70,42],[80,56],[90,56],[100,70],[110,83],[120,83],[130,96]]

const QOS_RUNS = [
  { key: 'qos2',  label: 'QOS = 2',  color: '#6366f1', duration: '~12 min', peak: 945 },
  { key: 'qos5',  label: 'QOS = 5',  color: '#3b82f6', duration: '~5 min',  peak: 870 },
  { key: 'qos10', label: 'QOS = 10', color: '#22c55e', duration: '~2 min',  peak: 711 },
  { key: 'qos25', label: 'QOS = 25', color: '#f59e0b', duration: '~25 sec', peak: 90  },
  { key: 'qos50', label: 'QOS = 50', color: '#ef4444', duration: '<10 sec', peak: 0   },
]

// Worker CPU usage (%) — sampled every ~45s.
// Max 2.08% at QOS=2, 2.24% at QOS=10. Worker is IO-bound, not CPU-bound.
const CPU_QOS2  = [[5,0.16],[45,0.63],[85,0.41],[125,0.34],[165,0.19],[205,0.39],[245,0.29],[285,0.33],[325,0.19],[365,0.43],[405,0.25],[445,0.29],[485,0.22],[525,0.25],[565,0.13],[605,0.19],[645,0.25],[685,0.15],[725,0.09],[735,0.0]]
const CPU_QOS10 = [[0,1.91],[40,1.17],[80,1.21],[120,0.72],[135,0.0]]
const CPU_S2    = [[0,0.05],[40,1.45],[80,1.06],[120,0.97],[160,1.24],[200,0.67],[240,0.46],[280,0.49],[320,0.56],[355,4.72]]

// S2 (100% failure) and S3 (40% failure) — document.processing drain curves
const S2_DRAIN = [[0,123],[15,526],[30,891],[45,851],[60,830],[75,770],[90,730],[105,690],[120,641],[135,611],[150,570],[165,521],[180,480],[195,432],[210,392],[225,365],[240,321],[255,278],[270,236],[285,188],[300,146],[315,98],[330,69],[345,26],[355,0]]
const S3_DRAIN = [[0,108],[15,503],[30,879],[45,832],[60,803],[75,751],[90,695],[105,644],[120,591],[135,537],[150,489],[165,440],[180,384],[195,352],[210,298],[225,246],[240,194],[255,137],[270,87],[285,34],[295,0]]

// Retry event rate (retries/second) during S2 and S3
const RETRY_S2 = [[25,3.56],[55,8.51],[85,8.53],[115,8.6],[145,8.42],[175,8.58],[205,8.38],[235,8.11],[265,8.36],[295,8.6],[325,8.42],[355,7.98]]
const RETRY_S3 = [[25,2.51],[55,6.4],[85,6.07],[115,6.13],[145,6.27],[175,6.42],[205,5.91],[235,6.27],[265,6.29],[295,6.29],[300,0]]

// ── Generic SVG chart primitives ──────────────────────────────────────────

const CHART_W = 760
const CHART_H = 260
const PAD = { top: 16, right: 20, bottom: 40, left: 56 }
const PLOT_W = CHART_W - PAD.left - PAD.right
const PLOT_H = CHART_H - PAD.top - PAD.bottom

function makeScaleX(maxT) { return (t) => PAD.left + (t / maxT) * PLOT_W }
function makeScaleY(maxY) { return (y) => PAD.top + PLOT_H - (y / maxY) * PLOT_H }

function ChartPolyline({ data, scaleX, scaleY, color, strokeWidth = 2.5 }) {
  const points = data.map(([t, v]) => `${scaleX(t)},${scaleY(v)}`).join(' ')
  return (
    <polyline
      points={points}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  )
}

function ChartGrid({ yTicks, xTicks, scaleX, scaleY, axisColor, gridColor }) {
  return (
    <>
      {yTicks.map(v => (
        <line key={v} x1={PAD.left} x2={CHART_W - PAD.right} y1={scaleY(v)} y2={scaleY(v)}
          stroke={gridColor} strokeWidth="0.5" />
      ))}
      {xTicks.map(t => (
        <line key={t} x1={scaleX(t)} x2={scaleX(t)} y1={PAD.top} y2={PAD.top + PLOT_H}
          stroke={gridColor} strokeWidth="0.5" />
      ))}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke={axisColor} strokeWidth="1" />
      <line x1={PAD.left} x2={CHART_W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke={axisColor} strokeWidth="1" />
    </>
  )
}

function ChartLabels({ yTicks, xTicks, scaleX, scaleY, yLabel, xLabel, formatY, formatX, textColor }) {
  return (
    <>
      {yTicks.map(v => (
        <text key={v} x={PAD.left - 6} y={scaleY(v) + 4} textAnchor="end" fontSize="11" fill={textColor}>
          {formatY ? formatY(v) : v}
        </text>
      ))}
      {xTicks.map(t => (
        <text key={t} x={scaleX(t)} y={CHART_H - 8} textAnchor="middle" fontSize="11" fill={textColor}>
          {formatX ? formatX(t) : `${t}s`}
        </text>
      ))}
      <text
        x={PAD.left - 42} y={PAD.top + PLOT_H / 2}
        textAnchor="middle" fontSize="11" fill={textColor}
        transform={`rotate(-90, ${PAD.left - 42}, ${PAD.top + PLOT_H / 2})`}
      >
        {yLabel}
      </text>
      <text x={PAD.left + PLOT_W / 2} y={CHART_H} textAnchor="middle" fontSize="11" fill={textColor}>
        {xLabel}
      </text>
    </>
  )
}

// ── Drain curve chart ─────────────────────────────────────────────────────

function DrainCurveChart({ dark }) {
  const textColor  = dark ? '#94a3b8' : '#64748b'
  const gridColor  = dark ? '#334155' : '#e2e8f0'
  const axisColor  = dark ? '#475569' : '#cbd5e1'

  const MAX_T = 750
  const MAX_Q = 1000
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Q)

  const yTicks = [0, 200, 400, 600, 800, 1000]
  const xTicks = [0, 150, 300, 450, 600, 750]
  const runs   = QOS_RUNS.map(r => ({ ...r, data: DRAIN_DATA[r.key] }))

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />
        {runs.map(r => <ChartPolyline key={r.key} data={r.data} scaleX={scaleX} scaleY={scaleY} color={r.color} />)}
        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="messages in queue" xLabel="seconds from upload start"
          textColor={textColor}
        />
      </svg>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {runs.map(r => (
          <div key={r.key} className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── E2E Duration chart ────────────────────────────────────────────────────

function E2EChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  const MAX_T = 730
  const MAX_Y = 720
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Y)

  const yTicks = [0, 120, 240, 360, 480, 600, 720]
  const xTicks = [0, 150, 300, 450, 600, 730]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />

        {/* QOS=2 line */}
        <ChartPolyline data={E2E_QOS2} scaleX={scaleX} scaleY={scaleY} color="#6366f1" />

        {/* QOS=10 line */}
        <ChartPolyline data={E2E_QOS10} scaleX={scaleX} scaleY={scaleY} color="#22c55e" />

        {/* Annotation: ideal (processing time only) */}
        <line
          x1={scaleX(0)} x2={scaleX(730)}
          y1={scaleY(13)} y2={scaleY(13)}
          stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 4"
        />
        <text x={scaleX(620)} y={scaleY(13) - 6} fontSize="10" fill="#f59e0b" textAnchor="middle">
          ideal: ~13s (processing only)
        </text>

        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="avg e2e duration (s)" xLabel="seconds from upload start"
          formatY={(v) => v === 0 ? '0' : v >= 60 ? `${Math.round(v/60)}m` : `${v}s`}
          textColor={textColor}
        />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {[
          { color: '#6366f1', label: 'QOS = 2  (avg e2e climbs to 672s)' },
          { color: '#22c55e', label: 'QOS = 10 (avg e2e max 96s)' },
          { color: '#f59e0b', label: 'Ideal: actual processing time only (~13s)', dashed: true },
        ].map(({ color, label, dashed }) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-full"
              style={{ backgroundColor: color, backgroundImage: dashed ? `repeating-linear-gradient(to right, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)` : 'none' }}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HikariCP saturation chart ─────────────────────────────────────────────

function HikariChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  // QOS=2 HikariCP active connections (low — DB not saturated)
  const hikariQos2 = [[5,8],[15,4],[25,2],[35,2],[45,1],[55,1],[65,2],[75,1],[85,1],[95,0],[105,1],[115,1],[125,1],[135,2],[145,1],[155,0],[165,0],[175,1],[185,0],[195,0],[205,2],[215,1],[225,1],[235,0],[245,0],[255,0],[265,2],[275,0],[285,0],[295,1],[305,2],[315,1],[325,1],[335,1],[345,0],[355,0],[365,0],[375,1],[385,0],[395,0],[405,1],[415,1],[425,1],[435,1],[445,0],[455,0],[465,0],[475,1],[485,0],[495,0],[505,1],[515,2],[525,0],[535,0],[545,0],[555,1],[565,0],[575,0],[585,0],[595,1],[605,1],[615,2],[625,0],[635,0],[645,1],[655,0],[665,0],[675,1],[685,1],[695,0],[705,0],[715,0],[725,0],[735,0]]

  // QOS=25 — spikes to pool ceiling (10 connections)
  const hikariQos25 = [[0,0],[5,10],[10,10],[15,10],[20,6],[25,4],[30,0]]

  const MAX_T = 740
  const MAX_Y = 12
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Y)

  const yTicks = [0, 2, 4, 6, 8, 10]
  const xTicks = [0, 150, 300, 450, 600, 740]

  // Pool ceiling line
  const ceilingY = scaleY(10)

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />

        {/* Pool ceiling */}
        <line
          x1={PAD.left} x2={CHART_W - PAD.right}
          y1={ceilingY} y2={ceilingY}
          stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3"
        />
        <text x={CHART_W - PAD.right - 4} y={ceilingY - 5} textAnchor="end" fontSize="10" fill="#ef4444">
          pool ceiling (10)
        </text>

        {/* QOS=2 line — stays low */}
        <ChartPolyline data={hikariQos2} scaleX={scaleX} scaleY={scaleY} color="#6366f1" strokeWidth={1.5} />

        {/* QOS=25 — spikes to ceiling, shown at x=600 area for visual clarity */}
        {(() => {
          const offset = 600
          const shifted = hikariQos25.map(([t, v]) => [t + offset, v])
          return <ChartPolyline data={shifted} scaleX={scaleX} scaleY={scaleY} color="#f59e0b" strokeWidth={2.5} />
        })()}

        {/* QOS=25 annotation */}
        <text x={scaleX(630)} y={scaleY(10.5)} textAnchor="middle" fontSize="10" fill="#f59e0b">
          QOS=25 spike →
        </text>

        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="active DB connections" xLabel="seconds from upload start"
          textColor={textColor}
        />
      </svg>

      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {[
          { color: '#6366f1', label: 'QOS = 2  (1–2 connections, DB idle)' },
          { color: '#f59e0b', label: 'QOS = 25 (hits pool ceiling of 10 — bottleneck)' },
          { color: '#ef4444', label: 'Pool ceiling (max-pool-size = 10)', dashed: true },
        ].map(({ color, label, dashed }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CPU chart ─────────────────────────────────────────────────────────────

function CpuChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  const MAX_T = 760
  const MAX_Y = 6   // %
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Y)

  const yTicks = [0, 1, 2, 3, 4, 5, 6]
  const xTicks = [0, 150, 300, 450, 600, 760]

  // Shift CPU_S2 to a separate x region for visual clarity (show as its own run)
  // Actually show all three with their normalized t=0 curves overlaid

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />
        <ChartPolyline data={CPU_QOS2}  scaleX={scaleX} scaleY={scaleY} color="#6366f1" strokeWidth={2} />
        <ChartPolyline data={CPU_QOS10} scaleX={scaleX} scaleY={scaleY} color="#22c55e" strokeWidth={2} />
        <ChartPolyline data={CPU_S2}    scaleX={scaleX} scaleY={scaleY} color="#ef4444" strokeWidth={2} />
        {/* 5% reference line */}
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={scaleY(5)} y2={scaleY(5)}
          stroke={dark ? '#475569' : '#cbd5e1'} strokeWidth="1" strokeDasharray="4 3" />
        <text x={CHART_W - PAD.right - 4} y={scaleY(5) - 5} textAnchor="end" fontSize="10" fill={textColor}>
          IO-bound threshold
        </text>
        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="CPU usage (%)" xLabel="seconds from run start"
          formatY={(v) => `${v}%`}
          textColor={textColor}
        />
      </svg>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {[
          { color: '#6366f1', label: 'QOS=2  (avg 0.3%, max 2.1%)' },
          { color: '#22c55e', label: 'QOS=10 (avg 1.3%, max 2.2%)' },
          { color: '#ef4444', label: 'S2 DLQ validation (avg 1.0%, max 4.7%)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Failure scenario drain curves ─────────────────────────────────────────

function FailureDrainChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  const MAX_T = 360
  const MAX_Q = 1000
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Q)

  const yTicks = [0, 200, 400, 600, 800, 1000]
  const xTicks = [0, 60, 120, 180, 240, 300, 360]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />
        {/* QOS=10 happy path for reference */}
        <ChartPolyline data={DRAIN_DATA.qos10} scaleX={scaleX} scaleY={scaleY} color="#22c55e" strokeWidth={1.5} />
        {/* S2 100% failure */}
        <ChartPolyline data={S2_DRAIN} scaleX={scaleX} scaleY={scaleY} color="#ef4444" strokeWidth={2.5} />
        {/* S3 40% failure */}
        <ChartPolyline data={S3_DRAIN} scaleX={scaleX} scaleY={scaleY} color="#f59e0b" strokeWidth={2.5} />
        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="document.processing depth" xLabel="seconds from upload start"
          textColor={textColor}
        />
      </svg>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {[
          { color: '#22c55e', label: 'S1 QOS=10 happy path (reference)' },
          { color: '#ef4444', label: 'S2 — 100% failure (all go to DLQ, ~6 min)' },
          { color: '#f59e0b', label: 'S3 — 40% failure (mixed DONE/DLQ, ~5 min)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Retry rate chart ──────────────────────────────────────────────────────

function RetryRateChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  const MAX_T = 360
  const MAX_Y = 10
  const scaleX = makeScaleX(MAX_T)
  const scaleY = makeScaleY(MAX_Y)

  const yTicks = [0, 2, 4, 6, 8, 10]
  const xTicks = [0, 60, 120, 180, 240, 300, 360]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
        <ChartGrid yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY} axisColor={axisColor} gridColor={gridColor} />
        <ChartPolyline data={RETRY_S2} scaleX={scaleX} scaleY={scaleY} color="#ef4444" strokeWidth={2.5} />
        <ChartPolyline data={RETRY_S3} scaleX={scaleX} scaleY={scaleY} color="#f59e0b" strokeWidth={2.5} />
        {/* S1 reference — zero retries */}
        <line x1={PAD.left} x2={CHART_W - PAD.right} y1={scaleY(0)} y2={scaleY(0)}
          stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
        <text x={scaleX(80)} y={scaleY(0) - 6} fontSize="10" fill="#22c55e">
          S1 happy path (0 retries)
        </text>
        <ChartLabels
          yTicks={yTicks} xTicks={xTicks} scaleX={scaleX} scaleY={scaleY}
          yLabel="retry events / second" xLabel="seconds from upload start"
          textColor={textColor}
        />
      </svg>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
        {[
          { color: '#ef4444', label: 'S2 — 100% failure (max 8.6/s, all 3 retries fire)' },
          { color: '#f59e0b', label: 'S3 — 40% failure (max 6.4/s, partial retries)' },
          { color: '#22c55e', label: 'S1 happy path (0 retries — stub never fails)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Probability math visualization ────────────────────────────────────────

function ProbabilityMath({ dark }) {
  const box = 'rounded-lg border px-3 py-2 text-center text-sm font-mono'
  const arrow = 'text-gray-400 dark:text-gray-500 text-lg font-bold self-center'
  const highlight = dark
    ? 'bg-indigo-950/50 border-indigo-800 text-indigo-300'
    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
  const normal = dark
    ? 'bg-gray-900 border-gray-700 text-gray-300'
    : 'bg-gray-50 border-gray-200 text-gray-700'
  const red = dark
    ? 'bg-red-950/50 border-red-800 text-red-300'
    : 'bg-red-50 border-red-200 text-red-700'
  const green = dark
    ? 'bg-green-950/50 border-green-800 text-green-300'
    : 'bg-green-50 border-green-200 text-green-700'
  const amber = dark
    ? 'bg-amber-950/50 border-amber-800 text-amber-300'
    : 'bg-amber-50 border-amber-200 text-amber-700'

  return (
    <div className="space-y-6">
      {/* Step 1 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Step 1 — Single call success probability
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${box} ${normal}`}>STUB_FAILURE_RATE = 0.4</div>
          <span className={arrow}>→</span>
          <div className={`${box} ${highlight}`}>P(one call succeeds) = 0.6</div>
        </div>
      </div>

      {/* Step 2 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Step 2 — All 3 calls succeed (Mono.zip fires summarize, flashcards, quiz concurrently)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${box} ${normal}`}>0.6 × 0.6 × 0.6</div>
          <span className={arrow}>=</span>
          <div className={`${box} ${green}`}>P(message succeeds in one attempt) = 21.6%</div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Setting STUB_FAILURE_RATE=0.4 doesn't mean 40% of messages fail — it means
          each of the 3 concurrent AI calls has a 40% chance of failing.
          All three must succeed simultaneously, which only happens 21.6% of the time.
        </p>
      </div>

      {/* Step 3 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Step 3 — Per-attempt failure probability
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${box} ${normal}`}>1 − 0.216</div>
          <span className={arrow}>=</span>
          <div className={`${box} ${amber}`}>P(message fails one attempt) = 78.4%</div>
        </div>
      </div>

      {/* Step 4 */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Step 4 — Fails all 3 attempts → routes to DLQ
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${box} ${normal}`}>0.784 × 0.784 × 0.784</div>
          <span className={arrow}>=</span>
          <div className={`${box} ${red}`}>P(DLQ) = 48.2%</div>
        </div>
      </div>

      {/* Final result */}
      <div className={`rounded-xl border p-4 ${dark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className={`${box} ${normal}`}>1000 messages × 48.2%</div>
          <span className={arrow}>=</span>
          <div className={`${box} ${red} font-bold`}>Expected DLQ: 482</div>
          <span className={arrow}>→</span>
          <div className={`${box} ${green} font-bold`}>Actual DLQ: 482 ✓</div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Prediction accurate to within 0.2% at 1000 samples.
          The law of large numbers means individual randomness averages out at scale —
          exactly what you'd expect in a distributed system handling real traffic.
        </p>
      </div>

      {/* Outcome breakdown */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Full outcome breakdown per message
        </p>
        <div className="space-y-2">
          {[
            { label: 'Succeeds on attempt 1',  prob: '21.6%', calc: '0.6³',               color: green },
            { label: 'Fails 1, succeeds on 2', prob: '16.9%', calc: '0.784 × 0.216',      color: green },
            { label: 'Fails 2, succeeds on 3', prob: '13.3%', calc: '0.784² × 0.216',     color: green },
            { label: 'Fails all 3 → DLQ',      prob: '48.2%', calc: '0.784³',             color: red   },
          ].map(({ label, prob, calc, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`${box} ${color} w-20 flex-shrink-0`}>{prob}</div>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{calc}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            <div className={`${box} ${highlight} w-20 flex-shrink-0 font-bold`}>100%</div>
            <span className="text-xs text-gray-500 dark:text-gray-400">total (51.8% DONE, 48.2% DLQ)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ReactFlow pipeline diagram ────────────────────────────────────────────

function PipelineNode({ data }) {
  return (
    <div className="rounded-xl border px-4 py-3 text-center shadow-sm w-36"
      style={{ background: data.bg, borderColor: data.borderColor }}>
      <Handle type="target" position={Position.Left}
        style={{ background: data.borderColor, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: data.borderColor, width: 8, height: 8 }} />
      <div className="text-base mb-1">{data.icon}</div>
      <div className="text-xs font-semibold" style={{ color: data.textColor }}>{data.label}</div>
      {data.metric && (
        <div className="mt-1.5 text-xs rounded-md px-1.5 py-0.5"
          style={{ background: data.metricBg, color: data.metricColor }}>
          {data.metric}
        </div>
      )}
      {data.sub && (
        <div className="text-xs mt-0.5 opacity-60" style={{ color: data.textColor }}>{data.sub}</div>
      )}
    </div>
  )
}

function BottleneckNode({ data }) {
  return (
    <div className="rounded-xl border-2 px-4 py-3 text-center shadow-md w-36"
      style={{ background: data.bg, borderColor: data.borderColor }}>
      <Handle type="target" position={Position.Left}
        style={{ background: data.borderColor, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: data.borderColor, width: 8, height: 8 }} />
      <div className="text-base mb-1">{data.icon}</div>
      <div className="text-xs font-semibold" style={{ color: data.textColor }}>{data.label}</div>
      <div className="mt-1.5 text-xs font-bold rounded-md px-1.5 py-0.5"
        style={{ background: data.metricBg, color: data.metricColor }}>
        {data.metric}
      </div>
      <div className="text-xs mt-1 font-semibold" style={{ color: '#ef4444' }}>← bottleneck</div>
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode, bottleneck: BottleneckNode }

function PipelineDiagram({ dark }) {
  const card = dark
    ? { bg: '#1e293b', border: '#334155', text: '#e2e8f0', metricBg: '#0f172a', metricColor: '#94a3b8' }
    : { bg: '#f8fafc',  border: '#e2e8f0', text: '#1e293b', metricBg: '#e2e8f0', metricColor: '#475569' }

  const n = (id, x, icon, label, metric, sub, type = 'pipeline') => ({
    id, type,
    position: { x, y: 80 },
    data: { icon, label, metric, sub, ...card,
      ...(type === 'bottleneck' ? {
        bg: dark ? '#450a0a' : '#fef2f2', borderColor: '#ef4444',
        textColor: dark ? '#fca5a5' : '#991b1b',
        metricBg: dark ? '#7f1d1d' : '#fee2e2', metricColor: dark ? '#fca5a5' : '#b91c1c',
      } : {
        bg: card.bg, borderColor: card.border, textColor: card.text,
        metricBg: card.metricBg, metricColor: card.metricColor,
      }),
    },
  })

  const nodes = [
    n('upload',  0,   '📤', 'Upload Script', '~30s / 1000 docs', '10 workers'),
    n('backend', 180, '⚙️', 'Backend',       'publishes msgs',   'Spring Boot'),
    n('queue',   360, '🐇', 'RabbitMQ',      'peak 945 @ QOS=2', 'doc.processing'),
    n('worker',  540, '🔧', 'Worker',        '~1.6s per doc',    'QOS = 2–50'),
    n('db',      720, '🗄️', 'Supabase DB',   '~5 docs/s ceiling','single writer', 'bottleneck'),
  ]

  const arrow = (color) => ({ type: MarkerType.ArrowClosed, color })
  const e = (id, source, target, label, color = dark ? '#475569' : '#94a3b8', dashed = false) => ({
    id, source, target, label,
    style: { stroke: color, strokeWidth: dashed ? 2 : 1.5, strokeDasharray: dashed ? '4 2' : undefined },
    markerEnd: arrow(color),
    labelStyle: { fontSize: 10, fill: color },
    labelBgStyle: { fill: dark ? '#1e293b' : '#f8fafc', fillOpacity: 0.9 },
  })

  const edges = [
    e('e1', 'upload',  'backend', 'HTTP upload'),
    e('e2', 'backend', 'queue',   'publish'),
    e('e3', 'queue',   'worker',  'consume (QOS)'),
    e('e4', 'worker',  'db',      'via doc.processed', '#ef4444', true),
  ]

  return (
    <div style={{ height: 240 }} className="w-full rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false} nodesConnectable={false}
        elementsSelectable={false} zoomOnScroll={false}
        panOnDrag={false} preventScrolling={false}
        colorMode={dark ? 'dark' : 'light'}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1}
          color={dark ? '#334155' : '#e2e8f0'} />
      </ReactFlow>
    </div>
  )
}

// ── Section / card helpers ────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="mb-14">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 pb-3 border-b border-gray-100 dark:border-gray-800">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FindingCard({ number, title, children }) {
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <span className="text-2xl font-bold text-indigo-500 dark:text-indigo-400 leading-none mt-0.5 tabular-nums">
          {String(number).padStart(2, '0')}
        </span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{children}</p>
        </div>
      </div>
    </div>
  )
}

function ScenarioCard({ label, badge, badgeColor, stats, description }) {
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900 dark:text-white text-sm">{label}</p>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: badgeColor + '22', color: badgeColor }}>
          {badge}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">{k}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

function QosTable() {
  const rows = [
    { qos: 2,  duration: '~12 min', peak: 945,   note: 'Linear drain. Worker fully utilized. E2E avg rose to 672s — queue wait dominated processing.' },
    { qos: 5,  duration: '~5 min',  peak: 870,   note: '~2.4× faster than QOS=2. Still scaling linearly with concurrency.' },
    { qos: 10, duration: '~2 min',  peak: 711,   note: 'Worker almost kept up with uploads during upload phase. Scaling starts flattening.' },
    { qos: 25, duration: '~25 sec', peak: 90,    note: 'Worker faster than uploads — queue barely built up. document.processed peaked at 521, DB write ceiling visible.' },
    { qos: 50, duration: '~5 min†', peak: '~0',  note: '†Queue barely built up during upload phase. Same total drain time as QOS=25 — DB ceiling confirmed.' },
  ]
  return (
    <div className="overflow-x-auto mt-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            {['QOS', 'Drain time', 'Peak depth', 'Observation'].map(h => (
              <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.qos} className="border-b border-gray-50 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
              <td className="py-3 pr-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.qos}</td>
              <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.duration}</td>
              <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.peak}</td>
              <td className="py-3 text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LoadTestPage() {
  const [dark] = useDarkMode()

  return (
    <InfoPageLayout title="Load Test Results">
      <div className="max-w-none">

        {/* Hero */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Load Test Results</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">Pipeline throughput analysis — March 2026</p>

        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl p-5 mb-12">
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Key finding</p>
          <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
            Increasing worker concurrency beyond <strong>QOS=10</strong> yields no throughput improvement.
            The bottleneck is the <strong>Supabase PostgreSQL round-trip</strong> for writing results —
            constrained by the single-writer principle. At QOS≥25 the worker outpaces the DB and
            backpressure appears in the{' '}
            <code className="bg-indigo-100 dark:bg-indigo-900 px-1 rounded text-xs">document.processed</code> queue.
          </p>
        </div>

        {/* What we tested */}
        <Section title="What We Tested">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            We replaced the real AI service with a configurable stub (1s fixed delay, zero cost) and
            published 1000 documents per run, varying only the worker's QOS (prefetch count) and
            flatmap-concurrency. Everything else — RabbitMQ, Spring Boot backend, Supabase — was real.
          </p>
          <PipelineDiagram dark={dark} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            The red node marks where throughput was bounded at high concurrency. All metrics were captured
            by Prometheus (5–15s scrape interval) and exported from Grafana.
          </p>
        </Section>

        {/* QOS ladder */}
        <Section title="QOS Ladder — Queue Drain Curves">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            Each line shows the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing</code> queue
            depth over time. Time is normalized to t=0 at upload start; the upload phase (~30 seconds)
            is visible as the rising slope before the peak. After uploads finish the worker alone drains the queue.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            Source: Prometheus time-series, sampled to 15s intervals. Actual scrape interval: 5s.
          </p>
          <DrainCurveChart dark={dark} />
          <QosTable />
        </Section>

        {/* E2E duration */}
        <Section title="The Queue Wait Effect — End-to-End Duration">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            This chart shows the average time from <em>document upload</em> to <em>result saved to DB</em>.
            At QOS=2, actual AI processing takes ~1.6s per document — but a document uploaded at t=600s
            first waits ~500s in the queue behind earlier documents. The average end-to-end time rose to{' '}
            <strong className="text-gray-900 dark:text-white">672 seconds</strong> by the end of the run.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            At QOS=10, the same workload completed with a maximum average of <strong className="text-gray-900 dark:text-white">96 seconds</strong>.
            The gap between the dashed line (pure processing time) and the actual curves is{' '}
            <em>entirely queue wait time</em> — waste that concurrency eliminates.
          </p>
          <E2EChart dark={dark} />
        </Section>

        {/* DB saturation */}
        <Section title="The Database Bottleneck — HikariCP Connections">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            The backend uses a HikariCP connection pool (max 10 connections) to write results to
            Supabase PostgreSQL. At QOS=2 the pool is almost idle — the worker generates results slowly
            and the DB writer has plenty of headroom.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            At QOS=25 the pool hit its ceiling of 10 active connections. New DB write requests had to
            queue inside HikariCP, confirming that <strong className="text-gray-900 dark:text-white">Supabase
            PostgreSQL round-trip latency</strong> — not worker concurrency — was the binding constraint.
            This is the single-writer principle's hard ceiling in production.
          </p>
          <HikariChart dark={dark} />
          <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-xl p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>Production implication:</strong> To scale beyond this ceiling, the options are:
              (1) a paid Supabase tier with lower latency and higher connection limits,
              (2) a connection pooler (PgBouncer) in transaction mode,
              or (3) batched DB writes in the backend consumer.
              The architectural pattern (single writer) remains correct — only the implementation
              parameters change.
            </p>
          </div>
        </Section>

        {/* CPU — worker is IO-bound */}
        <Section title="Worker CPU — The System Is IO-Bound">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            CPU never exceeded 5% during any run — even at QOS=50 with 50 concurrent processing
            pipelines. The worker spends its time waiting for network responses:
            PDF download from Supabase Storage, three concurrent HTTP calls to the AI service,
            and RabbitMQ publish confirms. The CPU is idle during all of this.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            This means CPU is <strong className="text-gray-900 dark:text-white">not a scaling constraint</strong>.
            Adding more replicas of the worker would multiply throughput linearly — up to the DB ceiling.
            The S2 DLQ run (100% failures) shows a brief CPU spike at the end when exhausted
            messages are nacked and result messages published simultaneously.
          </p>
          <CpuChart dark={dark} />
        </Section>

        {/* Failure scenario drain curves */}
        <Section title="Failure Scenarios — S2 and S3 Drain Curves">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            Both failure scenarios processed the same 1000 messages but with different AI stub
            configurations. Compared against the QOS=10 happy path, the failure runs are
            noticeably <em>slower to drain</em> — retry backoff delays (1s → 2s per attempt)
            add processing time per message even when the outcome is failure.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            S3 (40% failure, amber) drains slightly faster than S2 (100% failure, red)
            because roughly half the messages succeed on the first attempt with no backoff delay.
          </p>
          <FailureDrainChart dark={dark} />
        </Section>

        {/* Retry rate */}
        <Section title="Retry Activity During Failure Scenarios">
          <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
            This chart shows the retry event rate in events per second. During S1 (happy path)
            the rate is exactly zero — the stub never fails so no retries ever fire.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            S2 sustains ~8.5 retries/s throughout because every message fails every attempt.
            S3 settles around ~6 retries/s — lower because 21.6% of messages succeed on the
            first attempt and never retry. The difference between 8.5 and 6 directly reflects
            the fraction of messages that short-circuit on success.
          </p>
          <RetryRateChart dark={dark} />
        </Section>

        {/* The 482 DLQ math */}
        <Section title="The Mathematics Behind 482 DLQ Messages">
          <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            The test produced exactly 482 DLQ messages out of 1000 — matching the theoretical
            prediction to within 0.2%. Here is the probability chain that produces that number,
            step by step.
          </p>
          <ProbabilityMath dark={dark} />
        </Section>

        {/* Key findings */}
        <Section title="Key Findings">
          <div className="space-y-4">
            <FindingCard number={1} title="QOS=10 is the throughput sweet spot">
              Moving from QOS=2 to QOS=10 gave a 6× speedup (12 min → 2 min). Moving from QOS=10 to
              QOS=50 gave essentially zero improvement. The inflection point is where worker
              concurrency outpaces the database write rate (~5 docs/s on Supabase free tier).
            </FindingCard>
            <FindingCard number={2} title="Queue wait time dominates end-to-end latency at low concurrency">
              At QOS=2, actual processing was ~1.6s per document, but average end-to-end duration
              reached 672 seconds. Documents uploaded late in the run waited over 10 minutes in the
              queue before being touched. Increasing QOS collapses this wait — at QOS=10 the maximum
              average e2e dropped to 96 seconds.
            </FindingCard>
            <FindingCard number={3} title="The single-writer principle creates a hard throughput ceiling">
              The backend is the only service that writes to the database. At QOS≥25 the worker
              generated results faster than the backend could write them, saturating the HikariCP
              pool. The <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">document.processed</code> queue
              peaked at 521 messages — backpressure made visible.
            </FindingCard>
            <FindingCard number={4} title="Retry math predicts DLQ count to within 0.2% at 1000 samples">
              At 40% failure rate per AI call, three concurrent calls (Mono.zip) give a per-attempt
              failure probability of 1 − 0.6³ = 78.4%. Over three retries: 0.784³ ≈ 48.2% DLQ
              probability. The test produced 482 DLQ messages out of 1000 — the law of large numbers
              at work.
            </FindingCard>
          </div>
        </Section>

        {/* Scenario results */}
        <Section title="Scenario Results">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScenarioCard
              label="S1 — QOS Ladder" badge="5 runs" badgeColor="#6366f1"
              stats={[['Messages','1000 / run'],['Stub delay','1 second'],['Best drain','~2 min (QOS=10)'],['Worst drain','~12 min (QOS=2)']]}
              description="Five runs with QOS=2,5,10,25,50. Throughput scaled linearly from QOS=2 to QOS=10 then plateaued, confirming the DB ceiling. At QOS=50 the worker consumed messages faster than the upload script could publish them."
            />
            <ScenarioCard
              label="S2 — DLQ Validation" badge="100% failure" badgeColor="#ef4444"
              stats={[['Messages','1000'],['DLQ count','~1000'],['QOS','10'],['Duration','~7 min']]}
              description="With the stub returning 500 on every call, all 1000 messages exhausted their 3 retry attempts and routed to the DLQ. The processing queue and DLQ reached 0 and 1000 simultaneously — a perfect mirror confirming the retry mechanism."
            />
            <ScenarioCard
              label="S3 — Retry Mix" badge="40% failure rate" badgeColor="#f59e0b"
              stats={[['Messages','1000'],['DLQ count','482'],['DONE count','~518'],['Predicted','482']]}
              description="With 40% per-call failure and 3 concurrent AI calls, per-message failure probability = 1 − 0.6³ = 78.4%. DLQ probability over 3 attempts = 0.784³ ≈ 48.2%. Result: 482 — within 0.2% of prediction at 1000 samples."
            />
            <ScenarioCard
              label="S4 — 429 Rate Limit Backoff" badge="65s delay confirmed" badgeColor="#22c55e"
              stats={[['Messages','20'],['Duration','~10 min'],['Expected','~9 min'],['Result','Confirmed']]}
              description="With 100% rate-limit responses, the worker applied a 65-second fixed delay between retries (vs 1–2s for standard failures). All 20 messages exhausted retries and went to DLQ. Duration matched the theoretical prediction, confirming the backoff fires correctly."
            />
          </div>
        </Section>

        {/* Raw metrics link */}
        <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-5 mb-14 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">Full session metrics</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              All 15 Prometheus metrics across the entire 3-hour session, with test phase annotations.
            </p>
          </div>
          <Link
            to="/raw-metrics"
            className="flex-shrink-0 ml-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View raw metrics →
          </Link>
        </div>

        {/* Infrastructure */}
        <Section title="Test Infrastructure">
          <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
            The load test stack replaced the real AI service with a Python FastAPI stub while keeping
            everything else production-equivalent. Prometheus scraped RabbitMQ at 5-second intervals
            and Spring Boot actuators at 15-second intervals.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Upload workers','10 concurrent'],['Messages / run','1000'],['Stub delay','1 second'],['Prometheus','5s / 15s scrape']].map(([k, v]) => (
              <div key={k} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{k}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{v}</p>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </InfoPageLayout>
  )
}
