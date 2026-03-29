import { Link } from 'react-router-dom'
import InfoPageLayout from '../components/InfoPageLayout'
import useDarkMode from '../hooks/useDarkMode'

// ── Run metadata ─────────────────────────────────────────────────────────
const RUNS_META = [
  { key:'qos2',   label:'S1: QOS=2',   color:'#6366f1', scenario:'S1', msgs:1000, qos:2,  elapsed:738.86, uploadElapsed:82.39,  uploadErrors:0,  throughput:'1.4 msg/s' },
  { key:'qos5',   label:'S1: QOS=5',   color:'#3b82f6', scenario:'S1', msgs:1000, qos:5,  elapsed:330.17, uploadElapsed:89.59,  uploadErrors:1,  throughput:'3.0 msg/s' },
  { key:'qos10',  label:'S1: QOS=10',  color:'#22c55e', scenario:'S1', msgs:1000, qos:10, elapsed:188.14, uploadElapsed:188.14, uploadErrors:0,  throughput:'5.3 msg/s' },
  { key:'qos25',  label:'S1: QOS=25',  color:'#f59e0b', scenario:'S1', msgs:1000, qos:25, elapsed:115.81, uploadElapsed:115.8,  uploadErrors:13, throughput:'8.6 msg/s' },
  { key:'qos50',  label:'S1: QOS=50',  color:'#ef4444', scenario:'S1', msgs:1000, qos:50, elapsed:127.89, uploadElapsed:117.86, uploadErrors:17, throughput:'7.8 msg/s' },
  { key:'s2_dlq', label:'S2: DLQ',     color:'#a855f7', scenario:'S2', msgs:1000, qos:10, elapsed:446.89, uploadElapsed:86.09,  uploadErrors:0,  throughput:'2.2 msg/s' },
  { key:'s3_mix', label:'S3: Retry Mix',color:'#14b8a6', scenario:'S3', msgs:1000, qos:10, elapsed:347.77, uploadElapsed:87.08,  uploadErrors:0,  throughput:'2.9 msg/s' },
  { key:'s4_429', label:'S4: 429',      color:'#f97316', scenario:'S4', msgs:20,   qos:5,  elapsed:560.39, uploadElapsed:24.09,  uploadErrors:0,  throughput:'0.04 msg/s' },
]

// ── QOS Ladder drain curves (2026-03-25, same infra) ─────────────────────
const DRAIN_DATA = {
  // Start at origin (0,0); first rise occurs after t>0
  qos2:  [[0,0],[15,547],[30,945],[45,930],[60,911],[75,887],[90,865],[105,849],[120,825],[135,801],[150,788],[165,776],[180,765],[195,756],[210,734],[225,710],[240,694],[255,671],[270,648],[285,624],[300,608],[315,584],[330,562],[345,539],[360,525],[375,505],[390,484],[405,462],[420,440],[435,416],[450,401],[465,378],[480,355],[495,333],[510,317],[525,293],[540,271],[555,249],[570,235],[585,212],[600,190],[615,166],[630,150],[645,126],[660,103],[675,87],[690,63],[705,40],[720,16],[735,0]],
  qos5:  [[0,0],[15,491],[30,870],[45,817],[60,768],[75,717],[90,659],[105,605],[120,549],[135,496],[150,460],[165,401],[180,341],[195,286],[210,229],[225,172],[240,138],[255,85],[270,30],[280,0]],
  qos10: [[0,0],[15,418],[30,710],[45,637],[60,534],[75,425],[90,316],[105,206],[120,95],[135,0]],
  qos25: [[0,0],[15,90],[20,30],[25,0]],
  qos50: [[0,0],[15,8],[30,0]],
}

// ── S1 QOS=5 processing vs processed (crossover-style; processed stays 0) ──
const QOS5_PROCESSING = DRAIN_DATA.qos5
const QOS5_PROCESSED  = DRAIN_DATA.qos5.map(([t, _]) => [t, 0])

// ── S1 QOS=10 processing vs processed (crossover chart) ──────────────────
const QOS10_PROCESSING = DRAIN_DATA.qos10
const QOS10_PROCESSED  = [[0,0],[10,0],[20,0],[30,0],[40,0],[50,0],[60,0],[70,0],[80,0],[90,0],[100,0],[110,0],[120,29],[130,69],[140,107],[150,147],[160,185],[170,223],[180,258],[190,262],[200,228],[210,193],[220,161],[230,127],[240,93],[250,59],[260,25],[270,0],[280,0],[290,0],[300,0]]

// ── S2 DLQ queue drain (from +1h offset window: 14:49:40 - 14:56:50) ─────
const S2_PROCESSING = [[0,0],[20,234],[30,638],[40,872],[50,1000],[60,971],[70,950],[80,921],[90,904],[100,875],[110,847],[120,817],[130,789],[140,761],[150,732],[160,704],[170,675],[180,663],[190,634],[200,605],[210,574],[220,543],[230,514],[240,481],[250,450],[260,422],[270,393],[280,364],[290,351],[300,323],[310,294],[320,265],[330,238],[340,209],[350,180],[360,151],[370,122],[380,93],[390,79],[400,51],[410,24],[420,0]]
const S2_DLQ        = [[0,0],[20,0],[30,0],[40,0],[50,0],[60,29],[70,50],[80,79],[90,96],[100,125],[110,153],[120,183],[130,211],[140,239],[150,268],[160,296],[170,325],[180,337],[190,366],[200,395],[210,426],[220,457],[230,486],[240,519],[250,550],[260,578],[270,607],[280,636],[290,649],[300,677],[310,706],[320,735],[330,762],[340,791],[350,820],[360,849],[370,878],[380,907],[390,921],[400,949],[410,976],[420,1000]]

// ── S3 Retry Mix queues (processing + DLQ) ───────────────────────────────
const S3_PROCESSING = [[0,0],[10,220],[20,447],[30,688],[40,864],[50,833],[60,805],[70,766],[80,735],[90,706],[100,670],[110,637],[120,603],[130,568],[140,533],[150,499],[160,466],[170,434],[180,415],[190,380],[200,347],[210,316],[220,279],[230,245],[240,211],[250,179],[260,147],[270,117],[280,84],[290,50],[300,16],[310,0],[320,0]]
const S3_DLQ_QUEUE  = [[0,0],[10,11],[20,17],[30,34],[40,52],[50,62],[60,76],[70,91],[80,111],[90,127],[100,140],[110,155],[120,170],[130,188],[140,197],[150,216],[160,233],[170,244],[180,261],[190,275],[200,292],[210,311],[220,320],[230,336],[240,350],[250,367],[260,388],[270,398],[280,411],[290,426],[300,448],[310,460],[320,460]]

// ── S4 429 staircase data (20 msgs, 4 batches of 5, ~132s per batch) ─────
const S4_REMAINING = [[0,20],[131,20],[132,15],[262,15],[263,10],[393,10],[394,5],[524,5],[525,0],[560,0]]
const S4_DLQ       = [[0,0],[131,0],[132,5],[262,5],[263,10],[393,10],[394,15],[524,15],[525,20],[560,20]]

