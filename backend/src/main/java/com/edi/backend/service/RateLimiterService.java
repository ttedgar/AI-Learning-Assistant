package com.edi.backend.service;

import com.edi.backend.exception.RateLimitExceededException;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Redis-backed distributed rate limiter using the token-bucket algorithm.
 *
 * <p>Each user gets their own bucket keyed by {@code upload_limit:<supabaseUserId>}.
 * The bucket is lazily created in Redis on first use with 10 tokens that refill every hour.
 *
 * <h3>Why token bucket over fixed window?</h3>
 * <p>A fixed-window counter allows a burst of 2× the limit straddling a window boundary
 * (e.g. 10 at 11:59 + 10 at 12:00). Token bucket prevents this by refilling tokens
 * continuously within the window.
 *
 * <p>Production note: for higher-scale services, consider sliding window log (exact) or
 * sliding window counter (approximate). For this application, token bucket is a good fit
 * because uploads are user-initiated and bursty behaviour is limited.
 */
@Service
public class RateLimiterService {

    private static final String KEY_PREFIX = "upload_limit:";
    private static final int MAX_UPLOADS_PER_HOUR = 10;

    private final ProxyManager<String> proxyManager;

    public RateLimiterService(ProxyManager<String> proxyManager) {
        this.proxyManager = proxyManager;
    }

    /**
     * Checks whether the user may perform another upload.
     *
     * @param supabaseUserId the user's Supabase UUID (used as the Redis bucket key)
     * @throws RateLimitExceededException if the rate limit has been reached
     */
    public void checkAndConsume(String supabaseUserId) {
        BucketConfiguration config = BucketConfiguration.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(MAX_UPLOADS_PER_HOUR)
                        .refillIntervally(MAX_UPLOADS_PER_HOUR, Duration.ofHours(1))
                        .build())
                .build();

        boolean consumed = proxyManager
                .builder()
                .build(KEY_PREFIX + supabaseUserId, () -> config)
                .tryConsume(1);

        if (!consumed) {
            throw new RateLimitExceededException();
        }
    }
}
