import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  getSmoothStepPath,
  BaseEdge,
  EdgeLabelRenderer,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Link } from 'react-router-dom'
import useDarkMode from '../hooks/useDarkMode'

// ── Edge helpers ──────────────────────────────────────────────────────────────

const arrow = (color) => ({
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color,
})

const edgeLabelStyle = () => ({
  style:     { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '5 3' },
  markerEnd: arrow('#475569'),
  type:      'internalEdge',
})

/**
 * System-level edges: regenerated when dark mode changes so label bg matches theme.
 */
const makeSystemEdges = (dark) => [
  // Straight down: Frontend → Backend (same column)
  { id: 'fe-be',  source: 'frontend',  sourceHandle: 'bottom-s', target: 'backend',   targetHandle: 'top-t',    label: 'HTTPS · Bearer JWT',   ...edgeLabelStyle(), data: { tooltip: 'All API calls from the React frontend go to the Spring Boot backend over HTTPS; the Supabase JWT is attached as a Bearer token and validated by JwtAuthFilter on every request' } },
  // Frontend left-s → Supabase top-t: curves left and down
  { id: 'fe-sb',  source: 'frontend',  sourceHandle: 'left-s',   target: 'supabase',  targetHandle: 'top-t',    label: 'Google OAuth',          ...edgeLabelStyle(), data: { tooltip: 'Frontend initiates Supabase Google OAuth PKCE flow on sign-in; Supabase handles token exchange and returns a session JWT stored in localStorage' } },
  // Backend left-s → Supabase right-t: short horizontal
  { id: 'be-sb',  source: 'backend',   sourceHandle: 'left-s',   target: 'supabase',  targetHandle: 'right-t',  label: 'DB + Storage',          ...edgeLabelStyle(), data: { tooltip: 'Backend writes document metadata to Supabase PostgreSQL via Spring Data JPA, and uploads/downloads PDF files to Supabase Storage via its HTTP API' } },
  // Backend bottom-s → Redis top-t: straight down (same column)
  { id: 'be-rd',  source: 'backend',   sourceHandle: 'bottom-s', target: 'redis',     targetHandle: 'top-t',    label: 'Rate limit',            ...edgeLabelStyle(), data: { tooltip: 'Before each upload, Backend checks a Redis token bucket via Bucket4j: 10 uploads/hour per user enforced with an atomic Lua script — no race conditions' } },
  // document.processing: Backend right-s (upper 35%) → RabbitMQ left-t (upper 35%) — top horizontal
  { id: 'be-rmq', source: 'backend',   sourceHandle: 'right-s',  target: 'rabbitmq',  targetHandle: 'left-t',   label: 'document.processing',   ...edgeLabelStyle(), data: { tooltip: 'After saving a PENDING document row, Backend publishes the document ID to the document.processing direct exchange; Worker picks it up and starts PDF extraction' } },
  // consume results: RabbitMQ left-s (lower 65%) → Backend right-t (lower 65%) — bottom horizontal, parallel below document.processing
  { id: 'rmq-be', source: 'rabbitmq',  sourceHandle: 'left-s',   target: 'backend',   targetHandle: 'right-t',  label: 'consume results',       ...edgeLabelStyle(), data: { tooltip: 'Backend DocumentProcessedConsumer reads document.processed events from RabbitMQ and persists the AI results (summary, flashcards, quiz) to PostgreSQL; message ACKed only after DB write succeeds' } },
  // consume: label near RabbitMQ side
  { id: 'rmq-w', type: 'percentEdge', source: 'rabbitmq', sourceHandle: 'bottom-s', target: 'worker',   targetHandle: 'top-t',    style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '5 3' }, markerEnd: arrow('#475569'), data: { label: 'consume', labelPercent: 0.30, labelBg: dark ? '#1e293b' : '#f1f5f9', labelColor: dark ? '#94a3b8' : '#64748b', labelBorder: '#475569', tooltip: 'Worker subscribes to the document.processing queue via reactor-rabbitmq reactive consumer; each message carries a document ID that triggers the full PDF → AI pipeline' } },
  // document.processed: label near Worker side
  { id: 'w-rmq', type: 'percentEdge', source: 'worker',   sourceHandle: 'top-s',    target: 'rabbitmq', targetHandle: 'bottom-t', style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '5 3' }, markerEnd: arrow('#475569'), data: { label: 'document.processed', labelPercent: 0.30, labelBg: dark ? '#1e293b' : '#f1f5f9', labelColor: dark ? '#94a3b8' : '#64748b', labelBorder: '#475569', tooltip: 'After all three AI operations complete, Worker publishes summary, flashcards, and quiz JSON to the document.processed exchange; message is sent with publisher confirms before the original processing message is ACKed' } },
  // Straight down: Worker → AI Service (same column)
  { id: 'w-ai',   source: 'worker',    sourceHandle: 'bottom-s', target: 'aiservice', targetHandle: 'top-t',    label: 'HTTP · API key',        ...edgeLabelStyle(), data: { tooltip: 'Worker calls AI Service over HTTP for each of the three operations (summarize, flashcards, quiz); requests carry X-Internal-Api-Key and X-Correlation-Id headers' } },
  // AI Service left-s → Redis bottom-t: diagonal left and up
  { id: 'ai-rd',  source: 'aiservice', sourceHandle: 'left-s',   target: 'redis',     targetHandle: 'bottom-t', label: 'idempotency',           ...edgeLabelStyle(), data: { tooltip: 'AI Service uses Redis to cache LLM results keyed by (operation, document_id) with 24h TTL; a claim-then-cache pattern prevents duplicate Gemini calls on concurrent retries' } },
]

const mkInternalEdge = (id, source, target, label, _dark, opts = {}) => ({
  id, source, target, label,
  ...(opts.sourceHandle && { sourceHandle: opts.sourceHandle }),
  ...(opts.targetHandle && { targetHandle: opts.targetHandle }),
  type:      'internalEdge',
  markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#475569' },
  style:     { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '5 3' },
  data:      { tooltip: opts.tooltip ?? null },
})

// ── Service metadata ──────────────────────────────────────────────────────────

const SERVICE_META = {
  frontend:  { label: 'Frontend',    tech: 'React 19 · Vite · Tailwind',      color: '#3b82f6' },
  backend:   { label: 'Backend',     tech: 'Spring Boot · Java 21',            color: '#22c55e' },
  worker:    { label: 'Worker',      tech: 'Spring Boot · reactor-rabbitmq',   color: '#a855f7' },
  aiservice: { label: 'AI Service',  tech: 'FastAPI · LangChain · Python',     color: '#f59e0b' },
  rabbitmq:  { label: 'RabbitMQ',    tech: 'AMQP · Direct Exchange',           color: '#f97316' },
  redis:     { label: 'Redis',       tech: 'Cache · Rate Limit · Idempotency', color: '#818cf8' },
  supabase:  { label: 'Supabase',    tech: 'Auth · PostgreSQL · Storage',      color: '#22d3ee' },
}

// ── System-level nodes ────────────────────────────────────────────────────────
//
// Top-down layout:
//
//              [Frontend]
//                  |
//              [Backend]
//             /          \
//       [Supabase]     [RabbitMQ]
//           |               |
//        [Redis]         [Worker]
//                            |
//                        [AI Service]
//
// Redis also receives an edge from AI Service (idempotency),
// which crosses right→left at the bottom — unavoidable but manageable.

const mkServiceNode = (id, x, y) => ({
  id,
  type: 'service',
  position: { x, y },
  data: { ...SERVICE_META[id], id },
})

// Strict grid layout — 3 columns, 4 rows, node width=192px
//   col_L=50   col_C=372   col_R=694
//   row1=0     row2=230    row3=460    row4=690
//
//   Row 1:  —          Frontend(C)  —
//   Row 2:  Supabase   Backend(C)   RabbitMQ
//   Row 3:  —          Redis(C)     Worker
//   Row 4:  —          —            AI Service
//
// Equal gaps: Supabase.right(242)→Backend.left(372) = 130px
//             Backend.right(564)→RabbitMQ.left(694) = 130px  ← fits "document.processing" label
const SYSTEM_NODES = [
  mkServiceNode('frontend',   372,   0),   // col_C, row1
  mkServiceNode('supabase',    50, 230),   // col_L, row2
  mkServiceNode('backend',    372, 230),   // col_C, row2
  mkServiceNode('rabbitmq',   694, 230),   // col_R, row2
  mkServiceNode('redis',      372, 460),   // col_C, row3
  mkServiceNode('worker',     694, 460),   // col_R, row3
  mkServiceNode('aiservice',  694, 690),   // col_R, row4
]

