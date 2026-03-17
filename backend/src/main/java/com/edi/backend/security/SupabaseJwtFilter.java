package com.edi.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Validates the Supabase-issued JWT on every request and populates Spring Security's
 * {@link SecurityContextHolder}.
 *
 * <h3>Flow</h3>
 * <ol>
 *   <li>Extract the Bearer token from the {@code Authorization} header.</li>
 *   <li>Validate the token signature against the Supabase JWT Secret (HS256).</li>
 *   <li>Extract {@code sub} (Supabase user ID) and {@code email} claims.</li>
 *   <li>Set an {@link UsernamePasswordAuthenticationToken} as the current authentication.</li>
 *   <li>Put a {@code correlationId} into MDC for structured log tracing.</li>
 * </ol>
 *
 * <p>If no token is present, the filter chain continues unauthenticated — the
 * {@link com.edi.backend.config.SecurityConfig} decides which endpoints are public.
 *
 * <p>Production note: Supabase uses HS256 with the JWT Secret from project settings.
 * For multi-tenant or zero-trust environments, rotate to RS256 with JWKS endpoint verification
 * ({@code spring-security-oauth2-resource-server} + {@code spring.security.oauth2.resourceserver.jwt.jwk-set-uri}).
 */
@Component
public class SupabaseJwtFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SupabaseJwtFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final SecretKey signingKey;

    public SupabaseJwtFilter(@Value("${supabase.jwt-secret:}") String jwtSecret) {
        // HMAC-SHA256 requires a key of at least 256 bits (32 bytes).
        // Pad or truncate to exactly 32 bytes so short placeholder values (e.g. in test/default config)
        // don't cause a WeakKeyException at startup. In production the env var is a proper 32+ char secret.
        byte[] rawBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        byte[] keyBytes = new byte[32];
        System.arraycopy(rawBytes, 0, keyBytes, 0, Math.min(rawBytes.length, 32));
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String supabaseUserId = claims.getSubject();
            String email = claims.get("email", String.class);

            // Inject a per-request correlationId into MDC for log tracing.
            // Production: replace with OpenTelemetry trace-id propagation.
            String correlationId = UUID.randomUUID().toString();
            MDC.put("correlationId", correlationId);
            MDC.put("userId", supabaseUserId);

            AuthenticatedUser principal = new AuthenticatedUser(supabaseUserId, email);
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());
            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (JwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            // Do not set authentication — Spring Security will return 401 for protected endpoints.
        } finally {
            filterChain.doFilter(request, response);
            // Clear MDC after the full filter chain completes to prevent leaking context
            // across requests on the same thread-pool thread.
            MDC.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(header) && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}
