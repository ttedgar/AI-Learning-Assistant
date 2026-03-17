# AI Learning Assistant — Project Plan

## Architecture Overview

```
frontend (React + Vite + Tailwind)
    ↓ HTTP + Supabase Auth JWT
backend (Spring Boot)
    ↓ publishes → "document.processing" queue
worker (Spring Boot)
    ↓ HTTP (mTLS internal API key)
ai-service (Python FastAPI)
    ↓ HTTP
Gemini API
    ↑ publishes → "document.processed" queue
worker
    ↓ consumes
backend → saves results to DB
```

### Message flow (single writer principle)
```
backend → document.processing → worker → document.processed → backend
```
Backend is both producer and consumer. Worker never touches the DB — results go back via queue. Backend owns all writes.

### Infrastructure
| Service | Platform |
|---|---|
| Auth | Supabase (Google OAuth) |
| File Storage | Supabase Storage |
| Database | Supabase PostgreSQL |
| Message Queue | RabbitMQ (Railway plugin) |
| Rate Limit Cache | Redis (Railway plugin) |
| Hosting | Railway (monorepo, each service deployed independently) |

### Queues
| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `document.processing` | backend | worker | trigger AI processing |
| `document.processed` | worker | backend | save results to DB |
| `document.processing.dlq` | RabbitMQ (auto) | ops/manual replay | failed messages after retries exhausted |

### Tech decisions
| Concern | Choice | Reason |
|---|---|---|
| API versioning | `/api/v1/...` | Explicit, evolvable |
| Error format | RFC 7807 Problem Details | Industry standard, Spring Boot 3 native |
| Logging | JSON via Logback + Logstash encoder | Structured, ingestible by log aggregators |
| Tracing | Manual correlationId + MDC | Full control, great interview story. Production would use OpenTelemetry + Jaeger |
| DB migrations | Liquibase | Versioned, auditable schema changes |
| Frontend state | Zustand | Lightweight, modern, minimal boilerplate |
| Data fetching | TanStack Query | Caching, polling, loading states out of the box |
| Storage comms | WebClient REST | Direct Supabase Storage API, no SDK magic |
| Worker resilience | Retry (x3 exponential backoff) + DLQ | No message ever silently lost |
| Internal security | Internal API key header | Simple, explicit. Production would use mTLS |
| Long documents | Chunk + summarize (map-reduce) | Handles token limits, real RAG pattern |
| Rate limiting | Redis-backed Bucket4j | Works correctly under horizontal scaling |
| UI style | Clean minimal SaaS | Professional, dark sidebar, card-based |
| Testing | JUnit5 + Mockito + Testcontainers + Vitest + RTL | Full pyramid minus E2E (noted as next step) |
| API docs | Springdoc OpenAPI (Swagger UI) | Auto-generated, interactive, zero effort |

### Database Schema

```
users
├── id (uuid)
├── supabase_user_id
└── email

documents
├── id (uuid)
├── user_id
├── title
├── file_url            ← Supabase Storage URL
├── status              ← PENDING / PROCESSING / DONE / FAILED
└── created_at

summaries
├── id (uuid)
├── document_id
└── content

flashcards
├── id (uuid)
├── document_id
├── question
└── answer

quiz_questions
├── id (uuid)
├── document_id
├── question
├── type                ← MULTIPLE_CHOICE only (open-ended dropped — can't auto-grade wording variants)
├── correct_answer
└── options             ← JSON array, always 4 options
```

---

## Worktree Workflow

### Docker — build and test your service

Each service is defined in `docker-compose.yml`. After implementing, build and test your service in Docker before considering the worktree done.

```bash
# Build and (re)start your service
docker compose up -d --build <service>   # e.g. backend, worker, frontend, ai-service

# Watch logs
docker compose logs -f <service>

# Check all containers
docker compose ps
```

**WSL2 networking:** Docker ports are exposed on the Windows host, not on WSL localhost.
- From WSL you cannot `curl http://localhost:8080` directly.
- Option A — test from Windows PowerShell: `curl http://localhost:8080/api/v1/health`
- Option B — test from within the Docker network:
  ```bash
  docker run --rm --network ai-learning-assistant_default curlimages/curl:latest \
    http://<service>:<port>/api/v1/health
  ```
