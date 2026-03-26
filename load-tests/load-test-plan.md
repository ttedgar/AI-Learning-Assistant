# Load Test Plan — AI Learning Assistant

## Overview

This plan covers a full load test session for the document processing pipeline.
The goal is to find the throughput ceiling under different concurrency settings,
validate retry and dead-letter behaviour under failure conditions, and produce
automatically captured Grafana dashboards as the permanent result record.

The test replaces the real AI service with a configurable stub. Everything else
— RabbitMQ, Redis, Spring Boot backend, Spring Boot worker, Supabase — is real.
The upload script hits the real HTTP upload endpoint, which means the full pipeline
runs: HTTP → backend → Supabase Storage → RabbitMQ → worker → stub AI service →
RabbitMQ → backend → Supabase PostgreSQL.

**Estimated total session time:** 2.5 to 3 hours including setup and cleanup.

---

## Decisions Log

These decisions were made deliberately. If anything needs to change, update this
section with the reason.

| Decision | Choice | Why |
|---|---|---|
| Database | Real Supabase DB | No spare project slot on free tier; data is small and cleaned up after |
| Auth | DevAuthFilter (`X-Dev-*` headers) | No OAuth needed; 100 synthetic users cover the rate limiter |
| Storage | Real `documents` bucket | Flows through the real StorageService; cleanup script removes test files |
| Stub delay | 1 second | Long enough for meaningful Grafana curves; short enough to finish in one evening |
| Message count | 1000 (except S4) | Enough volume for a meaningful drain curve in Grafana |
| S4 message count | 20 | 65s retry delay × 2 retries × 1000 messages = 7+ hours; 20 proves the behaviour in ~9 minutes |
| Scrape interval (RabbitMQ) | 5 seconds | Queue depth is the fastest-moving metric; smoother drain curve |
| Scrape interval (JVM/system) | 15 seconds | Infrastructure metrics move slowly; 20 data points over 5 min is sufficient |
| QOS = flatmap-concurrency | Always equal | Clean single-variable comparison; production may use QOS slightly higher as a prefetch buffer |
| Results | Grafana snapshots + JSON log | No manual table-filling during the test; everything recorded automatically |
| Emergency brake | RabbitMQ max-length policy + script self-monitor + kill command | Three independent layers; no single failure can cause a runaway |

---

## Scenarios

### S1 — QOS Ladder (5 runs, the main event)

Finds the throughput ceiling and the point where increasing QOS stops helping.

| Run | QOS | flatmap-concurrency | Messages | Stub delay | Failure rate | Est. duration |
|-----|-----|---------------------|----------|------------|--------------|---------------|
| 1   | 2   | 2                   | 1000     | 1s         | 0%           | ~8 min        |
| 2   | 5   | 5                   | 1000     | 1s         | 0%           | ~3.5 min      |
| 3   | 10  | 10                  | 1000     | 1s         | 0%           | ~1.5 min      |
| 4   | 25  | 25                  | 1000     | 1s         | 0%           | ~40s          |
| 5   | 50  | 50                  | 1000     | 1s         | 0%           | ~20s          |

**What to watch:** the Grafana queue drain curve. QOS=2 and QOS=5 should show
clearly different slopes. At some point (likely QOS=25 or QOS=50) the drain rate
will plateau — this is the Supabase round-trip ceiling made visible. The JVM
`boundedElastic` thread pool (default: 10 × CPU cores) may also become a ceiling
at QOS=50.

**Between each run:** flush Redis (resets rate limiter buckets), then restart the
worker with new QOS values. Full commands in the execution section.

---

### S2 — DLQ Validation (1 run)

Verifies that the retry mechanism and dead-letter routing work correctly under load.

| QOS | Messages | Stub delay | Failure rate | Est. duration |
|-----|----------|------------|--------------|---------------|
| 10  | 1000     | 0s         | 100%         | ~8 min        |

**What to watch:** `document.processing.dlq` depth climbs to 1000.
`document.dlq.routed` Micrometer counter hits 1000. `document.processing` queue
drains to 0. Zero messages in `document.processed`.

**Note:** failures are instant (0s delay) so retries cycle quickly. Each message
makes 3 attempts (1 initial + 2 retries) with 1s → 2s backoff before going to DLQ.

---

### S3 — Retry Mix (1 run)

Realistic failure conditions — some messages succeed, some exhaust retries.

