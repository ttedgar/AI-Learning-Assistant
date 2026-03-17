package com.edi.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Integration test — verifies the full Spring application context boots
 * against real PostgreSQL and RabbitMQ containers via Testcontainers.
 *
 * <p>Requires Docker. Skipped automatically when Docker is unavailable
 * (e.g. on a developer machine without Docker Desktop running).
 * In CI/CD, Docker is always available so this test always runs.
 *
 * <p>Production note: a full CI pipeline (GitHub Actions, Jenkins) would
 * run this with a Docker-in-Docker setup or a remote Docker socket.
 */
@Testcontainers(disabledWithoutDocker = true)
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
