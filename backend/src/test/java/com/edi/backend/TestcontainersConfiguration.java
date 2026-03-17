package com.edi.backend;

import com.redis.testcontainers.RedisContainer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared Testcontainers configuration for integration tests.
 *
 * <p>Containers are started once per test class by Testcontainers JUnit 5 lifecycle management.
 * {@code @ServiceConnection} auto-wires each container's connection properties (host, port,
 * credentials) into Spring's application context, replacing the defaults from {@code application.yml}.
 *
 * <p>Requires Docker to be running. Tests annotated with
 * {@code @Testcontainers(disabledWithoutDocker = true)} are silently skipped if Docker is unavailable.
 *
 * <p>Infrastructure started:
 * <ul>
 *   <li>PostgreSQL — datasource and Liquibase migrations</li>
 *   <li>RabbitMQ — message broker</li>
 *   <li>Redis — rate limiting / cache</li>
 * </ul>
 *
 * <p><strong>Note on pinned image tags:</strong> Images are pinned to minor versions to prevent
 * flaky tests from upstream image updates. In a production CI pipeline, pin to digest hashes.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));
    }

    @Bean
    @ServiceConnection
    RabbitMQContainer rabbitContainer() {
        return new RabbitMQContainer(DockerImageName.parse("rabbitmq:3-management-alpine"));
    }

    /**
     * Redis container for Bucket4j rate-limiter integration tests.
     * {@code @ServiceConnection} maps to {@code spring.data.redis.*} properties automatically.
     */
    @Bean
    @ServiceConnection
    RedisContainer redisContainer() {
        return new RedisContainer(DockerImageName.parse("redis:7-alpine"));
    }
}