- Exception: `http://localhost:5173` (frontend) works directly in the Windows browser.

**Docker network name:** `ai-learning-assistant_default`

---

### How to work with worktrees

**Starting a worktree session:**
```bash
claude --worktree setup-infrastructure
```
Claude creates `.claude/worktrees/setup-infrastructure/` on branch `worktree-setup-infrastructure`, branching from main. Claude works there autonomously.

**When Claude finishes:**
```bash
# Review what was done
git diff main..worktree-setup-infrastructure

# Merge into main
git checkout main
git merge worktree-setup-infrastructure

# Clean up
git worktree remove .claude/worktrees/setup-infrastructure
git branch -d worktree-setup-infrastructure
```

**If you want changes after testing:**
```bash
# Option A — reopen the same worktree branch
claude --worktree setup-infrastructure
# tell Claude what to fix, it commits to the same branch, you merge again

# Option B — fix directly on main
# tell Claude in the main session what to change
```

**Running parallel sessions:**
```bash
# Terminal 1
claude --worktree setup-infrastructure

# Terminal 2
claude --worktree backend-api-core

# Terminal 3
claude --worktree ai-service
```

### Execution rounds (dependency order)

```
Round 1 — COMPLETE ✓
├── setup-infrastructure   ✓ merged to main
├── backend-api-core       ✓ merged to main
└── ai-service             ✓ merged to main

Round 2 — IN PROGRESS
├── backend-api-features   (needs: backend-api-core)
├── worker                 (needs: backend-api-core + ai-service)
└── frontend-core          (needs: setup-infrastructure)

Round 3 — depends on Round 2, run in parallel:
├── frontend-results       (needs: frontend-core + backend-api-features)
└── deployment             (needs: all)
```

---

## Worktree 1: `setup-infrastructure` ✓ COMPLETE
**Round 1 — no dependencies**

### Goal
Docker Compose for local development. Environment config. Railway deployment setup. Supabase schema SQL.

### Tasks
- [ ] `docker-compose.yml` — backend, worker, ai-service, frontend, RabbitMQ, Redis
- [ ] `.env.example` for each module (backend, worker, ai-service, frontend)
- [ ] Supabase setup SQL — all tables (Liquibase format), RLS policies, Storage bucket config
- [ ] Railway deployment config (`railway.toml`) for each service
- [ ] Health check endpoint scaffolding on backend, worker, ai-service (`GET /api/v1/health`)
- [ ] Dead letter queue config — `document.processing.dlq` bound to `document.processing`

### Key config
- RabbitMQ queues: `document.processing`, `document.processed`, `document.processing.dlq`
- Exchange type: Direct
- Services communicate via Docker internal network hostnames
- Java 17, Python 3.12

---

## Worktree 2: `backend-api-core` ✓ COMPLETE
**Round 1 — no dependencies**

### Goal
Spring Boot foundation — project structure, JPA entities, DB migrations, Spring Security JWT filter, structured logging, Swagger. No business logic yet.

### Stack
- Java 17, Spring Boot 3.x
- Package: `com.edi.backend`
- Liquibase for migrations
- Logback + Logstash encoder (JSON logs)
- Springdoc OpenAPI

### Tasks
- [ ] Project structure: `controller / service / repository / entity / config / exception` packages
- [ ] JPA entities: `User`, `Document`, `Summary`, `Flashcard`, `QuizQuestion`
- [ ] Liquibase migrations — create all tables
- [ ] Supabase JWT validation filter (Spring Security) — validate token, extract user into `SecurityContext`
- [ ] `GET /api/v1/health` endpoint
- [ ] RFC 7807 global exception handler (`@ControllerAdvice` + `ProblemDetail`)
- [ ] JSON structured logging — Logback + Logstash encoder, include `correlationId` from MDC
- [ ] Springdoc OpenAPI config — Swagger UI at `/swagger-ui.html`
- [ ] `application.yml` — all config via env vars (DB, RabbitMQ, Redis, Supabase)
- [ ] Unit test setup (JUnit5 + Mockito)
- [ ] Integration test setup (Testcontainers — PostgreSQL + RabbitMQ + Redis)

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `JwtFilterTest` — valid token passes, invalid token returns 401
- [ ] Unit: `GlobalExceptionHandlerTest` — verify RFC 7807 response shape
- [ ] Integration: `HealthEndpointIT` — Testcontainers boots app, GET /api/v1/health returns 200

