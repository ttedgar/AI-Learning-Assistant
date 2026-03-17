# Multi-stage build — keeps the final image lean by separating build deps
# from runtime deps. Production would add a non-root USER and a read-only
# filesystem layer.

# ── Stage 1: dependency install ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build tools needed by some Python packages (e.g. grpcio wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY app/ ./app/

# Production: run as non-root user
# RUN useradd -m appuser && chown -R appuser /app
# USER appuser

EXPOSE 8000

# Uvicorn with 2 workers. Production: tune workers = (2 × CPU cores) + 1
# and add --log-config for JSON logging integration.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
