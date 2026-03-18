# Architecture Summary — AI Learning Assistant

## What it is
A document intelligence platform: upload a PDF, receive an AI-generated summary, flashcard deck, and quiz. Four independently deployed microservices, message-driven, cloud-hosted on Railway.

---

## Services and responsibilities

**Frontend (React + Vite)** — SPA served by Nginx. Auth state in Zustand; API data via TanStack Query with 3-second polling while documents are in-flight. Axios interceptor reads the JWT synchronously from Zustand (not from `supabase.auth.getSession()` — that call can block indefinitely on token refresh and silently prevent requests from firing).

**Backend (Spring Boot)** — Sole database writer. Handles upload orchestration: rate-check → resolve user → upload PDF to Supabase Storage → insert `Document(status=PENDING)` → publish to `document.processing`. Also consumes `document.processed` to save results and flip status to `DONE`. Spring Security validates Supabase JWTs via JWKS (ES256, zero-trust — only the public key is held). Rate limiting is Redis-backed Bucket4j (token bucket, 10 uploads/hr/user, horizontally safe via Lua atomic ops).

**Worker (Spring Boot)** — Pure consumer. Downloads the PDF (WebClient), extracts text (PDFBox), calls the AI service three times (summary, flashcards, quiz), publishes results back. Never writes to the database — single writer principle. Resilience: 3-attempt exponential retry (1s → 2s → 4s), dead-letter queue after exhaustion.

**AI Service (FastAPI/Python)** — The only service that knows about Gemini. Implements DIP at the architecture level: swapping LLMs requires changing only this service. Long documents (>60K chars) are chunked and processed via LangChain map-reduce summarization. Protected by `X-Internal-Api-Key`; every Gemini call traced in Langfuse.

---

## Message flow (the core loop)

```
POST /api/v1/documents
  → backend publishes DocumentProcessingMessage(correlationId, documentId, fileUrl)
    → document.processing queue
      → worker consumes, calls AI service, publishes DocumentProcessedMessage
        → document.processed queue
          → backend consumes, saves results, updates status=DONE
```

The `correlationId` is a UUID generated at upload time, carried through the queue message, injected into MDC by the worker, and present on every log line across both Java services — manual distributed tracing without OpenTelemetry.

Dead-letter path: after 3 worker failures, RabbitMQ moves the message to `document.processing.dlq` via a dead-letter exchange. Ops can replay messages from there after the root cause is fixed.

---

## Key architectural decisions

| Decision | Implementation | Why it matters |
|---|---|---|
| Single writer | Worker never touches DB | No split-brain, clear ownership |
| Zero-trust JWT | ES256 via JWKS, backend holds no secret | Key rotation is automatic |
| Distributed rate limit | Bucket4j + Redis Lua scripts | Safe under horizontal scaling |
| DIP at architecture level | Worker → AI service interface, not Gemini | LLM swap = one service change |
| CorrelationId tracing | UUID in message → MDC → all log lines | End-to-end tracing without OTel |
| Idempotent auth/sync | DB upsert on every login | Safe for concurrent calls and retries |
| RabbitMQ timeout | 5s connection-timeout on RabbitTemplate | Publish failure returns 500 in 5s, not ∞ |
| Synchronous JWT read | Zustand store, not `getSession()` | Prevents interceptor hang on token refresh |

---

## Infrastructure

| Concern | Technology |
|---|---|
| Auth + DB + Storage | Supabase (Google OAuth, PostgreSQL + RLS, S3-compatible storage) |
| Messaging | RabbitMQ — direct exchange, 2 queues + DLQ |
| Rate limit cache | Redis + Bucket4j (Lettuce, Lua) |
| Schema migrations | Liquibase (versioned, auditable) |
| Hosting | Railway — 4 services, monorepo, Docker build per subdirectory |
| LLM observability | Langfuse — traces, prompt versions, token counts |

---

## Testing strategy

Backend: JUnit 5 + Mockito (unit, service layer), Testcontainers (integration — real PostgreSQL, RabbitMQ, Redis spun up per test suite). Frontend: Vitest + React Testing Library (component unit tests, store tests, protected route tests). No E2E suite — noted as the next step (Playwright against the dev auth bypass).