// ── Service detail nodes ──────────────────────────────────────────────────────

const mkIn = (id, label, desc, x, y, color = '#64748b', drillable = false) => ({
  id,
  type: 'internal',
  position: { x, y },
  data: { label, desc, color, drillable },
})

// Edges per service — function so dark mode can be applied at drill-in time
//
// Handle routing follows the same principle as system-level edges:
//   right-s (top:35%) / left-t (top:35%)  → upper horizontal lane
//   left-s  (top:65%) / right-t (top:65%) → lower horizontal lane
// This prevents bidirectional edges on the same axis from overlapping.
const SERVICE_DETAIL_EDGES = {
  frontend: (dark) => [
    mkInternalEdge('e1', 'fe-router',  'fe-auth',    'login',            dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',  tooltip: 'Triggers Supabase Google OAuth PKCE flow on login button click' }),
    mkInternalEdge('e2', 'fe-router',  'fe-query',   'uses',             dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'TanStack Query manages all server state — documents list, detail, and AI results' }),
    mkInternalEdge('e3', 'fe-auth',    'fe-zustand', 'stores JWT',       dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'onAuthStateChange fires on sign-in; Zustand stores user object and JWT for global access' }),
    mkInternalEdge('e4', 'fe-query',   'fe-axios',   'triggers request', dark, { sourceHandle: 'bottom-s', targetHandle: 'left-t',  tooltip: 'useQuery / useMutation fires the Axios HTTP request; React Query handles caching and retry' }),
    mkInternalEdge('e5', 'fe-zustand', 'fe-axios',   'reads token',      dark, { sourceHandle: 'bottom-s', targetHandle: 'right-t', tooltip: 'Request interceptor calls getState() synchronously to attach Bearer JWT to every outgoing request' }),
    mkInternalEdge('e6', 'fe-zustand', 'fe-router',  'auth state',       dark, { sourceHandle: 'left-s',   targetHandle: 'right-t', tooltip: 'ProtectedRoute reads user + loading from Zustand; redirects to / if unauthenticated' }),
  ],
  backend: (dark) => [
    mkInternalEdge('e1', 'be-filter',   'be-ctrl',   'authenticated request', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'Request passes 4-filter chain; CorrelationIdFilter stamps MDC thread-local for all downstream log lines' }),
    mkInternalEdge('e2', 'be-ctrl',     'be-svc',    'delegates',             dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'Controller validates input, maps HTTP to domain, and delegates business logic to the appropriate Service method' }),
    mkInternalEdge('e3', 'be-svc',      'be-repo',   'DB access (JPA)',       dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'Service calls Spring Data JPA repositories; state transitions use guarded UPDATE WHERE status = :expected' }),
    mkInternalEdge('e4', 'be-svc',      'be-rate',   'rate check',            dark, { sourceHandle: 'left-s',   targetHandle: 'right-t',  tooltip: 'Before upload, DocumentService atomically checks and decrements the user\'s Redis token bucket via Bucket4j Lua script' }),
    mkInternalEdge('e5', 'be-svc',      'be-msg',    'publish on upload',     dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'After saving document row (status=PENDING), publishes message to document.processing exchange' }),
    mkInternalEdge('e6', 'be-msg',      'be-svc',    'save results',          dark, { sourceHandle: 'left-s',   targetHandle: 'right-t',  tooltip: 'DocumentProcessedConsumer acquires SELECT FOR UPDATE lock then calls Service to persist summary, flashcards, and quiz' }),
    mkInternalEdge('e7', 'be-recovery', 'be-msg',    'republish',             dark, { sourceHandle: 'top-s',    targetHandle: 'bottom-t', tooltip: 'Recovered documents re-published to document.processing; refreshed leaseUntil prevents immediate re-trigger' }),
    mkInternalEdge('e8', 'be-recovery', 'be-repo',   'query stale docs',      dark, { sourceHandle: 'left-s',   targetHandle: 'right-t',  tooltip: 'Queries IN_PROGRESS docs with expired lease and PENDING docs older than 15 min with no processingStartedAt' }),
  ],
  worker: (dark) => [
    mkInternalEdge('e1', 'w-status',   'w-consumer','confirms',        dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'sendWithPublishConfirms waits for RabbitMQ broker ack before consumer proceeds — guarantees IN_PROGRESS signal was received' }),
    mkInternalEdge('e2', 'w-consumer', 'w-retry',   'on error',        dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'retryWhen exponential backoff: 1s → 2s → 4s, max 3 attempts; on exhaustion sends NACK requeue=false to RabbitMQ' }),
    mkInternalEdge('e3', 'w-consumer', 'w-pdf',     'starts pipeline', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'flatMap triggers the full reactive pipeline for each message; concurrency limited to 2 in-flight at a time' }),
    mkInternalEdge('e4', 'w-pdf',      'w-ai',      'extracted text',  dark, { sourceHandle: 'bottom-s', targetHandle: 'left-t',   tooltip: 'PDFBox-extracted raw text passed to AI Service Client as the document body for all three AI operations' }),
    mkInternalEdge('e5', 'w-ai',       'w-result',  'all results',     dark, { sourceHandle: 'top-s',    targetHandle: 'bottom-t', tooltip: 'Mono.zip runs summarize, flashcards, and quiz concurrently; total time = slowest of the three' }),
    mkInternalEdge('e6', 'w-result',   'w-consumer','ACK',             dark, { sourceHandle: 'top-s',    targetHandle: 'bottom-t', tooltip: 'Original RabbitMQ message ACKed only after broker confirms receipt of the document.processed result message' }),
  ],
  aiservice: (dark) => [
    mkInternalEdge('e1', 'ai-api',   'ai-mid',   'middleware',    dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'CorrelationIdMiddleware extracts X-Correlation-Id and sets correlation_id_var ContextVar for the full request scope' }),
    // api → idem: upper-left source (left-s2) → top-left target (top-t) — parallel with result below
    mkInternalEdge('e2', 'ai-api',   'ai-idem',  'check cache',   dark, { sourceHandle: 'left-s2',  targetHandle: 'top-t',    tooltip: 'Before calling the chain, Redis is checked for a cached result keyed by (operation, document_id)' }),
    // idem → api: top-right source (top-s) → lower-left target (left-t2) — parallel with check cache above
    mkInternalEdge('e3', 'ai-idem',  'ai-api',   'result',        dark, { sourceHandle: 'top-s',    targetHandle: 'left-t2',  tooltip: 'Returns cached result immediately to caller — skips LangChain and Gemini entirely on cache hit' }),
    mkInternalEdge('e4', 'ai-idem',  'ai-chain', 'on cache miss', dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'No cached result found — delegates to LangChain chain for live LLM processing' }),
    mkInternalEdge('e5', 'ai-chain', 'ai-gem',   'LLM call',      dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'LangChain chain sends structured prompt with extracted text to Gemini 1.5 Flash via Google GenAI SDK' }),
    mkInternalEdge('e6', 'ai-gem',   'ai-chain', 'response',      dark, { sourceHandle: 'top-s',    targetHandle: 'bottom-t', tooltip: 'Structured JSON response returned from Gemini; LangChain output parser validates and maps to the domain schema' }),
    mkInternalEdge('e7', 'ai-chain', 'ai-lf',    'LLM traces',    dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'LangChain callback fires after every chain run, sending latency, token count, prompt and output to Langfuse' }),
    mkInternalEdge('e8', 'ai-gem',   'ai-idem',  'cache 24h',     dark, { sourceHandle: 'left-s',   targetHandle: 'bottom-t', tooltip: 'Successful Gemini response written to Redis with 24h TTL keyed by (operation, document_id)' }),
  ],
  rabbitmq: (dark) => [
    mkInternalEdge('e1', 'rmq-ex',   'rmq-proc',   'routing key',        dark, { sourceHandle: 'left-s',   targetHandle: 'top-t', tooltip: 'Routes to document.processing queue — carries document ID for the Worker to download and process' }),
    mkInternalEdge('e2', 'rmq-ex',   'rmq-done',   'routing key',        dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Routes to document.processed queue — carries DONE or FAILED result from Worker back to Backend' }),
    mkInternalEdge('e3', 'rmq-ex',   'rmq-status', 'routing key',        dark, { sourceHandle: 'right-s',  targetHandle: 'top-t', tooltip: 'Routes to document.status queue — carries IN_PROGRESS signal from Worker; triggers lease stamp in Backend' }),
    mkInternalEdge('e4', 'rmq-proc', 'rmq-dlq',    'NACK requeue=false', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'After 3 failed retries the Worker NACKs with requeue=false; RabbitMQ dead-letters the message for operator inspection' }),
  ],
  redis: (_dark) => [],
  supabase: (dark) => [
    // auth → db: diagonal down-left
    mkInternalEdge('e1', 'sb-auth',    'sb-db',      'upsert user on sync',             dark, { sourceHandle: 'left-s',   targetHandle: 'top-t',   tooltip: 'POST /auth/sync upserts Supabase user into backend\'s users table — provides a stable internal UUID for foreign keys' }),
    mkInternalEdge('e2', 'sb-auth',    'sb-jwks',    'publishes public keys',            dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'Supabase signs JWTs with its private ES256 key; the matching public key is exposed at /.well-known/jwks.json for backend verification' }),
    mkInternalEdge('e3', 'sb-storage', 'sb-db',      'file URL stored in document row', dark, { sourceHandle: 'left-s',   targetHandle: 'right-t', tooltip: 'After PDF upload, the Supabase Storage path is saved in the documents.file_url column for later Worker download' }),
  ],
}

