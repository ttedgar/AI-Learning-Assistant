package com.edi.backend.service;

import com.edi.backend.exception.RateLimitExceededException;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.distributed.proxy.RemoteBucketBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link RateLimiterService}.
 *
 * <p>Mocks the Bucket4j {@link ProxyManager} to control bucket behaviour without Redis.
 * This tests the rate-limiter logic in isolation.
 */
@ExtendWith(MockitoExtension.class)
class RateLimiterTest {

    @Mock private ProxyManager<String> proxyManager;
    @Mock private RemoteBucketBuilder<String> bucketBuilder;
    @Mock private BucketProxy bucket;

    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        rateLimiterService = new RateLimiterService(proxyManager);
        when(proxyManager.builder()).thenReturn(bucketBuilder);
        when(bucketBuilder.build(any(String.class), any(Supplier.class))).thenReturn(bucket);
    }

    @Test
    void checkAndConsume_tokenAvailable_passes() {
        when(bucket.tryConsume(1)).thenReturn(true);

        assertThatCode(() -> rateLimiterService.checkAndConsume("user-123"))
                .doesNotThrowAnyException();

        verify(bucket).tryConsume(1);
    }

    @Test
    void checkAndConsume_bucketExhausted_throwsRateLimitExceeded() {
        when(bucket.tryConsume(1)).thenReturn(false);

        assertThatThrownBy(() -> rateLimiterService.checkAndConsume("user-123"))
                .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void checkAndConsume_usesUserScopedKey() {
        when(bucket.tryConsume(1)).thenReturn(true);
        String userId = "user-abc";

        rateLimiterService.checkAndConsume(userId);

        verify(bucketBuilder).build(eq("upload_limit:" + userId), any(Supplier.class));
    }
}
