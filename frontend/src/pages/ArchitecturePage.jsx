import { useState, useCallback } from 'react'
import InfoPageLayout from '../components/InfoPageLayout'
import MermaidDiagram from '../components/MermaidDiagram'
import LightboxModal from '../components/LightboxModal'

// ── Diagram definitions ───────────────────────────────────────────────────────

const DIAGRAM_SYSTEM_OVERVIEW = `
graph TD
    Browser["Browser<br/>React + Vite + Tailwind"]
    Backend["Backend<br/>Spring Boot · Java 17"]
    Worker["Worker<br/>Spring Boot · Java 17"]
    AIService["AI Service<br/>FastAPI · Python 3.12"]
    Supabase["Supabase<br/>Auth · PostgreSQL · Storage"]
    RabbitMQ["RabbitMQ"]
    Redis["Redis"]
    Gemini["Gemini 2.5 Flash"]

    Browser -->|"HTTPS · Bearer JWT ES256"| Backend
    Browser -->|"Google OAuth · auth state"| Supabase
    Backend -->|"upsert user · save results"| Supabase
    Backend -->|"upload PDF"| Supabase
    Backend -->|"Bucket4j rate limiting"| Redis
    Backend -->|"document.processing"| RabbitMQ
    RabbitMQ -->|"consume"| Worker
    Worker -->|"document.processed"| RabbitMQ
    RabbitMQ -->|"consume"| Backend
    Worker -->|"HTTP · X-Internal-Api-Key"| AIService
    AIService -->|"idempotency cache"| Redis
    AIService -->|"LLM API calls"| Gemini
`

const DIAGRAM_AUTH = `
sequenceDiagram
    participant Browser
    participant Supabase as Supabase Auth
    participant Google as Google OAuth
    participant Spring as Spring Filter Chain
    participant JWKS as Supabase JWKS Endpoint
    participant JWKCache as JWK Cache 15min
    participant Nimbus as Nimbus JWT Processor
    participant Converter as supabaseConverter
    participant MDC as MDC thread-local
    participant Controller

    Note over Browser,Google: Login flow - backend not involved

    Browser->>Supabase: Click Login with Google
    Supabase->>Browser: Redirect to Google consent screen
    Browser->>Google: User approves
    Google->>Supabase: Authorization code
    Supabase->>Supabase: Exchange code, verify identity
    Supabase->>Supabase: Sign JWT with ES256 private key
    Note over Supabase: JWT contains sub and email
    Supabase->>Browser: JWT issued
    Note over Browser: Frontend stores JWT via Supabase JS client

    Note over Browser,Controller: Every subsequent authenticated request

    Browser->>Spring: GET /api/v1/documents<br/>Authorization: Bearer eyJ...

    Note over Spring: CorrelationIdFilter first

    Note over Spring: BearerTokenAuthenticationFilter
    Spring->>Spring: Extract JWT from Authorization header

    Note over Spring,JWKCache: Key resolution
    alt Cache hit
        Spring->>JWKCache: get public key
        JWKCache-->>Nimbus: ES256 public key
    else Cache miss or 5min refresh
        JWKCache->>JWKS: GET /auth/v1/.well-known/jwks.json
        JWKS-->>JWKCache: public keys
        JWKCache-->>Nimbus: ES256 public key
    end

    Note over Nimbus: Cryptographic verification
    Nimbus->>Nimbus: Verify ES256 signature
    Nimbus->>Nimbus: Validate exp and nbf claims

    alt Invalid token
        Nimbus-->>Browser: 401 application/problem+json
    else Valid token
        Nimbus-->>Converter: Verified JWT claims
        Note over Converter: Extract sub and email
        Converter->>Converter: new AuthenticatedUser(sub, email)
        Converter->>Spring: SecurityContext populated

        Note over Spring: SupabaseJwtFilter after BearerTokenAuthenticationFilter
        Spring->>MDC: put userId supabaseId

        Spring->>Controller: request + AuthenticatedUser principal
        Controller-->>Browser: 200 response
    end
`

