"""
Load test upload script — AI Learning Assistant.

Orchestrates a full load test scenario by:
  1. Syncing 100 synthetic users into the backend DB (via POST /api/v1/auth/sync)
  2. Posting a Grafana annotation marking test start
  3. Uploading MESSAGE_COUNT PDFs via the real POST /api/v1/documents endpoint
     (distributes uploads across 100 users to stay within the 10/hour rate limit)
  4. Monitoring queue depth — fires emergency brake if messages stop being consumed
  5. Waiting for document.processing queue to drain to zero
  6. Posting a Grafana annotation marking test end
  7. Writing a structured JSON result file to load-tests/results/

Authentication: uses DevAuthFilter (X-Dev-User-Id / X-Dev-User-Email headers).
Requires the backend to be running with SPRING_PROFILES_ACTIVE=dev.

Usage:
  SCENARIO_NAME=s1-qos-2 MESSAGE_COUNT=1000 python upload.py

Environment variables:
  SCENARIO_NAME           — required, e.g. s1-qos-2, s2-dlq, s3-retry-mix, s4-429
  MESSAGE_COUNT           — number of documents to upload (default: 1000)
  DRAIN_TIMEOUT_MINUTES   — how long to wait for queue to drain (default: 30)
  BACKEND_URL             — backend base URL (default: http://localhost:8181)
  RABBITMQ_API_URL        — RabbitMQ management API (default: http://localhost:15673/api)
  RABBITMQ_USER           — RabbitMQ credentials (default: guest)
  RABBITMQ_PASS           — RabbitMQ credentials (default: guest)
  GRAFANA_URL             — Grafana base URL (default: http://localhost:3000)
  GRAFANA_USER            — Grafana credentials (default: admin)
  GRAFANA_PASS            — Grafana credentials (default: admin)
"""

import io
import json
import os
import signal
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

# ── Config ────────────────────────────────────────────────────────────────────

SCENARIO_NAME         = os.environ.get("SCENARIO_NAME")
UPLOAD_WORKERS        = int(os.environ.get("UPLOAD_WORKERS", "10"))  # concurrent upload threads
MESSAGE_COUNT         = int(os.environ.get("MESSAGE_COUNT", "1000"))
DRAIN_TIMEOUT_MINUTES = int(os.environ.get("DRAIN_TIMEOUT_MINUTES", "30"))
BACKEND_URL           = os.environ.get("BACKEND_URL",       "http://localhost:8181")
RABBITMQ_API_URL      = os.environ.get("RABBITMQ_API_URL",  "http://localhost:15673/api")
RABBITMQ_USER         = os.environ.get("RABBITMQ_USER",     "guest")
RABBITMQ_PASS         = os.environ.get("RABBITMQ_PASS",     "guest")
GRAFANA_URL           = os.environ.get("GRAFANA_URL",       "http://localhost:3000")
GRAFANA_USER          = os.environ.get("GRAFANA_USER",      "admin")
GRAFANA_PASS          = os.environ.get("GRAFANA_PASS",      "admin")

# 100 synthetic users — 100 × 10 uploads/hour = 1000 total within rate limit
NUM_USERS = 100

console = Console()

# Allow Ctrl+C to kill the script even while threads are blocking on HTTP requests
signal.signal(signal.SIGINT, lambda s, f: (console.print("\n[red]Interrupted.[/red]"), sys.exit(1)))

# ── Synthetic user helpers ────────────────────────────────────────────────────

def user_id(i: int) -> str:
    """Predictable UUID for synthetic user i (1-based). Starts with 10000000 for easy cleanup."""
    return f"10000000-0000-0000-0000-{i:012d}"


def user_email(i: int) -> str:
    return f"loadtest-{i:03d}@loadtest.local"


# ── PDF generation ────────────────────────────────────────────────────────────

def make_minimal_pdf() -> bytes:
    """
    Generate a minimal syntactically valid PDF that PDFBox can parse and extract text from.
    Byte offsets in the xref table are computed dynamically to guarantee correctness.
    No external dependencies — pure Python.
    """
    stream_content = (
        b"BT /F1 12 Tf 72 720 Td "
        b"(Load test document for AI Learning Assistant pipeline testing. "
        b"This stub PDF exercises the full worker pipeline: download, text extraction, "
        b"and AI service calls.) Tj ET"
    )
    objects = [
        b"<</Type /Catalog /Pages 2 0 R>>",
        b"<</Type /Pages /Kids [3 0 R] /Count 1>>",
        (
            b"<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
            b" /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>"
        ),
        (
            b"<</Length " + str(len(stream_content)).encode() + b">>\n"
            b"stream\n" + stream_content + b"\nendstream"
        ),
        b"<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>",
    ]

    buf = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(buf))
        buf += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_offset = len(buf)
    xref = b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
    xref += b"0000000000 65535 f \n"
    for off in offsets:
        xref += f"{off:010d} 00000 n \n".encode()

    trailer = (
        b"trailer\n<</Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R>>\n"
        b"startxref\n" + str(xref_offset).encode() + b"\n%%EOF"
    )
    return buf + xref + trailer


