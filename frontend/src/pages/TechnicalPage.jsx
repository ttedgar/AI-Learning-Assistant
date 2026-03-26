import InfoPageLayout from '../components/InfoPageLayout'

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

function DecisionCard({ title, impl, why }) {
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-5 space-y-2">
      <p className="font-semibold text-gray-900 dark:text-white text-sm">{title}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">Impl</span>
        {impl}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">Why</span>
        {why}
      </p>
    </div>
  )
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto font-mono leading-relaxed">
      {children}
    </pre>
  )
}

export default function TechnicalPage() {
  return (
    <InfoPageLayout title="Technical Information">
      <div className="max-w-none">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Technical Information</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-12">
          Architecture, design decisions, and the reasoning behind them.
        </p>

        {/* Overview */}
        <Section title="System Overview">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            AI Learning Assistant is a four-service microservice platform. Each service is independently deployed
            on Railway, communicates over HTTP or RabbitMQ, and has no shared code with the others.
          </p>
          <CodeBlock>{`Browser (React SPA)
     │  HTTPS — Bearer JWT (ES256)
     ▼
Backend (Spring Boot)          ← sole DB writer, auth gateway, rate limiter
     │ publishes                   │ consumes
     ▼                             ▼
document.processing         document.processed
(RabbitMQ queue)            (RabbitMQ queue)
     │                             │
     ▼                             │
Worker (Spring Boot)  ────────────┘
  PDFBox + WebClient
     │  HTTP  X-Internal-Api-Key
     ▼
AI Service (Python FastAPI)
  LangChain + OpenRouter (free tier) + Langfuse`}</CodeBlock>
        </Section>

        {/* Services */}
        <Section title="Services">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Frontend — React + Vite + Tailwind v4</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li><strong className="text-gray-800 dark:text-gray-200">Auth state</strong> — Zustand store. On Google OAuth sign-in, Supabase fires <code className="text-indigo-600 dark:text-indigo-400 text-xs">onAuthStateChange</code>, which calls <code className="text-xs text-indigo-600 dark:text-indigo-400">POST /api/v1/auth/sync</code> to upsert the user in the backend DB, then stores the session in Zustand.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Axios interceptor</strong> — reads the JWT <em>synchronously</em> from <code className="text-xs text-indigo-600 dark:text-indigo-400">useAuthStore.getState()</code>. This is a deliberate choice: calling <code className="text-xs text-indigo-600 dark:text-indigo-400">supabase.auth.getSession()</code> (async) inside the interceptor can block indefinitely during a token refresh, silently preventing any request from being sent.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Data fetching</strong> — TanStack Query. Documents in <code className="text-xs">PENDING</code> or <code className="text-xs">IN_PROGRESS</code> state trigger 3-second polling. Completed documents use 30-second stale time.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Routing</strong> — React Router. <code className="text-xs text-indigo-600 dark:text-indigo-400">ProtectedRoute</code> reads the Zustand <code className="text-xs">loading</code> flag to prevent a flash-redirect to the landing page during session hydration.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Dark mode</strong> — Class-based Tailwind v4 dark mode (<code className="text-xs">@variant dark</code>). A <code className="text-xs text-indigo-600 dark:text-indigo-400">useDarkMode</code> hook reads <code className="text-xs">localStorage</code> and <code className="text-xs">prefers-color-scheme</code> on init, toggles the <code className="text-xs">.dark</code> class on <code className="text-xs">&lt;html&gt;</code>, and persists the preference.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Sign-out order</strong> — Zustand state is cleared <em>before</em> calling <code className="text-xs text-indigo-600 dark:text-indigo-400">supabase.auth.signOut()</code>. Reversing this causes a race: LandingPage's <code className="text-xs">useEffect</code> sees a non-null user during navigation and bounces back to <code className="text-xs">/dashboard</code>.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Backend — Spring Boot 3.4, Java 21</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li><strong className="text-gray-800 dark:text-gray-200">Virtual threads</strong> — Spring Boot 3.4 on Java 21 with <code className="text-xs text-indigo-600 dark:text-indigo-400">spring.threads.virtual.enabled=true</code>. Every HTTP request and <code className="text-xs">@Async</code> task runs on a virtual thread — no thread pool tuning, no blocking-I/O bottlenecks under high concurrency. Production note: monitor for pinned carriers when using <code className="text-xs">synchronized</code> blocks with blocking calls inside.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Security</strong> — Spring Security OAuth2 Resource Server. JWT validation uses Nimbus with Supabase's public JWKS endpoint (ES256). The backend never holds the signing secret — only the public key is used. JWKS responses are cached for 15 minutes and refreshed every 5 minutes.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">JWT mapping</strong> — A custom <code className="text-xs text-indigo-600 dark:text-indigo-400">Converter&lt;Jwt, AuthenticatedUser&gt;</code> extracts the <code className="text-xs">sub</code> and <code className="text-xs">email</code> claims and returns a typed principal used throughout the application layer.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Upload flow</strong> — Rate check → resolve local user → upload to Supabase Storage (WebClient) → <code className="text-xs">INSERT Document(status=PENDING)</code> → publish <code className="text-xs">DocumentProcessingMessage</code> to <code className="text-xs">document.processing</code> with a <code className="text-xs">correlationId</code>.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Rate limiting</strong> — Redis-backed Bucket4j token bucket. 10 uploads/hour/user. Lua script executes the consume-or-reject operation atomically on the Redis server, making it correct under horizontal scaling. State lives in Redis, not in JVM heap.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Consumer</strong> — <code className="text-xs text-indigo-600 dark:text-indigo-400">DocumentProcessedConsumer</code> listens on <code className="text-xs">document.processed</code>, saves summary, flashcards, and quiz, then updates document status to <code className="text-xs">DONE</code> or <code className="text-xs">FAILED</code>.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Error handling</strong> — <code className="text-xs text-indigo-600 dark:text-indigo-400">@RestControllerAdvice</code> returns RFC 7807 Problem Details (<code className="text-xs">application/problem+json</code>) for all exceptions. Concurrent auth/sync inserts that hit the unique constraint return 409 Conflict rather than 500.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Database</strong> — PostgreSQL via Supabase. Liquibase manages schema migrations (versioned, auditable). Hibernate with <code className="text-xs">ddl-auto: validate</code> — it checks the schema matches the entities but never modifies it. Quiz options stored as JSONB, mapped via <code className="text-xs">@JdbcTypeCode(SqlTypes.JSON)</code>.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">RabbitMQ timeout</strong> — <code className="text-xs">connection-timeout: 5000ms</code> on RabbitTemplate. Without this, <code className="text-xs">convertAndSend()</code> blocks the HTTP thread indefinitely when the broker is unavailable. With it, the upload fails fast and returns 500 within 5 seconds.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Worker — Spring Boot 3.4, Java 21</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li><strong className="text-gray-800 dark:text-gray-200">Virtual threads</strong> — Also running on Java 21 virtual threads. The reactive <code className="text-xs">reactor-rabbitmq</code> pipeline is non-blocking by nature, but virtual threads benefit the WebClient-based PDF download and AI service calls that park on I/O.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Single writer principle</strong> — The worker never touches the database. All results are published to <code className="text-xs">document.processed</code> and the backend commits them. One service owns all writes, eliminating dual-write consistency problems.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Flow</strong> — Reactive consumer (reactor-rabbitmq) on <code className="text-xs">document.processing</code> → publish <code className="text-xs">IN_PROGRESS</code> status → download PDF (WebClient) → extract text (Apache PDFBox) → call AI service concurrently via <code className="text-xs">Mono.zip</code> (summary + flashcards + quiz in parallel) → publish <code className="text-xs">DocumentProcessedMessage</code> with publisher confirms.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Resilience</strong> — Reactor <code className="text-xs">retryWhen</code>: 3 attempts with exponential backoff. After exhaustion, a FAILED result is published to <code className="text-xs">document.processed</code> and the original message is nacked to <code className="text-xs">document.processing.dlq</code> via a dead-letter exchange. Operations can replay messages from the DLQ after fixing the root cause.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Publisher confirms</strong> — All outbound publishes use <code className="text-xs">sendWithPublishConfirms</code>, which waits for the broker's ack before the pipeline continues. The processing message is only acked after the result is durably received by the broker — eliminating the data-loss window of fire-and-forget publishing.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Internal auth</strong> — All requests to the AI service include an <code className="text-xs">X-Internal-Api-Key</code> header and a <code className="text-xs">X-Correlation-Id</code> header for end-to-end tracing. Production equivalent: mutual TLS between services.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">AI Service — Python 3.12, FastAPI</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li><strong className="text-gray-800 dark:text-gray-200">LLM provider</strong> — Uses OpenRouter's free tier (<code className="text-xs">openrouter/free</code>), which routes requests to a randomly selected free model (e.g., Llama 3.1 8B, Mistral 7B). The model varies per request — acceptable for a portfolio project, but production would pin a specific model for deterministic output quality.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">DIP at architecture level</strong> — The worker depends on this service's HTTP interface, not on any LLM SDK directly. This was proven in practice: the LLM provider was migrated from Gemini to OpenRouter with zero changes to the worker or backend — only the AI service was modified. The architectural boundary held exactly as designed.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Endpoints</strong> — <code className="text-xs text-indigo-600 dark:text-indigo-400">POST /ai/summarize</code>, <code className="text-xs text-indigo-600 dark:text-indigo-400">POST /ai/flashcards</code>, <code className="text-xs text-indigo-600 dark:text-indigo-400">POST /ai/quiz</code>. All protected by <code className="text-xs">X-Internal-Api-Key</code> middleware.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Long documents</strong> — Text above 60,000 characters is chunked (50K char chunks) and processed via LangChain map-reduce: each chunk is summarised separately, then all partial summaries are reduced into one. This avoids hitting the model's context window limit.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Redis idempotency</strong> — Each AI operation is cached by <code className="text-xs">(operation, document_id)</code> with a 24-hour TTL. Worker retries and DLQ replays return the cached result without a second LLM call — no duplicate cost, no duplicate content.</li>
                <li><strong className="text-gray-800 dark:text-gray-200">Observability</strong> — Langfuse traces every LLM call: prompt version, model, input tokens, output tokens, latency, response. Prompts are fetched from the Langfuse dashboard at runtime, with hardcoded fallbacks if the fetch fails.</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Message flow */}
        <Section title="Message Flow">
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            The core of the system is a message-driven pipeline. HTTP is used only at the edges (user → backend,
            worker → AI service). The backend-to-worker and worker-to-backend paths are fully asynchronous via RabbitMQ.
          </p>
          <CodeBlock>{`POST /api/v1/documents  (multipart PDF)
  ├─ rate limit check   (Redis/Bucket4j, 10/hr/user)
  ├─ resolveUser        (supabaseUserId → local User entity)
  ├─ upload PDF         (Supabase Storage, WebClient)
  ├─ INSERT document    (status=PENDING)
  └─ publish ──────────► document.processing queue
                               │
                         Worker reactive consumer (reactor-rabbitmq, QoS=2)
                         ├─ publish ──────────► document.status queue (IN_PROGRESS)
                         ├─ download PDF      (WebClient)
                         ├─ PDFBox text extract
                         ├─ Mono.zip (concurrent):
                         │    ├─ POST /ai/summarize
                         │    ├─ POST /ai/flashcards
                         │    └─ POST /ai/quiz
                         └─ publish ──────────► document.processed queue (publisher confirms)
                                                       │
                                                Backend consumer
                                                ├─ INSERT summary
                                                ├─ INSERT flashcards[]
                                                ├─ INSERT quiz_questions[]
                                                └─ UPDATE document status=DONE

Dead-letter path:
  After 3 retryWhen attempts → publish FAILED result → nack → document.processing.dlq`}</CodeBlock>
        </Section>

        {/* Key decisions */}
        <Section title="Key Design Decisions">
          <div className="grid gap-4 sm:grid-cols-2">
            <DecisionCard
              title="Single Writer Principle"
              impl="Worker publishes results back to document.processed; backend is the sole DB writer."
              why="Eliminates dual-write consistency problems. One service owns all database state — no split-brain, no partial write scenarios."
            />
            <DecisionCard
              title="Zero-Trust JWT Validation"
              impl="Backend validates ES256 tokens using Supabase's public JWKS endpoint. The signing secret is never held server-side."
              why="Key rotation is automatic — Supabase rotates keys, the backend picks them up via the 5-minute JWKS cache refresh without any deployment."
            />
            <DecisionCard
              title="Distributed Rate Limiting"
              impl="Bucket4j token bucket, state in Redis, consume operation executed as a Lua script."
              why="Lua scripts execute atomically on the Redis server — no race conditions under horizontal scaling. All JVM replicas share one consistent rate limit state."
            />
            <DecisionCard
              title="DIP at Architecture Level"
              impl="Worker calls the AI service's HTTP interface. Only the AI service imports the LLM SDK."
              why="Already proven: migrated from Gemini to OpenRouter with zero changes to worker or backend. The DIP boundary held exactly as designed."
            />
            <DecisionCard
              title="CorrelationId Tracing"
              impl="UUID generated at upload time, embedded in the RabbitMQ message, extracted into MDC by the worker, and forwarded to the AI service via X-Correlation-Id header where a Python middleware injects it into every log record."
              why="Every log line across all three services (backend, worker, AI service) carries the same correlationId — end-to-end request tracing without installing OpenTelemetry or Jaeger."
            />
            <DecisionCard
              title="Idempotent Auth/Sync"
              impl="POST /api/v1/auth/sync is a DB upsert. Concurrent inserts hitting the unique constraint return 409 Conflict."
              why="Safe to call on every login. Concurrent requests during session restore don't cause 500 errors or duplicate user rows."
            />
            <DecisionCard
              title="Synchronous JWT Read in Axios"
              impl="Interceptor reads session from Zustand (useAuthStore.getState()) — no async call, no await."
              why="Calling supabase.auth.getSession() in the interceptor triggers async token refresh and can block indefinitely, silently preventing any HTTP request from being sent."
            />
            <DecisionCard
              title="RabbitMQ Publish Timeout"
              impl="connection-timeout: 5000ms on RabbitTemplate."
              why="Without a timeout, convertAndSend() holds the HTTP thread indefinitely when the broker is down. With it, uploads fail fast and return 500 in 5 seconds."
            />
          </div>
        </Section>

        {/* Security */}
        <Section title="Security">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-3 pr-6 text-gray-500 dark:text-gray-400 font-medium">Concern</th>
                  <th className="text-left py-3 text-gray-500 dark:text-gray-400 font-medium">Implementation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                {[
                  ['Frontend → Backend auth', 'Supabase ES256 JWT, validated via JWKS (public key only)'],
                  ['Worker → AI Service auth', 'X-Internal-Api-Key header (production: mTLS)'],
                  ['Row-level data isolation', 'Supabase Row-Level Security — users can only read/write their own rows'],
                  ['Upload rate limiting', 'Redis-backed Bucket4j token bucket, 10 uploads/hr/user'],
                  ['CORS', 'Allowlist of the Railway frontend URL only'],
                  ['File storage', 'Supabase Storage with scoped paths per user'],
                  ['Secret management', 'All secrets injected via Railway environment variables — nothing in source code'],
                ].map(([concern, impl]) => (
                  <tr key={concern}>
                    <td className="py-3 pr-6 text-gray-700 dark:text-gray-300 font-medium align-top">{concern}</td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">{impl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Database */}
        <Section title="Database Schema">
          <CodeBlock>{`users
  id               UUID PRIMARY KEY
  supabase_user_id UUID UNIQUE         -- JWT sub claim
  email            TEXT

documents
  id               UUID PRIMARY KEY
  user_id          UUID REFERENCES users
  title            TEXT
  file_url         TEXT                -- Supabase Storage public URL
  status           TEXT                -- PENDING | IN_PROGRESS | DONE | FAILED
  created_at       TIMESTAMPTZ

summaries
  id               UUID PRIMARY KEY
  document_id      UUID REFERENCES documents ON DELETE CASCADE
  content          TEXT                -- AI-generated markdown

flashcards
  id               UUID PRIMARY KEY
  document_id      UUID REFERENCES documents ON DELETE CASCADE
  question         TEXT
  answer           TEXT

quiz_questions
  id               UUID PRIMARY KEY
  document_id      UUID REFERENCES documents ON DELETE CASCADE
  question         TEXT
  type             TEXT                -- MULTIPLE_CHOICE
  correct_answer   TEXT
  options          JSONB               -- ["a","b","c","d"]`}</CodeBlock>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            Row-Level Security is enabled on all tables. Schema is managed by Liquibase versioned migrations.
            Hibernate runs with <code className="text-xs">ddl-auto: validate</code> — it validates but never modifies the schema.
          </p>
        </Section>

        {/* Observability */}
        <Section title="Observability">
          <ul className="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
            <li>
              <strong className="text-gray-800 dark:text-gray-200">CorrelationId tracing</strong> — Every upload
              generates a UUID. It travels through the RabbitMQ message body, is extracted into SLF4J MDC by the
              worker, and forwarded to the AI service via <code className="text-xs">X-Correlation-Id</code> header
              where a Python middleware stores it in a <code className="text-xs">ContextVar</code> and injects it
              into every log record. Manual distributed tracing across all three services without OpenTelemetry or Jaeger.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Structured logging</strong> — Logback +
              Logstash encoder outputs JSON on all Java services. Fields include <code className="text-xs">correlationId</code>,
              <code className="text-xs"> documentId</code>, <code className="text-xs">userId</code>, log level, timestamp, logger name.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">LLM observability</strong> — Langfuse captures
              every LLM call: prompt version, model ID, input token count, output token count, latency, full response.
              Prompts are versioned and editable in the Langfuse UI without a deployment.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Production path</strong> — Replace manual MDC
              propagation with OpenTelemetry + Jaeger for automatic distributed tracing, spans, and flame graphs.
            </li>
          </ul>
        </Section>

        {/* Tech stack */}
        <Section title="Tech Stack">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-3 pr-6 text-gray-500 dark:text-gray-400 font-medium">Layer</th>
                  <th className="text-left py-3 text-gray-500 dark:text-gray-400 font-medium">Technology</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                {[
                  ['Frontend', 'React 19, Vite, Tailwind CSS v4, Zustand, TanStack Query, React Router, Axios, Supabase JS, @xyflow/react'],
                  ['Backend', 'Java 21 (virtual threads), Spring Boot 3.4, Spring Security, Spring AMQP, Spring Data JPA, Hibernate 6, Liquibase, Bucket4j, Springdoc OpenAPI'],
                  ['Worker', 'Java 21 (virtual threads), Spring Boot 3.4, reactor-rabbitmq, Apache PDFBox, WebFlux (WebClient, Mono.zip)'],
                  ['AI Service', 'Python 3.12, FastAPI, LangChain 0.3, langchain-openai, OpenRouter free tier, Langfuse, Pydantic'],
                  ['Database', 'PostgreSQL (Supabase), RLS, JSONB'],
                  ['Messaging', 'RabbitMQ — direct exchange, 2 queues + dead-letter queue'],
                  ['Cache / Rate limit', 'Redis (Lettuce) + Bucket4j (Lua scripts, atomic token-bucket)'],
                  ['Auth', 'Supabase Auth (Google OAuth), ES256 JWKS'],
                  ['Storage', 'Supabase Storage (S3-compatible)'],
                  ['Hosting', 'Railway — monorepo, 4 independent services, Docker build per subdirectory'],
                  ['Testing', 'JUnit 5, Mockito, Testcontainers (PostgreSQL, RabbitMQ, Redis), Vitest, React Testing Library'],
                ].map(([layer, tech]) => (
                  <tr key={layer}>
                    <td className="py-3 pr-6 text-gray-700 dark:text-gray-300 font-medium align-top whitespace-nowrap">{layer}</td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">{tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </InfoPageLayout>
  )
}
