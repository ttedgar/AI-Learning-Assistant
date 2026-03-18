# AI Learning Assistant

A full-stack, cloud-deployed document intelligence platform. Upload a PDF and receive an AI-generated summary, flashcard deck, and multiple-choice quiz within seconds. Built to enterprise architectural standards.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React)                          │
│     Zustand (auth state)  +  TanStack Query (data fetching)     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS — Bearer JWT (ES256)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (Spring Boot)                         │
│  Spring Security OAuth2 Resource Server → JWKS validation       │
│  Redis-backed Bucket4j rate limiting (10 uploads/hr/user)       │
│  Supabase Storage REST client (WebClient)                        │
│  Liquibase schema migrations                                     │
└──────┬──────────────────────────────┬───────────────────────────┘
       │ publishes                    │ consumes
       ▼                              ▼
  document.processing          document.processed
  (RabbitMQ queue)             (RabbitMQ queue)
       │                              │
       ▼                              │
┌─────────────────────┐              │
│  Worker             │              │
│  (Spring Boot)      │──────────────┘
│  PDFBox text extract│  publishes result back
│  3x retry + DLQ     │
└──────┬──────────────┘
       │ HTTP  X-Internal-Api-Key
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AI Service (Python FastAPI)                     │
│  LangChain — prompt management, chunking, map-reduce            │
│  Gemini API (gemini-2.5-flash)                                  │
│  Langfuse — LLM observability, prompt version tracking          │
└─────────────────────────────────────────────────────────────────┘

Infrastructure: Railway (hosting) · Supabase (auth/storage/db) · RabbitMQ · Redis
```

---

## Services

### Frontend — React + Vite + Tailwind
- **Auth**: Supabase Google OAuth. On sign-in, `onAuthStateChange` fires → calls `POST /api/v1/auth/sync` to create the user in the backend DB → stores session in Zustand.
- **HTTP**: Axios instance reads the JWT synchronously from Zustand store (not from `supabase.auth.getSession()`, which can block on token refresh).
- **State**: Zustand for auth. TanStack Query for all API data, with 3-second polling on documents in `PENDING`/`PROCESSING` state.
- **Routing**: React Router. `ProtectedRoute` reads Zustand loading flag to prevent flash-redirect on page refresh.
- **Dark mode**: Class-based Tailwind dark mode (`@variant dark`), toggled via `.dark` on `<html>`, persisted in `localStorage`.

### Backend — Spring Boot 3, Java 17
- **Security**: Spring Security OAuth2 Resource Server validates Supabase JWTs using Nimbus JWKS (ES256). Zero-trust — backend never holds the signing secret. JWKS is cached 15 min, refreshed every 5 min. Custom `Converter<Jwt, AuthenticatedUser>` extracts `sub` and `email` claims.
- **Upload flow**: Rate check → resolve local user → upload to Supabase Storage (WebClient) → persist `Document` with `status=PENDING` → publish `DocumentProcessingMessage` to `document.processing` with a `correlationId`.
- **Consumer**: `DocumentProcessedConsumer` listens on `document.processed`, saves summary/flashcards/quiz, updates document status to `DONE` or `FAILED`.
- **Rate limiting**: Redis-backed Bucket4j. Token bucket: 10 uploads/hr/user. Works correctly under horizontal scaling (state in Redis, not JVM heap).
- **Error handling**: `@RestControllerAdvice` returns RFC 7807 Problem Details (`application/problem+json`) for all exceptions.
- **Logging**: Logback + Logstash encoder (structured JSON). `correlationId` and `documentId` injected into MDC at request level via `CorrelationIdFilter` and post-JWT filter.
- **Database**: PostgreSQL via Supabase. Liquibase manages schema migrations. Hibernate with `ddl-auto: validate`. JSONB column on `quiz_questions.options` mapped via `@JdbcTypeCode(SqlTypes.JSON)`.
- **API**: Versioned `/api/v1/`. Springdoc OpenAPI with Swagger UI at `/swagger-ui.html`.

### Worker — Spring Boot 3, Java 17
- **Principle**: Never writes to the database directly. All results are published back to `document.processed`. Backend is the sole writer.
- **Flow**: `@RabbitListener` on `document.processing` → extract `correlationId` into MDC → download PDF (WebClient) → extract text (Apache PDFBox) → call AI service for summary, flashcards, quiz → publish result message.
- **Resilience**: Spring Retry with 3 attempts and exponential backoff (1s → 2s → 4s). After 3 failures, RabbitMQ routes the message to `document.processing.dlq` via dead-letter exchange.
- **Internal security**: `X-Internal-Api-Key` header on all requests to the AI service. Production equivalent: mTLS between services.
- **Timeout**: 5-minute `responseTimeout` on the AI service `WebClient` (Reactor Netty `HttpClient`) to handle long Gemini inference calls.

### AI Service — Python FastAPI
- **DIP**: The only service that talks to Gemini. Worker depends on the AI service's interface, not on Gemini directly — swapping LLM providers requires changing only this service.
- **Long documents**: Text above 60K characters is chunked (50K char chunks) and processed via LangChain map-reduce summarization — each chunk is summarized, then the partial summaries are reduced into one.
- **Endpoints**: `POST /ai/summarize`, `POST /ai/flashcards`, `POST /ai/quiz`. All protected by `X-Internal-Api-Key` middleware.
- **Observability**: Langfuse traces every LLM call with prompt versions, token counts, and latency. Prompts are fetched from the Langfuse dashboard at runtime with hardcoded fallbacks.

---

## Message Flow

```
POST /api/v1/documents (multipart PDF)
  │
  ├─ rate limit check (Redis/Bucket4j)
  ├─ resolveUser (supabaseUserId → local User entity)
  ├─ upload to Supabase Storage (WebClient)
  ├─ INSERT document (status=PENDING)
  └─ publish → document.processing
                    │
                    ▼
            Worker consumes
            ├─ MDC.put(correlationId)
            ├─ download PDF
            ├─ PDFBox text extraction
            ├─ POST /ai/summarize
            ├─ POST /ai/flashcards
            ├─ POST /ai/quiz
            └─ publish → document.processed (status=DONE|FAILED)
                                │
                                ▼
                    Backend DocumentProcessedConsumer
                    ├─ INSERT summary
                    ├─ INSERT flashcards[]
                    ├─ INSERT quiz_questions[]
                    └─ UPDATE document status=DONE