| QOS | Messages | Stub delay | Failure rate | Est. duration |
|-----|----------|------------|--------------|---------------|
| 10  | 1000     | 1s         | 40%          | ~10 min       |

**What to watch:** `document.processed` receives a mix of DONE and FAILED results.
`document.retry.count` counter shows retry activity. DLQ accumulates but does not
reach 1000. The split is probabilistic — roughly 600 DONE / 400 DLQ but variance
is expected.

---

### S4 — 429 Backoff (1 run)

Verifies that the worker applies the 65-second retry delay when the AI service
returns a rate limit error, not the standard 1–2s backoff.

| QOS | Messages | Stub delay | Rate limit rate | Est. duration |
|-----|----------|------------|-----------------|---------------|
| 5   | 20       | 0s         | 100%            | ~9 min        |

**What to watch:** worker logs show `65s` delay between retry attempts (not 1s or
2s). All 20 messages land in DLQ. Total duration is ~9 minutes — if it finishes in
under 2 minutes something is wrong with the retry delay.

**Why 20 messages and not 1000:** 65s × 2 retries × 1000 messages ÷ QOS=5 = 7+
hours. 20 messages proves the behaviour conclusively in a session-friendly time.

---

## Part 1: Supabase Setup

### What you need to do on Supabase

We are using your **real `ai-learning-assistant` Supabase project** — not a new
one. The database credentials are already in your `.env` file. No new project
setup is required.

There are two things to verify in the Supabase dashboard before the test:

**1. Confirm the `documents` storage bucket exists and is public**

Navigate to: Supabase Dashboard → Storage → Buckets

You should see a bucket named `documents`. The backend's `StorageService` hardcodes
this bucket name. All test PDFs will be uploaded here under paths like:
```
documents/10000000-0000-0000-0000-000000000001/some-uuid.pdf
```
These are easy to identify and bulk-delete after the test because all 100 synthetic
user IDs start with `10000000-0000-0000-0000-`.

If the bucket does not exist, create it and set it to public (the backend constructs
public URLs from it).

**2. Note your database connection string format**

Your `.env` already has the correct values. They look like this — do not change
anything, just confirm they are present:

```
# Direct connection (not the pooler) — required because Spring Boot uses
# prepared statements which are incompatible with Supabase's transaction-mode
# pooler (port 6543). The direct connection uses port 5432.
SUPABASE_DB_URL=jdbc:postgresql://db.crnenbwufcgjxzqjemcd.supabase.co:5432/postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-password-here
```

The format is always:
```
jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres
```

Where `<project-ref>` is the string in your Supabase project URL
(e.g. `crnenbwufcgjxzqjemcd`). Port **5432** is the direct connection.
Port 6543 is the pooler — do not use it.

### What test data will be created

| Table | Rows created | Identifier for cleanup |
|---|---|---|
| `users` | 100 rows | `email LIKE 'loadtest-%@loadtest.local'` |
| `documents` | 1000 rows per scenario run | `title LIKE 'loadtest-%'` |
| `summaries` | ~600 rows (S1 happy path) | cascade-deleted with documents |
| `flashcards` | ~600 × 2 rows | cascade-deleted with documents |
| `quiz_questions` | ~600 × 2 rows | cascade-deleted with documents |
| Supabase Storage | 1000 PDFs per run | paths starting with `10000000-0000-0000-0000-` |

The cleanup script (Part 9) handles all of this automatically.

---

## Part 2: One-Time Code Changes

**All code changes are already in place.** Nothing needs to be added before
building the load test stack. Verified:

- `io.micrometer:micrometer-registry-prometheus` — present in both `worker/build.gradle`
  and `backend/build.gradle` ✅
- `management.endpoints.web.exposure.include: health, info, prometheus` — present in
  both `worker/src/main/resources/application.yml` and `backend/src/main/resources/application.yml` ✅
- `WORKER_CONSUMER_QOS` and `WORKER_CONSUMER_FLATMAP_CONCURRENCY` env var bindings —
  already configured in `worker/src/main/resources/application.yml` ✅

The only remaining change is the RabbitMQ Prometheus plugin file (2d below),
which is a new file in `load-tests/` — not a change to existing code.

### 2d. Enable RabbitMQ Prometheus plugin

The `rabbitmq:3.13-management` image includes the `rabbitmq_prometheus` plugin but
does not enable it by default. The load test compose overlay handles this, but a
`load-tests/rabbitmq/enabled_plugins` file is needed:

