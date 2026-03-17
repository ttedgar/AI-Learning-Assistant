package com.edi.backend.integration;

import com.edi.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.web.context.WebApplicationContext;

/**
 * Integration test: full Spring Boot application context + real infrastructure via Testcontainers.
 *
 * <p>Verifies that:
 * <ul>
 *   <li>The application context loads cleanly (DB connection, Liquibase migrations, all beans)</li>
 *   <li>The health endpoint responds 200 without authentication (permit-all route)</li>
 *   <li>Unauthenticated access to protected routes returns 401 (Spring Security configured)</li>
 * </ul>
 *
 * <p>Infrastructure started by {@link TestcontainersConfiguration}:
 * PostgreSQL (with Liquibase migrations applied), RabbitMQ, Redis.
 *
 * <p>Uses {@code MOCK} web environment so the test doesn't start a real HTTP server —
 * {@link RestTestClient} wraps MockMvc and exercises the full Spring Security filter chain
 * without the networking overhead of {@code RANDOM_PORT}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class HealthEndpointIT {

    @Autowired
    private WebApplicationContext webApplicationContext;

    private RestTestClient restTestClient;

    @BeforeEach
    void setUp() {
        // bindToApplicationContext applies Spring Security's full filter chain including
        // JwtAuthenticationFilter, CorrelationIdFilter, and the configured SecurityFilterChain.
        restTestClient = RestTestClient
                .bindToApplicationContext(webApplicationContext)
                .build();
    }

    // ── Health endpoint (permit-all) ──────────────────────────────────────────

    @Test
    @DisplayName("GET /api/v1/health returns 200 without any auth (permit-all)")
    void healthEndpoint_noAuth_returns200() {
        restTestClient.get().uri("/api/v1/health")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo("UP")
                .jsonPath("$.service").isEqualTo("backend");
    }

    @Test
    @DisplayName("GET /api/v1/health echoes back X-Correlation-Id header if supplied")
    void healthEndpoint_withCorrelationId_echosItBack() {
        String correlationId = "test-correlation-id-12345";

        restTestClient.get().uri("/api/v1/health")
                .header("X-Correlation-Id", correlationId)
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("X-Correlation-Id", correlationId);
    }

    // ── Protected routes (require auth) ──────────────────────────────────────

    @Test
    @DisplayName("Unauthenticated request to protected route returns 401 (Spring Security)")
    void protectedRoute_noAuth_returns401() {
        // /api/v1/documents will be added in the features worktree.
        // Even without a controller registered, Spring Security should deny access with 401
        // before the request reaches the DispatcherServlet.
        restTestClient.get().uri("/api/v1/documents")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentType("application/problem+json");
    }
}