// ── Service detail nodes ──────────────────────────────────────────────────────
//
// Strict grid layout — node width=256px (w-64), gap=80px
//   col0=0   col1=336   col2=672
//   row0=0   row1=220   row2=440   row3=660

const SERVICE_DETAIL_NODES = {
  //
  // Frontend — 3 columns, 3 rows (5 nodes)
  //   [Router]      —      [Auth]
  //   [Query]       —    [Zustand]
  //       —       [Axios]    —
  //
  frontend: [
    mkIn('fe-router',  'Router & Pages',     'LandingPage · Dashboard · Upload · Document · How To Use · Technical · Architecture · Diary',    0,   0, '#3b82f6'),
    mkIn('fe-auth',    'Supabase JS Client', 'Google OAuth PKCE · JWT stored by client · onAuthStateChange listener',                        672,   0, '#22d3ee', true),
    mkIn('fe-query',   'TanStack Query',     'Server state · 3s polling on document status · staleTime 30s · retry 1',                        0, 220, '#f59e0b'),
    mkIn('fe-zustand', 'Zustand Auth Store', 'Global auth state · getState() for sync access in axios interceptor (outside React)',          672, 220, '#818cf8'),
    mkIn('fe-axios',   'Axios HTTP Client',  'Attaches Bearer JWT from Zustand store on every request via request interceptor',              336, 440, '#22c55e'),
  ],
  //
  // Backend — 3 columns, 4 rows (7 nodes)
  //       —       [Filter]     —
  //       —       [Ctrl]       —
  //   [Rate]      [Svc]     [Msg]
  //       —       [Repo]   [Recovery]
  //
  // Backend — col0=0, col1=450, col2=900 (194px gap between columns)
  backend: [
    mkIn('be-filter',   'Security Filter Chain', 'CorrelationIdFilter → BearerTokenAuthFilter → SupabaseJwtFilter → AuthorizationFilter · MDC thread-local',  450,   0, '#22c55e', true),
    mkIn('be-ctrl',     'Controllers',           '/api/v1/ · AuthController · DocumentController · ResultsController · HealthController',                      450, 220, '#3b82f6', true),
    mkIn('be-svc',      'Services',              'DocumentService · AuthService · ResultsService · StorageService · lazy user lookup · upsert pattern',         450, 440, '#a855f7'),
    mkIn('be-repo',     'Repositories (JPA)',    'DocumentRepository · UserRepository · SummaryRepository · FlashcardRepository · QuizQuestionRepository',     450, 660, '#f59e0b'),
    mkIn('be-rate',     'Rate Limiter',          'Bucket4j + Redis ProxyManager · 10 uploads/hr/user · Lua script atomic check-and-decrement',                   0, 440, '#f97316', true),
    mkIn('be-msg',      'Messaging',             'DocumentProcessingProducer · DocumentProcessedConsumer (SELECT FOR UPDATE) · DocumentStatusConsumer',         900, 440, '#818cf8', true),
    mkIn('be-recovery', 'Stale Job Recovery',   '@Scheduled fixedDelay=60s · resets expired IN_PROGRESS leases · republishes stuck PENDING docs',              900, 660, '#ef4444', true),
  ],
  //
  // Worker — 3 columns, 3 rows (6 nodes)
  //   [Status(left)]  [Consumer(mid)]  [Retry(right)]
  //                   [PDF(mid)]       [Result(right)]
  //                                    [AI(right)]
  //
  worker: [
    mkIn('w-status',   'Publish IN_PROGRESS',        'sendWithPublishConfirms → document.status · waits for broker ack',                                              0,   0, '#22d3ee'),
    mkIn('w-consumer', 'DocumentProcessingConsumer', 'reactor-rabbitmq Receiver/Sender · ApplicationRunner · flatMap concurrency=2 · QoS=2 · connection retry',  450,   0, '#a855f7', true),
    mkIn('w-retry',    'Retry & DLQ',                'retryWhen exponential 1s→2s→4s (max 3) · NACK requeue=false → document.processing.dlq',                     900,   0, '#ef4444', true),
    mkIn('w-pdf',      'PDF Pipeline',               'PdfDownloader (WebClient + .block()) → PdfTextExtractor (Apache PDFBox) · boundedElastic virtual threads',   450, 220, '#f59e0b', true),
    mkIn('w-result',   'Publish DONE / FAILED',      'sendWithPublishConfirms → document.processed · ACK original only after broker confirms result',               900, 220, '#3b82f6'),
    mkIn('w-ai',       'AI Service Client',          'Mono.zip: summarize ‖ flashcards ‖ quiz — concurrent · total time = slowest · X-Correlation-Id header',     900, 440, '#22c55e', true),
  ],
  //
  // AI Service — 3 columns, 3 rows (5 nodes)
  //       —      [API]       —
  //   [Idem]     [Chain]   [Gem]
  //   [Mid]       —          —
  //
  // AI Service — col0=0, col1=450, col2=900
  // Row 0: api(center) · mid(right)
  // Row 1: idem(left) · chain(center) · langfuse(right)
  // Row 2: gem(center)
  aiservice: [
    mkIn('ai-api',   'FastAPI Router',         'POST /ai/summarize · /ai/flashcards · /ai/quiz · X-Internal-Api-Key guard · CorrelationIdMiddleware',  450,   0, '#f59e0b'),
    mkIn('ai-mid',   'Correlation Middleware', 'ContextVar propagation · correlation_id_var.set(id) · injected into every Python log record',            900,   0, '#22c55e'),
    mkIn('ai-idem',  'Redis Idempotency',      'Claim-then-cache per (operation, document_id) · 24h TTL · prevents duplicate Gemini calls on retries',   0, 220, '#818cf8', true),
    mkIn('ai-chain', 'LangChain Chains',       'Summarize · Flashcard · Quiz chains · chunk + map-reduce for long documents',                           450, 220, '#a855f7', true),
    mkIn('ai-lf',    'Langfuse',               'LLM observability · LangChain callback handler · traces every chain run · latency · token usage · prompt versions', 900, 220, '#16a34a'),
    mkIn('ai-gem',   'Gemini API',             'gemini-1.5-flash · structured output · LLM responses parsed and returned to worker',                    450, 440, '#f97316'),
  ],
  //
  // RabbitMQ — 3 columns, 3 rows (5 nodes)
  //       —    [Exchange]     —
  //   [Proc]   [Done]    [Status]
  //   [DLQ]      —          —
  //
  rabbitmq: [
    mkIn('rmq-ex',     'document.exchange',       'Direct exchange · routes messages to queues by routing key',                                       336,   0, '#f97316'),
    mkIn('rmq-proc',   'document.processing',     'Backend → Worker · QoS prefetch=2 · persistent (deliveryMode=2) · source of all work',              0, 220, '#ef4444'),
    mkIn('rmq-done',   'document.processed',      'Worker → Backend · DONE or FAILED results · publisher confirms ensure no silent loss',             336, 220, '#22c55e'),
    mkIn('rmq-status', 'document.status',         'Worker → Backend · IN_PROGRESS signal · triggers lease stamp · idempotent guarded UPDATE',        672, 220, '#3b82f6'),
    mkIn('rmq-dlq',    'document.processing.dlq', 'Dead letter queue · NACKed after 3 retries · operator replay point · message preserved for debug',   0, 440, '#64748b'),
  ],
  //
  // Redis — 3 nodes, 2 rows (no edges)
  //   [Bucket]      —    [Idem]
  //       —       [JWK]    —
  //
  redis: [
    mkIn('rd-bucket', 'Bucket4j Rate Limiter', '10 uploads/hr/user · token bucket · LettuceBasedProxyManager · Lua script atomic check-and-decrement · state in Redis not JVM',    0,   0, '#818cf8'),
    mkIn('rd-idem',   'AI Idempotency Cache',  'Key: op:summarize:<doc_id> · 24h TTL · claim-then-cache · prevents duplicate Gemini calls on worker retry or DLQ replay',          672,   0, '#f59e0b'),
    mkIn('rd-jwk',    'JWK Cache',             'Supabase public JWKS keys · 15min TTL · 5min refresh window · ES256 asymmetric · backend never holds private key',                 336, 220, '#22d3ee'),
  ],
  //
  // Supabase — 3 columns, 2 rows (4 nodes)
  //       —      [Auth]       —
  //   [DB]      [JWKS]   [Storage]
  //
  supabase: [
    mkIn('sb-auth',    'Auth — Google OAuth', 'PKCE flow · Supabase manages Google redirect · signs ES256 JWT with private key · sub + email claims',   336,   0, '#22d3ee'),
    mkIn('sb-db',      'PostgreSQL Database', 'users · documents · summaries · flashcards · quiz_questions · Liquibase migrations · Hibernate validate',   0, 220, '#3b82f6'),
    mkIn('sb-jwks',    'JWKS Endpoint',       '/auth/v1/.well-known/jwks.json · only public keys exposed · backend caches 15min · zero-trust model',     336, 220, '#f59e0b'),
    mkIn('sb-storage', 'File Storage',        'documents bucket · <userId>/<uuid>.pdf · service-role key bypasses RLS · production: signed URLs + CDN', 672, 220, '#a855f7'),
  ],
}