// ── S4 Retry Timeline ────────────────────────────────────────────────────
const S4_TIMELINE = [
  { id:'5bad183b', events:[{tSec:0,type:'start'},{tSec:2,type:'fail'},{tSec:67,type:'start'},{tSec:67,type:'fail'},{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:132,type:'exhausted'}] },
  { id:'eafc609d', events:[{tSec:0,type:'start'},{tSec:2,type:'fail'},{tSec:67,type:'start'},{tSec:67,type:'fail'},{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:132,type:'exhausted'}] },
  { id:'1ece39a3', events:[{tSec:0,type:'start'},{tSec:2,type:'fail'},{tSec:67,type:'start'},{tSec:67,type:'fail'},{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:132,type:'exhausted'}] },
  { id:'93caa142', events:[{tSec:0,type:'start'},{tSec:2,type:'fail'},{tSec:67,type:'start'},{tSec:67,type:'fail'},{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:132,type:'exhausted'}] },
  { id:'ebc39af4', events:[{tSec:0,type:'start'},{tSec:2,type:'fail'},{tSec:67,type:'start'},{tSec:67,type:'fail'},{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:132,type:'exhausted'}] },
  { id:'b960d530', events:[{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:198,type:'start'},{tSec:198,type:'fail'},{tSec:263,type:'start'},{tSec:263,type:'fail'},{tSec:263,type:'exhausted'}] },
  { id:'5507dcc8', events:[{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:198,type:'start'},{tSec:198,type:'fail'},{tSec:263,type:'start'},{tSec:263,type:'fail'},{tSec:263,type:'exhausted'}] },
  { id:'ff069cc9', events:[{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:198,type:'start'},{tSec:198,type:'fail'},{tSec:263,type:'start'},{tSec:263,type:'fail'},{tSec:263,type:'exhausted'}] },
  { id:'30cbed39', events:[{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:198,type:'start'},{tSec:198,type:'fail'},{tSec:263,type:'start'},{tSec:263,type:'fail'},{tSec:263,type:'exhausted'}] },
  { id:'af1f2fb4', events:[{tSec:132,type:'start'},{tSec:132,type:'fail'},{tSec:198,type:'start'},{tSec:198,type:'fail'},{tSec:263,type:'start'},{tSec:263,type:'fail'},{tSec:263,type:'exhausted'}] },
  { id:'86602452', events:[{tSec:263,type:'start'},{tSec:264,type:'fail'},{tSec:329,type:'start'},{tSec:329,type:'fail'},{tSec:394,type:'start'},{tSec:394,type:'fail'},{tSec:394,type:'exhausted'}] },
  { id:'ee738621', events:[{tSec:263,type:'start'},{tSec:264,type:'fail'},{tSec:329,type:'start'},{tSec:329,type:'fail'},{tSec:394,type:'start'},{tSec:394,type:'fail'},{tSec:394,type:'exhausted'}] },
  { id:'6475b5d9', events:[{tSec:263,type:'start'},{tSec:264,type:'fail'},{tSec:329,type:'start'},{tSec:329,type:'fail'},{tSec:394,type:'start'},{tSec:394,type:'fail'},{tSec:394,type:'exhausted'}] },
  { id:'aeff28d4', events:[{tSec:264,type:'start'},{tSec:264,type:'fail'},{tSec:329,type:'start'},{tSec:329,type:'fail'},{tSec:394,type:'start'},{tSec:394,type:'fail'},{tSec:394,type:'exhausted'}] },
  { id:'0f842500', events:[{tSec:264,type:'start'},{tSec:265,type:'fail'},{tSec:329,type:'start'},{tSec:330,type:'fail'},{tSec:394,type:'start'},{tSec:395,type:'fail'},{tSec:395,type:'exhausted'}] },
  { id:'d84f7f08', events:[{tSec:394,type:'start'},{tSec:395,type:'fail'},{tSec:459,type:'start'},{tSec:459,type:'fail'},{tSec:524,type:'start'},{tSec:524,type:'fail'},{tSec:524,type:'exhausted'}] },
  { id:'4c78313c', events:[{tSec:394,type:'start'},{tSec:395,type:'fail'},{tSec:459,type:'start'},{tSec:459,type:'fail'},{tSec:524,type:'start'},{tSec:524,type:'fail'},{tSec:524,type:'exhausted'}] },
  { id:'4d066c80', events:[{tSec:394,type:'start'},{tSec:395,type:'fail'},{tSec:459,type:'start'},{tSec:459,type:'fail'},{tSec:524,type:'start'},{tSec:524,type:'fail'},{tSec:524,type:'exhausted'}] },
  { id:'db3f7ab2', events:[{tSec:394,type:'start'},{tSec:395,type:'fail'},{tSec:459,type:'start'},{tSec:459,type:'fail'},{tSec:524,type:'start'},{tSec:524,type:'fail'},{tSec:524,type:'exhausted'}] },
  { id:'aec4f311', events:[{tSec:395,type:'start'},{tSec:395,type:'fail'},{tSec:460,type:'start'},{tSec:460,type:'fail'},{tSec:525,type:'start'},{tSec:525,type:'fail'},{tSec:525,type:'exhausted'}] },
]

// ── E2E and CPU data (2025-03-25, same infra) ────────────────────────────

// ── Retry rates (2025-03-25) ─────────────────────────────────────────────
const S2_RETRY_RATE = [[0,3.79],[15,5.92],[30,8.18],[45,8.56],[60,8.49],[75,8.33],[90,8.42],[105,8.56],[120,8.49],[135,8.45],[150,8.4],[165,8.51],[180,8.69],[195,8.93],[210,9.11],[225,9.16],[240,8.93],[255,8.65],[270,8.44],[285,8.45],[300,8.47],[315,8.4],[330,8.45],[345,8.47],[360,8.44],[375,8.38],[390,8.27],[405,5.53],[420,2.71],[435,0.04]]
const S2_DLQ_RATE   = [[0,0],[15,1.67],[30,2.42],[45,2.89],[60,2.78],[75,2.76],[90,2.84],[105,2.87],[120,2.78],[135,2.78],[150,2.84],[165,2.89],[180,2.89],[195,2.93],[210,3],[225,3.07],[240,2.98],[255,2.87],[270,2.82],[285,2.82],[300,2.84],[315,2.76],[330,2.82],[345,2.82],[360,2.84],[375,2.78],[390,2.84],[405,1.96],[420,1.02],[435,0.04]]
const S3_RETRY_RATE = [[0,2.76],[15,4.36],[30,5.74],[45,5.8],[60,5.89],[75,6.18],[90,6.31],[105,6.09],[120,5.91],[135,5.82],[150,6.04],[165,6.04],[180,6.13],[195,6.13],[210,6.16],[225,6.07],[240,6.13],[255,6.22],[270,6.22],[285,6.11],[300,4.49],[315,2.58],[330,0.47],[345,0]]
const S3_DLQ_RATE   = [[0,0],[15,0.78],[30,1.13],[45,1.42],[60,1.51],[75,1.56],[90,1.58],[105,1.51],[120,1.51],[135,1.44],[150,1.56],[165,1.58],[180,1.56],[195,1.51],[210,1.47],[225,1.44],[240,1.49],[255,1.58],[270,1.58],[285,1.56],[300,1.16],[315,0.76],[330,0.18],[345,0]]

