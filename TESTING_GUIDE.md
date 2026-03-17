# Testing Guide

This guide explains how to test each worktree after merging it into main.

---

## Golden rule

> A worktree is not done until its tests are written and passing.

Your acceptance checklist for every worktree:
1. Does it build?
2. Do automated tests pass?
3. Does `docker-compose up` start all services?
4. Does the feature actually work? (HTTP client / browser)

If any of these fail — the worktree goes back for fixes before you move on.

---

## Your local setup

### Prerequisites
- Docker Desktop installed and running
- IntelliJ IDEA
- A browser (Chrome/Firefox)
- Supabase project created (Auth, Storage, DB)

### First time setup
```bash
# 1. Copy env file and fill in your values
cp .env.example .env

# 2. Start all infrastructure
docker-compose up -d

# 3. Verify everything is running
docker-compose ps
```

All services should show status `running`.

---

## Testing by round

---

### Round 1 ✓ COMPLETE — already merged to main

**Worktrees:** `setup-infrastructure`, `backend-api-core`, `ai-service`

All three are merged. Services are running. Skip to Round 2.

For reference, what was verified:
- `docker-compose up -d` starts all services
- Backend Swagger UI: `http://localhost:8080/swagger-ui.html` ✓
- AI service health: call from within Docker network (see networking note below) ✓
- Supabase tables created by Liquibase ✓

> **WSL2 networking note:** Docker ports are exposed on the Windows host, not on WSL localhost.
> From WSL you cannot `curl http://localhost:8080` directly. Two options:
> - Use Windows PowerShell: `curl http://localhost:8080/api/v1/health`
> - Call from within the Docker network: `docker run --rm --network ai-learning-assistant_default curlimages/curl:latest http://backend:8080/api/v1/health`

---

#### Step 2 — Run automated tests
```bash
# Backend
cd backend
./gradlew test

# AI service
cd ai-service
pip install -r requirements.txt
pytest
```

All tests must be green before continuing.

#### Step 3 — Start services
```bash
docker-compose up -d
docker-compose ps   # all should be "running"
```

#### Step 4 — Health checks

Open browser:
- Backend Swagger UI: `http://localhost:8080/swagger-ui.html` → should load
- RabbitMQ dashboard: `http://localhost:15672` (guest/guest) → should load
- AI service health: `http://localhost:8000/health` → should return `{"status": "ok"}`

Or use IntelliJ HTTP client — create `test.http`:
```http
### Backend health
GET http://localhost:8080/api/v1/health

### AI service health
GET http://localhost:8000/health
```

Both should return HTTP 200.

#### Step 5 — Verify Supabase DB
- Open your Supabase dashboard
- Go to Table Editor
- Verify all tables exist: `users`, `documents`, `summaries`, `flashcards`, `quiz_questions`

#### Round 1 is done when:
- [ ] `./gradlew test` is green
- [ ] `pytest` is green
- [ ] All containers running
- [ ] `/health` endpoints return 200
- [ ] Swagger UI loads
- [ ] Supabase tables exist

---

### Round 2

**Worktrees:** `backend-api-features`, `worker`, `frontend-core`

This is the core of the application. You're testing real business logic — uploads, queue messages, AI processing.

#### Step 1 — Merge and build
```bash
git checkout main
git merge worktree-backend-api-features
git merge worktree-worker
git merge worktree-frontend-core
```

#### Step 2 — Run automated tests
```bash
cd backend
./gradlew test

cd worker
./gradlew test
```

All green before continuing.

#### Step 3 — Restart services
```bash
docker-compose down
docker-compose up -d --build   # --build because code changed
```

#### Step 4 — Test auth sync

