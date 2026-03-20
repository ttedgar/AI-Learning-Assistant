# Architecture & Improvements

This document is the authoritative design record for the AI Learning Assistant. It covers the agreed distributed-system architecture, all four core design decisions, the complete implementation plan, and the remaining improvement backlog.

Items marked **[DONE]** are already implemented. Items marked **[NEXT]** are the active implementation plan.

---

## Status

| Area | Status |
|---|---|
| Non-blocking worker (Reactor RabbitMQ) | **[DONE]** |
| Parallel AI calls (Mono.zip) | **[DONE]** |
| State machine + guarded transitions | **[DONE]** |
| Backend consumer idempotency | **[NEXT — Step 2]** |
| document.status queue + IN_PROGRESS flow | **[NEXT — Step 3]** |
| Lease / stale job recovery | **[NEXT — Step 4]** |
| AI service Redis idempotency | **[NEXT — Step 5]** |
| Publisher confirms in worker | **[NEXT — Step 6]** |
| Observability (logs + metrics) | **[NEXT — Step 7]** |
| OpenTelemetry context propagation | Backlog |
| Resilience4j circuit breaker | Backlog |
| Transactional outbox | Backlog |
| Playwright E2E test suite | Backlog |

---

## Architecture Summary

Four independently deployed services communicate via HTTP (user-facing) and RabbitMQ (internal async pipeline). The backend is the sole writer to PostgreSQL. The worker is fully non-blocking. The AI service is treated as an unreliable external dependency.

```
Browser (React SPA)
     │  HTTPS — Bearer JWT (ES256)
     ▼
Backend (Spring Boot)          ← sole DB writer, auth gateway, rate limiter
     │ publishes                   │ consumes
     ▼                             ▼
document.processing          document.status        document.processed
(queue)                      (queue)                (queue)
     │                             │                       │
     ▼                             │                       │
Worker (Spring Boot)               └───────────────────────┘
  Reactor RabbitMQ                         (worker publishes to both)
  PDFBox + WebClient
     │  HTTP  X-Internal-Api-Key
     ▼
AI Service (Python FastAPI)
  LangChain + Gemini + Redis idempotency
```

### Core Constraints (never violated)

- **Backend is the only DB writer.** Worker communicates state changes via queue events.
- **Worker is fully non-blocking.** No `.block()` anywhere in the message pipeline.
- **At-least-once delivery.** Every state transition guard must be idempotent.
- **Duplicate execution must be safe.** AI service and backend consumer are independently idempotent.
- **Retries must be safe.** Partial failures leave the system in a recoverable state.

---

## Service Responsibilities

### Backend
- Owns all database writes (documents, summaries, flashcards, quiz_questions, users)
- Exposes REST API for upload, status polling, result retrieval
- Publishes `DocumentProcessingMessage` to `document.processing` on upload
- Consumes `document.status` → performs guarded state transitions
- Consumes `document.processed` → persists results, sets terminal state
- Runs scheduled stale job recovery (IN_PROGRESS and PENDING)
- Rate limiting (Redis-backed Bucket4j, 10 uploads/hour/user)

### Worker
- Consumes `document.processing` via Reactor RabbitMQ (`consumeManualAck`)
- Immediately publishes `DocumentStatusEvent(IN_PROGRESS)` to `document.status`
- Downloads PDF (WebClient, non-blocking via boundedElastic)
- Extracts text (PDFBox, offloaded to boundedElastic)
- Calls AI service three times concurrently (Mono.zip)
- Publishes result to `document.processed`, waits for broker confirm
- Only then acks the original `document.processing` message
- Never writes to the database

### AI Service
- Exposes `POST /ai/summarize`, `POST /ai/flashcards`, `POST /ai/quiz`
- Each endpoint accepts a `documentId` (idempotency key) alongside the text
- Redis-backed idempotency: SET NX claim, cache result, return cached on replay
- Protected by `X-Internal-Api-Key` header

---

## State Machine

### States

| State | Meaning |
|---|---|
| `PENDING` | Job created, message published to queue, not yet picked up |
| `IN_PROGRESS` | Worker has picked up the job and signalled start |
| `DONE` | Results persisted, job complete |
| `FAILED` | All retries exhausted, FAILED result persisted |