```

Dead-letter path: on 3 consecutive failures, the `document.processing` message is rejected → RabbitMQ routes it to `document.processing.dlq` via the default exchange. The worker publishes a `FAILED` status message regardless.

---

## Database Schema

```sql
users
  id               UUID PRIMARY KEY
  supabase_user_id UUID UNIQUE         -- JWT sub claim
  email            TEXT

documents
  id               UUID PRIMARY KEY
  user_id          UUID REFERENCES users
  title            TEXT
  file_url         TEXT                -- Supabase Storage public URL
  status           TEXT                -- PENDING | PROCESSING | DONE | FAILED
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
  options          JSONB               -- ["a","b","c","d"]
```

Supabase Row-Level Security (RLS) is enabled on all tables. Users can only read and write their own rows (`auth.uid() = supabase_user_id`).

---

## Auth Flow

1. User clicks "Continue with Google" → `supabase.auth.signInWithOAuth()`.
2. Supabase redirects back to the app. `onAuthStateChange(SIGNED_IN, session)` fires.
3. Frontend calls `POST /api/v1/auth/sync` with `{ supabaseUserId, email }`. Backend upserts a local `User` record (idempotent).
4. Every subsequent API call includes `Authorization: Bearer <access_token>` (read from Zustand — synchronous, no network call).
5. Backend Spring Security extracts the JWT, fetches the Supabase JWKS (cached), validates the ES256 signature, and maps `sub` → `AuthenticatedUser` principal.
6. Logout: Zustand state cleared first (prevents LandingPage bounce-back), then `supabase.auth.signOut()` revokes the server-side session.

---

## Security

| Concern | Implementation |
|---|---|
| Frontend → Backend auth | Supabase ES256 JWT, validated via JWKS |
| Worker → AI Service auth | `X-Internal-Api-Key` header (production: mTLS) |
| Database row isolation | Supabase Row-Level Security (RLS) |
| Upload rate limiting | Redis-backed Bucket4j token bucket (10/hr/user) |
| CORS | Allowlist of Railway frontend URL only |
| File storage | Supabase Storage with scoped paths per user |

---

## Observability

- **Correlation tracing**: Every document upload generates a `correlationId` (UUID). It is embedded in the `document.processing` message, extracted by the worker into MDC, and flows through all log lines across both services.
- **Structured logging**: Logback + Logstash encoder outputs JSON on all Java services. Fields include `correlationId`, `documentId`, `userId`, log level, timestamp, logger name.
- **LLM tracing**: Langfuse captures every Gemini call — prompt version, model, input tokens, output tokens, latency, response.
- **Production path**: Replace manual MDC propagation with OpenTelemetry + Jaeger for automatic distributed tracing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS v4, Zustand, TanStack Query, React Router, Axios, Supabase JS |
| Backend | Java 17, Spring Boot 3.4, Spring Security, Spring AMQP, Spring Data JPA, Hibernate 6, Liquibase, Bucket4j, Springdoc OpenAPI |
| Worker | Java 17, Spring Boot 3.4, Spring AMQP, Spring Retry, Apache PDFBox, WebFlux (WebClient) |
| AI Service | Python 3.12, FastAPI, LangChain 0.3, langchain-google-genai, Gemini, Langfuse, Pydantic |
| Database | PostgreSQL (Supabase), RLS, JSONB |
| Messaging | RabbitMQ — direct exchange, 2 queues + DLQ |
| Cache / Rate limit | Redis (Lettuce) + Bucket4j (Lua scripts, atomic token-bucket) |
| Auth | Supabase Auth (Google OAuth), ES256 JWKS |
| Storage | Supabase Storage (S3-compatible) |
| Hosting | Railway (monorepo, 4 independent services) |
| Testing | JUnit 5, Mockito, Testcontainers (PostgreSQL, RabbitMQ, Redis), Vitest, React Testing Library |

---

## Project Structure

```
AI-Learning-Assistant/
├── frontend/           React + Vite SPA, served by Nginx in production
├── backend/            Spring Boot REST API, document orchestration
├── worker/             Spring Boot RabbitMQ consumer, PDF processing
├── ai-service/         Python FastAPI, Gemini integration
├── docker-compose.yml          Full local stack
├── docker-compose.dev.yml      Dev auth bypass overlay (no OAuth required)
└── plan.md             Architecture decisions and worktree breakdown
```

Each service has its own `Dockerfile` and `railway.toml`. Railway deploys them independently from the same Git repository using subdirectory build contexts.

---

## Running Locally

**Full stack (production-equivalent):**
```bash
docker-compose up -d --build
# Frontend: http://localhost:5173
# Backend Swagger: http://localhost:8080/swagger-ui.html
```

**Dev mode (no Google OAuth — automated testing friendly):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
# Auto-logged in as dev@local.test (UUID: 00000000-0000-0000-0000-000000000001)
# Backend uses DevSecurityConfig (@Profile("dev")) with X-Dev-User-Id header auth
```

---

## Key Design Decisions

**Single writer principle**: Worker never writes to the database. All results flow back through `document.processed` queue and are committed by the backend. One service owns all writes — no split-brain, no dual-write consistency issues.

**Zero-trust JWT validation**: Backend validates ES256 tokens using Supabase's public JWKS endpoint. It never holds the signing secret. Key rotation is handled automatically by the 5-minute JWKS cache refresh.

**Distributed rate limiting**: Bucket4j uses Redis + Lua scripts for atomic token-bucket operations. Safe under horizontal scaling because all state lives in Redis, not in JVM memory.

**DIP at the architecture level**: The worker calls the AI service's HTTP interface, not Gemini directly. Swapping LLM providers (Gemini → OpenAI → Claude) only requires modifying the AI service — worker and backend are completely isolated from the change.

**CorrelationId tracing**: Generated at upload time, embedded in the queue message, extracted by the worker into MDC. Every log line across both Java services shares the same `correlationId`, enabling end-to-end request tracing without a distributed tracing framework.

**Idempotent auth/sync**: The `POST /api/v1/auth/sync` upsert is safe to call on every login. Concurrent calls are handled via `DataIntegrityViolationException` catch (unique constraint on `supabase_user_id`) returning 409 instead of 500.
