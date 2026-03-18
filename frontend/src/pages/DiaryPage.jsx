import InfoPageLayout from '../components/InfoPageLayout'

function Entry({ date, title, children }) {
  return (
    <div className="relative pl-8 pb-12 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-0 top-2 bottom-0 w-px bg-gray-100 dark:bg-gray-800 last:hidden" />
      {/* Timeline dot */}
      <div className="absolute left-[-4px] top-2 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-gray-950" />

      <div className="mb-1">
        <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400 uppercase tracking-wide">{date}</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      <div className="text-gray-600 dark:text-gray-400 text-sm space-y-3">{children}</div>
    </div>
  )
}

function Tag({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 mr-1.5 mb-1">
      {children}
    </span>
  )
}

export default function DiaryPage() {
  return (
    <InfoPageLayout title="Development Diary">
      <div className="max-w-none">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Development Diary</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">
          A behind-the-scenes look at how this project was built — from blank repo to production deployment
          in three days.
        </p>
        <div className="mb-10 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-white">Portfolio context.</strong> This project was built
          as a portfolio piece to demonstrate enterprise-level architectural thinking. The goal was never just
          "make something that works" — it was to make every decision defensible in a senior engineering interview.
          AI tooling (Claude Code) was used throughout. That's not a shortcut; it's the way modern senior engineers work.
        </div>

        <div className="mt-8">
          {/* Day 1 */}
          <Entry date="2026-03-16 — Day 1" title="Planning & Architecture">
            <p>
              No code was written on day one. The entire day was spent on architecture. Every major decision
              was thought through before a single file was created — because retroactively changing the
              messaging topology or the auth model would cascade into every service.
            </p>
            <p>
              The core questions answered on day 1:
            </p>
            <ul className="list-none space-y-1.5 pl-0">
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">How many services?</strong> Four. Frontend, backend, worker, AI service. Each with a single responsibility and no shared code.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">Who writes to the database?</strong> The backend only. The worker never touches the DB — it publishes results back onto a queue. This single writer principle eliminates dual-write consistency problems entirely.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">How do services communicate?</strong> Two RabbitMQ queues: <code className="text-indigo-600 dark:text-indigo-400 text-xs">document.processing</code> (backend → worker) and <code className="text-indigo-600 dark:text-indigo-400 text-xs">document.processed</code> (worker → backend). Plus a dead-letter queue after 3 retries.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">How does auth work?</strong> Supabase Google OAuth issues ES256 JWTs. The backend validates them via JWKS (public key only — zero-trust). Key rotation is automatic.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">How do we isolate user data?</strong> Supabase Row-Level Security on every table. No service-level filtering — isolation enforced at the database engine level.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">How do we trace requests across services?</strong> A <code className="text-indigo-600 dark:text-indigo-400 text-xs">correlationId</code> UUID generated at upload time, embedded in the queue message, and injected into MDC by every service — manual distributed tracing without OpenTelemetry.</span></li>
            </ul>
            <p>
              The output of day 1 was <code className="text-xs text-indigo-600 dark:text-indigo-400">plan.md</code>: a detailed architecture document
              that acted as the spec for the next two days of implementation. Claude Code was used as a
              sounding board and co-author for the plan — asking "what happens if RabbitMQ is down during
              publish?" is exactly the kind of question that surfaces the need for a connection timeout.
            </p>
            <div className="flex flex-wrap">
              <Tag>Architecture</Tag>
              <Tag>RabbitMQ topology</Tag>
              <Tag>Single writer principle</Tag>
              <Tag>Zero-trust JWT</Tag>
              <Tag>RLS</Tag>
            </div>
          </Entry>

          {/* Day 2 */}
          <Entry date="2026-03-17 — Day 2" title="Implementation — Git Worktrees & Parallel Development">
            <p>
              Day 2 was implementation. The challenge: four services, each complex enough to require focused
              attention, but with enough independence to build in parallel. The solution was <strong className="text-gray-800 dark:text-gray-200">Git worktrees</strong>.
            </p>
            <p>
              Git worktrees allow multiple working trees to be attached to the same repository simultaneously.
              Each worktree checks out a different branch and has its own working directory — so you can have
              <code className="text-xs text-indigo-600 dark:text-indigo-400"> worktree-backend</code>,
              <code className="text-xs text-indigo-600 dark:text-indigo-400"> worktree-worker</code>, and
              <code className="text-xs text-indigo-600 dark:text-indigo-400"> worktree-frontend</code> all
              open at the same time, each on their own branch, without stashing or switching.
            </p>
            <p>
              Claude Code was used to spawn <strong className="text-gray-800 dark:text-gray-200">parallel subagents</strong> — each agent
              running in its own worktree, working on a separate service concurrently. One agent built the
              Spring Boot backend while another built the worker, while another scaffolded the FastAPI AI
              service. This is Claude Code's multi-agent architecture: a parent agent orchestrates child
              agents, each of which has its own context window and tool access.
            </p>
            <p>Key work on day 2:</p>
            <ul className="list-none space-y-1.5 pl-0">
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">Backend</strong> — Spring Security JWKS config, upload endpoint, rate limiting with Bucket4j+Redis, Liquibase migrations, RabbitMQ producer, DocumentProcessedConsumer, GlobalExceptionHandler (RFC 7807 Problem Details).</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">Worker</strong> — RabbitMQ consumer, PDFBox text extraction, WebClient for AI service calls, Spring Retry with exponential backoff, dead-letter queue configuration.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">AI Service</strong> — FastAPI endpoints, LangChain prompt management, Gemini 2.5 Flash integration, map-reduce chunking for long documents, Langfuse tracing, internal API key middleware.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">Frontend</strong> — React + Vite scaffold, Zustand auth store, Supabase OAuth flow, Axios with JWT interceptor, TanStack Query data fetching with 3-second polling, Dashboard, Upload, and Document pages.</span></li>
              <li className="flex gap-2"><span className="text-indigo-500 font-bold flex-shrink-0">→</span><span><strong className="text-gray-800 dark:text-gray-200">Infrastructure</strong> — Docker Compose for local stack, Dockerfiles for all four services, Railway config (<code className="text-xs">railway.toml</code>) for each service.</span></li>
            </ul>
            <p>
              Worktrees were merged back into <code className="text-xs text-indigo-600 dark:text-indigo-400">main</code> at end of day
              after resolving integration conflicts — primarily around environment variable naming consistency
              and RabbitMQ queue/exchange naming that had to match across both Spring Boot services.
            </p>
            <div className="flex flex-wrap">
              <Tag>Git worktrees</Tag>
              <Tag>Claude Code multi-agent</Tag>
              <Tag>Spring Boot</Tag>
              <Tag>FastAPI</Tag>
              <Tag>React</Tag>
              <Tag>Docker</Tag>
            </div>
          </Entry>

          {/* Day 3 */}
          <Entry date="2026-03-18 — Day 3" title="Debugging, Polish & Deployment">
            <p>
              Day 3 was the hardest day — not because of new features, but because of the kind of bugs that
              only appear when all four services are running together for the first time.
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Bug 1: Uploads hanging with no network request.</strong></p>
            <p>
              The upload mutation showed <code className="text-xs">isPending: true</code> but the browser
              Network tab was empty — Axios never sent the HTTP request. Root cause: the request interceptor
              called <code className="text-xs text-indigo-600 dark:text-indigo-400">supabase.auth.getSession()</code> (async) to get
              the JWT. When Supabase's token refresh was in flight, this call hung indefinitely,
              blocking the interceptor and silently preventing the request from being dispatched.
              Fix: read the session synchronously from Zustand store instead.
              This is now documented in the architecture as a non-obvious decision.
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Bug 2: Sign-out bouncing back to dashboard.</strong></p>
            <p>
              After clicking Sign Out, the user was briefly redirected to the landing page and then
              immediately bounced back to <code className="text-xs">/dashboard</code>. Cause: Zustand state was cleared
              <em> after</em> <code className="text-xs text-indigo-600 dark:text-indigo-400">supabase.auth.signOut()</code> — but LandingPage's
              <code className="text-xs"> useEffect</code> ran during the navigation and saw a non-null <code className="text-xs">user</code>
              in the store, redirecting back. Fix: clear Zustand state <em>first</em>, then call <code className="text-xs">signOut()</code>.
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Bug 3: "Unhandled exception" on concurrent auth/sync.</strong></p>
            <p>
              Backend logs showed "Unhandled exception: DataIntegrityViolationException" when two
              <code className="text-xs"> POST /api/v1/auth/sync</code> calls raced and both tried to insert the same user.
              The unique constraint on <code className="text-xs">supabase_user_id</code> caught the second insert, but
              the exception fell through to the generic handler and returned 500. Fix: explicit handler
              returning 409 Conflict.
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Bug 4: ES256 JWT validation failure.</strong></p>
            <p>
              The backend was originally configured with an HS256 shared secret for JWT validation.
              Supabase issues ES256 tokens — a completely different algorithm. Fix: switched to JWKS
              discovery via the Supabase public JWKS endpoint, which is the correct zero-trust approach
              anyway (no shared secret required).
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Deployment.</strong></p>
            <p>
              All four services deployed to Railway. Railway's monorepo support allowed each service to be
              configured with its own subdirectory build context — the frontend Dockerfile is in
              <code className="text-xs"> frontend/</code>, the backend in <code className="text-xs">backend/</code>, and so on.
              Environment variables (Supabase keys, RabbitMQ credentials, Redis URL, internal API keys)
              were injected via Railway's environment variable UI — nothing is committed to source control.
            </p>

            <p><strong className="text-gray-800 dark:text-gray-200">Polish.</strong></p>
            <p>
              Once the pipeline was confirmed working end-to-end, Claude Code was used to add the final
              polish: dark mode across all pages (Tailwind v4 class-based, <code className="text-xs">useDarkMode</code> hook,
              localStorage persistence), landing page cleanup (removed feature section, replaced
              with hero-only layout), comprehensive documentation (README, architecture summary, core summary),
              and these three public information pages.
            </p>

            <div className="flex flex-wrap">
              <Tag>Railway deployment</Tag>
              <Tag>Bug fixes</Tag>
              <Tag>Dark mode</Tag>
              <Tag>Documentation</Tag>
              <Tag>JWKS / ES256</Tag>
            </div>
          </Entry>
        </div>

        {/* Reflections */}
        <div className="mt-14 pt-10 border-t border-gray-100 dark:border-gray-800">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Reflections</h2>
          <div className="space-y-4 text-gray-600 dark:text-gray-400 text-sm">
            <p>
              <strong className="text-gray-800 dark:text-gray-200">On using Claude Code.</strong> AI coding tools
              don't replace engineering judgment — they amplify it. The architectural decisions (single writer,
              zero-trust JWT, distributed rate limiting) came from understanding the problem. Claude Code
              translated those decisions into working code faster than typing alone, and was particularly
              valuable for the boilerplate-heavy parts of Spring Boot (security config, exception handlers,
              Liquibase migrations). The parallel worktree approach — one agent per service — is probably
              the most productive pattern for building multi-service systems from scratch.
            </p>
            <p>
              <strong className="text-gray-800 dark:text-gray-200">What I'd do differently.</strong> Add
              Playwright E2E tests from day one. Integration bugs (the JWT interceptor hang, the sign-out
              race) only surfaced during manual testing. A proper E2E suite against the dev auth bypass
              would catch these before they reach a real debugging session.
            </p>
            <p>
              <strong className="text-gray-800 dark:text-gray-200">What I'd add next.</strong> OpenTelemetry +
              Jaeger to replace the manual correlationId/MDC approach. A proper CI pipeline (GitHub Actions
              running Testcontainers integration tests on push). Playwright E2E tests using the dev auth
              bypass mode that was built as part of the debugging infrastructure.
            </p>
          </div>
        </div>
      </div>
    </InfoPageLayout>
  )
}