### Allowed Transitions

| From | To | Trigger | Guard |
|---|---|---|---|
| `PENDING` | `IN_PROGRESS` | Worker publishes status event | `WHERE status='PENDING'` |
| `PENDING` | `DONE` | Result arrives before status event (out-of-order) | `WHERE status='PENDING'` |
| `PENDING` | `FAILED` | Failure result arrives before status event (out-of-order) | `WHERE status='PENDING'` |
| `IN_PROGRESS` | `DONE` | Backend processes successful `document.processed` | `WHERE status='IN_PROGRESS'` |
| `IN_PROGRESS` | `FAILED` | Backend processes failure `document.processed` | `WHERE status='IN_PROGRESS'` |
| `IN_PROGRESS` | `PENDING` | Stale job recovery (lease expired) | `WHERE status='IN_PROGRESS' AND lease_until < NOW()` |
| `FAILED` | `PENDING` | Manual admin reprocess | `WHERE status='FAILED'` |

### Rejected / Ignored Transitions

| From | Incoming Event | Action | Reason |
|---|---|---|---|
| `DONE` | Any | Ack silently, no write | Terminal state — duplicate delivery |
| `FAILED` | Any (non-admin) | Ack silently, no write | Terminal state — duplicate delivery |
| `IN_PROGRESS` | IN_PROGRESS event | 0 rows affected, ack | Duplicate status event |
| `DONE` | IN_PROGRESS event | 0 rows affected, ack | Out-of-order, already terminal |

### Out-of-Order Strategy

**Design decision: the system prioritises eventual correctness over strict state ordering.**

Accepting `PENDING → DONE` (result arrives before IN_PROGRESS event) is intentional. The result data is valid regardless of which state transition precedes it. The document reaches the correct terminal state.

The alternative — rejecting a DONE event when status is PENDING — would require NACK and requeue. If the IN_PROGRESS event is delayed (queue lag, slow consumer), the DONE event would loop in requeue until retry budget is exhausted, then DLQ. The document would never reach DONE. This is strictly worse: more complex, higher operational risk, no correctness benefit.

The late IN_PROGRESS event arriving after DONE is silently ignored (0 rows affected by the guarded UPDATE). No correctness issue.

---

## Queue Topology

```
document.processing
  Publisher:  Backend (on upload)
  Consumer:   Worker
  DLX:        → document.processing.dlq (after 3 nacks)
  Content:    DocumentProcessingMessage

document.status
  Publisher:  Worker (immediately on job pickup)
  Consumer:   Backend (DocumentStatusConsumer)
  DLX:        → document.status.dlq
  Content:    DocumentStatusEvent

document.processed
  Publisher:  Worker (on completion, success or failure)
  Consumer:   Backend (DocumentProcessedConsumer)
  DLX:        → document.processed.dlq
  Content:    DocumentProcessedMessage

document.processing.dlq    Dead storage — manual replay via admin API
document.status.dlq        Dead storage — ops inspection
document.processed.dlq     Dead storage — ops inspection
```

All queues are durable. All exchanges are direct. Messages are persistent.

---

## Message Contracts

All messages carry a common metadata envelope:

```json
{
  "documentId":    "uuid",
  "correlationId": "uuid — generated at upload, same for all messages for this document",
  "eventType":     "PROCESSING_REQUESTED | STATUS_UPDATED | PROCESSING_COMPLETED",
  "timestamp":     "2026-03-19T10:00:00Z",
  "version":       1
}
```

### DocumentProcessingMessage
```json
{
  "documentId":    "uuid",
  "correlationId": "uuid",
  "eventType":     "PROCESSING_REQUESTED",
  "timestamp":     "...",
  "version":       1,
  "fileUrl":       "https://supabase.storage/.../file.pdf",
  "userId":        "uuid"
}
```

### DocumentStatusEvent
```json
{
  "documentId":    "uuid",
  "correlationId": "uuid",
  "eventType":     "STATUS_UPDATED",
  "timestamp":     "...",
  "version":       1,
  "status":        "IN_PROGRESS",
  "workerId":      "worker-instance-hostname"
}
```

