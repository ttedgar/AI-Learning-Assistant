FROM python:3.12-slim

WORKDIR /app

# Install only what the stub needs — no LangChain, no Gemini SDK
RUN pip install --no-cache-dir fastapi uvicorn[standard]

COPY main.py .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