// ── Level-3 detail nodes & edges ──────────────────────────────────────────────
//
// Keyed by the internal-node id that is drillable.
// Grid: col0=0, col1=336 or 450, col2=672 or 900 depending on content width.

const L3_NODES = {
  //
  // Backend › Controllers — DispatcherServlet fans out to 4 controllers
  //       —    [Dispatcher]    —
  //   [Auth]    [Doc]      [Results]
  //       —    [Health]       —
  //
  // Controllers — dispatcher at center, pure cardinal fan (up/left/right/down)
  //       —     [Health]     —
  //   [Doc]   [Dispatcher]  [Results]
  //       —     [Auth]       —
  'be-ctrl': [
    mkIn('bc-health', 'HealthController',            'GET /api/v1/health → 200 OK · used as Railway health probe · no auth required · bypasses filter chain authorization',               450,   0, '#3b82f6'),
    mkIn('bc-doc',    'DocumentController',          'GET /documents · POST /upload (rate-limited) · GET /documents/{id} · delegates to DocumentService · returns RFC 7807 on error',       0, 220, '#3b82f6'),
    mkIn('bc-disp',   'DispatcherServlet + OpenAPI', 'Spring MVC front controller · routes by @RequestMapping · Springdoc auto-generates /swagger-ui.html from @Operation annotations',  450, 220, '#3b82f6'),
    mkIn('bc-res',    'ResultsController',           'GET /documents/{id}/summary · /flashcards · /quiz · 404 if not yet processed · lazy-loads from JPA repositories',                  900, 220, '#3b82f6'),
    mkIn('bc-auth',   'AuthController',              'POST /api/v1/auth/sync — upserts Supabase user into local users table · idempotent · returns 200 on both create and update',       450, 440, '#3b82f6'),
  ],
  //
  // Backend › Security Filter Chain — linear vertical pipeline
  //   [CorrelationId]
  //   [BearerToken]
  //   [SupabaseJwt]
  //   [Authorization]
  //
  'be-filter': [
    mkIn('bf-corr',   'CorrelationIdFilter',   'Generates X-Correlation-Id if absent · stores in MDC (thread-local) · propagated to all log lines · returned in response header',  336,   0, '#94a3b8'),
    mkIn('bf-bearer', 'BearerTokenAuthFilter', 'Extracts Authorization: Bearer <token> header · stores raw JWT string in SecurityContext for downstream filters',                    336, 220, '#94a3b8'),
    mkIn('bf-jwt',    'SupabaseJwtFilter',     'Validates ES256 JWT signature against Supabase JWKS · caches public keys 15min · extracts sub + email claims',                     336, 440, '#94a3b8'),
    mkIn('bf-authz',  'AuthorizationFilter',   'Confirms SecurityContext is populated · returns 401 if unauthenticated · sets authenticated principal for controller layer',        336, 660, '#94a3b8'),
  ],
  //
  // Worker › PDF Pipeline — linear vertical pipeline
  //   [PdfDownloader]
  //   [PdfTextExtractor]
  //   [TextChunker]
  //
  'w-pdf': [
    mkIn('wp-dl',    'PdfDownloader',    'WebClient fetches PDF from Supabase Storage signed URL · .block() on virtual thread (Java 21 Loom) — parks, does not burn OS thread',    336,   0, '#f59e0b'),
    mkIn('wp-ext',   'PdfTextExtractor', 'Apache PDFBox PDDocument.load() · PDFTextStripper strips layout/formatting · returns raw text string · closes stream in finally block',   336, 220, '#f59e0b'),
    mkIn('wp-chunk', 'Text Chunker',     'LangChain4j CharacterTextSplitter · configurable chunk size + overlap · only invoked if text exceeds single-prompt token limit',          336, 440, '#f59e0b'),
  ],
  //
  // Worker › AI Service Client — Mono.zip fan-out to 3 concurrent calls
  //         [Mono.zip]
  //    /        |        \
  // [Sum]   [Flash]   [Quiz]
  //
  'w-ai': [
    mkIn('wa-zip',   'Mono.zip Orchestrator', 'Fires all three HTTP calls concurrently · total latency = max(sum, flash, quiz) · any failure propagates to retryWhen',              450,   0, '#22c55e'),
    mkIn('wa-sum',   'POST /ai/summarize',    'WebClient POST · X-Correlation-Id header · JSON body: { documentId, text } · returns { summary }',                                    0, 220, '#22c55e'),
    mkIn('wa-flash', 'POST /ai/flashcards',   'WebClient POST · X-Correlation-Id header · JSON body: { documentId, text } · returns { flashcards: [...] }',                        450, 220, '#22c55e'),
    mkIn('wa-quiz',  'POST /ai/quiz',         'WebClient POST · X-Correlation-Id header · JSON body: { documentId, text } · returns { questions: [...] }',                         900, 220, '#22c55e'),
  ],
  //
  // AI Service › LangChain Chains — 3 chains fan into MapReduce for long docs
  //   [Summarize]  [Flashcard]  [Quiz]
  //                [MapReduce]
  //
  'ai-chain': [
    mkIn('ac-sum',   'Summarize Chain',  'PromptTemplate → LLM → StrOutputParser · single-shot for short docs · triggers map-reduce when chunk count > 1',   0, 0, '#a855f7'),
    mkIn('ac-flash', 'Flashcard Chain',  'Structured output parser → List[Flashcard] · JSON schema enforcement · temperature 0.3 for consistency',           450, 0, '#a855f7'),
    mkIn('ac-quiz',  'Quiz Chain',       'Structured output parser → List[QuizQuestion] · 4 options + correct index · temperature 0.4',                      900, 0, '#a855f7'),
    mkIn('ac-mr',    'Map-Reduce Chain', 'map: summarize each chunk independently · reduce: combine summaries into final output · avoids context window limit', 450, 220, '#818cf8'),
  ],
  //
  // Backend › Rate Limiter — linear pipeline through Bucket4j + Redis
  //   [Request]
  //   [Bucket4j Token Bucket]
  //   [LettuceBasedProxyManager]
  //   [Redis Lua Script]
  //
  'be-rate': [
    mkIn('br-req',    'Incoming Upload Request', 'POST /api/v1/upload · userId extracted from JWT · triggers rate-limit check before any processing begins',                                     336,   0, '#f97316'),
    mkIn('br-bucket', 'Bucket4j Token Bucket',   '10 tokens/hr/user · token bucket algorithm · refills at fixed rate · bandwidth = 10 · thread-safe in-process handle',                         336, 220, '#f97316'),
    mkIn('br-proxy',  'LettuceBasedProxyManager','Proxies bucket state to Redis via Lettuce async client · bucket key = "rate-limit:<userId>" · each check reads + writes Redis atomically',     336, 440, '#f97316'),
    mkIn('br-lua',    'Redis Lua Script (EVAL)',  'EVAL atomic check-and-decrement · if tokens > 0: decrement + allow · else: reject 429 · single round-trip prevents TOCTOU race condition',    336, 660, '#f97316'),
  ],
  //
  // Backend › Messaging — Producer + 2 Consumers, with SELECT FOR UPDATE detail
  //       —      [Producer]      —
  //   [Processed Consumer]   [Status Consumer]
  //   [SELECT FOR UPDATE]        —
  //
  'be-msg': [
    mkIn('bm-prod',   'DocumentProcessingProducer', 'RabbitTemplate.convertAndSend() · document.processing queue · JSON body: { documentId, storageUrl, correlationId } · called on upload',   450,   0, '#818cf8'),
    mkIn('bm-proc',   'DocumentProcessedConsumer',  '@RabbitListener · receives DONE/FAILED result · acquires SELECT FOR UPDATE row lock · prevents duplicate writes on concurrent redelivery',   0, 220, '#818cf8'),
    mkIn('bm-status', 'DocumentStatusConsumer',     '@RabbitListener · receives IN_PROGRESS signal from worker · calls transitionToInProgress() guarded UPDATE · idempotent on duplicate',      900, 220, '#818cf8'),
    mkIn('bm-lock',   'SELECT FOR UPDATE',          'findByIdForUpdate() — pessimistic write lock on document row · first concurrent consumer processes · second reads post-commit state + acks silently',  0, 440, '#475569'),
  ],
  //
  // Backend › Stale Job Recovery — two-path recovery, converges on republish
  //         [Scheduler]
  //    [IN_PROGRESS]  [PENDING]
  //    [reset lease]  [find stuck]
  //         [Republish]
  //
  'be-recovery': [
    mkIn('brc-sched', '@Scheduled Trigger',          'fixedDelay=60s · Spring @Scheduled · runs in virtual thread pool · both recovery paths execute on every tick',                              450,   0, '#ef4444'),
    mkIn('brc-ip',    'Expired IN_PROGRESS Path',    'leaseUntil < now · worker crashed or timed out mid-processing · lease was set by DocumentStatusConsumer when work began',                    0, 220, '#ef4444'),
    mkIn('brc-pend',  'Stuck PENDING Path',          'createdAt < 15min ago + processingStartedAt IS NULL · message was published but never consumed · covers broker/worker restart gap',        900, 220, '#ef4444'),
    mkIn('brc-reset', 'resetStaleInProgressJobs()',  'bulk UPDATE status=PENDING · sets new leaseUntil = now+30min (prevents re-trigger before worker picks it up) · returns affected row count', 0, 440, '#ef4444'),
    mkIn('brc-find',  'findStuckPendingDocuments()', 'SELECT WHERE status=PENDING AND processingStartedAt IS NULL AND createdAt < cutoff · returns list for republishing',                       900, 440, '#ef4444'),
    mkIn('brc-pub',   'Republish to RabbitMQ',       'DocumentProcessingProducer.send() for each recovered document · correlationId preserved · worker will re-download and reprocess',          450, 660, '#ef4444'),
  ],
  //
  // Worker › DocumentProcessingConsumer — reactor-rabbitmq reactive pipeline
  //         [ApplicationRunner]
  //   [consumeManualAck]   [Connection Retry]
  //         [flatMap concurrency=2]
  //         [Ack / Nack Decision]
  //
  'w-consumer': [
    mkIn('wc-run',  'ApplicationRunner',        'Spring ApplicationRunner.run() on startup · creates reactor-rabbitmq Receiver + Sender · establishes RabbitMQ connection with retry',            450,   0, '#a855f7'),
    mkIn('wc-recv', 'consumeManualAck (QoS=2)', 'Receiver.consumeManualAck() · prefetch=2 → max 2 unacked messages in-flight · backpressure: broker stops delivering if both slots are busy',      0, 220, '#a855f7'),
    mkIn('wc-conn', 'Connection Retry',         'retryWhen on connection error · exponential backoff · RabbitMQ unavailable during deploy does not crash the worker',                              900, 220, '#a855f7'),
    mkIn('wc-flat', 'flatMap(concurrency=2)',   'Project Reactor flatMap · processes up to 2 messages concurrently per instance · each message is a non-blocking reactive pipeline',              450, 440, '#a855f7'),
    mkIn('wc-ack',  'Ack / Nack Decision',      'ACK only after Sender.sendWithPublishConfirms() resolves · broker confirms result published · on error: NACK triggers retryWhen exponential', 450, 660, '#a855f7'),
  ],
  //
  // Worker › Retry & DLQ — error path with exponential backoff
  //     [Error Signal]
  //     [retryWhen]
  //   [Succeeded]  [Exhausted]
  //                [NACK → DLQ]
  //
  'w-retry': [
    mkIn('wr-err',    'Processing Error',        'Mono error signal from any stage (download, extract, AI call, publish) · triggers retryWhen operator in the reactive pipeline',                 450,   0, '#ef4444'),
    mkIn('wr-retry',  'retryWhen (max 3)',        'Reactor retryWhen · exponential backoff: 1s → 2s → 4s · attempt counter incremented on each retry · total max wait ≈ 7s before exhaustion',   450, 220, '#ef4444'),
    mkIn('wr-ok',     'Retry Succeeded',         'Processing completes on a retry attempt · result published via sendWithPublishConfirms · original message ACKed · no dead-letter entry',         0, 440, '#22c55e'),
    mkIn('wr-fail',   'All Attempts Exhausted',  'All 3 retry attempts failed · error propagated out of retryWhen · message must be negatively acknowledged without re-queuing',                  900, 440, '#ef4444'),
    mkIn('wr-dlq',    'NACK → DLQ',              'NACK requeue=false → RabbitMQ dead-letters to document.processing.dlq · message preserved for manual inspection and operator replay',           900, 660, '#ef4444'),
  ],
  //
  // Frontend › Supabase JS Client — OAuth PKCE flow end to end
  //       [loginWithGoogle()]
  //   [PKCE Challenge]  [Google Redirect]
  //       [Token Exchange]
  //       [onAuthStateChange → /auth/sync]
  //
  'fe-auth': [
    mkIn('fa-login',    'loginWithGoogle()',         'User clicks "Continue with Google" · calls supabase.auth.signInWithOAuth({ provider: "google" }) · initiates PKCE flow',                  450,   0, '#22d3ee'),
    mkIn('fa-pkce',     'PKCE Code Verifier',        'supabase-js generates cryptographically random code_verifier · derives code_challenge = SHA-256(verifier) · stored in sessionStorage',      0, 220, '#22d3ee'),
    mkIn('fa-redir',    'Google OAuth2 IDP',         'Browser redirected to accounts.google.com · user authenticates · Google returns auth code to Supabase callback URL',                       900, 220, '#22d3ee'),
    mkIn('fa-token',    'Supabase Token Exchange',   'Supabase exchanges code + code_verifier for session · ES256 JWT issued · PKCE prevents authorization code interception attacks',            450, 440, '#22d3ee'),
    mkIn('fa-sync',     'onAuthStateChange + sync',  'SIGNED_IN event fires · JWT stored by supabase-js · App.jsx calls POST /api/v1/auth/sync to upsert user in backend DB',                   450, 660, '#22d3ee'),
  ],
  //
  // AI Service › Redis Idempotency — claim-then-cache pattern
  //       [Check Cache]  [Cache Hit]
  //       [SETNX Claim]
  //       [LLM Processing]
  //       [SET Result + TTL]
  //
  'ai-idem': [
    mkIn('aid-check',   'Check Result Cache',    'GET result:{op}:{doc_id} · if key exists → return cached value immediately · no LLM call · prevents duplicate spend on worker retry',   450,   0, '#818cf8'),
    mkIn('aid-hit',     'Cache Hit',             'Cached result returned directly · 24h TTL means even DLQ replay after hours still hits cache · zero extra Gemini API cost',              900,   0, '#22c55e'),
    mkIn('aid-claim',   'SETNX Claim',           'SET claim:{op}:{doc_id} NX EX 300 · atomic: only first caller succeeds · concurrent workers with same doc blocked at this step',        450, 220, '#818cf8'),
    mkIn('aid-process', 'LLM Processing',        'LangChain chain invoked → Gemini API call · structured output parsed · this is the expensive operation the idempotency layer protects',  450, 440, '#818cf8'),
    mkIn('aid-store',   'SET Result + 24h TTL',  'SET result:{op}:{doc_id} <value> EX 86400 · DELETE claim key · future callers hit Cache Hit path · claim released on success or error', 450, 660, '#818cf8'),
  ],
}

