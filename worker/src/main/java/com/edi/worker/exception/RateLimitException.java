package com.edi.worker.exception;

/**
 * Thrown when the ai-service responds with HTTP 429 (Gemini quota exceeded).
 *
 * <p>Used to distinguish rate-limit failures from transient infrastructure failures
 * in the retry strategy. The {@link com.edi.worker.config.RabbitMqConfig} retry bean
 * applies a 65-second minimum backoff for this exception type — long enough for the
 * Gemini free-tier 1-minute RPM window to reset — while infrastructure failures
 * (network errors, 502s) use the standard 1 s / 2 s exponential backoff.
 *
 * <p>Production note: with a paid Gemini tier the quota windows are longer (day-based)
 * and a fixed 65 s backoff would not suffice. In that case, the ai-service should
 * include a Retry-After header and the worker should respect it.
 */
public class RateLimitException extends RuntimeException {

    public RateLimitException(String message) {
        super(message);
    }
}
