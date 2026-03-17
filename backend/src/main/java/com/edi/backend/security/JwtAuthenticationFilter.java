package com.edi.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Spring Security filter that validates the Supabase JWT on every incoming request.
 *
 * <p>Flow:
 * <ol>
 *   <li>Extract the {@code Authorization: Bearer <token>} header.</li>
 *   <li>Validate the JWT with {@link SupabaseJwtValidator}.</li>
 *   <li>On success: populate the {@link org.springframework.security.core.context.SecurityContext}
 *       with a {@link UsernamePasswordAuthenticationToken} whose principal is the Supabase user ID
 *       (the JWT {@code sub} claim).</li>
 *   <li>On failure: write a minimal RFC 7807 JSON error and short-circuit the filter chain.</li>
 * </ol>
 *
 * <p><strong>Production note:</strong> The RFC 7807 body written here is intentionally minimal.
 * In production the full error would flow through {@link com.edi.backend.exception.GlobalExceptionHandler},
 * but since this filter runs before the DispatcherServlet, we write the response directly.
 * A more elaborate approach would delegate to a custom {@link org.springframework.security.web.AuthenticationEntryPoint}.
 */
@Slf4j
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final SupabaseJwtValidator jwtValidator;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            // No token present — continue; Spring Security will reject unauthenticated requests
            // to protected endpoints downstream via the configured AuthenticationEntryPoint.
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(BEARER_PREFIX.length());

        try {
            Claims claims = jwtValidator.validateAndExtract(token);
            String supabaseUserId = claims.getSubject();

            if (supabaseUserId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                supabaseUserId,
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_USER"))
                        );
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
                log.debug("Authenticated request for Supabase user: {}", supabaseUserId);
            }
        } catch (JwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            SecurityContextHolder.clearContext();
            writeUnauthorizedResponse(response, e.getMessage());
            return;
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Writes a minimal RFC 7807 Problem Details response for authentication failures.
     *
     * <p>This runs outside the DispatcherServlet, so we write directly to the response.
     * The GlobalExceptionHandler cannot intercept filter-level exceptions.
     */
    private void writeUnauthorizedResponse(HttpServletResponse response, String detail) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("""
                {"type":"about:blank","title":"Unauthorized","status":401,"detail":"%s"}
                """.formatted(detail.replace("\"", "'")));
    }
}