// ── Generic SVG chart primitives ─────────────────────────────────────────

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

function ChartLegend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
      {items.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-2">
          <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Section / card helpers ───────────────────────────────────────────────

function Section({ id, title, children }) {
  return (
    <section id={id} className="mb-14">
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

// ── Table of Contents ────────────────────────────────────────────────────

function TableOfContents() {
  const items = [
    { id: 'session-overview', label: '1. Session Overview' },
    { id: 's1-qos-ladder', label: '2. S1 -- QOS Ladder' },
    { id: 's2-dlq', label: '3. S2 -- DLQ Validation' },
    { id: 's3-retry-mix', label: '4. S3 -- Retry Mix' },
    { id: 's4-429', label: '5. S4 -- 429 Rate Limit Backoff' },
    { id: 'cross-scenario', label: '6. Cross-Scenario Summary' },
    { id: 'test-environment', label: '7. Test Environment' },
  ]
  return (
    <nav className="border border-gray-100 dark:border-gray-800 rounded-xl p-5 mb-12">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Contents</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {items.map(({ id, label }) => (
          <a key={id} href={`#${id}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}

// ── Session Timeline Bar ─────────────────────────────────────────────────

function SessionTimeline({ dark }) {
  const totalElapsed = RUNS_META.reduce((sum, r) => sum + r.elapsed, 0)
  const textColor = dark ? '#94a3b8' : '#64748b'
  const barH = 32
  const svgW = 760
  const svgH = 60

  let x = 0
  const bars = RUNS_META.map(r => {
    const w = Math.max(8, (r.elapsed / totalElapsed) * svgW)
    const bar = { ...r, x, w }
    x += w
    return bar
  })

  return (
    <div className="w-full overflow-x-auto mt-6">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 360 }}>
        {bars.map(b => (
          <g key={b.key}>
            <rect x={b.x} y={4} width={b.w} height={barH} rx={3} fill={b.color} opacity={0.85} />
            {b.w > 40 && (
              <text x={b.x + b.w / 2} y={24} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="600">
                {b.label}
              </text>
            )}
            <text x={b.x + b.w / 2} y={barH + 16} textAnchor="middle" fontSize="8" fill={textColor}>
              {Math.round(b.elapsed)}s
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Throughput Bar Chart ─────────────────────────────────────────────────

function ThroughputChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const s1Runs = RUNS_META.filter(r => r.scenario === 'S1')
  const maxVal = 10
  const barW = 80
  const gap = 24
  const svgW = s1Runs.length * (barW + gap) + PAD.left + PAD.right
  const svgH = 200
  const plotH = svgH - 60
  const scaleY = (v) => 30 + plotH - (v / maxVal) * plotH

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 320 }}>
        {[0, 2, 4, 6, 8, 10].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={svgW - PAD.right} y1={scaleY(v)} y2={scaleY(v)} stroke={gridColor} strokeWidth="0.5" />
            <text x={PAD.left - 6} y={scaleY(v) + 4} textAnchor="end" fontSize="10" fill={textColor}>{v}</text>
          </g>
        ))}
        {s1Runs.map((r, i) => {
          const val = parseFloat(r.throughput)
          const x = PAD.left + i * (barW + gap) + gap / 2
          const y = scaleY(val)
          const h = scaleY(0) - y
          return (
            <g key={r.key}>
              <rect x={x} y={y} width={barW} height={h} rx={4} fill={r.color} opacity={0.85} />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={r.color}>
                {r.throughput}
              </text>
              <text x={x + barW / 2} y={scaleY(0) + 14} textAnchor="middle" fontSize="10" fill={textColor}>
                QOS={r.qos}
              </text>
            </g>
          )
        })}
        <text x={PAD.left - 42} y={30 + plotH / 2} textAnchor="middle" fontSize="11" fill={textColor}
          transform={`rotate(-90, ${PAD.left - 42}, ${30 + plotH / 2})`}>
          throughput (msg/s)
        </text>
      </svg>
    </div>
  )
}

// ── S4 Swim Lane Timeline ────────────────────────────────────────────────

function SwimLaneChart({ dark }) {
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const bgBand = dark ? '#1e293b' : '#f8fafc'
  const maxT = 560
  const rowH = 22
  const labelW = 80
  const plotLeft = labelW + 10
  const plotRight = 750
  const plotW = plotRight - plotLeft
  const topPad = 28
  const svgH = topPad + S4_TIMELINE.length * rowH + 30
  const svgW = 760

  const sx = (t) => plotLeft + (t / maxT) * plotW

  // Backoff interval lines at 65s intervals
  const backoffLines = []
  for (let t = 65; t <= maxT; t += 65) backoffLines.push(t)

  // Batch labels
  const batches = [
    { label: 'Batch 1', startIdx: 0, endIdx: 4 },
    { label: 'Batch 2', startIdx: 5, endIdx: 9 },
    { label: 'Batch 3', startIdx: 10, endIdx: 14 },
    { label: 'Batch 4', startIdx: 15, endIdx: 19 },
  ]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 500 }}>
        {/* X-axis labels */}
        {[0, 65, 130, 195, 260, 325, 390, 455, 520].map(t => (
          <text key={t} x={sx(t)} y={topPad - 10} textAnchor="middle" fontSize="9" fill={textColor}>
            {t}s
          </text>
        ))}

        {/* Backoff interval dashed lines */}
        {backoffLines.map(t => (
          <line key={`bl-${t}`} x1={sx(t)} x2={sx(t)} y1={topPad} y2={topPad + S4_TIMELINE.length * rowH}
            stroke={gridColor} strokeWidth="0.5" strokeDasharray="3 3" />
        ))}

        {/* Row backgrounds and labels */}
        {S4_TIMELINE.map((doc, i) => {
          const y = topPad + i * rowH
          const isBatch = batches.find(b => i === b.startIdx)
          return (
            <g key={doc.id}>
              {/* Alternating row bands */}
              {i % 2 === 0 && (
                <rect x={plotLeft} y={y} width={plotW} height={rowH} fill={bgBand} opacity={0.5} />
              )}
              {/* Batch separator lines */}
              {isBatch && i > 0 && (
                <line x1={labelW - 4} x2={plotRight} y1={y} y2={y}
                  stroke={dark ? '#475569' : '#cbd5e1'} strokeWidth="1" />
              )}
              {/* Doc ID label */}
              <text x={labelW} y={y + rowH / 2 + 3} textAnchor="end" fontSize="9" fontFamily="monospace" fill={textColor}>
                {doc.id}
              </text>
              {/* Event markers */}
              {doc.events.map((ev, j) => {
                const cx = sx(ev.tSec)
                const cy = y + rowH / 2
                if (ev.type === 'start') {
                  return <circle key={j} cx={cx} cy={cy} r={4} fill="#22c55e" />
                }
                if (ev.type === 'fail') {
                  return (
                    <g key={j}>
                      <line x1={cx - 3} x2={cx + 3} y1={cy - 3} y2={cy + 3} stroke="#ef4444" strokeWidth="2" />
                      <line x1={cx + 3} x2={cx - 3} y1={cy - 3} y2={cy + 3} stroke="#ef4444" strokeWidth="2" />
                    </g>
                  )
                }
                if (ev.type === 'exhausted') {
                  return (
                    <g key={j}>
                      <circle cx={cx} cy={cy} r={5} fill="none" stroke={dark ? '#e2e8f0' : '#1e293b'} strokeWidth="1.5" />
                      <line x1={cx - 2} x2={cx + 2} y1={cy - 1} y2={cy - 1} stroke={dark ? '#e2e8f0' : '#1e293b'} strokeWidth="1.5" />
                      <circle cx={cx - 1.5} cy={cy - 3} r={0.8} fill={dark ? '#e2e8f0' : '#1e293b'} />
                      <circle cx={cx + 1.5} cy={cy - 3} r={0.8} fill={dark ? '#e2e8f0' : '#1e293b'} />
                    </g>
                  )
                }
                return null
              })}
              {/* Connection lines between events */}
              {doc.events.length > 1 && (
                <line
                  x1={sx(doc.events[0].tSec)} x2={sx(doc.events[doc.events.length - 1].tSec)}
                  y1={y + rowH / 2} y2={y + rowH / 2}
                  stroke={textColor} strokeWidth="0.5" opacity={0.3}
                />
              )}
            </g>
          )
        })}

        {/* Batch labels on left side */}
        {batches.map(b => {
          const y1 = topPad + b.startIdx * rowH
          const y2 = topPad + (b.endIdx + 1) * rowH
          const midY = (y1 + y2) / 2
          return (
            <text key={b.label} x={8} y={midY + 3} fontSize="9" fontWeight="600" fill={textColor}>
              {b.label}
            </text>
          )
        })}

        {/* Legend */}
        {(() => {
          const ly = topPad + S4_TIMELINE.length * rowH + 12
          return (
            <g>
              <circle cx={plotLeft} cy={ly} r={4} fill="#22c55e" />
              <text x={plotLeft + 8} y={ly + 3} fontSize="9" fill={textColor}>start</text>
              <g transform={`translate(${plotLeft + 50}, ${ly})`}>
                <line x1={-3} x2={3} y1={-3} y2={3} stroke="#ef4444" strokeWidth="2" />
                <line x1={3} x2={-3} y1={-3} y2={3} stroke="#ef4444" strokeWidth="2" />
              </g>
              <text x={plotLeft + 58} y={ly + 3} fontSize="9" fill={textColor}>fail (429)</text>
              <circle cx={plotLeft + 120} cy={ly} r={5} fill="none" stroke={dark ? '#e2e8f0' : '#1e293b'} strokeWidth="1.5" />
              <text x={plotLeft + 130} y={ly + 3} fontSize="9" fill={textColor}>exhausted</text>
              <line x1={plotLeft + 200} x2={plotLeft + 220} y1={ly} y2={ly} stroke={gridColor} strokeWidth="0.5" strokeDasharray="3 3" />
              <text x={plotLeft + 226} y={ly + 3} fontSize="9" fill={textColor}>65s backoff interval</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LoadTestFullReport20260326() {
  const [dark] = useDarkMode()

  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#e2e8f0'
  const axisColor = dark ? '#475569' : '#cbd5e1'

  return (
    <InfoPageLayout title="Load Test Results">
      <div className="max-w-none">

        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Load Test Results
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-8">
          8 scenarios across 4 test categories, ~2.5 hours total runtime. All tests executed locally
          with Docker Compose: stub AI service, real RabbitMQ, real Supabase PostgreSQL (hosted), and
          Prometheus/Grafana observability.
        </p>

        <TableOfContents />

        {/* ── 1. Session Overview ──────────────────────────────────────────── */}
        <Section id="session-overview" title="1. Session Overview">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            All 8 runs were executed sequentially in a single session. The table below summarizes each
            run; the timeline bar below it shows relative duration.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Run', 'Scenario', 'QOS', 'Messages', 'Upload Errors', 'Total Elapsed', 'Throughput'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RUNS_META.map(r => (
                  <tr key={r.key} className="border-b border-gray-50 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="font-semibold text-gray-900 dark:text-white">{r.label}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.scenario}</td>
                    <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.qos}</td>
                    <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.msgs.toLocaleString()}</td>
                    <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.uploadErrors}</td>
                    <td className="py-3 pr-4 font-mono text-gray-700 dark:text-gray-300">{r.elapsed.toFixed(1)}s</td>
                    <td className="py-3 pr-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.throughput}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SessionTimeline dark={dark} />
        </Section>

        {/* ── 2. S1 -- QOS Ladder ──────────────────────────────────────────── */}
        <Section id="s1-qos-ladder" title="2. S1 -- QOS Ladder">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            Five sequential runs at QOS=2, 5, 10, 25, 50. Each run published 1000 documents through
            a 1-second-delay stub. The goal: find the throughput ceiling and identify the bottleneck.
          </p>

          {/* Queue Drain Curves */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Queue Drain Curves</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            Each line shows <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing</code> queue
            depth over time. Time is normalized to t=0 at upload start.
          </p>
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
              <ChartGrid
                yTicks={[0, 200, 400, 600, 800, 1000]}
                xTicks={[0, 150, 300, 450, 600, 750]}
                scaleX={makeScaleX(750)} scaleY={makeScaleY(1000)}
                axisColor={axisColor} gridColor={gridColor}
              />
              {[
                { key: 'qos2',  color: '#6366f1', data: DRAIN_DATA.qos2 },
                { key: 'qos5',  color: '#3b82f6', data: DRAIN_DATA.qos5 },
                { key: 'qos10', color: '#22c55e', data: DRAIN_DATA.qos10 },
                { key: 'qos25', color: '#f59e0b', data: DRAIN_DATA.qos25 },
                { key: 'qos50', color: '#ef4444', data: DRAIN_DATA.qos50 },
              ].map(r => (
                <ChartPolyline key={r.key} data={r.data} scaleX={makeScaleX(750)} scaleY={makeScaleY(1000)} color={r.color} />
              ))}
              <ChartLabels
                yTicks={[0, 200, 400, 600, 800, 1000]}
                xTicks={[0, 150, 300, 450, 600, 750]}
                scaleX={makeScaleX(750)} scaleY={makeScaleY(1000)}
                yLabel="messages in queue" xLabel="seconds from upload start"
                textColor={textColor}
              />
            </svg>
            <ChartLegend items={[
              { color: '#6366f1', label: 'QOS=2 (~12 min drain)' },
              { color: '#3b82f6', label: 'QOS=5 (~5 min)' },
              { color: '#22c55e', label: 'QOS=10 (~2 min)' },
              { color: '#f59e0b', label: 'QOS=25 (~25s)' },
              { color: '#ef4444', label: 'QOS=50 (<10s)' },
            ]} />
          </div>

          {/* Processing vs Processed Handoff (side-by-side comparison by QOS) */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Processing vs Processed Handoff</h3>

          {/* QOS=5 */}
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">QOS=5</p>
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
              <ChartGrid
                yTicks={[0, 150, 300, 450, 600, 750, 900]}
                xTicks={[0, 60, 120, 180, 240, 300]}
                scaleX={makeScaleX(300)} scaleY={makeScaleY(900)}
                axisColor={axisColor} gridColor={gridColor}
              />
              <ChartPolyline data={QOS5_PROCESSING} scaleX={makeScaleX(300)} scaleY={makeScaleY(900)} color="#22c55e" />
              <ChartPolyline data={QOS5_PROCESSED}  scaleX={makeScaleX(300)} scaleY={makeScaleY(900)} color="#3b82f6" />
              <ChartLabels
                yTicks={[0, 150, 300, 450, 600, 750, 900]}
                xTicks={[0, 60, 120, 180, 240, 300]}
                scaleX={makeScaleX(300)} scaleY={makeScaleY(900)}
                yLabel="messages in queue" xLabel="seconds from run start"
                formatY={(v) => String(v)} formatX={(t) => `${t}s`}
                textColor={textColor}
              />
            </svg>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
              {[
                { color: '#22c55e', label: 'document.processing (worker input)' },
                { color: '#3b82f6', label: 'document.processed (backend input, 0)' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* QOS=10 */}
          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-8 mb-2">QOS=10</p>
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
              <ChartGrid
                yTicks={[0, 150, 300, 450, 600, 750]}
                xTicks={[0, 60, 120, 180, 240, 300]}
                scaleX={makeScaleX(300)} scaleY={makeScaleY(750)}
                axisColor={axisColor} gridColor={gridColor}
              />
              <ChartPolyline data={QOS10_PROCESSING} scaleX={makeScaleX(300)} scaleY={makeScaleY(750)} color="#22c55e" />
              <ChartPolyline data={QOS10_PROCESSED} scaleX={makeScaleX(300)} scaleY={makeScaleY(750)} color="#3b82f6" />
              <ChartLabels
                yTicks={[0, 150, 300, 450, 600, 750]}
                xTicks={[0, 60, 120, 180, 240, 300]}
                scaleX={makeScaleX(300)} scaleY={makeScaleY(750)}
                yLabel="messages in queue" xLabel="seconds from run start"
                formatY={(v) => String(v)} formatX={(t) => `${t}s`}
                textColor={textColor}
              />
            </svg>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
              {[
                { color: '#22c55e', label: 'document.processing (worker input)' },
                { color: '#3b82f6', label: 'document.processed (backend input, peak 262)' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Explanation for both */}
          <p className="text-gray-600 dark:text-gray-400 mt-4 mb-4 text-sm leading-relaxed">
            At QOS=5, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processed</code> stays at 0 —
            the backend keeps up with the worker’s output, so only the
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> document.processing</code> queue shows a drain curve.
            At QOS=10, the worker drains <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing</code>
            fast enough that the backend becomes the visible bottleneck, and
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> document.processed</code> briefly accumulates (peak ≈262)
            before draining.
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            <span className="font-semibold text-gray-900 dark:text-white">Production fix:</span> increase
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> @RabbitListener</code> consumer concurrency from 1 to 5–10
            to match backend write throughput to worker output rate. The existing
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> SELECT FOR UPDATE</code> idempotency guard already
            handles concurrent consumers safely.
          </p>

          {/* E2E Duration — stacked bar */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">End-to-End Duration Breakdown</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            Average time from document upload to result saved in the database, decomposed into three phases:
            worker queue wait (time in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing</code>),
            processing time (~13s constant), and processed queue wait (time
            in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processed</code> waiting for the single
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> @RabbitListener</code> to pick up and write). At low QOS the
            bottleneck is upstream (worker queue). At high QOS it shifts downstream (backend consumer concurrency on
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono"> document.processed</code>). QOS=10 and 25 converge near ~65s but
            for entirely different reasons. QOS=50 is actually worse (77s) due to Supabase connection contention at high
            concurrency.
          </p>
          {(() => {
            const e2eBars = [
              { label: 'QOS=2',  color: '#6366f1', workerWait: 327, processing: 13, backendWait: 0,  total: 340 },
              { label: 'QOS=5',  color: '#3b82f6', workerWait: 132, processing: 13, backendWait: 0,  total: 145 },
              { label: 'QOS=10', color: '#22c55e', workerWait: 36,  processing: 13, backendWait: 18, total: 67 },
              { label: 'QOS=25', color: '#f59e0b', workerWait: 5,   processing: 13, backendWait: 47, total: 65 },
              { label: 'QOS=50', color: '#ef4444', workerWait: 1,   processing: 13, backendWait: 63, total: 77 },
            ]
            const maxVal = 400
            const barW = 100
            const gap = 24
            const chartLeft = PAD.left + 10
            const svgW = e2eBars.length * (barW + gap) + chartLeft + PAD.right
            const svgH = 300
            const plotTop = 30
            const plotH = svgH - 80
            const sY = (v) => plotTop + plotH - (v / maxVal) * plotH

            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 400 }}>
                  {[0, 100, 200, 300, 400].map(v => (
                    <g key={v}>
                      <line x1={chartLeft} x2={svgW - PAD.right} y1={sY(v)} y2={sY(v)} stroke={gridColor} strokeWidth="0.5" />
                      <text x={chartLeft - 6} y={sY(v) + 4} textAnchor="end" fontSize="10" fill={textColor}>
                        {v >= 60 ? `${Math.round(v / 60)}m` : `${v}s`}
                      </text>
                    </g>
                  ))}
                  {e2eBars.map((b, i) => {
                    const x = chartLeft + i * (barW + gap) + gap / 2
                    // Three stacked segments, bottom to top: backendWait, processing, workerWait
                    const bwH = (b.backendWait / maxVal) * plotH
                    const prH = (b.processing / maxVal) * plotH
                    const wwH = (b.workerWait / maxVal) * plotH

                    // Y positions (stacking from bottom)
                    const bwY = sY(b.backendWait)
                    const prY = sY(b.backendWait + b.processing)
                    const wwY = sY(b.total)

                    return (
                      <g key={b.label}>
                        {/* Backend wait segment (bottom — orange-tinted) */}
                        {b.backendWait > 0 && (
                          <rect x={x} y={bwY} width={barW} height={bwH}
                            rx={4} fill="#f97316" opacity={0.4} />
                        )}
                        {/* Processing segment (middle — solid color) */}
                        <rect x={x} y={prY} width={barW} height={prH}
                          fill={b.color} opacity={0.85} />
                        {/* Worker wait segment (top — light color) */}
                        {b.workerWait > 0 && (
                          <rect x={x} y={wwY} width={barW} height={wwH}
                            rx={4} fill={b.color} opacity={0.3} />
                        )}
                        {/* Total label above bar */}
                        <text x={x + barW / 2} y={wwY - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill={b.color}>
                          {b.total >= 60 ? `${Math.floor(b.total / 60)}m ${b.total % 60}s` : `${b.total}s`}
                        </text>
                        {/* QOS label below */}
                        <text x={x + barW / 2} y={sY(0) + 14} textAnchor="middle" fontSize="10" fill={textColor}>
                          {b.label}
                        </text>
                        {/* Worker wait label inside segment if tall enough */}
                        {wwH > 18 && (
                          <text x={x + barW / 2} y={wwY + wwH / 2 + 4} textAnchor="middle" fontSize="8" fill={dark ? '#e2e8f0' : '#ffffff'} fontWeight="600">
                            {Math.round(b.workerWait / b.total * 100)}% worker wait
                          </text>
                        )}
                        {/* Backend wait label inside segment if tall enough */}
                        {bwH > 18 && (
                          <text x={x + barW / 2} y={bwY + bwH / 2 + 4} textAnchor="middle" fontSize="8" fill={dark ? '#e2e8f0' : '#374151'} fontWeight="600">
                            {Math.round(b.backendWait / b.total * 100)}% backend wait
                          </text>
                        )}
                      </g>
                    )
                  })}
                  <text x={chartLeft - 44} y={plotTop + plotH / 2} textAnchor="middle" fontSize="11" fill={textColor}
                    transform={`rotate(-90, ${chartLeft - 44}, ${plotTop + plotH / 2})`}>
                    avg e2e duration
                  </text>
                </svg>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: '#6366f1', opacity: 0.3 }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Worker consumer wait (upstream bottleneck, processing queue)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: '#6366f1', opacity: 0.85 }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Processing time (~13s constant)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: '#f97316', opacity: 0.4 }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Backend consumer wait (downstream bottleneck, processed queue)</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Throughput comparison */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Throughput by QOS Level</h3>
          <ThroughputChart dark={dark} />

          {/* Key Findings */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Key Findings</h3>
          <div className="space-y-4">
            <FindingCard number={1} title="Throughput ceiling reached at QOS=25 (8.6 msg/s), no improvement at QOS=50">
              QOS=50 actually measured 7.8 msg/s -- slightly lower than QOS=25. Beyond QOS=10 the
              bottleneck shifts to the Supabase PostgreSQL write path. Additional worker concurrency
              cannot overcome this ceiling.
            </FindingCard>
            <FindingCard number={2} title="At QOS>=10, system is upload-bound (upload_elapsed = total_elapsed)">
              At QOS=10, upload_elapsed (188.14s) equals total_elapsed (188.14s). The worker drains
              the queue as fast as the upload script can fill it. No post-upload drain phase exists.
            </FindingCard>
            <FindingCard number={3} title="Upload errors increase with QOS (0 to 17), indicating Supabase contention">
              QOS=2 and QOS=10 had zero upload errors. QOS=25 had 13, QOS=50 had 17. The upload
              script and the worker compete for Supabase connections at high concurrency.
            </FindingCard>
            <FindingCard number={4} title="Worker CPU stayed below 2.2% -- expected with stub AI service">
              The stub returns immediately without computation, so CPU usage reflects only
              serialization and network I/O overhead. In production, PDF text extraction (PDFBox)
              and real LLM inference would significantly increase CPU load.
            </FindingCard>
          </div>
        </Section>

        {/* ── 3. S2 -- DLQ Validation ──────────────────────────────────────── */}
        <Section id="s2-dlq" title="3. S2 -- DLQ Validation">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            1000 messages with 100% failure rate, 0-second stub delay, QOS=10. Every message
            exhausts 3 retry attempts and routes to the dead-letter queue.
          </p>

          {/* Queue Drain — processing vs DLQ */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Processing vs DLQ</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            As messages exhaust their 3 retry attempts, they drain
            from <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing</code> and
            accumulate in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processing.dlq</code>.
            The two curves are near-perfect inverses — every message that leaves processing enters the DLQ.
          </p>
          {(() => {
            const sX = makeScaleX(450)
            const sY = makeScaleY(1000)
            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
                  <ChartGrid
                    yTicks={[0, 200, 400, 600, 800, 1000]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360, 420]}
                    scaleX={sX} scaleY={sY} axisColor={axisColor} gridColor={gridColor}
                  />
                  <ChartPolyline data={S2_PROCESSING} scaleX={sX} scaleY={sY} color="#a855f7" />
                  <ChartPolyline data={S2_DLQ} scaleX={sX} scaleY={sY} color="#ef4444" />
                  <ChartLabels
                    yTicks={[0, 200, 400, 600, 800, 1000]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360, 420]}
                    scaleX={sX} scaleY={sY}
                    yLabel="messages" xLabel="seconds from run start"
                    formatX={(t) => `${t}s`}
                    textColor={textColor}
                  />
                </svg>
                <ChartLegend items={[
                  { color: '#a855f7', label: 'document.processing (draining)' },
                  { color: '#ef4444', label: 'document.processing.dlq (accumulating to 1000)' },
                ]} />
              </div>
            )
          })()}

          {/* Retry Rate */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Retry Rate vs DLQ Routed Rate</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            The retry rate (~8.5/s) measures messages being re-delivered for another attempt.
            The DLQ routed rate (~2.8/s) measures messages exhausting all 3 attempts. The ratio
            is approximately 3:1 — each DLQ entry consumes 3 retry events (1 initial + 2 retries).
          </p>
          {(() => {
            const sX = makeScaleX(450)
            const sY = makeScaleY(10)
            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
                  <ChartGrid
                    yTicks={[0, 2, 4, 6, 8, 10]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360, 420]}
                    scaleX={sX} scaleY={sY} axisColor={axisColor} gridColor={gridColor}
                  />
                  <ChartPolyline data={S2_RETRY_RATE} scaleX={sX} scaleY={sY} color="#a855f7" strokeWidth={2.5} />
                  <ChartPolyline data={S2_DLQ_RATE} scaleX={sX} scaleY={sY} color="#ef4444" strokeWidth={2} />
                  <ChartLabels
                    yTicks={[0, 2, 4, 6, 8, 10]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360, 420]}
                    scaleX={sX} scaleY={sY}
                    yLabel="events / second" xLabel="seconds from run start"
                    formatX={(t) => `${t}s`}
                    textColor={textColor}
                  />
                </svg>
                <ChartLegend items={[
                  { color: '#a855f7', label: 'Retry rate (~8.5/s sustained)' },
                  { color: '#ef4444', label: 'DLQ routed rate (~2.8/s — retries / 3)' },
                ]} />
              </div>
            )
          })()}

          {/* Key Findings */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Key Findings</h3>
          <div className="space-y-4">
            <FindingCard number={1} title="All 1000 messages processed through retry cycle (3 attempts each)">
              Every message attempted processing 3 times before being routed to the DLQ. The retry
              mechanism correctly exhausted all attempts before giving up.
            </FindingCard>
            <FindingCard number={2} title="Total time: 446.89s (~7.4 min) -- retry backoff adds significant overhead">
              Compared to the QOS=10 happy path (188s), 100% failure with retry backoff (1s, 2s) more
              than doubled the total processing time despite 0-second stub delay.
            </FindingCard>
            <FindingCard number={3} title="Steady drain rate: ~16 msg/10s = 1.6 msg/s (vs 5.3 msg/s at QOS=10)">
              The linear drain slope confirms consistent retry behavior. Each message spends ~3s in
              retry backoff (1s + 2s) before being nacked and re-queued.
            </FindingCard>
            <FindingCard number={4} title="CPU remained below 5% throughout -- stub test limitation">
              Peak was 4.72% at the end when the last batch published FAILED results simultaneously.
              With the stub AI service, CPU data reflects local machine capacity rather than
              production-representative load.
            </FindingCard>
          </div>
        </Section>

        {/* ── 4. S3 -- Retry Mix ───────────────────────────────────────────── */}
        <Section id="s3-retry-mix" title="4. S3 -- Retry Mix">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            1000 messages with 40% per-call failure rate, 1-second stub delay, QOS=10. A mix of
            successful and failed documents with probabilistic retry behavior.
          </p>

          {/* Queue Drain — processing vs DLQ */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Processing vs DLQ</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            Unlike S2 where all messages end in the DLQ, here the gap between the two curves
            represents the ~540 messages that succeeded and exited
            through <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">document.processed</code> (consumed
            instantly by the backend, so never visible as queue depth).
          </p>
          {(() => {
            const sX = makeScaleX(330)
            const sY = makeScaleY(1000)
            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
                  <ChartGrid
                    yTicks={[0, 200, 400, 600, 800, 1000]}
                    xTicks={[0, 60, 120, 180, 240, 300]}
                    scaleX={sX} scaleY={sY} axisColor={axisColor} gridColor={gridColor}
                  />
                  <ChartPolyline data={S3_PROCESSING} scaleX={sX} scaleY={sY} color="#14b8a6" />
                  <ChartPolyline data={S3_DLQ_QUEUE} scaleX={sX} scaleY={sY} color="#ef4444" />
                  <ChartLabels
                    yTicks={[0, 200, 400, 600, 800, 1000]}
                    xTicks={[0, 60, 120, 180, 240, 300]}
                    scaleX={sX} scaleY={sY}
                    yLabel="messages" xLabel="seconds from run start"
                    formatX={(t) => `${t}s`}
                    textColor={textColor}
                  />
                </svg>
                <ChartLegend items={[
                  { color: '#14b8a6', label: 'document.processing (draining)' },
                  { color: '#ef4444', label: 'document.processing.dlq (accumulating to ~460)' },
                ]} />
              </div>
            )
          })()}

          {/* Retry Rate */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Retry Rate vs DLQ Routed Rate</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            With 40% per-call failure, retry rate (~6.1/s) is lower than S2 because successful messages
            exit without retrying. DLQ rate (~1.5/s) is roughly half of S2 — only the probabilistically
            unlucky messages exhaust all attempts.
          </p>
          {(() => {
            const sX = makeScaleX(360)
            const sY = makeScaleY(8)
            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
                  <ChartGrid
                    yTicks={[0, 2, 4, 6, 8]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360]}
                    scaleX={sX} scaleY={sY} axisColor={axisColor} gridColor={gridColor}
                  />
                  <ChartPolyline data={S3_RETRY_RATE} scaleX={sX} scaleY={sY} color="#14b8a6" strokeWidth={2.5} />
                  <ChartPolyline data={S3_DLQ_RATE} scaleX={sX} scaleY={sY} color="#ef4444" strokeWidth={2} />
                  <ChartLabels
                    yTicks={[0, 2, 4, 6, 8]}
                    xTicks={[0, 60, 120, 180, 240, 300, 360]}
                    scaleX={sX} scaleY={sY}
                    yLabel="events / second" xLabel="seconds from run start"
                    formatX={(t) => `${t}s`}
                    textColor={textColor}
                  />
                </svg>
                <ChartLegend items={[
                  { color: '#14b8a6', label: 'Retry rate (~6.1/s)' },
                  { color: '#ef4444', label: 'DLQ routed rate (~1.5/s)' },
                ]} />
              </div>
            )
          })()}

          {/* Key Findings */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Key Findings</h3>
          <div className="space-y-4">
            <FindingCard number={1} title="Total time: 347.77s (~5.8 min)">
              Faster than S2 (446.89s) because successful messages exit on first attempt without
              consuming retry slots.
            </FindingCard>
            <FindingCard number={2} title="Expected ~600 DONE / ~400 DLQ based on probabilistic failure">
              With 40% per-call failure and 3 concurrent AI calls, per-message success rate is
              0.6 cubed = 21.6%. Over 3 retry attempts, DLQ probability is 0.784 cubed = 48.2%.
            </FindingCard>
            <FindingCard number={3} title="Queue saturates at ~870 (upload rate > processing rate)">
              The queue reaches a plateau at ~870 messages and holds steady. Upload completes faster
              than the worker can drain due to retry overhead.
            </FindingCard>
            <FindingCard number={4} title="40% failure adds ~85% overhead vs pure success (347s vs 188s at QOS=10)">
              The overhead comes from retry backoff delays. Each failed attempt adds 1-2 seconds of
              backoff before the next attempt, significantly extending per-message processing time.
            </FindingCard>
          </div>
        </Section>

        {/* ── 5. S4 -- 429 Rate Limit Backoff ─────────────────────────────── */}
        <Section id="s4-429" title="5. S4 -- 429 Rate Limit Backoff (Full Deep Dive)">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            20 messages with 100% 429 rate-limit responses, QOS=5. This scenario validates the
            65-second fixed backoff implementation for rate-limited requests.
          </p>

          {/* Queue Depth — inverted staircases */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Pipeline Drain — Inverted Staircases</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            With QOS=5, the worker holds exactly 5 messages at a time. Each batch exhausts all 3
            attempts (~132s per batch), then the next 5 messages enter. The remaining-in-pipeline
            count steps down in increments of 5 while the DLQ steps up — perfect inverse staircases
            crossing at t=263s (halfway through 20 messages).
          </p>
          {(() => {
            const sX = makeScaleX(560)
            const sY = makeScaleY(20)
            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ minWidth: 320 }}>
                  <ChartGrid
                    yTicks={[0, 5, 10, 15, 20]}
                    xTicks={[0, 132, 263, 394, 525]}
                    scaleX={sX} scaleY={sY} axisColor={axisColor} gridColor={gridColor}
                  />
                  <ChartPolyline data={S4_REMAINING} scaleX={sX} scaleY={sY} color="#f97316" strokeWidth={2.5} />
                  <ChartPolyline data={S4_DLQ} scaleX={sX} scaleY={sY} color="#ef4444" strokeWidth={2.5} />
                  {/* Batch labels */}
                  {[
                    { x: 66, label: 'Batch 1' },
                    { x: 197, label: 'Batch 2' },
                    { x: 328, label: 'Batch 3' },
                    { x: 459, label: 'Batch 4' },
                  ].map(b => (
                    <text key={b.label} x={sX(b.x)} y={sY(10) + 4} textAnchor="middle" fontSize="9" fill={textColor} opacity={0.6}>
                      {b.label}
                    </text>
                  ))}
                  <ChartLabels
                    yTicks={[0, 5, 10, 15, 20]}
                    xTicks={[0, 132, 263, 394, 525]}
                    scaleX={sX} scaleY={sY}
                    yLabel="messages" xLabel="seconds from run start"
                    formatX={(t) => `${t}s`}
                    textColor={textColor}
                  />
                </svg>
                <ChartLegend items={[
                  { color: '#f97316', label: 'Remaining in pipeline (processing + queued)' },
                  { color: '#ef4444', label: 'Routed to DLQ (exhausted all retries)' },
                ]} />
              </div>
            )
          })()}

          {/* Swim Lane Timeline */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Per-Message Retry Timeline</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
            Each row is one document. Green circles indicate processing start, red X marks indicate
            429 failure, and the circle marks indicate retry exhaustion. Vertical dashed lines mark
            65-second backoff intervals. Documents are processed in batches of 5 (matching QOS=5
            prefetch).
          </p>
          <SwimLaneChart dark={dark} />

          {/* Log Excerpt */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Log Excerpt -- Representative Document</h3>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-5 overflow-x-auto">
            <pre className="font-mono text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre">
{`Document 5bad183b:
14:10:45.904  Starting document processing
14:10:47.970  FAIL -- 429 (rate limit) for /ai/flashcards
14:11:53.111  RETRY 1 -- FAIL -- 429 (rate limit) for /ai/flashcards  [+65.1s]
14:12:58.281  RETRY 2 -- FAIL -- 429 (rate limit) for /ai/summarize   [+65.2s]
14:12:58.284  All retries exhausted -> FAILED (RATE_LIMIT_EXCEEDED)`}
            </pre>
          </div>

          {/* Key Findings */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Key Findings</h3>
          <div className="space-y-4">
            <FindingCard number={1} title="Retry interval is consistently 65s (+/-1s) -- validates backoff implementation">
              The worker logs show 65.1s and 65.2s between retry attempts. This matches the
              configured 65-second fixed backoff for 429 rate-limit responses, distinct from the
              1-2 second exponential backoff used for standard failures.
            </FindingCard>
            <FindingCard number={2} title="20 messages processed in 4 batches of 5 (matching QOS=5 prefetch)">
              The QOS=5 prefetch count means the worker holds exactly 5 messages at a time. Each
              batch starts when the previous batch exhausts all retries and releases its prefetch
              slots.
            </FindingCard>
            <FindingCard number={3} title="Total time: 560.39s (~9.3 min) for 20 messages">
              Theoretical minimum: 65s x 2 retries x 4 batches = ~520s. The measured 560s is
              within 8% of the theoretical floor, with the difference accounted for by initial
              processing time and inter-batch scheduling.
            </FindingCard>
            <FindingCard number={4} title="Each batch: attempt at t, retry at t+65s, retry at t+130s, then exhausted">
              The swim-lane chart clearly shows the three-attempt pattern. Each document gets
              exactly 3 chances (initial + 2 retries) before being marked FAILED with the
              RATE_LIMIT_EXCEEDED error code.
            </FindingCard>
            <FindingCard number={5} title="All 20 documents ended with FAILED (RATE_LIMIT_EXCEEDED)">
              Zero messages succeeded. The error code propagated correctly through the entire
              pipeline from the AI service 429 response through the worker retry logic to the
              final status stored in the database.
            </FindingCard>
          </div>
        </Section>

        {/* ── 6. Cross-Scenario Summary ────────────────────────────────────── */}
        <Section id="cross-scenario" title="6. Cross-Scenario Summary">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            Throughput comparison across all 8 runs. S4 is excluded from the bar chart due to its
            fundamentally different scale (20 messages with 65-second backoff delays).
          </p>

          {/* Cross-scenario throughput comparison */}
          {(() => {
            const runs = RUNS_META.filter(r => r.key !== 's4_429')
            const maxVal = 10
            const barW = 70
            const gap = 16
            const chartLeft = PAD.left
            const svgW = runs.length * (barW + gap) + chartLeft + PAD.right
            const svgH = 200
            const plotH = svgH - 60
            const sY = (v) => 30 + plotH - (v / maxVal) * plotH

            return (
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 360 }}>
                  {[0, 2, 4, 6, 8, 10].map(v => (
                    <g key={v}>
                      <line x1={chartLeft} x2={svgW - PAD.right} y1={sY(v)} y2={sY(v)} stroke={gridColor} strokeWidth="0.5" />
                      <text x={chartLeft - 6} y={sY(v) + 4} textAnchor="end" fontSize="10" fill={textColor}>{v}</text>
                    </g>
                  ))}
                  {runs.map((r, i) => {
                    const val = parseFloat(r.throughput)
                    const x = chartLeft + i * (barW + gap) + gap / 2
                    const y = sY(val)
                    const h = sY(0) - y
                    return (
                      <g key={r.key}>
                        <rect x={x} y={y} width={barW} height={h} rx={4} fill={r.color} opacity={0.85} />
                        <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill={r.color}>
                          {r.throughput}
                        </text>
                        <text x={x + barW / 2} y={sY(0) + 14} textAnchor="middle" fontSize="9" fill={textColor}>
                          {r.label}
                        </text>
                      </g>
                    )
                  })}
                  <text x={chartLeft - 42} y={30 + plotH / 2} textAnchor="middle" fontSize="11" fill={textColor}
                    transform={`rotate(-90, ${chartLeft - 42}, ${30 + plotH / 2})`}>
                    throughput (msg/s)
                  </text>
                </svg>
              </div>
            )
          })()}

          <div className="mt-6 rounded-xl border border-gray-100 dark:border-gray-800 p-4 text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">
              <span className="font-semibold text-gray-900 dark:text-white">False data windows excluded from visualization:</span>
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono">
              <li>14:00 -- 14:06 (session warmup / initial configuration)</li>
              <li>14:19:30 -- 14:28 (inter-run gap)</li>
              <li>14:33:25 -- 14:43 (infrastructure restart)</li>
              <li>14:47:20 -- 14:49 (metric collection gap)</li>
            </ul>
          </div>
        </Section>

        {/* ── 7. Test Environment ──────────────────────────────────────────── */}
        <Section id="test-environment" title="7. Test Environment">
          <p className="text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
            All tests ran locally via Docker Compose with a stub AI service replacing
            the real OpenRouter LLM integration. Supabase PostgreSQL was the only hosted (production) dependency.
            Prometheus scraped RabbitMQ at 5-second intervals and Spring Boot actuators at 15-second intervals.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Backend', 'Spring Boot 3.x (Docker)'],
              ['Worker', 'Spring Boot 3.x (Docker)'],
              ['Database', 'Supabase PostgreSQL (free tier)'],
              ['Queue', 'RabbitMQ with Prometheus plugin'],
              ['Monitoring', 'Grafana + Prometheus'],
              ['AI Service', 'Stub (configurable delay/failure)'],
              ['Upload Workers', '10 concurrent'],
              ['Messages / run', '1000 (S1-S3), 20 (S4)'],
              ['Emergency Brake', 'Queue policy at 2000 messages'],
            ].map(([k, v]) => (
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
