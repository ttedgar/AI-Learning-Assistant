# Improvement Backlog

Architectural improvements identified during development. Each entry documents the current state, the problem it causes, and the target design. Ordered by impact.

---

## 1. Make the worker pipeline non-blocking and parallel

### Current state

`DocumentProcessingConsumer` runs on a Spring AMQP listener thread. Every I/O call in the pipeline blocks that thread:

```
listener thread
│
├─ pdfDownloader.download()          → .block()   ~1s
├─ aiServiceClient.summarize()       → .block()   ~20s
├─ aiServiceClient.generateFlashcards() → .block() ~20s   ← sequential, same input
└─ aiServiceClient.generateQuiz()   → .block()   ~20s   ← sequential, same input

Total wall time: ~61s. Thread occupied the entire time.
```

The three AI calls are completely independent — they all receive the same extracted text and produce unrelated outputs. There is no reason they run sequentially. This is the biggest avoidable performance cost in the system.

Additionally, `WebClient` is a reactive HTTP client (Project Reactor). Calling `.block()` on it defeats its purpose entirely — it forces a reactive pipeline back onto a blocking thread.

### Problem

- **Throughput**: One worker instance can only process one document at a time. During the ~60s it is blocked, it cannot pick up another message from the queue.
- **Thread waste**: The listener thread is frozen waiting on network I/O. The CPU is idle. The thread is not available for other work.
- **Scale ceiling**: Horizontal scaling (more worker instances) compensates, but each instance is still fundamentally inefficient.

### Target design

**Step 1 — Parallelise the three AI calls (high impact, low effort)**

The three AI calls can run concurrently using Project Reactor's `Mono.zip()`. This cuts AI processing time from ~60s to ~20s with no change to the threading model:

```java
Mono<String> summaryMono      = aiServiceClient.summarize(text);
Mono<List<FlashcardDto>> flashcardsMono = aiServiceClient.generateFlashcards(text);
Mono<List<QuizQuestionDto>> quizMono    = aiServiceClient.generateQuiz(text);

Mono.zip(summaryMono, flashcardsMono, quizMono)
    .map(tuple -> buildResultMessage(tuple.getT1(), tuple.getT2(), tuple.getT3()))
    .block(); // still blocking the listener thread, but 3x faster
```

This requires `AiServiceClient` methods to return `Mono<T>` instead of `T`, removing the `.block()` inside each method.

**Step 2 — Fully reactive pipeline (low effort, high correctness)**

Replace Spring AMQP's blocking listener with [Reactor RabbitMQ](https://projectreactor.io/docs/rabbitmq/release/reference/) (`reactor-rabbitmq`). The listener becomes a reactive stream — the thread is freed immediately when waiting for I/O and reused for other messages:

```java
// Reactor RabbitMQ receiver
receiver.consumeAutoAck(DOCUMENT_PROCESSING_QUEUE)
    .flatMap(delivery -> processMessage(delivery)  // non-blocking, frees thread during I/O
        .doOnError(e -> log.error("Processing failed", e)))
    .subscribe();
```

With `flatMap`, multiple messages can be in-flight concurrently on a small thread pool — the thread is only used when there is actual CPU work to do, not while waiting for Gemini to respond.

**Step 3 — Non-blocking PDF text extraction**

Apache PDFBox's `PDDocument.load()` and text extraction are CPU-bound and blocking. Move this onto a dedicated `Schedulers.boundedElastic()` thread pool to keep the reactive event loop unblocked:

```java
Mono.fromCallable(() -> pdfTextExtractor.extractText(pdfBytes))
    .subscribeOn(Schedulers.boundedElastic());
```

### Dependencies required

```gradle
implementation 'io.projectreactor.rabbitmq:reactor-rabbitmq:1.5.6'
// WebFlux already present — no addition needed for Mono/Flux
```

### What stays the same

- The `document.processing` and `document.processed` queue topology is unchanged.
- The single writer principle is unchanged — the worker still never touches the database.
- The dead-letter queue and retry logic are re-implemented using Reactor's `retryWhen()` operator.
- The AI service (FastAPI) is unchanged — it still exposes the same three HTTP endpoints.

### Interview framing

> "We used WebClient but called `.block()` on every request, which negates the reactive model entirely. The correct approach is to keep the pipeline as a `Mono` chain end-to-end — `Mono.zip()` for the parallel AI calls, `subscribeOn(Schedulers.boundedElastic())` for the CPU-bound PDF extraction, and Reactor RabbitMQ to replace the blocking AMQP listener. That gives us high concurrency from a small thread pool without horizontal scaling."

---

## 2. Parallelize AI calls at the AI service level

*(Placeholder — to be detailed)*

Currently the AI service calls Gemini sequentially within each endpoint. For the summarize endpoint on long documents, LangChain's map-reduce already parallelises chunk summarisation. The same pattern should be applied to flashcard and quiz generation when chunking is active.

---

## 3. Replace manual MDC tracing with OpenTelemetry

*(Placeholder — to be detailed)*

`correlationId` is manually injected into SLF4J MDC in the worker and extracted from the queue message. This does not propagate automatically across thread boundaries in a reactive pipeline (MDC is thread-local). OpenTelemetry with the Reactor context propagation bridge solves both problems: automatic trace propagation and compatibility with any observability backend (Jaeger, Tempo, Datadog).

---

## 4. Playwright E2E test suite

*(Placeholder — to be detailed)*

No end-to-end tests exist. The dev auth bypass (`DevAuthFilter`, `VITE_DEV_AUTH=true`) was explicitly built to enable Playwright testing without Google OAuth. The suite should cover: upload → polling → DONE state → summary/flashcard/quiz rendering. Run against `docker-compose.dev.yml` in CI.

---

## 5. Resilience4j circuit breaker on AI service calls

*(Placeholder — to be detailed)*

If the AI service is unhealthy, the worker retries 3 times per message, consuming retry budget and filling the DLQ. A circuit breaker would detect sustained failures and open the circuit — new messages fail immediately instead of burning retries, and the circuit closes automatically when the AI service recovers.