const L3_EDGES = {
  'be-ctrl': (dark) => [
    mkInternalEdge('l1', 'bc-disp', 'bc-health', 'routes', dark, { sourceHandle: 'top-s',    targetHandle: 'bottom-t', tooltip: 'GET /api/v1/health — bypasses authorization filter, used as Railway health probe; always returns 200' }),
    mkInternalEdge('l2', 'bc-disp', 'bc-doc',    'routes', dark, { sourceHandle: 'left-s',   targetHandle: 'right-t',  tooltip: 'GET /documents · POST /upload (rate-limited) · GET /documents/:id — delegates to DocumentService' }),
    mkInternalEdge('l3', 'bc-disp', 'bc-res',    'routes', dark, { sourceHandle: 'right-s',  targetHandle: 'left-t',   tooltip: 'GET /documents/:id/summary · /flashcards · /quiz — returns 404 if AI results are not yet ready' }),
    mkInternalEdge('l4', 'bc-disp', 'bc-auth',   'routes', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',    tooltip: 'POST /auth/sync — upserts Supabase user into local users table on first sign-in or each session' }),
  ],
  'be-filter': (dark) => [
    mkInternalEdge('l1', 'bf-corr',   'bf-bearer', 'request passes through', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Generates or reads X-Correlation-Id header; sets correlationId in MDC so all downstream log lines share the same trace ID' }),
    mkInternalEdge('l2', 'bf-bearer', 'bf-jwt',    'request passes through', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Extracts Bearer token from Authorization header; passes raw JWT string to the Supabase JWT filter for signature verification' }),
    mkInternalEdge('l3', 'bf-jwt',    'bf-authz',  'request passes through', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Verifies ES256 JWT signature using cached Supabase public JWKS; sets the SecurityContext principal on success' }),
  ],
  'w-pdf': (dark) => [
    mkInternalEdge('l1', 'wp-dl',  'wp-ext',   'raw bytes', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'WebClient downloads PDF from Supabase Storage using service-role key; .block() parks the virtual thread during I/O wait' }),
    mkInternalEdge('l2', 'wp-ext', 'wp-chunk', 'raw text',  dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'PDFBox strips PDF structure and extracts plain text; oversized documents are split into chunks for LangChain map-reduce' }),
  ],
  'w-ai': (dark) => [
    mkInternalEdge('l1', 'wa-zip', 'wa-sum',   'concurrent', dark, { sourceHandle: 'left-s',   targetHandle: 'top-t', tooltip: 'SummarizeChain HTTP call runs in parallel with flashcard and quiz calls via Mono.zip' }),
    mkInternalEdge('l2', 'wa-zip', 'wa-flash', 'concurrent', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'FlashcardChain HTTP call runs concurrently; generates structured card objects from extracted text' }),
    mkInternalEdge('l3', 'wa-zip', 'wa-quiz',  'concurrent', dark, { sourceHandle: 'right-s',  targetHandle: 'top-t', tooltip: 'QuizChain HTTP call runs concurrently; generates multiple-choice questions with correct answer index' }),
  ],
  'ai-chain': (dark) => [
    mkInternalEdge('l1', 'ac-sum',   'ac-mr', 'long doc', dark, { sourceHandle: 'bottom-s', targetHandle: 'left-t',  tooltip: 'For documents over chunk threshold, SummarizeChain uses map-reduce: summarize each chunk then combine results' }),
    mkInternalEdge('l2', 'ac-flash', 'ac-mr', 'long doc', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'For long documents, FlashcardChain maps over chunks and merges the card sets from each chunk' }),
    mkInternalEdge('l3', 'ac-quiz',  'ac-mr', 'long doc', dark, { sourceHandle: 'bottom-s', targetHandle: 'right-t', tooltip: 'For long documents, QuizChain maps over chunks and deduplicates questions across the merged result' }),
  ],
  'be-rate': (dark) => [
    mkInternalEdge('l1', 'br-req',    'br-bucket', 'check limit',    dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'DocumentService injects the userId as the Bucket4j key; checks how many tokens remain for this user' }),
    mkInternalEdge('l2', 'br-bucket', 'br-proxy',  'proxy to Redis', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'LettuceBasedProxyManager routes the bucket state check to the correct Redis key namespace' }),
    mkInternalEdge('l3', 'br-proxy',  'br-lua',    'EVAL script',    dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Atomic Lua script: if tokens > 0 then decrement and allow, else reject — prevents race conditions between concurrent requests' }),
  ],
  'be-msg': (dark) => [
    mkInternalEdge('l1', 'bm-proc', 'bm-lock', 'findByIdForUpdate()', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'SELECT FOR UPDATE serialises concurrent duplicate deliveries; second consumer blocks until first commits, then reads terminal status' }),
  ],
  'be-recovery': (dark) => [
    mkInternalEdge('l1', 'brc-sched', 'brc-ip',    'leaseUntil < now', dark, { sourceHandle: 'left-s',   targetHandle: 'top-t',   tooltip: 'Finds IN_PROGRESS documents whose leaseUntil timestamp has expired — indicates the worker crashed mid-processing' }),
    mkInternalEdge('l2', 'brc-sched', 'brc-pend',  'createdAt old',    dark, { sourceHandle: 'right-s',  targetHandle: 'top-t',   tooltip: 'Finds PENDING documents older than 15 minutes with no processingStartedAt — indicates a missed publish on upload' }),
    mkInternalEdge('l3', 'brc-ip',    'brc-reset',  'bulk UPDATE',      dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'UPDATE sets status=PENDING and refreshes leaseUntil; the refreshed timestamp prevents the recovery job itself from re-triggering' }),
    mkInternalEdge('l4', 'brc-pend',  'brc-find',   'SELECT WHERE',     dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'SELECT fetches the stuck PENDING documents by ID to collect the ones that need to be republished' }),
    mkInternalEdge('l5', 'brc-reset', 'brc-pub',    'recovered docs',   dark, { sourceHandle: 'bottom-s', targetHandle: 'left-t',  tooltip: 'Recovered IN_PROGRESS→PENDING documents re-published to document.processing queue for reprocessing' }),
    mkInternalEdge('l6', 'brc-find',  'brc-pub',    'recovered docs',   dark, { sourceHandle: 'bottom-s', targetHandle: 'right-t', tooltip: 'Stuck PENDING documents re-published to document.processing queue; worker will pick them up and retry' }),
  ],
  'w-consumer': (dark) => [
    mkInternalEdge('l1', 'wc-run',  'wc-recv', 'starts consumer',  dark, { sourceHandle: 'left-s',   targetHandle: 'top-t', tooltip: 'ApplicationRunner.run() bootstraps the reactor-rabbitmq Receiver with queue binding and prefetch settings' }),
    mkInternalEdge('l2', 'wc-run',  'wc-conn', 'resilience',       dark, { sourceHandle: 'right-s',  targetHandle: 'top-t', tooltip: 'ConnectionProvider configures retry and reconnect; worker survives RabbitMQ restarts without JVM crash' }),
    mkInternalEdge('l3', 'wc-recv', 'wc-flat', 'message stream',   dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Flux<Delivery> from Receiver piped into flatMap; concurrency=2 limits parallel in-flight pipeline executions' }),
    mkInternalEdge('l4', 'wc-flat', 'wc-ack',  'processed result', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'After full pipeline completes, sendWithPublishConfirms sends the result then ACKs the original delivery' }),
  ],
  'w-retry': (dark) => [
    mkInternalEdge('l1', 'wr-err',   'wr-retry', 'error signal',       dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'Any exception in the reactive pipeline triggers retryWhen with exponential backoff strategy' }),
    mkInternalEdge('l2', 'wr-retry', 'wr-ok',    'attempt succeeds',   dark, { sourceHandle: 'left-s',   targetHandle: 'top-t', tooltip: 'Retry attempt succeeds — pipeline continues normally to publish DONE result and ACK the message' }),
    mkInternalEdge('l3', 'wr-retry', 'wr-fail',  '3× failed',          dark, { sourceHandle: 'right-s',  targetHandle: 'top-t', tooltip: 'All 3 retry attempts exhausted — pipeline publishes FAILED result to document.processed queue' }),
    mkInternalEdge('l4', 'wr-fail',  'wr-dlq',   'NACK requeue=false', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t', tooltip: 'NACK with requeue=false sent to RabbitMQ; message dead-lettered to document.processing.dlq for operator inspection' }),
  ],
  'fe-auth': (dark) => [
    mkInternalEdge('l1', 'fa-login', 'fa-pkce',  'generate verifier',    dark, { sourceHandle: 'left-s',   targetHandle: 'top-t',   tooltip: 'Supabase JS generates a random PKCE code_verifier and derives code_challenge via SHA-256 hashing' }),
    mkInternalEdge('l2', 'fa-login', 'fa-redir', 'redirect + challenge', dark, { sourceHandle: 'right-s',  targetHandle: 'top-t',   tooltip: 'Browser redirected to Google OAuth with code_challenge appended; Google shows the consent screen' }),
    mkInternalEdge('l3', 'fa-pkce',  'fa-token', 'verifier + code',      dark, { sourceHandle: 'bottom-s', targetHandle: 'left-t',  tooltip: 'After Google redirects back, Supabase exchanges the authorization code + code_verifier for access and refresh tokens' }),
    mkInternalEdge('l4', 'fa-redir', 'fa-token', 'auth code',            dark, { sourceHandle: 'bottom-s', targetHandle: 'right-t', tooltip: 'Google redirects to the app callback URL with the authorization code; Supabase JS intercepts and processes it' }),
    mkInternalEdge('l5', 'fa-token', 'fa-sync',  'session + JWT',        dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',   tooltip: 'Supabase stores session locally; onAuthStateChange fires SIGNED_IN; backend /auth/sync called to upsert user' }),
  ],
  'ai-idem': (dark) => [
    mkInternalEdge('l1', 'aid-check',   'aid-hit',     'cached',         dark, { sourceHandle: 'right-s',  targetHandle: 'left-t', tooltip: 'Redis GET returns a non-null value — cached LLM result returned immediately to the caller without any chain call' }),
    mkInternalEdge('l2', 'aid-check',   'aid-claim',   'cache miss',     dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',  tooltip: 'Redis GET returns null — proceeds to claim the operation slot before calling the LLM to prevent duplicate calls' }),
    mkInternalEdge('l3', 'aid-claim',   'aid-process', 'claim acquired', dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',  tooltip: 'Redis SET NX acquires a processing lock for this (operation, document_id) pair; concurrent requests wait or fail fast' }),
    mkInternalEdge('l4', 'aid-process', 'aid-store',   'LLM result',     dark, { sourceHandle: 'bottom-s', targetHandle: 'top-t',  tooltip: 'LLM result received — written to Redis with 24h TTL to serve all future identical requests without calling Gemini' }),
  ],
}

// Maps each drillable internal node id to its parent service id (for back-navigation)
const L3_PARENT = {
  'be-ctrl':     'backend',
  'be-filter':   'backend',
  'be-rate':     'backend',
  'be-msg':      'backend',
  'be-recovery': 'backend',
  'w-consumer':  'worker',
  'w-pdf':       'worker',
  'w-ai':        'worker',
  'w-retry':     'worker',
  'fe-auth':     'frontend',
  'ai-chain':    'aiservice',
  'ai-idem':     'aiservice',
}

// Human-readable label for the breadcrumb
const L3_LABEL = {
  'be-ctrl':     'Controllers',
  'be-filter':   'Security Filter Chain',
  'be-rate':     'Rate Limiter',
  'be-msg':      'Messaging',
  'be-recovery': 'Stale Job Recovery',
  'w-consumer':  'DocumentProcessingConsumer',
  'w-pdf':       'PDF Pipeline',
  'w-ai':        'AI Service Client',
  'w-retry':     'Retry & DLQ',
  'fe-auth':     'Supabase JS Client',
  'ai-chain':    'LangChain Chains',
  'ai-idem':     'Redis Idempotency',
}

// ── Custom edge: PercentEdge ──────────────────────────────────────────────────
// Renders the label at `data.labelPercent` (0–1) along the straight-line path
// instead of the default 50% midpoint. Uses EdgeLabelRenderer so the label is
// a real DOM element (avoids SVG text clipping and supports transforms).

function PercentEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd }) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const pct = data?.labelPercent ?? 0.5
  const lx = sourceX + (targetX - sourceX) * pct
  const ly = sourceY + (targetY - sourceY) * pct
  const [tipPos, setTipPos] = useState(null)
  const labelRef = useRef(null)

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            ref={labelRef}
            className="nodrag nopan pointer-events-auto"
            onMouseEnter={() => {
              const r = labelRef.current?.getBoundingClientRect()
              if (r) setTipPos({ x: r.left + r.width / 2, y: r.top })
            }}
            onMouseLeave={() => setTipPos(null)}
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
              background: data.labelBg,
              color: data.labelColor,
              border: `0.75px solid ${data.labelBorder ?? 'transparent'}`,
              fontSize: 10,
              fontWeight: 500,
              borderRadius: 4,
              padding: '3px 6px',
              cursor: 'default',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {tipPos && data?.tooltip && createPortal(
        <div
          style={{ position: 'fixed', left: tipPos.x, top: tipPos.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999, pointerEvents: 'none' }}
          className="bg-gray-900 text-white text-[10px] leading-snug rounded-lg px-2.5 py-2 shadow-xl border border-white/10 max-w-[260px] text-center"
        >
          {data.tooltip}
        </div>,
        document.body
      )}
    </>
  )
}