### DocumentProcessedMessage
```json
{
  "documentId":    "uuid",
  "correlationId": "uuid",
  "eventType":     "PROCESSING_COMPLETED",
  "timestamp":     "...",
  "version":       1,
  "status":        "DONE | FAILED",
  "errorMessage":  "null on success",
  "summary":       "...",
  "flashcards":    [...],
  "quiz":          [...]
}
```

---

## Problem A: IN_PROGRESS State

**Decision: Worker publishes a `DocumentStatusEvent` to `document.status` immediately upon pickup. Backend consumes it and performs the guarded PENDING → IN_PROGRESS transition.**

### Why not HTTP call (Option 1)
Synchronous HTTP coupling inside a reactive pipeline. Worker must await backend response before proceeding. Backend unavailability during AI processing stalls the worker. Violates non-blocking constraint.

### Why not backend-sets-IN_PROGRESS-at-publish (Option 3)
Backend writes IN_PROGRESS to DB then publishes to RabbitMQ. If the publish fails after DB commit, the document is permanently stuck IN_PROGRESS with no message in queue. Requires transactional outbox to fix, which is strictly more complex than Option 2.

### Implementation Flow

```
Worker picks up DocumentProcessingMessage
  → publish DocumentStatusEvent(IN_PROGRESS) to document.status   ← fire and forget, non-blocking
  → begin buildProcessingPipeline:
      download PDF → extract text → Mono.zip AI calls
      → publish DocumentProcessedMessage to document.processed
      → await broker confirm
      → ack document.processing message

Backend DocumentStatusConsumer:
  Receive DocumentStatusEvent
  → UPDATE documents
       SET status='IN_PROGRESS', lease_until = NOW() + INTERVAL '20 minutes'
       WHERE id=? AND status='PENDING'
  → rows affected == 0 → ack silently (duplicate or out-of-order)
  → rows affected == 1 → ack
```

### Constraint Satisfaction

- **Single DB writer**: backend performs the UPDATE
- **Non-blocking worker**: status event is fire-and-forget (Sender.send → Mono, no await)
- **Idempotency**: `WHERE status='PENDING'` — exactly one transition wins
- **Retry safety**: duplicate events → 0 rows → ack silently
- **Crash recovery**: if worker crashes before publishing status event, document stays PENDING — stale PENDING recovery handles it
- **Scalability**: `document.status` is a separate queue; can scale consumers independently

---

## Problem B: AI Service Idempotency

**Decision: Redis-backed idempotency per operation using documentId as key. Atomic SET NX claim. JSON value with metadata. Result cached inline. Fail open on Redis unavailability.**

### Redis Key Structure

```
ai:idempotency:{documentId}:{operation}

Examples:
  ai:idempotency:doc-abc123:summarize
  ai:idempotency:doc-abc123:flashcards
  ai:idempotency:doc-abc123:quiz
```

Per-operation keys allow each AI call to be independently idempotent. If summarize completes but flashcards times out, only flashcards is retried — summarize returns its cached result immediately.

### Redis Value Model (JSON)

```json
{
  "status":      "PROCESSING | COMPLETED",
  "startedAt":   "2026-03-19T10:00:00Z",
  "completedAt": "2026-03-19T10:00:45Z",
  "workerId":    "worker-instance-hostname",
  "result":      "...serialized payload (present when COMPLETED)..."
}
```

The `workerId` and `startedAt` fields are not required for correctness but are essential for observability. A `PROCESSING` entry with `startedAt` from 10 minutes ago, with `status` still `PROCESSING`, indicates the TTL has not yet expired but something is wrong — ops can inspect without needing application logs.

### Atomic Claim

```
SET ai:idempotency:{documentId}:{op} {"status":"PROCESSING","startedAt":"...","workerId":"..."} EX 300 NX
```

- `NX`: only set if key does not exist — atomic, no race condition
- `EX 300`: 5-minute TTL — this is the lease within the AI service. If the AI service crashes mid-call, the key expires and the next attempt reclaims it cleanly

### Scenarios

