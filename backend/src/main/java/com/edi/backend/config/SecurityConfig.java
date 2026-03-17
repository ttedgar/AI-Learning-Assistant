package com.edi.backend.config;

import com.edi.backend.security.JwtAuthenticationFilter;
import com.edi.backend.security.SupabaseJwtValidator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security configuration for the backend API.
 *
 * <p>Key decisions:
 * <ul>
 *   <li><strong>Stateless sessions:</strong> No HttpSession is created. Every request must carry
 *       a valid Supabase JWT. This is the only safe approach for horizontally-scalable REST APIs.</li>
 *   <li><strong>CSRF disabled:</strong> CSRF protection is not needed for stateless APIs that use
 *       token-based auth (no cookies). Enabling it would break the API for all non-browser clients.</li>
 *   <li><strong>Custom AuthenticationEntryPoint:</strong> Returns RFC 7807 JSON on 401 rather than
 *       the Spring Security default HTML redirect, which would be useless for API consumers.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /** Public endpoints that do not require a JWT. */
    private static final String[] PUBLIC_MATCHERS = {
            "/api/v1/health",
            "/v3/api-docs/**",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/actuator/health"
    };

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(SupabaseJwtValidator jwtValidator) {
        return new JwtAuthenticationFilter(jwtValidator);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthenticationFilter jwtAuthenticationFilter) throws Exception {
        http
                // Stateless REST API — no sessions.
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // CSRF not needed for stateless token auth.
                .csrf(AbstractHttpConfigurer::disable)

                // CORS is configured per-controller via @CrossOrigin or a global CorsConfigurationSource bean.
                // The features worktree will add the production CORS config (Railway frontend URL only).
                .cors(AbstractHttpConfigurer::disable)

                // Request authorisation rules.
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(PUBLIC_MATCHERS).permitAll()
                        .anyRequest().authenticated()
                )

                // Custom 401 response: RFC 7807 JSON, not a redirect.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                            response.getWriter().write("""
                                    {"type":"about:blank","title":"Unauthorized","status":401,"detail":"%s"}
                                    """.formatted(authException.getMessage()));
                        })
                )

                // JWT filter runs before Spring's UsernamePasswordAuthenticationFilter.
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
