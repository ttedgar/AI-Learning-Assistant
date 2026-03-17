package com.edi.backend.security;

import com.edi.backend.controller.HealthController;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.client.RestTestClient;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Unit tests for {@link JwtAuthenticationFilter}.
 *
 * <p>Uses Spring Framework 7's {@link RestTestClient} in standalone mode — no Spring application
 * context, no database, no Testcontainers. The filter is instantiated directly and attached to
 * a standalone MockMvc build that includes only the {@link HealthController}.
 *
 * <p>These tests verify the filter's own behaviour:
 * <ul>
 *   <li>Invalid JWT → filter short-circuits with 401 + RFC 7807 body</li>
 *   <li>Valid JWT → filter populates SecurityContext and passes through</li>
 * </ul>
 *
 * <p>Testing "unauthenticated access to a protected route returns 401" is exercised in
 * {@link com.edi.backend.integration.HealthEndpointIT} which loads the full Spring Security stack.
 */
class JwtFilterTest {

    /**
     * Test-only JWT secret — never used in production. Supabase secrets are 64-char hex strings.
     * HMAC-SHA256 requires a minimum of 256 bits (32 bytes).
     */
    private static final String JWT_SECRET =
            "test-secret-used-only-in-unit-and-integration-tests-32bytes!";

    private RestTestClient restTestClient;
    private SecretKey signingKey;

    @BeforeEach
    void setUp() {
        signingKey = Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8));

        SupabaseJwtValidator validator = new SupabaseJwtValidator(JWT_SECRET);
        JwtAuthenticationFilter jwtFilter = new JwtAuthenticationFilter(validator);

        restTestClient = RestTestClient
                .bindToController(new HealthController())
                .configureServer(builder -> builder.addFilters(jwtFilter))
                .build();
    }

    // ── Public endpoint ────────────────────────────────────────────────────────

    @Test
    @DisplayName("Health endpoint is accessible without a JWT (permit-all)")
    void healthEndpoint_noToken_returns200() {
        restTestClient.get().uri("/api/v1/health")
                .exchange()
                .expectStatus().isOk();
    }

    // ── Valid JWT ──────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Valid JWT passes filter — request reaches the controller")
    void validJwt_passesFilter_requestSucceeds() {
        String token = buildToken(UUID.randomUUID().toString(), "user@example.com", false);

        restTestClient.get().uri("/api/v1/health")
                .header("Authorization", "Bearer " + token)
                .exchange()
                .expectStatus().isOk();
    }

    // ── Invalid / malformed JWTs ───────────────────────────────────────────────

    @Test
    @DisplayName("JWT signed with wrong key returns 401 with problem+json body")
    void invalidJwtSignature_returns401() {
        SecretKey wrongKey = Keys.hmacShaKeyFor(
                "completely-different-secret-key-not-used-anywhere-1!".getBytes(StandardCharsets.UTF_8));
        String tamperedToken = Jwts.builder()
                .subject(UUID.randomUUID().toString())
                .claim("email", "hacker@example.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 3_600_000))
                .signWith(wrongKey)
                .compact();

        restTestClient.get().uri("/api/v1/health")
                .header("Authorization", "Bearer " + tamperedToken)
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentType("application/problem+json");
    }

    @Test
    @DisplayName("Expired JWT returns 401 with problem+json body")
    void expiredJwt_returns401() {
        String expiredToken = buildToken(UUID.randomUUID().toString(), "user@example.com", true);

        restTestClient.get().uri("/api/v1/health")
                .header("Authorization", "Bearer " + expiredToken)
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentType("application/problem+json");
    }

    @Test
    @DisplayName("Malformed token (not a JWT) returns 401 with problem+json body")
    void malformedToken_returns401() {
        restTestClient.get().uri("/api/v1/health")
                .header("Authorization", "Bearer not-a-real-jwt-at-all")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentType("application/problem+json");
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private String buildToken(String userId, String email, boolean expired) {
        long now = System.currentTimeMillis();
        Date expiry = expired
                ? new Date(now - 1_000)           // 1 second in the past
                : new Date(now + 3_600_000);      // 1 hour in the future

        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .claim("role", "authenticated")
                .issuedAt(new Date(now))
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }
}
