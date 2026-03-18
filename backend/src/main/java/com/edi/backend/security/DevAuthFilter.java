package com.edi.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Dev-only authentication filter that trusts {@code X-Dev-User-Id} / {@code X-Dev-User-Email}
 * request headers instead of validating a Supabase JWT.
 *
 * <p>This allows automated tooling (e.g. Playwright) to authenticate without triggering
 * Google OAuth bot-detection. It is <strong>never</strong> compiled into the production
 * build because of the {@code @Profile("dev")} annotation.
 *
 * <p>Production equivalent: Bearer token validated by {@link com.edi.backend.config.SecurityConfig}
 * against Supabase's public JWKS endpoint (ES256, zero-trust).
 *
 * <p>If either header is absent the filter sets no authentication, so Spring Security
 * returns 401 as normal — dev mode does not open an unauthenticated backdoor.
 */
@Component
@Profile("dev")
public class DevAuthFilter extends OncePerRequestFilter {

    private static final String HEADER_USER_ID    = "X-Dev-User-Id";
    private static final String HEADER_USER_EMAIL = "X-Dev-User-Email";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String userId = request.getHeader(HEADER_USER_ID);
        String email  = request.getHeader(HEADER_USER_EMAIL);

        if (userId != null && email != null) {
            AuthenticatedUser principal = new AuthenticatedUser(userId, email);
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(principal, null, List.of()));
        }

        filterChain.doFilter(request, response);
    }
}
