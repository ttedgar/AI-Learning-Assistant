# Reset script -- run between every load test scenario.
#
# Order matters:
#   1. Stop backend FIRST -- prevents StaleJobRecoveryService from
#      republishing PENDING documents into the queue while we purge.
#   2. Clean DB manually -- removes test documents so recovery service
#      has nothing to republish when backend restarts.
#   3. Purge queues + flush Redis.
#   4. Restart backend (worker started separately with QOS env vars).
#
# Usage: .\load-tests\reset.ps1

Write-Host ""
Write-Host "=== Load Test Reset ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Stopping backend and worker..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml -f docker-compose.dev.yml -f load-tests/docker-compose.loadtest.yml stop backend worker
Write-Host "      Stopped." -ForegroundColor Green

Write-Host ""
Write-Host "[2/5] DATABASE CLEANUP REQUIRED" -ForegroundColor Red
Write-Host "      Go to Supabase SQL editor and run:" -ForegroundColor White
Write-Host ""
Write-Host "        DELETE FROM documents WHERE title LIKE 'loadtest-%';" -ForegroundColor Cyan
Write-Host "        DELETE FROM users WHERE email LIKE 'loadtest-%@loadtest.local';" -ForegroundColor Cyan
Write-Host ""
Read-Host "      Press Enter when done"

Write-Host "[3/5] Purging queues..." -ForegroundColor Yellow
docker exec rabbitmq rabbitmqctl purge_queue document.processing
docker exec rabbitmq rabbitmqctl purge_queue document.processed
docker exec rabbitmq rabbitmqctl purge_queue document.processing.dlq
docker exec rabbitmq rabbitmqctl purge_queue document.status
Write-Host "      Queues purged." -ForegroundColor Green

Write-Host "[4/5] Flushing Redis..." -ForegroundColor Yellow
docker exec redis redis-cli FLUSHDB
Write-Host "      Redis flushed." -ForegroundColor Green

Write-Host "[5/5] Restarting backend..." -ForegroundColor Yellow
docker-compose -f docker-compose.yml -f docker-compose.dev.yml -f load-tests/docker-compose.loadtest.yml up -d backend
Write-Host "      Backend restarting." -ForegroundColor Green

Write-Host ""
Write-Host "=== Reset complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Start the worker when ready (replace QOS value as needed):" -ForegroundColor White
Write-Host ""
Write-Host '  $env:WORKER_CONSUMER_QOS="2"; $env:WORKER_CONSUMER_FLATMAP_CONCURRENCY="2"; docker-compose -f docker-compose.yml -f docker-compose.dev.yml -f load-tests/docker-compose.loadtest.yml up -d worker' -ForegroundColor Cyan
Write-Host ""