| Scenario | Behaviour |
|---|---|
| First call | SET NX → `OK` → process → SET key to COMPLETED with result, EX 3600 |
| Duplicate while PROCESSING | SET NX → `nil` → GET → `PROCESSING` → return HTTP 409, `Retry-After: 30` |
| Duplicate after COMPLETED | SET NX → `nil` → GET → `COMPLETED` → deserialize and return cached result immediately |
| AI service crash mid-call | Key is `PROCESSING` with 5-min TTL → expires → next attempt reclaims cleanly |
| Redis failure | Fail open — log warning + metric, process without idempotency check. Backend consumer idempotency protects DB correctness regardless. |
| TTL expires after long idle | Next attempt claims key and processes fresh — correct for DLQ replay |

### Why Redis Over In-Memory Cache

In-memory cache is local to one instance. Under horizontal scaling, load balancer routes a retry to a different instance with no record of the prior call — duplicate Gemini invocation. Redis is a shared source of truth across all AI service instances. Single-instance AI service: in-memory is equivalent. Multi-instance: in-memory is incorrect. Redis is the only safe choice.

### Constraint Satisfaction

- **Non-blocking worker**: Redis call is the AI service's concern; worker sees a standard HTTP call
- **Idempotency**: SET NX is atomic — exactly one caller proceeds per operation per documentId
- **Retry safety**: cached result returned to all retries after first completion
- **Crash recovery**: TTL expiry releases the claim — no manual cleanup
- **Scalability**: Redis handles thousands of SET NX operations/second; shared across all AI instances

---

## Problem C: Backend Consumer Idempotency

**Decision: `SELECT FOR UPDATE` status check inside the same transaction as result inserts. Terminal-state short-circuit prevents duplicate writes. Unique constraint on `summaries.document_id` as belt-and-suspenders.**

### Consumer Behaviour Per Status

```
Receive DocumentProcessedMessage
→ BEGIN TRANSACTION
→ SELECT status FROM documents WHERE id=? FOR UPDATE

  Case status = IN_PROGRESS (valid):
    INSERT INTO summaries (document_id, content) VALUES (?, ?)
    INSERT INTO flashcards ... (batch)
    INSERT INTO quiz_questions ... (batch)
    UPDATE documents SET status=? WHERE id=? AND status='IN_PROGRESS'
    COMMIT → ACK

  Case status = DONE or FAILED (duplicate delivery):
    ROLLBACK
    ACK silently
    LOG: "duplicate document.processed received, ignoring"

  Case status = PENDING (out-of-order — result arrived before status event):
    INSERT summaries, flashcards, quiz_questions
    UPDATE documents SET status=? WHERE id=?   ← no status guard, accept regardless
    COMMIT → ACK
    (subsequent IN_PROGRESS event will find status=DONE, affect 0 rows, ack silently)
```

### How `SELECT FOR UPDATE` Prevents Race Conditions

Two `document.processed` messages for the same document arrive concurrently (e.g. from a retry + the original). Both consumers begin a transaction and issue `SELECT FOR UPDATE`. PostgreSQL serialises at the row level — consumer A acquires the lock, consumer B blocks. Consumer A commits (status=DONE). Consumer B reads the post-commit status (DONE) → terminal-state short-circuit → ROLLBACK → ACK silently. No duplicate inserts.

### Database Constraints as Defence-in-Depth

`summaries` has `UNIQUE(document_id)`. Even if the `SELECT FOR UPDATE` guard were bypassed, a second insert throws `DataIntegrityViolationException` — caught, acked without requeue, logged. Flashcards and quiz questions use `INSERT ... ON CONFLICT DO NOTHING` because they are multi-row.

### Why This Layer Is Required Even With AI Idempotency

AI idempotency prevents duplicate Gemini calls. It does not prevent duplicate messages on `document.processed`. Sequence demonstrating the gap:

```
1. Worker processes document → AI returns cached result (idempotency works)
2. Worker publishes DocumentProcessedMessage to document.processed
3. Worker crashes before acking document.processing
4. RabbitMQ redelivers document.processing
5. Worker processes again → AI cached result again → publishes DocumentProcessedMessage again
6. Backend now has two DocumentProcessedMessages for the same document
```

