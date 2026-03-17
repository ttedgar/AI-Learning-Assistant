package com.edi.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Post-authentication filter that injects the authenticated user's Supabase ID into MDC
 * for structured log tracing.
 *
 * <p>JWT validation is handled entirely by Spring Security's OAuth2 Resource Server
 * ({@link org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter})
 * using Supabase's JWKS endpoint. This filter only enriches MDC after authentication.
 *
 * <p>Registered with {@code addFilterAfter(BearerTokenAuthenticationFilter.class)} so the
 * SecurityContext is already populated when this filter runs.
 *
 * <p>Not a Spring-managed bean (@Component) — instantiated directly in {@link com.edi.backend.config.SecurityConfig}
 * to prevent Spring Boot from auto-registering it in the servlet container filter chain.
 */
public class SupabaseJwtFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser user) {
            MDC.put("userId", user.supabaseUserId());
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove("userId");
        }
    }
}