```
[rabbitmq_management,rabbitmq_prometheus].
```

This file is mounted into the RabbitMQ container via the overlay. Prometheus scrapes
the RabbitMQ metrics endpoint at port 15692.

---

## Part 3: Files to Create

The complete directory structure for the load test infrastructure:

```
load-tests/
├── load-test-plan.md                   ← this file
├── docker-compose.loadtest.yml         ← compose overlay
├── stub-ai-service/
│   ├── Dockerfile
│   └── main.py                         ← FastAPI stub
├── upload-script/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── upload.py                       ← test runner / upload script
├── prometheus/
│   └── prometheus.yml                  ← scrape config
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml          ← auto-configure datasource
│       └── dashboards/
│           └── dashboards.yml          ← auto-load dashboard files
├── rabbitmq/
│   └── enabled_plugins                 ← enables rabbitmq_prometheus
├── fixtures/
│   └── sample.pdf                      ← small test PDF (~20KB, committed)
└── results/
    └── .gitkeep                        ← directory tracked, contents gitignored
```

Add to `.gitignore`:
```
load-tests/results/*.json
load-tests/results/*.csv
```

---

### 3a. Stub AI service (`load-tests/stub-ai-service/main.py`)

A FastAPI application that implements the same three endpoints as the real
`ai-service` but returns hardcoded responses. Behaviour is controlled entirely
by environment variables so no code changes are needed between scenarios.

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `STUB_DELAY_SECONDS` | `1.0` | Artificial latency per request |
| `STUB_FAILURE_RATE` | `0.0` | Fraction [0.0–1.0] of requests returning 500 |
| `STUB_RATE_LIMIT_RATE` | `0.0` | Fraction [0.0–1.0] of requests returning 429 |
| `INTERNAL_API_KEY` | `dev-internal-key` | Must match worker's configured key |

**Endpoints to implement:**

- `GET /health` → `{"status": "ok"}` — exempt from API key check
- `POST /ai/summarize` → `SummaryResponse` with hardcoded summary + `"model_used": "stub-v1"`
- `POST /ai/flashcards` → `FlashcardsResponse` with 2 hardcoded flashcards
- `POST /ai/quiz` → `QuizResponse` with 1 MULTIPLE_CHOICE + 1 OPEN_ENDED question
- `GET /pdf` → returns a minimal valid PDF binary (generated in-process by Python)

**The `/pdf` endpoint is critical:** the worker's first step is downloading the
PDF from the `fileUrl` in the queue message. The upload script sets `fileUrl` to
the backend's real Supabase Storage URL (from the actual upload response) — the
stub does NOT serve the PDF. The stub only handles the AI calls. This means the
full PDF download → PDFBox extraction → AI call chain runs realistically.

**API key validation:** implement as middleware identical to the real service —
reject requests missing or with wrong `X-Internal-Api-Key` with 401. Exempt `/health`.

**Failure injection logic:** on each request, check `STUB_RATE_LIMIT_RATE` first
(return 429 if triggered), then `STUB_FAILURE_RATE` (return 500 if triggered),
then apply `STUB_DELAY_SECONDS` delay, then return the canned response. Order
matters: rate limit check before failure check.

**Dockerfile:** `python:3.12-slim`, install `fastapi uvicorn[standard]`, copy
`main.py`, run with `uvicorn main:app --host 0.0.0.0 --port 8000`.

---

### 3b. Upload script (`load-tests/upload-script/upload.py`)

A Python script that orchestrates the full test run. It is the only thing you
interact with during a scenario — start it, then watch Grafana.

**Dependencies:** `requests`, `rich` (for live terminal output)

**What it does, in order:**

1. **Reads config from environment variables** (see below)
2. **Syncs 100 synthetic users** — calls `POST /api/v1/auth/sync` for each, with
   `X-Dev-User-Id` and `X-Dev-User-Email` headers. Creates user records in the DB
   so `DocumentService.resolveUser()` does not throw. User IDs follow the pattern
   `10000000-0000-0000-0000-{i:012d}` for i in 1..100. Emails follow
   `loadtest-{i:03d}@loadtest.local`.
3. **Posts a Grafana annotation** — marks test start on the dashboard timeline
   automatically.
4. **Uploads PDFs** — sends `POST /api/v1/documents/upload` with the sample PDF
   multipart request, distributing uploads round-robin across 100 users (10 each).
   Each upload uses `X-Dev-User-Id` and `X-Dev-User-Email` headers matching the
   synthetic user. Document title is `loadtest-{run_id}-{i:04d}` for easy cleanup.
