package com.edi.backend.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Servlet filter that establishes a correlation ID for every inbound request.
 *
 * <p>The correlation ID is used to tie log lines together across the full request lifecycle:
 * backend → RabbitMQ message → worker → ai-service response → backend consumer.
 * It is injected into the SLF4J {@link MDC} as {@code correlationId}, which the Logstash
 * encoder includes in every JSON log line.
 *
 * <p>The ID is taken from the incoming {@code X-Correlation-Id} header if present (allowing
 * upstream callers, e.g. an API gateway, to inject their own trace ID), or a new UUID is
 * generated. The ID is echoed in the {@code X-Correlation-Id} response header.
 *
 * <p><strong>Production note:</strong> In a production system this would be replaced by
 * OpenTelemetry automatic instrumentation, which propagates trace context via the W3C
 * {@code traceparent} header and integrates with Jaeger or Datadog APM.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String CORRELATION_ID_HEADER = "X-Correlation-Id";
    public static final String MDC_CORRELATION_ID_KEY = "correlationId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String correlationId = request.getHeader(CORRELATION_ID_HEADER);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }

        MDC.put(MDC_CORRELATION_ID_KEY, correlationId);
        response.setHeader(CORRELATION_ID_HEADER, correlationId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            // Always clean up MDC to prevent context leaking across request threads.
            // This is critical in thread-pool environments (Tomcat reuses threads).
            MDC.remove(MDC_CORRELATION_ID_KEY);
        }
    }
}