// ── Custom edge: InternalEdge ─────────────────────────────────────────────────
// Renders the edge label as an HTML element (via EdgeLabelRenderer) so we can
// use Tailwind group-hover to show a tooltip with a longer explanation on hover.

function InternalEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd, label }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const [tipPos, setTipPos] = useState(null)
  const labelRef = useRef(null)

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute"
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
          >
            <span
              ref={labelRef}
              onMouseEnter={() => {
                const r = labelRef.current?.getBoundingClientRect()
                if (r) setTipPos({ x: r.left + r.width / 2, y: r.top })
              }}
              onMouseLeave={() => setTipPos(null)}
              className="block text-[9px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-400/30 dark:border-gray-600/40 rounded px-1.5 py-0.5 cursor-default select-none"
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
      {tipPos && data?.tooltip && createPortal(
        <div
          style={{ position: 'fixed', left: tipPos.x, top: tipPos.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999, pointerEvents: 'none' }}
          className="bg-gray-900 text-white text-[10px] leading-snug rounded-lg px-2.5 py-2 shadow-xl border border-white/10 max-w-[260px] text-center"
        >
          {data.tooltip}
        </div>,
        document.body
      )}
    </>
  )
}

// ── Custom node: ServiceNode ──────────────────────────────────────────────────

