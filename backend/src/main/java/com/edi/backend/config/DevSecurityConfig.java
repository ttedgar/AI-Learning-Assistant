package com.edi.backend.config;

import com.edi.backend.security.DevAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Spring Security configuration for the {@code dev} profile.
 *
 * <p>Replaces {@link SecurityConfig} (which is annotated {@code @Profile("!dev")}) for
 * local development and automated testing. The key difference is that JWT validation via
 * Supabase's JWKS endpoint is removed — authentication is handled by {@link DevAuthFilter},
 * which trusts {@code X-Dev-User-Id} / {@code X-Dev-User-Email} request headers.
 *
 * <p>All other security rules (CORS, CSRF, session policy, public endpoints) are identical
 * to production so that downstream code (controllers, services, RLS checks) runs exactly
 * as in production.
 *
 * <p>Production equivalent: {@link SecurityConfig} — validates ES256 JWTs against Supabase's
 * public JWKS endpoint (zero-trust, no shared secret).
 */
@Configuration
@EnableWebSecurity
@Profile("dev")
public class DevSecurityConfig {

    @Value("${cors.allowed-origins:http://localhost:5173}")
    private String allowedOriginsRaw;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOriginsRaw.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   DevAuthFilter devAuthFilter) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/v1/health").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**",
                                         "/v3/api-docs/**").permitAll()
                        .anyRequest().authenticated())
                // DevAuthFilter runs before the standard UsernamePasswordAuthenticationFilter.
                // It populates the SecurityContext from X-Dev-* headers; missing headers → no auth → 401.
                .addFilterBefore(devAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, e) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                            response.getWriter().write(
                                    "{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401," +
                                    "\"detail\":\"Authentication required\"}");
                        }))
                .build();
    }
}
