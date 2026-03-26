# AI Learning Assistant — Project Standards

## Quality Bar

This project demonstrates enterprise-level architectural thinking from a 1.5-year junior developer.

**Never suggest shortcuts because "it's just a CV project."**

Every decision should reflect what a large company or global bank would do. If a simpler approach is taken for practical reasons, it must be:
1. A conscious, documented decision
2. Explained in a code comment with the production alternative
3. Defensible in a senior engineering interview

## Architecture

See `plan.md` for the full plan, worktree breakdown, and execution rounds.

### Stack
| Layer | Choice |
|---|---|
| Frontend | React + Vite + Tailwind + Zustand + TanStack Query |
| Backend | Spring Boot 3.x, Java 17, `com.edi.backend` |
| Worker | Spring Boot 3.x, Java 17, `com.edi.worker` |
| AI Service | Python 3.12, FastAPI, LangChain, OpenRouter (free tier) |
| Auth | Supabase (Google OAuth) |
| Storage | Supabase Storage (PDFs) |
| Database | Supabase PostgreSQL |
| Migrations | Liquibase |
| Queue | RabbitMQ (Railway plugin) |
| Cache / Rate limit | Redis (Railway plugin) + Bucket4j |
| Hosting | Railway (monorepo, each service deployed independently) |

### Key architectural decisions
- **Single writer principle** — worker never writes to DB, publishes `document.processed` event, backend consumes and saves
- **Two queues** — `document.processing` (backend→worker), `document.processed` (worker→backend)
- **Dead letter queue** — `document.processing.dlq` catches messages after 3 failed retries
- **DIP at architecture level** — worker depends on ai-service interface, not the LLM provider directly (proven by Gemini → OpenRouter migration)
- **Internal API key** — worker→ai-service requires `X-Internal-Api-Key` header (production: mTLS)
- **correlationId tracing** — manually propagated through queue messages, injected into MDC (production: OpenTelemetry + Jaeger)
- **Long documents** — chunk + map-reduce summarization via LangChain
- **Rate limiting** — Redis-backed Bucket4j, 10 uploads/hour per user
- **API versioning** — all endpoints prefixed `/api/v1/`
- **Error format** — RFC 7807 Problem Details
- **Logging** — JSON structured logs via Logback + Logstash encoder
- **API docs** — Springdoc OpenAPI, Swagger UI at `/swagger-ui.html`

### Testing
- Backend: JUnit5 + Mockito (unit) + Testcontainers (integration)
- Frontend: Vitest + React Testing Library
- E2E: not implemented, noted as next step (Playwright)

## Monorepo structure
```
AI-Learning-Assistant/
├── frontend/       React app
├── backend/        Spring Boot REST API
├── worker/         Spring Boot RabbitMQ consumer
├── ai-service/     Python FastAPI AI orchestration
├── plan.md         Full plan + worktree breakdown
└── CLAUDE.md       This file
```
