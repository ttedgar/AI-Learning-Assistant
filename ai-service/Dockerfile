# Multi-stage build — keep production image minimal
# Production note: pin to a specific digest for supply-chain security
FROM python:3.12-slim AS base

WORKDIR /app

# Install dependencies in a separate layer for better cache utilisation
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run as non-root for security (principle of least privilege)
RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