function ServiceNode({ data }) {
  return (
    <div
      style={{ borderColor: `${data.color}60` }}
      className="w-48 rounded-lg border bg-white dark:bg-gray-900 cursor-pointer select-none group transition-shadow hover:shadow-md"
    >
      {/* Named handles at each side — source and target separated so edges
          can specify exact entry/exit points and avoid overlapping paths */}
      <Handle id="top-t"    type="target" position={Position.Top}    isConnectable={false} style={{ opacity: 0, left: '40%' }} />
      <Handle id="top-s"    type="source" position={Position.Top}    isConnectable={false} style={{ opacity: 0, left: '60%' }} />
      <Handle id="left-t"   type="target" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="left-t2"  type="target" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="left-s"   type="source" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="left-s2"  type="source" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="right-t"  type="target" position={Position.Right}  isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="right-s"  type="source" position={Position.Right}  isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="bottom-t" type="target" position={Position.Bottom} isConnectable={false} style={{ opacity: 0, left: '60%' }} />
      <Handle id="bottom-s" type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0, left: '40%' }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div style={{ backgroundColor: data.color }} className="h-2 w-2 rounded-full flex-shrink-0" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{data.label}</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">{data.tech}</p>
        <p style={{ color: data.color }} className="text-xs font-medium mt-2 flex items-center gap-1 group-hover:gap-2 transition-all">
          Explore internals
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </p>
      </div>
    </div>
  )
}

