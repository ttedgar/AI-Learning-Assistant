package com.edi.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Springdoc OpenAPI / Swagger UI configuration.
 *
 * <p>The "Bearer Auth" security scheme is registered so that Swagger UI shows an "Authorize"
 * button — engineers can paste a Supabase JWT and test protected endpoints directly from
 * the browser without needing an external HTTP client.
 *
 * <p>Access at: {@code /swagger-ui.html}
 * <p>Raw OpenAPI JSON at: {@code /v3/api-docs}
 *
 * <p><strong>Production note:</strong> Disable Swagger UI in production by setting
 * {@code springdoc.swagger-ui.enabled=false} and {@code springdoc.api-docs.enabled=false}
 * in the Railway environment profile.
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_AUTH_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("AI Learning Assistant API")
                        .version("1.0.0")
                        .description("REST API for the AI Learning Assistant — upload PDFs, " +
                                "receive AI-generated summaries, flashcards, and quiz questions.")
                        .contact(new Contact()
                                .name("AI Learning Assistant")
                                .email("contact@example.com")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH_SCHEME))
                .components(new Components()
                        .addSecuritySchemes(BEARER_AUTH_SCHEME, new SecurityScheme()
                                .name(BEARER_AUTH_SCHEME)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Supabase-issued JWT. Obtain via Google OAuth login.")));
    }
}
