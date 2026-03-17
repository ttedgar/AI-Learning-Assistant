package com.edi.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared Testcontainers configuration for integration tests.
 *
 * <p>Containers defined here are reused across all tests that {@code @Import} this class,
 * rather than being started/stopped per test. Spring Boot's {@code @ServiceConnection}
 * auto-wires each container's connection details into the application context, eliminating
 * the need for manually set {@code spring.datasource.url} etc. in test properties.
 *
 * <p>Infrastructure started:
 * <ul>
 *   <li>PostgreSQL — datasource and Liquibase migrations</li>
 *   <li>RabbitMQ — message broker (used by features worktree tests)</li>
 *   <li>Redis — rate limiting / cache (used by features worktree tests)</li>
 * </ul>
 *
 * <p><strong>Note on pinned image tags:</strong> {@code latest} is used here for simplicity.
 * In a production CI pipeline, pin image digests (e.g. {@code postgres:16.2}) to prevent
 * flaky tests from upstream image updates.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:latest"));
    }

    @Bean
    @ServiceConnection
    RabbitMQContainer rabbitContainer() {
        return new RabbitMQContainer(DockerImageName.parse("rabbitmq:latest"));
    }

    /**
     * Redis container. Spring Boot 3.1+ supports {@code @ServiceConnection} for Redis via
     * a {@link GenericContainer} when the service name is "redis".
     *
     * <p>Production note: use {@code redis:7-alpine} for a smaller, more secure image.
     */
    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redisContainer() {
        return new GenericContainer<>(DockerImageName.parse("redis:latest"))
                .withExposedPorts(6379);
    }
}