# ── API helpers ───────────────────────────────────────────────────────────────

def dev_headers(i: int) -> dict:
    """DevAuthFilter headers for synthetic user i."""
    return {
        "X-Dev-User-Id":    user_id(i),
        "X-Dev-User-Email": user_email(i),
    }


def sync_user(session: requests.Session, i: int) -> bool:
    """Upsert synthetic user i into the backend DB. Returns True on success."""
    try:
        r = session.post(
            f"{BACKEND_URL}/api/v1/auth/sync",
            json={"supabaseUserId": user_id(i), "email": user_email(i)},
            headers=dev_headers(i),
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        console.print(f"[red]sync_user {i} failed: {e}[/red]")
        return False


def upload_document(session: requests.Session, i: int, title: str, pdf_bytes: bytes) -> bool:
    """
    Upload a PDF document for synthetic user i.
    Returns True on success (HTTP 201).
    """
    try:
        r = session.post(
            f"{BACKEND_URL}/api/v1/documents",
            files={"file": ("sample.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"title": title},
            headers=dev_headers(i),
            timeout=30,
        )
        if r.status_code == 201:
            return True
        console.print(f"[yellow]Upload {title} returned {r.status_code}: {r.text[:200]}[/yellow]")
        return False
    except Exception as e:
        console.print(f"[red]Upload {title} failed: {e}[/red]")
        return False


def get_queue_depth(session: requests.Session) -> int | None:
    """Poll document.processing queue depth via RabbitMQ management API."""
    try:
        r = session.get(
            f"{RABBITMQ_API_URL}/queues/%2F/document.processing",
            auth=(RABBITMQ_USER, RABBITMQ_PASS),
            timeout=5,
        )
        if r.status_code == 200:
            return r.json().get("messages", 0)
    except Exception:
        pass
    return None


def post_grafana_annotation(session: requests.Session, text: str, tags: list[str]) -> None:
    """Post an annotation to Grafana marking a test event on the timeline."""
    try:
        session.post(
            f"{GRAFANA_URL}/api/annotations",
            json={"text": text, "tags": tags},
            auth=(GRAFANA_USER, GRAFANA_PASS),
            timeout=5,
        )
    except Exception:
        pass  # Grafana annotation failure is non-fatal


def wait_for_backend(session: requests.Session, max_wait: int = 60) -> bool:
    """Wait up to max_wait seconds for the backend health endpoint to respond."""
    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        try:
            r = session.get(f"{BACKEND_URL}/actuator/health", timeout=3)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    if not SCENARIO_NAME:
        console.print("[red]SCENARIO_NAME environment variable is required.[/red]")
        console.print("Example: SCENARIO_NAME=s1-qos-2 python upload.py")
        return 1

    run_id  = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    pdf     = make_minimal_pdf()
    session = requests.Session()

    console.rule(f"[bold]Load Test — {SCENARIO_NAME}[/bold]")
    console.print(f"Messages : {MESSAGE_COUNT}")
    console.print(f"Users    : {NUM_USERS}")
    console.print(f"Workers  : {UPLOAD_WORKERS} concurrent")
    console.print(f"Backend  : {BACKEND_URL}")
    console.print(f"Run ID   : {run_id}")
    console.print()

    # ── Wait for backend ──────────────────────────────────────────────────────
    console.print("Waiting for backend...")
    if not wait_for_backend(session):
        console.print("[red]Backend did not become healthy within 60s. Aborting.[/red]")
        return 1
    console.print("[green]Backend is ready.[/green]")

    # ── Sync users ────────────────────────────────────────────────────────────
    console.print(f"\nSyncing {NUM_USERS} synthetic users...")
    failed_syncs = 0
    for i in range(1, NUM_USERS + 1):
        if not sync_user(session, i):
            failed_syncs += 1
    if failed_syncs > 0:
        console.print(f"[yellow]Warning: {failed_syncs}/{NUM_USERS} user syncs failed.[/yellow]")
    else:
        console.print(f"[green]All {NUM_USERS} users synced.[/green]")

    # ── Grafana annotation: test start ────────────────────────────────────────
    post_grafana_annotation(
        session,
        f"Load test started: {SCENARIO_NAME} ({MESSAGE_COUNT} messages)",
        ["loadtest", "start", SCENARIO_NAME],
    )

    # ── Upload documents (concurrent) ─────────────────────────────────────────
    # ThreadPoolExecutor fires UPLOAD_WORKERS requests simultaneously.
    # Each worker gets its own requests.Session to avoid connection contention.
    # Round-robin across 100 synthetic users keeps rate limiter happy (10/user/hour).
    console.print(f"\nUploading {MESSAGE_COUNT} documents ({UPLOAD_WORKERS} concurrent workers)...")
    upload_start  = time.monotonic()
    uploaded      = 0
    upload_errors = 0

    import threading
    thread_local = threading.local()

    def get_thread_session() -> requests.Session:
        if not hasattr(thread_local, "session"):
            thread_local.session = requests.Session()
        return thread_local.session

    def upload_task(idx: int) -> bool:
        worker_session = get_thread_session()
        user_idx = (idx % NUM_USERS) + 1
        title    = f"loadtest-{SCENARIO_NAME}-{idx:04d}"
        return upload_document(worker_session, user_idx, title, pdf)

    with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as executor:
        futures = {executor.submit(upload_task, idx): idx for idx in range(MESSAGE_COUNT)}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if future.result():
                uploaded += 1
            else:
                upload_errors += 1

            if completed % 100 == 0 or completed == MESSAGE_COUNT:
                elapsed = time.monotonic() - upload_start
                console.print(
                    f"  {completed}/{MESSAGE_COUNT} uploaded "
                    f"({elapsed:.1f}s, {upload_errors} errors)"
                )

            # Emergency brake check every 100 completions
            if completed % 100 == 0:
                depth = get_queue_depth(session)
                if depth is not None and depth > MESSAGE_COUNT * 1.5:
                    console.print(
                        f"\n[bold red]EMERGENCY BRAKE[/bold red]: queue depth {depth} exceeds "
                        f"{int(MESSAGE_COUNT * 1.5)} (1.5× message count). "
                        "Messages are not being consumed. Stopping uploads.\n"
                        "Run: docker-compose stop worker\n"
                        "Then check: docker logs worker --tail 100"
                    )
                    post_grafana_annotation(
                        session,
                        f"EMERGENCY BRAKE: {SCENARIO_NAME} — queue depth {depth}",
                        ["loadtest", "emergency", SCENARIO_NAME],
                    )
                    executor.shutdown(wait=False, cancel_futures=True)
                    return 1

    upload_elapsed = time.monotonic() - upload_start
    console.print(
        f"\n[green]Upload complete:[/green] {uploaded} succeeded, "
        f"{upload_errors} failed in {upload_elapsed:.1f}s"
    )

    # ── Wait for queue to drain ───────────────────────────────────────────────
    console.print("\nWaiting for document.processing queue to drain...")
    drain_start   = time.monotonic()
    drain_timeout = DRAIN_TIMEOUT_MINUTES * 60
    last_depth    = None

    while True:
        elapsed = time.monotonic() - drain_start
        if elapsed > drain_timeout:
            console.print(
                f"[yellow]Drain timeout after {DRAIN_TIMEOUT_MINUTES} minutes. "
                f"Queue depth: {last_depth}[/yellow]"
            )
            break

        depth = get_queue_depth(session)
        if depth is not None:
            last_depth = depth
            console.print(
                f"  Queue depth: {depth:>5}  "
                f"(elapsed: {elapsed:.0f}s)",
                end="\r",
            )
            if depth == 0:
                console.print(f"\n[green]Queue drained in {elapsed:.1f}s.[/green]")
                break

        time.sleep(5)

    total_elapsed = time.monotonic() - upload_start

    # ── Grafana annotation: test end ──────────────────────────────────────────
    post_grafana_annotation(
        session,
        f"Load test ended: {SCENARIO_NAME} — drained in {total_elapsed:.0f}s",
        ["loadtest", "end", SCENARIO_NAME],
    )

    # ── Write result file ─────────────────────────────────────────────────────
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    result_file = results_dir / f"run-{run_id}-{SCENARIO_NAME}.json"

    result = {
        "run_id":            run_id,
        "scenario":          SCENARIO_NAME,
        "message_count":     MESSAGE_COUNT,
        "uploaded":          uploaded,
        "upload_errors":     upload_errors,
        "upload_elapsed_s":  round(upload_elapsed, 2),
        "total_elapsed_s":   round(total_elapsed, 2),
        "final_queue_depth": last_depth,
        "timestamp_utc":     datetime.now(timezone.utc).isoformat(),
    }

    result_file.write_text(json.dumps(result, indent=2))
    console.print(f"\nResult written to: {result_file}")

    # ── Summary ───────────────────────────────────────────────────────────────
    console.rule("[bold]Summary[/bold]")
    table = Table(show_header=False, box=None)
    table.add_column(style="bold")
    table.add_column()
    table.add_row("Scenario",       SCENARIO_NAME)
    table.add_row("Uploaded",       f"{uploaded} / {MESSAGE_COUNT}")
    table.add_row("Upload time",    f"{upload_elapsed:.1f}s")
    table.add_row("Total time",     f"{total_elapsed:.1f}s")
    table.add_row("Final depth",    str(last_depth))
    table.add_row("Result file",    str(result_file.name))
    console.print(table)

    return 0


if __name__ == "__main__":
    sys.exit(main())
