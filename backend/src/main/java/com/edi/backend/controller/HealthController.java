package com.edi.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Lightweight liveness probe.
 *
 * <p>Returns HTTP 200 with {"status":"UP"} when the application context is running.
 * Does NOT check downstream dependencies (DB, RabbitMQ, Redis) — that is the
 * responsibility of Spring Actuator's /actuator/health endpoint, which performs
 * readiness checks against each integration.
 *
 * <p>Railway and Docker use this endpoint for health checks before routing traffic.
 * Production note: a more sophisticated readiness probe would verify DB connectivity
 * and queue reachability before returning healthy.
 */
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "UP"));
    }
}