const DIAGRAM_PIPELINE = `
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant RMQ as RabbitMQ
    participant W as Worker
    participant AI as AI Service
    participant G as Gemini

    F->>B: POST /api/v1/documents (multipart PDF)
    B->>B: Rate check (Bucket4j + Redis, 10/hr/user)
    B->>B: Resolve Supabase user → local User entity
    B->>B: Upload PDF to Supabase Storage
    B->>B: INSERT Document (status=PENDING)
    B->>RMQ: Publish document.processing (correlationId embedded)
    B-->>F: 201 Created

    RMQ->>W: Deliver message (QoS=2, publisher confirms)
    W->>RMQ: Publish status event (IN_PROGRESS)
    W->>W: Download PDF via WebClient (5 min timeout)
    W->>W: Extract text with Apache PDFBox

    par Concurrent via Mono.zip
        W->>AI: POST /ai/summarize
    and
        W->>AI: POST /ai/flashcards
    and
        W->>AI: POST /ai/quiz
    end

    AI->>G: Gemini API calls (Redis idempotency per document_id)
    G-->>AI: LLM responses
    AI-->>W: summary · flashcards · quiz

    W->>RMQ: Publish document.processed (DONE, publisher confirms)
    W->>RMQ: ACK original message
    RMQ->>B: Deliver result message
    B->>B: INSERT summary, flashcards, quiz_questions
    B->>B: UPDATE Document (status=DONE)

    F->>B: GET /api/v1/documents/:id (3-second polling)
    B-->>F: status=DONE + all results
`

const DIAGRAM_CORRELATION = `
flowchart LR
    subgraph Backend["Backend (Java)"]
        B1["Generate UUID<br/>correlationId"]
        B2["MDC.put(correlationId)<br/>every log line carries it"]
        B3["Embed in message body<br/>DocumentProcessingMessage"]
    end

    subgraph Queue["RabbitMQ"]
        Q["document.processing<br/>{ correlationId: 'abc-123' }"]
    end

    subgraph Worker["Worker (Java)"]
        W1["Extract from message<br/>MDC.put(correlationId)"]
        W2["Pass to AiServiceClient<br/>X-Correlation-Id header"]
    end

    subgraph AIService["AI Service (Python)"]
        A1["CorrelationIdMiddleware<br/>correlation_id_var.set(id)"]
        A2["CorrelationIdFilter<br/>inject into every log record"]
    end

    B1 --> B2 --> B3 --> Q --> W1 --> W2 --> A1 --> A2
`

const DIAGRAM_IDEMPOTENCY = `
flowchart TD
    Start["POST /ai/summarize<br/>{ document_id, text }"]
    Check{"Redis lookup<br/>op:summarize:doc-id"}
    Hit["Return cached result<br/>No Gemini call · No extra cost"]
    Gemini["Call Gemini API<br/>LangChain chain.invoke()"]
    Store["Cache result in Redis<br/>TTL: 24 hours"]
    Response["Return result to Worker"]

    Start --> Check
    Check -->|"HIT"| Hit
    Check -->|"MISS"| Gemini
    Gemini --> Store
    Store --> Response
`

const DIAGRAM_RATE_LIMIT = `
flowchart TD
    Req["POST /api/v1/documents<br/>Bearer JWT → userId extracted"]
    RLS["RateLimitService<br/>Bucket4j ConsumptionProbe"]
    Lua["Redis Lua Script<br/>Atomic check-and-decrement<br/>token bucket keyed on userId"]
    Allow["Continue upload pipeline<br/>token consumed"]
    Reject["HTTP 429 Too Many Requests<br/>Retry-After header returned"]

    Req --> RLS
    RLS -->|"tryConsume(1)"| Lua
    Lua -->|"token available"| Allow
    Lua -->|"bucket empty — > 10/hr"| Reject
`