In IntelliJ HTTP client:
1. Log in via Supabase (you'll need a JWT token — get it from browser devtools after Google login on frontend, or use Supabase dashboard → Authentication → Users → generate token)
2. Send:
```http
### Sync user
POST http://localhost:8080/api/v1/auth/sync
Authorization: Bearer YOUR_JWT_TOKEN
```
Should return 200. Check Supabase `users` table — your user should appear.

#### Step 5 — Test document upload

```http
### Upload PDF
POST http://localhost:8080/api/v1/documents
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data; boundary=boundary

--boundary
Content-Disposition: form-data; name="file"; filename="test.pdf"
Content-Type: application/pdf

< ./test.pdf
--boundary--
```

Expected: HTTP 202 Accepted, response contains `documentId` and `status: PENDING`

#### Step 6 — Watch the queue

Open RabbitMQ dashboard: `http://localhost:15672`
- Go to **Queues**
- You should see `document.processing` with 1 message (briefly, before worker picks it up)
- After worker processes: `document.processed` should appear and be consumed by backend

This is the most satisfying moment — watching messages flow between services in real time.

#### Step 7 — Watch worker logs

```bash
docker-compose logs -f worker
```

You should see log lines with your `correlationId`, document status changing PENDING → PROCESSING → DONE.

#### Step 8 — Verify results in Supabase

Open Supabase Table Editor:
- `documents` table → status should be `DONE`
- `summaries` table → should have a row for your document
- `flashcards` table → should have multiple rows
- `quiz_questions` table → should have multiple rows

#### Step 9 — Test results endpoints

```http
### Get document
GET http://localhost:8080/api/v1/documents/YOUR_DOCUMENT_ID
Authorization: Bearer YOUR_JWT_TOKEN

### Get summary
GET http://localhost:8080/api/v1/documents/YOUR_DOCUMENT_ID/summary
Authorization: Bearer YOUR_JWT_TOKEN

### Get flashcards
GET http://localhost:8080/api/v1/documents/YOUR_DOCUMENT_ID/flashcards
Authorization: Bearer YOUR_JWT_TOKEN

### Get quiz
GET http://localhost:8080/api/v1/documents/YOUR_DOCUMENT_ID/quiz
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Step 10 — Test rate limiting

Upload 11 PDFs. The 11th should return:
```
HTTP 429 Too Many Requests
```
With RFC 7807 Problem Details body.

#### Step 11 — Test error handling (DLQ)

```bash
# Stop ai-service to simulate failure
docker-compose stop ai-service

# Upload a PDF — worker will fail to call ai-service
# Watch worker logs — should retry 3 times
docker-compose logs -f worker

# Check RabbitMQ dashboard — message should land in document.processing.dlq
```

Restart ai-service after:
```bash
docker-compose start ai-service
```

#### Step 12 — Verify Langfuse traces

After a successful upload + processing flow, open your Langfuse dashboard:
- You should see traces for `summarize`, `flashcards`, `quiz` operations
- Each trace shows the Gemini model (`gemini-2.5-flash`), temperature, and operation name
- Traces linked to prompt versions (if Langfuse prompts are configured)

This is optional but confirms the full observability pipeline is working end-to-end.

#### Step 13 — Test frontend core

Open `http://localhost:5173`:
- [ ] Landing page loads
- [ ] "Login with Google" works, redirects to dashboard
- [ ] Dashboard shows your uploaded documents with correct status badges
- [ ] Upload page — drag & drop a PDF, progress shows, redirects to dashboard
- [ ] Status badge updates automatically (polling working)

#### Round 2 is done when:
- [ ] All automated tests green
- [ ] Upload → processing → results flow works end-to-end
- [ ] RabbitMQ messages flow correctly (visible in dashboard)
- [ ] DLQ receives failed messages
- [ ] Rate limiting returns 429
- [ ] Frontend auth + upload + dashboard work
- [ ] Supabase DB has correct data

---

### Round 3

**Worktrees:** `frontend-results`, `deployment`

Final round — full user experience and live deployment.

#### Step 1 — Merge and build
```bash
git checkout main
git merge worktree-frontend-results
git merge worktree-deployment
```

#### Step 2 — Run all tests
```bash
cd backend && ./gradlew test
cd worker && ./gradlew test
cd frontend && npm test
```

#### Step 3 — Full browser test

Open `http://localhost:5173` and go through the complete user flow:

- [ ] Login with Google
- [ ] Upload a PDF from dashboard
- [ ] Watch status badge change: PENDING → PROCESSING → DONE
- [ ] Click document → opens detail page
- [ ] Summary tab — readable summary appears
- [ ] Flashcards tab — cards flip on click, prev/next works, counter updates
- [ ] Quiz tab — answer multiple choice questions, correct/incorrect revealed, score shown at end
- [ ] Original tab — PDF viewable or downloadable
- [ ] Delete a document — disappears from dashboard
- [ ] Logout — redirects to landing page

#### Step 4 — Security test

- Log in as User A, upload a document, note the document ID
- Log in as User B (different Google account)
- Try to access User A's document directly: `http://localhost:5173/documents/USER_A_DOC_ID`
- Should be blocked — either redirect or error

#### Step 5 — Live deployment smoke test

After Railway deployment:
- [ ] Repeat the full browser test on the live URL
- [ ] Google OAuth works on live URL (not just localhost)
- [ ] Upload a real PDF — full flow works in production

#### Round 3 is done when:
- [ ] All automated tests green
- [ ] Full user flow works in browser locally
- [ ] Security test passes (users isolated)
- [ ] Live Railway deployment works end-to-end

---

## Quick reference commands

```bash
# Start everything
docker-compose up -d --build

# Stop everything
docker-compose down

# View logs for a specific service
docker-compose logs -f backend
docker-compose logs -f worker
docker-compose logs -f ai-service

# Run backend tests
cd backend && ./gradlew test

# Run worker tests
cd worker && ./gradlew test

# Run frontend tests
cd frontend && npm test

# Run AI service tests
cd ai-service && pytest

# Check RabbitMQ queues
open http://localhost:15672   # guest / guest

# Check Swagger UI
open http://localhost:8080/swagger-ui.html
```

---

## When something goes wrong

**Service won't start:**
```bash
docker-compose logs backend   # read the error
```

**Tests failing:**
- Read the test output carefully
- Check if Testcontainers needs Docker running
- Don't move to the next worktree until fixed

**Queue messages not flowing:**
- Open RabbitMQ dashboard `http://localhost:15672`
- Check if queues exist
- Check worker logs for errors

**AI service returning errors:**
- Check your Gemini API key in `.env`
- Check ai-service logs: `docker-compose logs ai-service`

**Database issues:**
- Open Supabase dashboard → Table Editor
- Check Liquibase migration logs in backend output