---

## Worktree 3: `backend-api-features`
**Round 2 — depends on: `backend-api-core`**

### Goal
All business logic — file upload, document CRUD, rate limiting, RabbitMQ producer, results consumer, results endpoints.

### Endpoints
```
POST   /api/v1/auth/sync                  ← upsert Supabase user into local users table
GET    /api/v1/documents                  ← list authenticated user's documents
POST   /api/v1/documents                  ← upload PDF → Supabase Storage → publish to queue
GET    /api/v1/documents/{id}             ← get document metadata
DELETE /api/v1/documents/{id}             ← delete document + file from Supabase Storage
GET    /api/v1/documents/{id}/summary     ← get summary
GET    /api/v1/documents/{id}/flashcards  ← get flashcards
GET    /api/v1/documents/{id}/quiz        ← get quiz questions
```

### Tasks
- [ ] Redis-backed Bucket4j rate limiter — 10 uploads/hour per user
- [ ] Supabase Storage client (WebClient) — upload PDF, delete PDF
- [ ] RabbitMQ producer — publish `DocumentProcessingMessage` to `document.processing` with `correlationId`
- [ ] RabbitMQ consumer — consume `DocumentProcessedMessage` from `document.processed`, save results, update status
- [ ] Document controller + service (upload, list, get, delete)
- [ ] Results controllers (summary, flashcards, quiz)
- [ ] Auth sync endpoint
- [ ] Unit tests for service layer
- [ ] Integration tests for controllers (Testcontainers)

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `DocumentServiceTest` — upload, list, get, delete logic (Mockito)
- [ ] Unit: `RateLimiterTest` — 10th request passes, 11th returns 429
- [ ] Unit: `RabbitMqProducerTest` — verify message published with correlationId
- [ ] Integration: `DocumentControllerIT` — Testcontainers, full upload flow via HTTP
- [ ] Integration: `DocumentProcessedConsumerIT` — consume mock message, verify DB updated

### Docker
```bash
docker compose up -d --build backend
docker compose logs -f backend
# Test from within Docker network (WSL2 — see Docker section above):
docker run --rm --network ai-learning-assistant_default curlimages/curl:latest \
  http://backend:8080/api/v1/health
```

### Messages

`document.processing` (backend → worker):
```json
{
  "correlationId": "uuid",
  "documentId": "uuid",
  "fileUrl": "https://supabase.../storage/...",
  "userId": "uuid"
}
```

`document.processed` (worker → backend):
```json
{
  "correlationId": "uuid",
  "documentId": "uuid",
  "status": "DONE | FAILED",
  "errorMessage": "null or reason",
  "summary": "...",
  "flashcards": [{ "question": "...", "answer": "..." }],
  "quiz": [{ "question": "...", "type": "MULTIPLE_CHOICE", "correctAnswer": "...", "options": ["...", "...", "...", "..."] }]
}
```

---

## Worktree 4: `worker`
**Round 2 — depends on: `backend-api-core`, `ai-service`**

### Goal
RabbitMQ consumer — downloads PDF, extracts text, calls ai-service, publishes results back. Never touches DB directly (single writer principle). Retries on failure, routes to DLQ after exhausting retries.

### Stack
- Java 17, Spring Boot 3.x
- Package: `com.edi.worker`
- Apache PDFBox (text extraction)
- WebClient (HTTP calls)

### Tasks
- [ ] Spring Boot project in `/worker`
- [ ] RabbitMQ consumer (`@RabbitListener`) on `document.processing`
- [ ] Retry config — 3 attempts, exponential backoff (1s, 2s, 4s)
- [ ] DLQ routing — after 3 failures, message goes to `document.processing.dlq`
- [ ] Download PDF from Supabase Storage URL (WebClient)
- [ ] Extract text from PDF (Apache PDFBox)
- [ ] Call ai-service with `X-Internal-Api-Key` header: `/ai/summarize`, `/ai/flashcards`, `/ai/quiz`
- [ ] MDC — put `correlationId` from message into MDC for all log lines
- [ ] Publish `DocumentProcessedMessage` to `document.processed` (DONE or FAILED)
- [ ] No direct DB access — all results go via queue
- [ ] JSON structured logging (Logback + Logstash encoder)
- [ ] Unit tests (JUnit5 + Mockito)

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `PdfTextExtractorTest` — extract text from sample PDF
- [ ] Unit: `AiServiceClientTest` — mock HTTP server, verify correct request/response handling
- [ ] Unit: `RetryTest` — simulate ai-service failure, verify 3 retries with backoff
- [ ] Integration: `WorkerConsumerIT` — Testcontainers RabbitMQ, consume real message, verify published result