Step 5 is protected by AI idempotency. Step 6 is protected only by backend consumer idempotency. Both layers are independently necessary.

### Constraint Satisfaction

- **Single DB writer**: all writes in one backend transaction
- **Idempotency**: `SELECT FOR UPDATE` + status check → exactly one write set per document
- **Retry safety**: terminal state → ack silently, any number of times
- **Crash recovery**: if backend crashes mid-transaction → DB rolls back → message redelivered → `SELECT FOR UPDATE` finds status still IN_PROGRESS → processes correctly
- **Scalability**: row-level lock, not table-level → concurrent processing of different documents is unaffected

---

## Problem D: Stale Job Recovery (Lease Mechanism)

**Decision: Explicit `lease_until` column. Scheduled recovery job claims expired leases via atomic UPDATE. Covers both IN_PROGRESS and PENDING stuck jobs.**

### Lease Model

`lease_until` is a timestamp column on the `documents` table. It represents the absolute expiry time of the current processing claim.

- Set to `NOW() + lease_duration` when a job transitions to IN_PROGRESS (via the status consumer)
- Set to `NOW() + lease_duration` when a job is republished by the recovery job (to avoid immediate re-recovery)
- Lease duration: 20 minutes (conservative; actual max processing time is ~5 minutes under all retries)
- Not renewed during processing in the current design (see heartbeat note below)

### Recovery Job: Stale IN_PROGRESS

```sql
UPDATE documents
SET    status = 'PENDING',
       lease_until = NOW() + INTERVAL '20 minutes'
WHERE  status = 'IN_PROGRESS'
AND    lease_until < NOW()
RETURNING id, file_url, user_id, correlation_id
```

For each returned row: publish a new `DocumentProcessingMessage` to `document.processing`.

### Recovery Job: Stuck PENDING

A job can be stuck PENDING if:
- The worker crashed before publishing the status event (RabbitMQ will redeliver, but may take up to 30 minutes)
- The message was published to RabbitMQ but the broker lost it (rare — mitigated by publisher confirms on the backend outbox in future)
- The application-level recovery provides a shorter detection window than RabbitMQ's consumer timeout

```sql
UPDATE documents
SET    lease_until = NOW() + INTERVAL '20 minutes'
WHERE  status = 'PENDING'
AND    created_at < NOW() - INTERVAL '15 minutes'
RETURNING id, file_url, user_id, correlation_id
```

For each returned row: publish a new `DocumentProcessingMessage` to `document.processing`.

**Interaction with RabbitMQ redelivery:** Both the recovery-triggered message and the RabbitMQ-redelivered message may arrive at the worker concurrently. Both go through the same pipeline: publish IN_PROGRESS event → process → publish result. The backend's `SELECT FOR UPDATE` in the result consumer ensures only the first to complete persists results. The second sees DONE → ack silently. Safe.

**Why PENDING recovery improves latency:** RabbitMQ consumer timeout defaults to 30 minutes. A worker crash means 30 minutes of dead time before redelivery. The recovery job runs every 5 minutes with a 15-minute PENDING threshold → maximum detection latency is 20 minutes instead of 30+.

### Multiple Backend Instances — No Conflicts

Both instances issue the same UPDATE simultaneously. PostgreSQL row-level locks serialise the operation:
- Instance A acquires row locks, updates rows, commits — rows now have `status='PENDING'` or `lease_until` updated
- Instance B's UPDATE finds those rows no longer match the WHERE clause → 0 rows affected → does nothing

No application-level coordination required. The atomic UPDATE is the implicit distributed lock.

### Future Extension: Heartbeat-Based Lease Renewal

Not implemented but documented for interview completeness.

The worker would periodically (every 5 minutes) publish a `HEARTBEAT` event to `document.status`. The backend status consumer would update `lease_until = NOW() + lease_duration` for the given documentId if status is IN_PROGRESS. This allows legitimately long-running jobs (very large documents with map-reduce) to hold the lease beyond the initial 20-minute window without being incorrectly recovered.

Without heartbeats, the lease duration must be set conservatively large (≥ max processing time), which increases recovery latency on actual crashes. With heartbeats, the lease duration can be shorter (e.g. 10 minutes), improving crash detection at the cost of extra message traffic.