// ── Custom node: InternalNode ─────────────────────────────────────────────────

function InternalNode({ data }) {
  return (
    <div
      style={{ borderColor: `${data.color}60` }}
      className={`w-64 rounded-lg border bg-white dark:bg-gray-900 select-none${data.drillable ? ' cursor-pointer group' : ''}`}
    >
      <Handle id="top-t"    type="target" position={Position.Top}    isConnectable={false} style={{ opacity: 0, left: '40%' }} />
      <Handle id="top-s"    type="source" position={Position.Top}    isConnectable={false} style={{ opacity: 0, left: '60%' }} />
      <Handle id="left-t"   type="target" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="left-t2"  type="target" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="left-s"   type="source" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="left-s2"  type="source" position={Position.Left}   isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="right-t"  type="target" position={Position.Right}  isConnectable={false} style={{ opacity: 0, top: '65%' }} />
      <Handle id="right-s"  type="source" position={Position.Right}  isConnectable={false} style={{ opacity: 0, top: '35%' }} />
      <Handle id="bottom-t" type="target" position={Position.Bottom} isConnectable={false} style={{ opacity: 0, left: '60%' }} />
      <Handle id="bottom-s" type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0, left: '40%' }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div style={{ backgroundColor: data.color }} className="h-2 w-2 rounded-full flex-shrink-0" />
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{data.label}</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{data.desc}</p>
        {data.drillable && (
          <p style={{ color: data.color }} className="text-xs font-medium mt-2 flex items-center gap-1 group-hover:gap-2 transition-all">
            Explore internals
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </p>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { service: ServiceNode, internal: InternalNode }
const edgeTypes = { percentEdge: PercentEdge, internalEdge: InternalEdge }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemMapPage() {
  const [dark, setDark] = useDarkMode()
  const [activeService, setActiveService] = useState(null)  // level 2
  const [activeModule, setActiveModule]   = useState(null)  // level 3 (internal node id)
  const [showMinimap, setShowMinimap] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState(SYSTEM_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(() => makeSystemEdges(dark))

  // Re-sync label backgrounds whenever dark mode changes
  useEffect(() => {
    if (activeModule) {
      setEdges(L3_EDGES[activeModule](dark))
    } else if (activeService) {
      setEdges(SERVICE_DETAIL_EDGES[activeService](dark))
    } else {
      setEdges(makeSystemEdges(dark))
    }
  }, [dark, activeService, activeModule, setEdges])

  const drillInto = useCallback((serviceId) => {
    if (!SERVICE_DETAIL_NODES[serviceId]) return
    setActiveModule(null)
    setActiveService(serviceId)
    setNodes(SERVICE_DETAIL_NODES[serviceId])
    setEdges(SERVICE_DETAIL_EDGES[serviceId](dark))
  }, [dark, setNodes, setEdges])

  const drillIntoModule = useCallback((moduleId) => {
    setActiveModule(moduleId)
    setNodes(L3_NODES[moduleId])
    setEdges(L3_EDGES[moduleId](dark))
  }, [dark, setNodes, setEdges])

  const backToService = useCallback(() => {
    const serviceId = L3_PARENT[activeModule]
    setActiveModule(null)
    setNodes(SERVICE_DETAIL_NODES[serviceId])
    setEdges(SERVICE_DETAIL_EDGES[serviceId](dark))
  }, [dark, activeModule, setNodes, setEdges])

  const backToSystem = useCallback(() => {
    setActiveService(null)
    setActiveModule(null)
    setNodes(SYSTEM_NODES)
    setEdges(makeSystemEdges(dark))
  }, [dark, setNodes, setEdges])

  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'service') drillInto(node.id)
    else if (node.type === 'internal' && node.data?.drillable) drillIntoModule(node.id)
  }, [drillInto, drillIntoModule])

  const activeMeta   = activeService ? SERVICE_META[activeService] : null
  const activeModLabel = activeModule ? L3_LABEL[activeModule] : null

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 transition-colors duration-200">

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Home
          </Link>
          <span className="text-gray-200 dark:text-gray-700 flex-shrink-0">/</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0">
            System Architecture Map
          </span>
          {activeMeta && (
            <>
              <span className="text-gray-200 dark:text-gray-700 flex-shrink-0">/</span>
              <button
                onClick={activeModule ? backToService : backToSystem}
                style={{ color: activeMeta.color }}
                className="text-sm font-medium flex-shrink-0 hover:opacity-70 transition-opacity"
              >
                {activeMeta.label}
              </button>
              {activeModLabel && (
                <>
                  <span className="text-gray-200 dark:text-gray-700 flex-shrink-0">/</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0">
                    {activeModLabel}
                  </span>
                </>
              )}
              <button
                onClick={activeModule ? backToService : backToSystem}
                className="ml-1 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1 flex-shrink-0"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
                {activeModule ? `Back to ${activeMeta.label}` : 'Back to overview'}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {!activeService && (
            <p className="text-xs text-gray-400 dark:text-gray-600 hidden sm:block">
              Click any service to explore its internals
            </p>
          )}
          {activeService && !activeModule && (
            <p className="text-xs text-gray-400 dark:text-gray-600 hidden sm:block">
              Click a highlighted module to drill deeper
            </p>
          )}
          <button
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle dark mode"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {dark ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          key={activeModule ?? activeService ?? 'system'}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          colorMode={dark ? 'dark' : 'light'}
          minZoom={0.15}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={dark ? '#374151' : '#e5e7eb'}
          />
          <Controls showInteractive={false} />
          {showMinimap && (
            <MiniMap
              nodeColor={(node) =>
                node.type === 'service'
                  ? (SERVICE_META[node.data.id]?.color ?? '#64748b')
                  : (node.data.color ?? '#64748b')
              }
              maskColor={dark ? '#111827cc' : '#f9fafbcc'}
              style={{ border: 'none' }}
            />
          )}
          <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 5 }}>
            <button
              onClick={() => setShowMinimap((v) => !v)}
              title={showMinimap ? 'Hide minimap' : 'Show minimap'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
            </button>
          </div>
        </ReactFlow>
      </div>
    </div>
  )
}