### Docker
```bash
docker compose up -d --build worker
docker compose logs -f worker
# Test from within Docker network (WSL2 — see Docker section above):
docker run --rm --network ai-learning-assistant_default curlimages/curl:latest \
  http://worker:8080/api/v1/health
```

### Flow
```
consume from document.processing
    ↓
MDC.put("correlationId", message.correlationId)
    ↓
download PDF (WebClient → Supabase Storage URL)
    ↓
extract text (PDFBox)
    ↓
POST /ai/summarize   (X-Internal-Api-Key header)  ← ai-service handles chunking internally
POST /ai/flashcards  (X-Internal-Api-Key header)
POST /ai/quiz        (X-Internal-Api-Key header)
    ↓
publish to document.processed: { status: DONE, results... }

ON ANY FAILURE (after 3 retries):
    ↓
publish to document.processed: { status: FAILED, errorMessage }
message routed to document.processing.dlq

NOTE: Worker sends full extracted text to ai-service. Chunking and map-reduce
summarization for long documents is handled entirely within ai-service — worker
does not need to split text or manage chunks.
```

---

## Worktree 5: `ai-service` ✓ COMPLETE
**Round 1 — no dependencies**

### Goal
Python FastAPI microservice — sole responsibility: communicate with Gemini. Implements DIP at architecture level. Handles long documents via chunk + map-reduce summarization. Protected by internal API key.

### Stack
- Python 3.12
- FastAPI
- LangChain 0.3.x (prompt management, chunking, map-reduce)
- langchain-google-genai 2.1.x — Gemini via LangChain
- Gemini model: `gemini-2.5-flash`
- Langfuse 3.x — LLM observability (traces, prompt version tracking)
- Pydantic (strict response models)

### Endpoints
```
GET  /health

POST /ai/summarize
    headers: X-Internal-Api-Key
    body:    { "text": "..." }
    returns: { "summary": "..." }

POST /ai/flashcards
    headers: X-Internal-Api-Key
    body:    { "text": "..." }
    returns: { "flashcards": [{ "question": "...", "answer": "..." }] }

POST /ai/quiz
    headers: X-Internal-Api-Key
    body:    { "text": "..." }
    returns: { "questions": [{ "question": "...", "type": "MULTIPLE_CHOICE", "correct_answer": "...", "options": ["...", "...", "...", "..."] }] }
```

### Tasks
- [x] FastAPI project in `/ai-service`
- [x] Internal API key middleware — reject requests without valid `X-Internal-Api-Key`
- [x] LangChain + Gemini integration (`gemini-2.5-flash`)
- [x] Prompt templates for summary, flashcards, quiz (hardcoded fallbacks)
- [x] Langfuse prompt management — prompts fetched from dashboard at call time, hardcoded fallbacks if unreachable
      Prompt names: `summarize-document`, `summarize-chunk`, `summarize-reduce`, `generate-flashcards`, `generate-quiz`
- [x] Langfuse observability — every LLM call traced, prompt versions linked to traces
- [x] Long document handling — chunk text, map-reduce summarization via LangChain
- [x] Pydantic response models — strict validation
- [x] Structured JSON logging
- [x] `GET /health`
- [x] Dockerfile

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `test_api_key_middleware` — missing/wrong key returns 401
- [ ] Unit: `test_summarize_endpoint` — mock LangChain, verify response shape
- [ ] Unit: `test_flashcards_endpoint` — mock LangChain, verify response shape
- [ ] Unit: `test_quiz_endpoint` — mock LangChain, verify response shape
- [ ] Unit: `test_long_document_chunking` — text over threshold triggers map-reduce path

---

## Worktree 6: `frontend-core`
**Round 2 — depends on: `setup-infrastructure`**

### Goal
App shell, routing, Google OAuth, dashboard, upload page. Clean minimal SaaS aesthetic.