### Constraint Satisfaction

- **Single DB writer**: recovery job runs on backend; all UPDATEs are backend-executed
- **Non-blocking worker**: worker has no role in this mechanism
- **Idempotency**: `WHERE status='IN_PROGRESS' AND lease_until < NOW()` — only expired leases are claimed; reset to PENDING + republish is idempotent under concurrent recovery runs
- **Retry safety**: republished job goes through full pipeline; AI idempotency and backend consumer idempotency handle any duplicate results
- **Crash recovery**: this is the crash recovery mechanism
- **Scalability**: index on `(status, lease_until)` — recovery query is a fast index scan; runs every 5 minutes, low overhead

---

## Reliability Mechanisms

### Publisher Confirms in Worker — Correct Sequence

```
1. Worker builds DocumentProcessedMessage
2. sender.send(outboundMessage) → returns Mono<OutboundMessageResult>
3. flatMap on result: await broker acknowledgment
4. Only then: delivery.ack()
```

**Why ack-before-confirm is permanent data loss:**

If the worker acks `document.processing` before the broker confirms receipt of `document.processed`:
- `document.processing` is acked → RabbitMQ considers the job done → no redelivery
- If RabbitMQ drops the `document.processed` message (memory pressure, connection reset before fsync) → the result is gone
- Document stays IN_PROGRESS until stale recovery fires (up to 20 minutes)
- Stale recovery republishes → worker processes again → but the original ack means the original delivery is gone, not the recovery one
- This path does eventually recover, but it means 20 minutes of incorrect state and an unnecessary full re-processing

With confirms, if the broker rejects or drops the message, the `Mono` errors, `delivery.ack()` is never called, and the pipeline enters the `retryWhen` path. The result is published again on retry. No state loss.

### Backend Dual-Write Problem (Outbox Not Yet Implemented)

On upload, the backend does:
1. `INSERT INTO documents (status='PENDING')` — DB write
2. `rabbitTemplate.convertAndSend(...)` — queue write

These are two separate writes to two different systems. No distributed transaction covers both.

**Failure scenario A: DB succeeds, publish fails.**
Document exists but no message in queue. Document stays PENDING indefinitely. Stale PENDING recovery detects this after 15 minutes and republishes. The system eventually self-heals — but with up to 15-minute latency.

**Failure scenario B: Publish succeeds, DB write fails (transaction rolled back).**
Message is in queue for a document that does not exist in the database. Worker picks it up, calls AI service, publishes result. Backend `DocumentProcessedConsumer` tries to `SELECT FOR UPDATE` the document → NOT FOUND → FK violation on result inserts → unhandled exception → message is nacked → retried → DLQ. Document is never created. This is a real data loss scenario.

**Transactional outbox (future implementation):**
1. Same DB transaction: `INSERT documents` + `INSERT outbox_events(documentId, payload, publishedAt=NULL)`
2. Separate outbox poller: `SELECT * FROM outbox_events WHERE publishedAt IS NULL FOR UPDATE SKIP LOCKED`
3. Publish to RabbitMQ, wait for confirm
4. `UPDATE outbox_events SET publishedAt=NOW()`

`FOR UPDATE SKIP LOCKED` allows multiple poller instances without double-publishing. The DB commit covers both the document and the outbox entry atomically. Publish happens outside the transaction, driven by the outbox poller, which is safe to retry.

Until the outbox is implemented, Scenario A is mitigated by stale PENDING recovery. Scenario B remains a gap — documented explicitly here.

---

## Observability

### Logging Strategy

Every log line across all Java services must carry:
- `correlationId` — same UUID for all log lines related to one document, across all services
- `documentId`
- State transitions logged explicitly: `documentId={} transition: {} → {}`

Current implementation uses SLF4J MDC with manual propagation. MDC is thread-local and does not cross Reactor thread boundaries automatically. See backlog for OpenTelemetry migration.

