package com.edi.backend.config;

import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.cas.LettuceBasedProxyManager;
import io.lettuce.core.AbstractRedisClient;
import io.lettuce.core.RedisClient;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.codec.StringCodec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;

/**
 * Configures Bucket4j's Redis-backed distributed rate limiter via the Lettuce client.
 *
 * <h3>Why Bucket4j + Redis?</h3>
 * <p>In-process rate limiters (e.g. Guava's RateLimiter) break under horizontal scaling —
 * each instance has its own counter. Bucket4j uses Lua scripts sent to Redis to implement
 * atomic token-bucket operations, ensuring the limit is enforced globally across all
 * backend pods.
 *
 * <h3>Why access Lettuce directly instead of RedisTemplate?</h3>
 * <p>Bucket4j's Lettuce integration requires a {@code StatefulRedisConnection<String, byte[]>}
 * to send raw Lua scripts. Spring's {@code RedisTemplate} abstracts over the connection and
 * doesn't expose the raw connection in a compatible form.
 *
 * <p>Production note: for Redis Cluster, cast {@code AbstractRedisClient} to
 * {@code RedisClusterClient} and use {@code StatefulRedisClusterConnection}.
 */
@Configuration
public class RateLimiterConfig {

    @Bean
    public ProxyManager<String> bucket4jProxyManager(LettuceConnectionFactory lettuceConnectionFactory) {
        AbstractRedisClient nativeClient = lettuceConnectionFactory.getNativeClient();
        // Single-node Redis (local Docker, Railway Redis plugin).
        // Production: RedisClusterClient for HA; RedisClient for standalone.
        RedisClient redisClient = (RedisClient) nativeClient;
        return LettuceBasedProxyManager
                .builderFor(redisClient.connect(RedisCodec.of(StringCodec.UTF8, ByteArrayCodec.INSTANCE)))
                .build();
    }
}