const DIAGRAM_DLQ = `
flowchart TD
    Msg["Message from document.processing<br/>QoS=2 prefetch"]
    Process["Worker pipeline<br/>download + extract + AI calls"]
    OK{"Success?"}
    Ack["Publish document.processed DONE<br/>ACK original message"]
    Attempts{"Retry<br/>attempts < 3?"}
    Backoff["Exponential backoff<br/>1s → 2s → 4s<br/>retryWhen operator"]
    Publish["Publish FAILED result<br/>to document.processed"]
    NACK["NACK original message<br/>requeue = false"]
    DLQ["document.processing.dlq<br/>Dead Letter Queue"]
    Backend["Backend saves<br/>Document(status=FAILED)"]

    Msg --> Process
    Process --> OK
    OK -->|"yes"| Ack
    OK -->|"no"| Attempts
    Attempts -->|"yes"| Backoff
    Backoff --> Process
    Attempts -->|"no — exhausted"| Publish
    Publish --> NACK
    NACK --> DLQ
    Publish --> Backend
`

// ── Diagram card component ────────────────────────────────────────────────────

function DiagramCard({ title, description, definition, onOpen }) {
  return (
    <section className="mb-14">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{description}</p>
      )}
      <button
        onClick={onOpen}
        className="w-full text-left bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex justify-center relative group hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-zoom-in"
        aria-label={`Open ${title} diagram fullscreen`}
      >
        <MermaidDiagram definition={definition} />
        {/* Fullscreen hint badge */}
        <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Click to expand
        </span>
      </button>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const DIAGRAMS = [
  {
    title: 'System Overview',
    description: 'All four services and the external infrastructure they communicate with. The browser is the only public entry point — all service-to-service communication is internal.',
    definition: DIAGRAM_SYSTEM_OVERVIEW,
  },
  {
    title: 'Authentication & JWT Validation',
    description: 'Google OAuth handled entirely by Supabase. The backend validates ES256 tokens using only the public JWKS key — the signing secret never leaves Supabase.',
    definition: DIAGRAM_AUTH,
  },
  {
    title: 'Document Processing Pipeline',
    description: 'From PDF upload to completed study materials. The three AI calls (summarize, flashcards, quiz) are fired concurrently via Reactor\'s Mono.zip — total latency equals the slowest call, not their sum.',
    definition: DIAGRAM_PIPELINE,
  },
  {
    title: 'Correlation ID Tracing',
    description: 'A UUID generated at upload time travels through every service. Without OpenTelemetry, this gives end-to-end log traceability across Java and Python services.',
    definition: DIAGRAM_CORRELATION,
  },
  {
    title: 'Redis Idempotency — AI Service',
    description: 'Each AI operation is cached by (operation, document_id). Worker retries and DLQ replays return the cached result without a second Gemini call — no duplicate cost, no duplicate content.',
    definition: DIAGRAM_IDEMPOTENCY,
  },
  {
    title: 'Rate Limiting — Bucket4j + Redis',
    description: 'Token bucket state lives in Redis, not JVM heap. The consume operation executes as a Lua script — atomically on the Redis server — making it correct under horizontal scaling.',
    definition: DIAGRAM_RATE_LIMIT,
  },
  {
    title: 'Dead Letter Queue & Retry',
    description: 'Failed messages are retried three times with exponential backoff via Reactor\'s retryWhen operator. After exhaustion, a FAILED result is published to the backend and the original message is nacked to the DLQ for operator replay.',
    definition: DIAGRAM_DLQ,
  },
]

export default function ArchitecturePage() {
  const [lightbox, setLightbox] = useState(null)
  const closeLightbox = useCallback(() => setLightbox(null), [])

  return (
    <InfoPageLayout title="Architecture">
      <div className="max-w-none">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Architecture Diagrams
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-12">
          Visual overview of every major system flow — rendered client-side with Mermaid.js.
          Click any diagram to expand it fullscreen with zoom and pan.
        </p>

        {DIAGRAMS.map((d) => (
          <DiagramCard
            key={d.title}
            title={d.title}
            description={d.description}
            definition={d.definition}
            onOpen={() => setLightbox(d)}
          />
        ))}
      </div>

      {lightbox && (
        <LightboxModal
          title={lightbox.title}
          definition={lightbox.definition}
          onClose={closeLightbox}
        />
      )}
    </InfoPageLayout>
  )
}
