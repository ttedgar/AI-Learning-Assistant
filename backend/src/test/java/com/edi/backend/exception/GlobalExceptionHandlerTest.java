package com.edi.backend.exception;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unit tests for {@link GlobalExceptionHandler}.
 *
 * <p>Uses Spring Framework 7's {@link RestTestClient} in standalone mode — no Spring application
 * context, no database, no Testcontainers. A minimal inline test controller deliberately triggers
 * each exception type so we can verify the RFC 7807 response shape.
 *
 * <p>Each test verifies:
 * <ul>
 *   <li>Correct HTTP status code</li>
 *   <li>Content-Type: {@code application/problem+json}</li>
 *   <li>Required RFC 7807 fields present in the JSON body</li>
 * </ul>
 */
class GlobalExceptionHandlerTest {

    private RestTestClient restTestClient;

    @BeforeEach
    void setUp() {
        restTestClient = RestTestClient
                .bindToController(new TestController())
                .configureServer(builder -> builder.setControllerAdvice(new GlobalExceptionHandler()))
                .build();
    }

    // ── ResourceNotFoundException → 404 ───────────────────────────────────────

    @Test
    @DisplayName("ResourceNotFoundException maps to 404 with RFC 7807 body")
    void resourceNotFound_produces404ProblemDetail() {
        restTestClient.get().uri("/test/not-found")
                .exchange()
                .expectStatus().isNotFound()
                .expectHeader().contentType("application/problem+json")
                .expectBody()
                .jsonPath("$.status").isEqualTo(404)
                .jsonPath("$.title").isEqualTo("Resource Not Found")
                .jsonPath("$.detail").exists()
                .jsonPath("$.type").isEqualTo("/errors/not-found");
    }

    // ── Generic Exception → 500 ───────────────────────────────────────────────

    @Test
    @DisplayName("Unhandled Exception maps to 500 with RFC 7807 body")
    void unhandledException_produces500ProblemDetail() {
        restTestClient.get().uri("/test/server-error")
                .exchange()
                .expectStatus().is5xxServerError()
                .expectHeader().contentType("application/problem+json")
                .expectBody()
                .jsonPath("$.status").isEqualTo(500)
                .jsonPath("$.title").isEqualTo("Internal Server Error")
                .jsonPath("$.detail").exists()
                .jsonPath("$.type").isEqualTo("/errors/internal");
    }

    // ── Bean Validation → 400 ─────────────────────────────────────────────────

    @Test
    @DisplayName("Bean validation failure maps to 400 with per-field errors in RFC 7807 body")
    void validationFailure_produces400WithFieldErrors() {
        restTestClient.post().uri("/test/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .body("""
                        {"name": ""}
                        """)
                .exchange()
                .expectStatus().isBadRequest()
                .expectHeader().contentType("application/problem+json")
                .expectBody()
                .jsonPath("$.status").isEqualTo(400)
                .jsonPath("$.title").isEqualTo("Validation Error")
                .jsonPath("$.errors").exists()
                .jsonPath("$.errors.name").exists();
    }

    // ── Minimal inline test controller ────────────────────────────────────────

    /**
     * Exists only to trigger the exception paths we want to verify.
     * This is an inner class loaded only by this test — not a production component.
     */
    @RestController
    @RequestMapping("/test")
    static class TestController {

        @GetMapping("/not-found")
        void throwNotFound() {
            throw new ResourceNotFoundException("Document", "abc-123");
        }

        @GetMapping("/server-error")
        void throwServerError() {
            throw new RuntimeException("Something exploded internally");
        }

        @PostMapping("/validate")
        void validate(@Valid @RequestBody ValidatedRequest request) {
            // deliberately empty — just triggers @Valid
        }

        record ValidatedRequest(@NotBlank(message = "must not be blank") String name) {}
    }
}