5. **Monitors queue depth** during upload — polls RabbitMQ management API every 5
   seconds. If `document.processing` depth exceeds `MESSAGE_COUNT × 1.5` the
   emergency brake fires: stops publishing, prints a warning, exits non-zero.
6. **Waits for the queue to drain** — polls until `document.processing` depth
   reaches 0 or timeout (configurable, default 30 minutes).
7. **Posts a Grafana annotation** — marks test end.
8. **Writes a JSON result file** to `load-tests/results/run-{timestamp}.json`
   containing: scenario name, QOS setting, message count, start time, end time,
   total duration, messages published, any errors encountered.
9. **Prints a summary** to the terminal.

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8181` | Backend base URL |
| `RABBITMQ_API_URL` | `http://localhost:15673/api` | RabbitMQ management API |
| `RABBITMQ_USER` | `guest` | RabbitMQ credentials |
| `RABBITMQ_PASS` | `guest` | RabbitMQ credentials |
| `GRAFANA_URL` | `http://localhost:3000` | Grafana base URL |
| `GRAFANA_USER` | `admin` | Grafana credentials |
| `GRAFANA_PASS` | `admin` | Grafana credentials |
| `SCENARIO_NAME` | required | e.g. `s1-qos-2`, `s2-dlq`, `s3-retry-mix`, `s4-429` |
| `MESSAGE_COUNT` | `1000` | Number of documents to upload |
| `DRAIN_TIMEOUT_MINUTES` | `30` | How long to wait for queue to drain |

**The script runs from your host machine** (not inside Docker) because it needs to
write result files to `load-tests/results/` and it interacts with the backend and
RabbitMQ via their exposed localhost ports.

**Requirements.txt:**
```
requests
rich
```

---

### 3c. Compose overlay (`load-tests/docker-compose.loadtest.yml`)

Overrides the `ai-service` with the stub and adds Prometheus and Grafana.

```yaml
# Load test compose overlay.
# Usage:
#   docker-compose -f docker-compose.yml \
#                  -f docker-compose.dev.yml \
#                  -f load-tests/docker-compose.loadtest.yml \
#                  up -d --build

version: "3.9"

services:

  # Replace real ai-service with stub. Container name stays "ai-service"
  # so the worker's AI_SERVICE_URL=http://ai-service:8000 resolves unchanged.
  ai-service:
    build:
      context: ./load-tests/stub-ai-service
      dockerfile: Dockerfile
    environment:
      INTERNAL_API_KEY:     ${INTERNAL_API_KEY:-dev-internal-key}
      STUB_DELAY_SECONDS:   ${STUB_DELAY_SECONDS:-1.0}
      STUB_FAILURE_RATE:    ${STUB_FAILURE_RATE:-0.0}
      STUB_RATE_LIMIT_RATE: ${STUB_RATE_LIMIT_RATE:-0.0}
    # No GOOGLE_API_KEY, no REDIS_URL — stub needs neither

  # Enable Prometheus plugin on RabbitMQ
  rabbitmq:
    volumes:
      - ./load-tests/rabbitmq/enabled_plugins:/etc/rabbitmq/enabled_plugins
    ports:
      - "127.0.0.1:15692:15692"   # Prometheus metrics endpoint

  # Worker: expose actuator port so Prometheus can scrape it from host
  # (Prometheus is in the same Docker network so no host exposure is
  # strictly needed, but useful for manual inspection during the test)
  # Note: worker runs on port 8081 (server.port default in application.yml),
  # not 8080. Backend uses 8080; worker uses 8081.
  worker:
    environment:
      WORKER_CONSUMER_QOS:                 ${WORKER_CONSUMER_QOS:-2}
      WORKER_CONSUMER_FLATMAP_CONCURRENCY: ${WORKER_CONSUMER_FLATMAP_CONCURRENCY:-2}
    ports:
      - "127.0.0.1:8182:8081"   # worker actuator at localhost:8182

  # Prometheus — scrapes RabbitMQ, worker, and backend
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: prometheus
    volumes:
      - ./load-tests/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "127.0.0.1:9090:9090"
    restart: unless-stopped

  # Grafana — pre-configured with Prometheus datasource and dashboards
  grafana:
    image: grafana/grafana:10.4.0
    container_name: grafana
    environment:
      GF_SECURITY_ADMIN_USER:     admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED:  "true"
    volumes:
      - ./load-tests/grafana/provisioning:/etc/grafana/provisioning
      - grafana-data:/var/lib/grafana
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  grafana-data:
```