### Metrics

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `document.e2e.duration` | Histogram | `status` (DONE/FAILED) | End-to-end processing time (created_at → terminal state) |
| `document.processing.duration` | Histogram | `status` | Worker processing time (IN_PROGRESS → terminal) |
| `document.retry.count` | Counter | `reason` | Number of retry attempts per document |
| `ai.call.latency` | Histogram | `operation` (summarize/flashcards/quiz) | Per-operation AI latency |
| `ai.idempotency.cache.hit` | Counter | `operation` | Redis cached result returned |
| `ai.idempotency.cache.miss` | Counter | `operation` | New AI call required |
| `ai.idempotency.redis.failure` | Counter | — | Fail-open events (Redis unavailable) |
| `document.recovery.stale_in_progress` | Counter | — | Jobs reset from IN_PROGRESS by recovery job |
| `document.recovery.stale_pending` | Counter | — | Jobs republished from PENDING by recovery job |
| `rabbitmq.publish.confirm.failure` | Counter | `queue` | Broker rejected publish confirm |
| `document.dlq.routed` | Counter | `queue` | Messages routed to DLQ |

---

## Failure Scenarios

| Scenario | Detection | Recovery | Safe? |
|---|---|---|---|
| Worker crash before IN_PROGRESS event | PENDING recovery (15 min) or RabbitMQ redelivery (30 min) | Republish → full retry | ✓ |
| Worker crash after IN_PROGRESS, before result | IN_PROGRESS lease expiry (20 min) | Reset to PENDING → republish | ✓ |
| Worker crash after result publish, before ack | `document.processing` redelivered | Worker retries → AI cached result → backend sees DONE → ack silently | ✓ |
| Duplicate `document.processed` delivery | Backend consumer | `SELECT FOR UPDATE` → terminal state → ack silently | ✓ |
| AI service timeout (3 attempts) | Worker `retryWhen` exhausted | FAILED result published → FAILED state | ✓ |
| AI service returns stale cached result | Redis TTL, not a failure | Cached result is correct for the documentId | ✓ |
| Redis failure at AI service | Try/catch in idempotency check | Fail open → process without cache → backend consumer idempotency still protects | ✓ (with risk of duplicate AI call) |
| Backend DB failure mid-result-insert | Transaction rollback | Message redelivered → retry | ✓ |
| Out-of-order events (DONE before IN_PROGRESS) | Guarded transitions → 0 rows on late IN_PROGRESS | No action required | ✓ |
| Backend publish fails on upload (dual-write gap) | PENDING recovery (15 min) | Republish | ✓ (with latency) |
| Backend DB succeeds, publish fails on upload | PENDING recovery | Republish | ✓ (with latency) |
| Backend DB fails, publish succeeds on upload | Worker tries to process non-existent document | FK violation → DLQ | ✗ (data loss — requires outbox to fix) |

---

## Implementation Plan

### Step 1 — State Machine + Guarded Transitions
**What:** Add `processing_started_at` and `lease_until` columns to `documents` via Liquibase migration. Update `GlobalExceptionHandler` for any new error paths. Define the full allowed/rejected transition table in code.

**Why:** All subsequent steps depend on the state machine being correct and explicit. Transitions that are not guarded in the DB layer are not safe regardless of application logic.

**Protects against:** Duplicate state writes, out-of-order event corruption, terminal state re-entry.

---

### Step 2 — Backend Consumer Idempotency
**What:** Wrap `DocumentProcessedConsumer` result-insert logic in a transaction with `SELECT FOR UPDATE`. Add terminal-state short-circuit. Add `UNIQUE(document_id)` constraint on `summaries`. Add `ON CONFLICT DO NOTHING` to flashcard and quiz inserts.

**Why:** At-least-once delivery means the backend consumer will receive the same result message more than once. Without this step, every other step that causes a retry will result in duplicate data.

**Protects against:** Duplicate inserts from redelivery, concurrent consumers processing the same result simultaneously.

---

### Step 3 — document.status Queue + IN_PROGRESS Flow
**What:** Declare `document.status` queue and DLX in `RabbitMqConfig` (both backend and worker). Worker publishes `DocumentStatusEvent(IN_PROGRESS)` as the first step of `buildProcessingPipeline`. Backend gets a new `DocumentStatusConsumer` that performs the guarded PENDING → IN_PROGRESS transition and sets `lease_until`.

