package com.edi.backend.config;

import com.edi.backend.security.AuthenticatedUser;
import com.edi.backend.security.SupabaseJwtFilter;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.net.MalformedURLException;
import java.net.URL;
import java.util.List;

/**
 * Spring Security configuration for a stateless REST API.
 *
 * <h3>JWT validation</h3>
 * Supabase signs tokens with ES256 (asymmetric ECDSA). We verify them using Supabase's
 * public JWKS endpoint rather than a shared secret. This is zero-trust: the backend
 * only holds public keys that Supabase rotates automatically.
 *
 * <h3>Design decisions</h3>
 * <ul>
 *   <li>CSRF disabled — stateless JWT API, no cookies.</li>
 *   <li>Session management STATELESS — every request must carry its own JWT.</li>
 *   <li>{@code /api/v1/health} is public — required for Railway / Docker health checks.</li>
 *   <li>Swagger UI is public — allows API exploration without credentials.</li>
 *   <li>All other endpoints require a valid Supabase JWT.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
@Profile("!dev")
public class SecurityConfig {

    /**
     * Comma-separated list of allowed CORS origins.
     * Local dev: http://localhost:5173. Production: set CORS_ALLOWED_ORIGINS to the Railway frontend URL.
     */
    @Value("${cors.allowed-origins:http://localhost:5173}")
    private String allowedOriginsRaw;

    /**
     * Supabase project URL — used to derive the JWKS endpoint.
     * Defaults to Supabase's local dev port so tests can load the context without a real URL.
     */
    @Value("${supabase.url:http://localhost:54321}")
    private String supabaseUrl;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOriginsRaw.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // Production note: restrict to specific headers in prod for defence-in-depth.
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /**
     * Verifies Supabase ES256 JWTs using their public JWKS endpoint.
     *
     * <p>Uses Nimbus {@link JWKSourceBuilder} directly rather than Spring's
     * {@code withJwkSetUri()} shortcut because the shortcut defaults to RSA algorithms
     * (RS256) and doesn't expose retry configuration. This builder provides:
     * <ul>
     *   <li>ES256 key selector — matches Supabase's ECDSA signing algorithm.</li>
     *   <li>Retry on transient I/O failure — handles Docker/WSL2 network flakiness
     *       on the first outbound HTTPS connection to Supabase.</li>
     *   <li>15-minute JWK set cache — avoids a remote fetch on every request.</li>
     * </ul>
     *
     * <p>Production note: for zero-downtime key rotation, Supabase publishes new keys
     * to the JWKS endpoint before retiring old ones. The 5-minute cache-refresh window
     * ensures the backend picks up rotated keys without a restart.
     */
    @Bean
    public JwtDecoder jwtDecoder() {
        try {
            URL jwksUrl = new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json");

            JWKSource<SecurityContext> jwkSource = JWKSourceBuilder
                    .create(jwksUrl)
                    .retrying(true)                          // retry once on I/O failure
                    .cache(15 * 60 * 1000L, 5 * 60 * 1000L) // 15-min TTL, 5-min refresh
                    .build();

            DefaultJWTProcessor<SecurityContext> jwtProcessor = new DefaultJWTProcessor<>();
            jwtProcessor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.ES256, jwkSource));
            // Disable Nimbus-level claims checking — Spring Security's JwtValidator handles exp/nbf.
            jwtProcessor.setJWTClaimsSetVerifier(null);

            NimbusJwtDecoder decoder = new NimbusJwtDecoder(jwtProcessor);
            decoder.setJwtValidator(JwtValidators.createDefault());
            return decoder;
        } catch (MalformedURLException e) {
            throw new IllegalStateException("Invalid JWKS URL derived from supabase.url", e);
        }
    }

    /**
     * Maps a validated {@link Jwt} to our internal {@link AuthenticatedUser} principal.
     * Extracts the {@code sub} (Supabase user UUID) and {@code email} claims.
     */
    private Converter<Jwt, AbstractAuthenticationToken> supabaseConverter() {
        return jwt -> {
            String supabaseUserId = jwt.getSubject();
            String email = jwt.getClaimAsString("email");
            AuthenticatedUser principal = new AuthenticatedUser(supabaseUserId, email);
            return new UsernamePasswordAuthenticationToken(principal, null, List.of());
        };
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Liveness probe — must be accessible before auth is wired up
                        .requestMatchers(HttpMethod.GET, "/api/v1/health").permitAll()
                        // Actuator health for Railway readiness probes
                        .requestMatchers("/actuator/health").permitAll()
                        // Prometheus scrape endpoint — internal network only; permitted here, protected by network ACLs in production
                        .requestMatchers("/actuator/prometheus").permitAll()
                        // Swagger UI — publicly accessible for API exploration
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**",
                                         "/v3/api-docs/**").permitAll()
                        // All other endpoints require a valid Supabase JWT
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder())
                                .jwtAuthenticationConverter(supabaseConverter()))
                        // Return RFC 7807 Problem Details on auth failure so the frontend
                        // and integration tests see application/problem+json on 401.
                        .authenticationEntryPoint((request, response, ex) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                            response.getWriter().write(
                                    "{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401," +
                                    "\"detail\":\"Authentication required\"}");
                        }))
                // Post-auth filter: injects the authenticated user's Supabase ID into MDC
                // for structured log tracing. Runs after BearerTokenAuthenticationFilter
                // so the SecurityContext is already populated.
                .addFilterAfter(new SupabaseJwtFilter(), BearerTokenAuthenticationFilter.class)
                .build();
    }
}