---

### 3d. Prometheus config (`load-tests/prometheus/prometheus.yml`)

```yaml
global:
  scrape_interval:     15s   # default for JVM/system metrics
  evaluation_interval: 15s

scrape_configs:

  - job_name: rabbitmq
    scrape_interval: 5s      # queue depth changes fast — tighter interval
    static_configs:
      - targets: ['rabbitmq:15692']

  - job_name: worker
    scrape_interval: 15s
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ['worker:8081']   # worker runs on 8081, backend on 8080

  - job_name: backend
    scrape_interval: 15s
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ['backend:8080']
```

Note: Prometheus runs inside the Docker network, so it reaches services by their
container names (`rabbitmq`, `worker`, `backend`) on their internal ports, not the
host-mapped ports.

---

### 3e. Grafana provisioning

**`load-tests/grafana/provisioning/datasources/prometheus.yml`:**

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

**`load-tests/grafana/provisioning/dashboards/dashboards.yml`:**

```yaml
apiVersion: 1
providers:
  - name: load-test-dashboards
    folder: Load Tests
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

**Dashboards to import manually** (first time only, via Grafana UI → Dashboards → Import):

| Dashboard | Grafana ID | Purpose |
|---|---|---|
| RabbitMQ Overview | `10991` | Queue depth, message rates, consumer count |
| JVM Micrometer | `4701` | Heap, GC, thread pools, HTTP latency |

After importing, save both dashboards so they persist in the `grafana-data` volume.

**Custom load test panel** — after importing the two above, create a new dashboard
with these panels (manual, takes ~10 minutes):

- `document_dlq_routed_total` — counter, shows DLQ routing events over time
- `document_retry_count_total` — counter, shows retry activity
- `ai_call_latency_seconds` — histogram, p50/p95/p99 per operation tag

---

## Part 4: Pre-flight Procedure

Run through this checklist **before every test session**. Do not skip steps.
If any step fails, do not proceed to scenarios.

### Step 1 — Build and start the full load test stack

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d --build
```

Wait 60 seconds for all services to be healthy.

### Step 2 — Verify all services are running

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  ps
```

All services should show `running`. Worker and backend may take 30–60 seconds to
fully start (JVM startup).

### Step 3 — Verify Prometheus scrape targets are green

Open: `http://localhost:9090/targets`

All three targets (`rabbitmq`, `worker`, `backend`) must show **State: UP**.

If `worker` or `backend` shows DOWN: check that the Micrometer Prometheus dependency
was added (Part 2a/2b) and the actuator endpoint is exposed (Part 2c). Check logs:

```bash
docker logs worker --tail 50
docker logs backend --tail 50
```

**Do not proceed if any target is DOWN.** You will run the test with no data.

### Step 4 — Verify Grafana dashboards are showing data

Open: `http://localhost:3000` (admin / admin)

Navigate to the RabbitMQ Overview dashboard. You should see metric values (even
zeros are fine — the important thing is no "No data" panels). If panels show
"No data", Prometheus is not scraping correctly — return to Step 3.

### Step 5 — Set the RabbitMQ emergency brake (max-length policy)

This must be set before any test run. It caps the `document.processing` queue at
2000 messages. If messages somehow accumulate beyond this (e.g. consumer crash loop),
new messages are dead-lettered instead of piling up indefinitely.

```bash
curl -u guest:guest -X PUT \
  http://localhost:15673/api/policies/%2F/load-test-max-length \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "document\\.processing",
    "definition": {"max-length": 2000},
    "apply-to": "queues",
    "priority": 10
  }'
```

