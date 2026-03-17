package com.edi.backend.config;

import com.edi.backend.security.SupabaseJwtFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security configuration for a stateless REST API.
 *
 * <h3>Design decisions</h3>
 * <ul>
 *   <li>CSRF disabled — the API is stateless (JWT, no cookies), so CSRF is not applicable.</li>
 *   <li>Session management STATELESS — every request must carry its own JWT; no server-side sessions.</li>
 *   <li>{@code /api/v1/health} is public — required for Railway / Docker health checks before auth is available.</li>
 *   <li>Swagger UI is public — allows API exploration without credentials; restrict in production if needed.</li>
 *   <li>All other endpoints require a valid JWT.</li>
 * </ul>
 *
 * <p>Production note: add CORS configuration here (allow only the Railway frontend URL),
 * and consider rate-limiting the Swagger UI path to prevent enumeration attacks.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final SupabaseJwtFilter supabaseJwtFilter;

    public SecurityConfig(SupabaseJwtFilter supabaseJwtFilter) {
        this.supabaseJwtFilter = supabaseJwtFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Liveness probe — must be accessible before auth is wired up
                        .requestMatchers(HttpMethod.GET, "/api/v1/health").permitAll()
                        // Actuator health for Railway readiness probes
                        .requestMatchers("/actuator/health").permitAll()
                        // Swagger UI — publicly accessible for API exploration
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**",
                                         "/v3/api-docs/**").permitAll()
                        // All other endpoints require a valid Supabase JWT
                        .anyRequest().authenticated())
                .addFilterBefore(supabaseJwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