**Why:** Without this, there is no PROCESSING state, no lease start time, and no crash recovery anchor. Step 4 depends on `lease_until` being set.

**Protects against:** User seeing documents stuck in PENDING with no feedback. Inability to detect crashes. Inability to recover IN_PROGRESS jobs.

---

### Step 4 — Lease / Stale Job Recovery
**What:** Add `@Scheduled` recovery job to backend. Two queries: stale IN_PROGRESS (`lease_until < NOW()`), stuck PENDING (`created_at < NOW() - 15 min`). Each query uses `UPDATE ... RETURNING` and republishes to `document.processing`. Index on `(status, lease_until)` and `(status, created_at)`.

**Why:** Without this, a worker crash leaves documents stuck permanently (or until RabbitMQ 30-minute consumer timeout). This step is the application-level crash recovery mechanism.

**Protects against:** Worker crash after setting IN_PROGRESS. Message loss on initial publish. RabbitMQ consumer timeout lag.

---

### Step 5 — AI Service Redis Idempotency
**What:** Add Redis client to AI service (Python `redis-py`). Implement SET NX claim at the start of each endpoint handler. Store JSON value with status, timestamps, workerId. Cache result on completion. Fail open on Redis unavailability with metric emission.

**Why:** The worker retries up to 3 times per message, and the recovery job may trigger additional retries. Without AI idempotency, each retry calls Gemini — wasting quota, increasing latency, and risking inconsistent results across retries.

**Protects against:** Duplicate Gemini calls, quota exhaustion under retries, inconsistent results between original call and retry.

---

### Step 6 — Publisher Confirms in Worker
**What:** Replace `rabbitTemplate.convertAndSend()` in `buildProcessingPipeline` with `reactor-rabbitmq Sender.send()` returning `Mono<OutboundMessageResult>`. Pipeline: build result → `sender.send()` → `flatMap` on confirm result → `delivery.ack()`. If confirm fails → pipeline errors → `retryWhen` → retry.

**Why:** Without confirms, the worker acks the processing message before the broker has durably received the result. A RabbitMQ crash in that window causes permanent data loss — the processing message is gone and the result was never stored.

**Protects against:** Silent result loss on broker instability. Data loss window between publish and ack.

---

### Step 7 — Observability
**What:** Add structured metrics (Micrometer) for all metrics listed in the Observability section. Emit state transition log lines with documentId and correlationId on every transition. Add AI call latency histogram per operation. Add Redis idempotency cache hit/miss/failure counters in AI service (Prometheus via `prometheus_client`).

**Why:** Without metrics, production incidents are invisible until a user reports them. The recovery job, retry counts, and AI latency are the three most operationally important signals in this system.

**Protects against:** Silent accumulation of stuck jobs, quota exhaustion going undetected, cache failure going undetected.

---

## Backlog (Not in Active Plan)

### Transactional Outbox
Eliminates the dual-write gap on upload. Requires `outbox_events` table, outbox poller with `FOR UPDATE SKIP LOCKED`, and publisher confirms on outbox publish. High operational correctness value; medium implementation effort.

### OpenTelemetry Context Propagation
Replace manual MDC propagation with OpenTelemetry + Micrometer context-propagation bridge. Enables automatic trace propagation across Reactor thread switches and across service boundaries. Required for production observability at scale.

### Resilience4j Circuit Breaker
Wrap AI service HTTP calls with a circuit breaker. If the AI service is consistently failing, the circuit opens — new messages fail immediately (no retries wasted) and enter FAILED state. Circuit closes automatically on recovery. Prevents retry storms from amplifying AI service outages.

### Playwright E2E Test Suite
The dev auth bypass (`DevAuthFilter`, `VITE_DEV_AUTH=true`) was built specifically to enable E2E tests without Google OAuth. Covers: upload → polling → DONE state → summary/flashcard/quiz rendering. Run against `docker-compose.dev.yml` in CI.

### Heartbeat-Based Lease Renewal
Worker periodically publishes HEARTBEAT events. Backend renews `lease_until` on receipt. Allows legitimately long-running jobs to hold the lease without false recovery, while keeping the base lease duration short for fast crash detection.