### Stack
- React + Vite + Tailwind CSS
- React Router
- Zustand (global state)
- TanStack Query (data fetching + polling)
- Supabase JS client
- Axios (HTTP client with JWT interceptor)

### Pages
```
/            ← landing page — clean hero, "Login with Google" CTA
/dashboard   ← document list with status badges
/upload      ← drag & drop PDF upload
```

### Tasks
- [ ] React Router — all routes
- [ ] Supabase client config
- [ ] Google OAuth login/logout
- [ ] Zustand auth store — user, JWT token, loading state
- [ ] Axios instance — auto-attaches JWT to every request
- [ ] Protected routes — redirect to `/` if unauthenticated
- [ ] TanStack Query setup
- [ ] Dashboard — document list, status badges (PENDING / PROCESSING / DONE / FAILED)
- [ ] Upload page — drag & drop, PDF validation (type + max size), progress indicator
- [ ] Polling — TanStack Query refetch every 3s while any doc is PENDING/PROCESSING
- [ ] Vitest + React Testing Library setup

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `AuthStore.test.ts` — login sets user + token, logout clears state
- [ ] Unit: `ProtectedRoute.test.tsx` — unauthenticated user redirected to /
- [ ] Unit: `UploadPage.test.tsx` — non-PDF file rejected, PDF accepted
- [ ] Unit: `StatusBadge.test.tsx` — correct badge rendered for each status

### Docker
```bash
docker compose up -d --build frontend
docker compose logs -f frontend
# Frontend is served by Nginx — open directly in Windows browser:
# http://localhost:5173
```

---

## Worktree 7: `frontend-results`
**Round 3 — depends on: `frontend-core`, `backend-api-features`**

### Goal
Document detail page — PDF viewer, summary, flashcards, quiz. Clean SaaS UI.

### Pages
```
/documents/:id  ← 4 tabs: Summary | Flashcards | Quiz | Original
```

### Tasks
- [ ] Fetch document, summary, flashcards, quiz in parallel (TanStack Query)
- [ ] Summary tab — rendered markdown
- [ ] Flashcards tab — flip animation, prev/next, progress counter (e.g. 3/12)
- [ ] Quiz tab:
  - Multiple choice — 4 options, color-coded correct/incorrect reveal
  - Open ended — text input, reveal correct answer
  - Score summary screen
- [ ] Original tab — embedded PDF viewer or download button
- [ ] Skeleton loaders for all tabs
- [ ] Back to dashboard button
- [ ] Component unit tests (Vitest + RTL)

**Tests (must be green before worktree is considered done):**
- [ ] Unit: `FlashcardViewer.test.tsx` — flip works, next/prev navigation works
- [ ] Unit: `QuizMultipleChoice.test.tsx` — selecting answer reveals correct/incorrect
- [ ] Unit: `QuizOpenEnded.test.tsx` — submit reveals correct answer
- [ ] Unit: `ScoreSummary.test.tsx` — correct score calculated and displayed

---

## Worktree 8: `deployment`
**Round 3 — depends on: all other worktrees**

### Goal
All services live on Railway, end-to-end tested, secure.

### Tasks
- [ ] Dockerfiles for backend, worker, ai-service, frontend (Nginx)
- [ ] Verify `docker-compose up` runs full app locally end-to-end
- [ ] Railway project — each service linked to monorepo subfolder
- [ ] All env vars configured in Railway dashboard
- [ ] Supabase RLS — users can only read/write their own rows
- [ ] CORS on backend — allow Railway frontend URL only
- [ ] Smoke test: login → upload PDF → wait → verify summary/flashcards/quiz appear
- [ ] Verify DLQ — intentionally break ai-service, confirm failed message lands in DLQ
- [ ] Verify rate limiting — confirm 11th upload in an hour is rejected with 429

---

## Deployment Checklist
- [ ] `docker-compose up` runs everything locally
- [ ] Google OAuth works on live Railway URL
- [ ] Full flow works: upload → processing → results
- [ ] RLS verified — user A cannot access user B's documents
- [ ] All services respond on `/api/v1/health` or `/health`
- [ ] DLQ verified — failed messages are captured, not lost
- [ ] Rate limiting verified — 429 returned after limit exceeded
- [ ] Swagger UI accessible at `/swagger-ui.html`
