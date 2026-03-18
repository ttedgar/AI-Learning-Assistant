#!/bin/sh
# Full E2E API test running inside Docker network
# Dev auth: X-Dev-User-Id + X-Dev-User-Email headers (no OAuth needed)

BACKEND="http://backend:8080"
AI_SERVICE="http://ai-service:8000"
DEV_USER_ID="00000000-0000-0000-0000-000000000001"
DEV_EMAIL="dev@local.test"
PDF_PATH="/data/solid-principles.pdf"

echo "============================================"
echo "AI LEARNING ASSISTANT - E2E API TEST"
echo "Date: $(date)"
echo "============================================"
echo ""

# ── STEP 1: Frontend check ─────────────────────────────────────────────────
echo "=== STEP 1: Check frontend is serving ==="
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://frontend:80/ 2>&1)
FRONTEND_HTML=$(curl -s http://frontend:80/ 2>&1)
echo "  Frontend HTTP status: $FRONTEND_STATUS"
echo "  HTML title line: $(echo "$FRONTEND_HTML" | grep -i '<title' | head -1)"
DEV_AUTH_CHECK=$(echo "$FRONTEND_HTML" | grep -c "dev" 2>/dev/null || echo "0")
echo "  HTML contains 'dev': $DEV_AUTH_CHECK occurrences"

# Check vite JS bundles for VITE_DEV_AUTH
JS_FILES=$(curl -s http://frontend:80/ | grep -o 'src="[^"]*\.js"' | sed 's/src="//;s/"//')
for f in $JS_FILES; do
  JS_CONTENT=$(curl -s "http://frontend:80$f" 2>&1)
  if echo "$JS_CONTENT" | grep -q "devAuth\|DEV_AUTH\|dev@local"; then
    echo "  Dev auth found in JS bundle: $f"
  fi
done
echo ""

# ── STEP 2: Backend health ─────────────────────────────────────────────────
echo "=== STEP 2: Check backend health ==="
HEALTH=$(curl -s "$BACKEND/actuator/health")
echo "  Backend health: $HEALTH"
echo ""

# ── STEP 3: AI service health ─────────────────────────────────────────────
echo "=== STEP 3: Check AI service health ==="
AI_HEALTH=$(curl -s "$AI_SERVICE/health")
echo "  AI service health: $AI_HEALTH"
echo ""

# ── STEP 4: Auth sync ─────────────────────────────────────────────────────
echo "=== STEP 4: Auth sync (simulate auto-login) ==="
AUTH_RESPONSE=$(curl -s -X POST "$BACKEND/api/v1/auth/sync" \
  -H "Content-Type: application/json" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL" \
  -d "{\"supabaseUserId\": \"$DEV_USER_ID\", \"email\": \"$DEV_EMAIL\"}")
echo "  Auth sync response: $AUTH_RESPONSE"
echo ""

# ── STEP 5: List existing documents ───────────────────────────────────────
echo "=== STEP 5: List existing documents ==="
DOCS_RESPONSE=$(curl -s "$BACKEND/api/v1/documents" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL")
echo "  Documents response: $DOCS_RESPONSE"
echo ""

# ── STEP 6: Upload PDF ────────────────────────────────────────────────────
echo "=== STEP 6: Upload solid-principles.pdf ==="
if [ ! -f "$PDF_PATH" ]; then
  echo "  ERROR: PDF not found at $PDF_PATH"
  exit 1
fi

PDF_SIZE=$(wc -c < "$PDF_PATH")
echo "  PDF size: $PDF_SIZE bytes"

UPLOAD_RESPONSE=$(curl -s -X POST "$BACKEND/api/v1/documents" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL" \
  -F "file=@$PDF_PATH;type=application/pdf" \
  -F "title=SOLID Principles")
echo "  Upload response: $UPLOAD_RESPONSE"
echo ""

# Extract document ID
DOC_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Extracted Document ID: $DOC_ID"
echo ""

if [ -z "$DOC_ID" ]; then
  echo "  ERROR: Could not extract document ID"
  echo "  Trying to get API docs..."

  # Check swagger for correct endpoints
  SWAGGER=$(curl -s "$BACKEND/v3/api-docs" 2>&1)
  echo "  API docs (first 1000 chars): ${SWAGGER:0:1000}"
  exit 1
fi

# ── STEP 7: Poll for processing ────────────────────────────────────────────
echo "=== STEP 7: Polling for processing completion ==="
echo "  (polling every 10 seconds, up to 4 minutes)"

PROCESSED=false
STATUS=""
STATUS_RESPONSE=""
for i in $(seq 1 24); do
  sleep 10

  STATUS_RESPONSE=$(curl -s "$BACKEND/api/v1/documents/$DOC_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -H "X-Dev-User-Email: $DEV_EMAIL")

  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Poll $i/24 at $(date +%H:%M:%S): status=$STATUS"

  # Also show any error field
  ERROR_FIELD=$(echo "$STATUS_RESPONSE" | grep -o '"error":"[^"]*"' | head -1)
  if [ -n "$ERROR_FIELD" ]; then
    echo "  Error field: $ERROR_FIELD"
  fi

  if [ "$STATUS" = "DONE" ] || [ "$STATUS" = "READY" ] || [ "$STATUS" = "COMPLETE" ]; then
    PROCESSED=true
    echo ""
    echo "  *** PROCESSING COMPLETE! Status: $STATUS ***"
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo ""
    echo "  *** PROCESSING FAILED! ***"
    echo "  Full response: $STATUS_RESPONSE"
    PROCESSED=false
    break
  fi
done

if [ "$PROCESSED" = "false" ] && [ "$STATUS" != "FAILED" ]; then
  echo ""
  echo "  TIMEOUT: Document not processed within 240 seconds"
  echo "  Last response: $STATUS_RESPONSE"
fi
echo ""

# ── STEP 8: Get final document ─────────────────────────────────────────────
echo "=== STEP 8: Final document state ==="
FINAL_DOC=$(curl -s "$BACKEND/api/v1/documents/$DOC_ID" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL")
echo "  Final document: $FINAL_DOC"
echo ""

# ── STEP 9: Get summary ────────────────────────────────────────────────────
echo "=== STEP 9: Summary ==="
SUMMARY=$(curl -s "$BACKEND/api/v1/documents/$DOC_ID/summary" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL")
SUMMARY_LEN=$(echo "$SUMMARY" | wc -c)
echo "  Summary response ($SUMMARY_LEN chars): ${SUMMARY:0:2000}"
echo ""

# ── STEP 10: Get flashcards ────────────────────────────────────────────────
echo "=== STEP 10: Flashcards ==="
FLASHCARDS=$(curl -s "$BACKEND/api/v1/documents/$DOC_ID/flashcards" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL")
FLASH_LEN=$(echo "$FLASHCARDS" | wc -c)
echo "  Flashcards ($FLASH_LEN chars): ${FLASHCARDS:0:2000}"
echo ""

# ── STEP 11: Get quiz ─────────────────────────────────────────────────────
echo "=== STEP 11: Quiz questions ==="
QUIZ=$(curl -s "$BACKEND/api/v1/documents/$DOC_ID/quiz" \
  -H "X-Dev-User-Id: $DEV_USER_ID" \
  -H "X-Dev-User-Email: $DEV_EMAIL")
QUIZ_LEN=$(echo "$QUIZ" | wc -c)
echo "  Quiz ($QUIZ_LEN chars): ${QUIZ:0:2000}"
echo ""

echo "============================================"
echo "TEST SUMMARY"
echo "  Document ID: $DOC_ID"
echo "  Final Status: $STATUS"
echo "  Processing Complete: $PROCESSED"
echo "  Summary chars: $SUMMARY_LEN"
echo "  Flashcards chars: $FLASH_LEN"
echo "  Quiz chars: $QUIZ_LEN"
echo "============================================"