Verify in the RabbitMQ UI (http://localhost:15673 → Admin → Policies) that the
policy `load-test-max-length` appears.

### Step 6 — Open monitoring windows

Open these in separate browser tabs and arrange them so all are visible:

1. `http://localhost:15673` — RabbitMQ Management UI
2. `http://localhost:9090/targets` — Prometheus targets
3. `http://localhost:3000` — Grafana (RabbitMQ dashboard)
4. Terminal with live Docker stats:
   ```bash
   docker stats rabbitmq worker backend ai-service --format \
     "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
   ```

### Step 7 — Install upload script dependencies (first time only)

```bash
cd load-tests/upload-script
pip install -r requirements.txt
cd ../..
```

---

## Part 5: Running Scenarios

### Between every run — mandatory reset steps

These steps must be completed between every scenario run (including between each
QOS ladder step):

```bash
# 1. Flush Redis — resets rate limiter buckets for all 100 synthetic users
#    Also clears ai-service idempotency keys (fine for load testing)
docker exec redis redis-cli FLUSHDB

# 2. Purge all queues — removes any leftover messages from the previous run
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/queues/%2F/document.processing/contents
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/queues/%2F/document.processed/contents
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/queues/%2F/document.processing.dlq/contents
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/queues/%2F/document.status/contents
```

---

### S1 — QOS Ladder

Run the five steps in order. The QOS and flatmap-concurrency values are passed as
environment variables to `docker-compose`, which recreates the worker container
with the new settings.

**Run 1 — QOS=2:**

```bash
# Restart worker with QOS=2 (this is the default but set explicitly for clarity)
WORKER_CONSUMER_QOS=2 WORKER_CONSUMER_FLATMAP_CONCURRENCY=2 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

# Wait 15 seconds for worker to reconnect to RabbitMQ
sleep 15

# Run the upload script
SCENARIO_NAME=s1-qos-2 MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

When the script prints "Test complete", run the mandatory reset steps above, then
proceed to Run 2.

**Run 2 — QOS=5:**

```bash
WORKER_CONSUMER_QOS=5 WORKER_CONSUMER_FLATMAP_CONCURRENCY=5 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s1-qos-5 MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

**Run 3 — QOS=10:**

```bash
WORKER_CONSUMER_QOS=10 WORKER_CONSUMER_FLATMAP_CONCURRENCY=10 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s1-qos-10 MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

**Run 4 — QOS=25:**

```bash
WORKER_CONSUMER_QOS=25 WORKER_CONSUMER_FLATMAP_CONCURRENCY=25 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s1-qos-25 MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

**Run 5 — QOS=50:**

```bash
WORKER_CONSUMER_QOS=50 WORKER_CONSUMER_FLATMAP_CONCURRENCY=50 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s1-qos-50 MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

After all 5 runs: run mandatory reset steps, then proceed to S2.

---

### S2 — DLQ Validation

```bash
# Switch stub to 100% failure, instant response
STUB_FAILURE_RATE=1.0 STUB_DELAY_SECONDS=0 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d ai-service

# Set worker to QOS=10
WORKER_CONSUMER_QOS=10 WORKER_CONSUMER_FLATMAP_CONCURRENCY=10 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s2-dlq MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

**Expected result:** `document.processing.dlq` depth = 1000.

After: run mandatory reset steps, restore stub to defaults, proceed to S3.

```bash
# Restore stub to defaults before S3
STUB_FAILURE_RATE=0.0 STUB_DELAY_SECONDS=1.0 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d ai-service
```

---

### S3 — Retry Mix

```bash
# 40% failure rate
STUB_FAILURE_RATE=0.4 STUB_DELAY_SECONDS=1.0 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d ai-service

WORKER_CONSUMER_QOS=10 WORKER_CONSUMER_FLATMAP_CONCURRENCY=10 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s3-retry-mix MESSAGE_COUNT=1000 \
  python load-tests/upload-script/upload.py
```

After: run mandatory reset steps, restore stub to defaults, proceed to S4.

```bash
STUB_FAILURE_RATE=0.0 STUB_DELAY_SECONDS=1.0 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d ai-service
```

---

### S4 — 429 Backoff

```bash
# 100% rate limit responses
STUB_RATE_LIMIT_RATE=1.0 STUB_DELAY_SECONDS=0 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d ai-service

WORKER_CONSUMER_QOS=5 WORKER_CONSUMER_FLATMAP_CONCURRENCY=5 \
  docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  up -d worker

sleep 15

SCENARIO_NAME=s4-429 MESSAGE_COUNT=20 DRAIN_TIMEOUT_MINUTES=15 \
  python load-tests/upload-script/upload.py
```

**While this runs, watch the worker logs** — this is the one scenario where logs
tell you more than Grafana:

```bash
docker logs worker -f
```

You should see lines like:
```
WARN  DocumentProcessingConsumer - Processing failed for documentId=..., will retry if attempts remain
```
with approximately 65 seconds between retry attempts for each message.

If the retries happen in under 5 seconds, the 65s delay is not being applied —
stop the test immediately and investigate `RabbitMqConfig.documentProcessingRetry()`.

---

## Part 6: Results Capture

**Do this BEFORE tearing down the stack. Once `docker-compose down` runs, Prometheus
data is gone. Grafana data survives (named volume) but the time series do not.**

---

### Step 1 — Export every CSV from the Load Test dashboard

This is the most critical step. Do it before anything else.

Open the **Load Test — Pipeline Overview** dashboard (`http://localhost:3000/d/load-test-pipeline`).

For **every panel**, do this in order:
1. Click the three-dot menu (⋯) on the panel
2. **Inspect → Data**
3. Click **Download CSV**
4. Save to `load-tests/results/grafana-exports/`

**⚠️ CRITICAL — panels that export multiple series correctly:**

The Queue Depth panel has 4 separate targets (one per queue). When you export it
from the **panel inspector** (not from Explore), Grafana will include all 4 columns:
`document.processing`, `document.processed`, `document.processing.dlq`, `document.status`.

**DO NOT export from the Explore view** — Explore only exports the first series.
Always export from the dashboard panel inspector.

**Complete panel export checklist — check each off:**

| Panel | Expected columns | Done? |
|---|---|---|
| Queue Depth — All Queues | document.processing, document.processed, document.processing.dlq, document.status | ☐ |
| Total Messages Ready | Total ready | ☐ |
| Message Publish Rate vs Deliver Rate | Publish rate (msg/s) | ☐ |
| Messages Published / s | Published / s | ☐ |
| Messages Routed to Queues / s | Routed / s | ☐ |
| Unacknowledged Messages (In-Flight) | Unacked (document.processing) | ☐ |
| Worker Unacked vs QOS Capacity | Unacked (in-flight) | ☐ |
| Retries & DLQ Events | Retry rate | ☐ |
| AI Call Latency — Average per Operation | Avg latency — flashcards | ☐ |
| End-to-End Pipeline Duration — Average | Avg e2e duration (DONE) | ☐ |
| Backend DB Connection Pool (HikariCP) | Active connections | ☐ |
| Consumer Capacity — document.processing | Consumer capacity | ☐ |
| Worker CPU Usage | Worker CPU | ☐ |
| Worker JVM Heap | Heap used — G1 Eden Space | ☐ |
| Backend JVM Heap | Heap used — G1 Eden Space | ☐ |
| Worker Threads | Live threads | ☐ |
| Worker CPU Usage | Worker CPU | ☐ |
| Worker Unacked vs QOS Capacity | Unacked (in-flight) | ☐ |

**After downloading, verify the Queue Depth CSV has 4 columns:**

```bash
head -2 "load-tests/results/grafana-exports/Queue Depth*"
# Must show: Time, document.processing, document.processed, document.processing.dlq, document.status
# If it only shows Time + one column — you exported from Explore, not the panel. Redo it.
```

---

### Step 2 — Export Grafana snapshots

For each dashboard (RabbitMQ Overview, JVM Micrometer, Load Test Pipeline):

Grafana UI → Dashboard → Share (top bar) → Snapshot → Publish locally

This creates a permanent snapshot URL accessible even after the stack is torn down.
Copy all snapshot URLs into `load-tests/results/snapshots.md`.

### Step 3 — Export raw Prometheus data (optional)

If you want the raw time series for later analysis:

```bash
# Query queue depth over the full test window
curl "http://localhost:9090/api/v1/query_range?\
query=rabbitmq_queue_messages{queue='document.processing'}\
&start=$(date -d '3 hours ago' +%s)&end=$(date +%s)&step=5" \
> load-tests/results/queue-depth-$(date +%Y%m%d).json
```

### Step 3 — Note the result files

The upload script wrote one JSON file per run to `load-tests/results/`. These
contain start/end times and total duration for each scenario. These are gitignored
(raw data) but review them now before teardown.

### Step 4 — Fill in the results summary

Create `load-tests/results/summary-YYYYMMDD.md` with:

```markdown
# Load Test Results — YYYY-MM-DD

## S1 QOS Ladder

| QOS | Duration | Peak worker memory | Peak CPU | Notes |
|-----|----------|--------------------|----------|-------|
| 2   |          |                    |          |       |
| 5   |          |                    |          |       |
| 10  |          |                    |          |       |
| 25  |          |                    |          |       |
| 50  |          |                    |          |       |

Throughput ceiling observed at QOS=___. Reason: ___.

## S2 DLQ Validation
DLQ depth after run: ___. Expected: 1000. Pass/Fail: ___.

## S3 Retry Mix
Approximate DONE/DLQ split: ___/___. Retry counter value: ___.

## S4 429 Backoff
Observed delay between retries (from worker logs): ___s. Expected: ~65s.
Pass/Fail: ___.

## Grafana Snapshot URLs
- RabbitMQ:
- JVM Micrometer:
- Custom:
```

This file **is** committed to the repo — it is the permanent record of findings.

---

## Part 7: Cleanup

Run the cleanup script after results are captured and before tearing down.

### Step 1 — Clean the database

Connect to your Supabase database via the SQL editor in the dashboard, or via
`psql`. Run in this order (cascade handles children automatically):

```sql
-- Remove all test documents (cascades to summaries, flashcards, quiz_questions)
DELETE FROM documents
WHERE title LIKE 'loadtest-%';

-- Remove all synthetic test users
DELETE FROM users
WHERE email LIKE 'loadtest-%@loadtest.local';

-- Verify
SELECT COUNT(*) FROM documents WHERE title LIKE 'loadtest-%';   -- expect 0
SELECT COUNT(*) FROM users    WHERE email LIKE 'loadtest-%@loadtest.local'; -- expect 0
```

### Step 2 — Clean Supabase Storage

In the Supabase dashboard → Storage → documents bucket:

Filter or search for folders starting with `10000000-0000-0000-0000-`. There
will be 100 folders (one per synthetic user), each containing up to 10 PDFs per
scenario run. Select all and delete.

Alternatively, use the Supabase CLI if installed:

```bash
supabase storage rm --recursive \
  --project-ref crnenbwufcgjxzqjemcd \
  documents/10000000-0000-0000-0000-
```

### Step 3 — Flush Redis

```bash
docker exec redis redis-cli FLUSHDB
```

### Step 4 — Remove RabbitMQ max-length policy

```bash
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/policies/%2F/load-test-max-length
```

### Step 5 — Tear down the load test stack

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  down
```

If you want to return to the normal dev stack (without the load test overlay):

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

---

## Part 8: Emergency Procedures

### The upload script fires its own emergency brake

If the upload script detects that `document.processing` queue depth has grown to
more than 1.5× the message count (sign that messages are not being consumed),
it stops publishing automatically and exits non-zero. Check worker logs immediately:

```bash
docker logs worker --tail 100
```

### Kill switch — stop all processing immediately

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f load-tests/docker-compose.loadtest.yml \
  stop worker
```

Messages already in `document.processing` remain there safely (durable queue).
They can be inspected in the RabbitMQ UI and purged manually:

```bash
curl -u guest:guest -X DELETE \
  http://localhost:15673/api/queues/%2F/document.processing/contents
```

### If the DLQ fills unexpectedly during S1 (happy path)

Stop the worker immediately. Something is wrong with the stub or the worker
configuration. Do not continue with more scenarios. Check:

1. Is the stub actually running? `docker logs ai-service --tail 50`
2. Is `STUB_FAILURE_RATE` set to 0? `docker inspect ai-service | grep STUB`
3. Are the worker retry logs showing the real error? `docker logs worker --tail 100`

### RabbitMQ max-length policy as final backstop

Even if the upload script fails to self-monitor, the RabbitMQ max-length policy
set in Step 5 of pre-flight caps `document.processing` at 2000 messages. Anything
beyond that is routed directly to the DLQ. This prevents indefinite accumulation
regardless of what the script or worker does.

---

## Appendix: Free Tier Impact Reference

| Supabase Resource | Limit | One full session (all 4 scenarios) | Headroom |
|---|---|---|---|
| Storage | 1 GB | ~25 MB (1000 × 25KB PDF) | 97.5% |
| Database | 500 MB | ~4 MB | 99.2% |
| Bandwidth egress | 5 GB/month | ~30 MB | 99.4% |
| Auth MAU | 50,000 | 0 (DevAuth bypass) | 100% |

A retry storm cannot deplete these limits. The mathematical ceiling of the worst
case (all 1000 messages retrying 3 times each) is still under 100 MB storage and
10 MB database — well within free tier limits. The emergency brake exists to
prevent infinite loops and wasted time, not to protect Supabase quotas.
