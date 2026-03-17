package com.edi.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Springdoc OpenAPI configuration.
 *
 * <p>Swagger UI is available at {@code /swagger-ui.html}.
 * The Bearer token scheme matches the Supabase JWT authentication used in all protected endpoints.
 *
 * <p>Production note: configure {@code springdoc.api-docs.enabled=false} in prod if you don't
 * want to expose the API schema publicly (or restrict via IP allowlist on the reverse proxy).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI openAPI() {
        final String securitySchemeName = "bearerAuth";
        return new OpenAPI()
                .info(new Info()
                        .title("AI Learning Assistant API")
                        .description("REST API for the AI Learning Assistant — document upload, " +
                                     "AI-generated summaries, flashcards, and quizzes.")
                        .version("v1"))
                .addSecurityItem(new SecurityRequirement().addList(securitySchemeName))
                .components(new Components()
                        .addSecuritySchemes(securitySchemeName,
                                new SecurityScheme()
                                        .name(securitySchemeName)
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("Supabase-issued JWT. Obtain from the frontend " +
                                                     "after completing Google OAuth.")));
    }
}
