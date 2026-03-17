package com.edi.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Liveness probe endpoint — no authentication required.
 *
 * <p>Used by Railway's health check, Docker's HEALTHCHECK, and load balancers to determine
 * whether this instance is ready to receive traffic.
 *
 * <p>This endpoint deliberately does NOT check downstream dependencies (DB, RabbitMQ, Redis).
 * Dependency health is exposed via {@code /actuator/health} which Spring Boot Actuator
 * auto-configures with individual health indicators for each integration.
 */
@Tag(name = "Health", description = "Liveness probe")
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    @Operation(summary = "Liveness check", description = "Returns 200 OK if the service is running. No auth required.")
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "backend"
        ));
    }
}
