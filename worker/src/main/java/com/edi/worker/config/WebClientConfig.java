package com.edi.worker.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * WebClient beans used by the worker.
 *
 * <p>Two separate clients:
 * <ul>
 *   <li>{@code aiServiceWebClient} — base URL + internal API key pre-attached
 *   <li>{@code pdfDownloadWebClient} — no base URL; used with full Supabase Storage URLs
 * </ul>
 *
 * <p>Production note: mTLS mutual authentication would replace the static
 * {@code X-Internal-Api-Key} header for service-to-service auth.
 */
@Configuration
public class WebClientConfig {

    @Value("${ai-service.url}")
    private String aiServiceUrl;

    @Value("${internal.api-key}")
    private String internalApiKey;

    @Bean
    public WebClient aiServiceWebClient(WebClient.Builder builder) {
        return builder
                .baseUrl(aiServiceUrl)
                .defaultHeader("X-Internal-Api-Key", internalApiKey)
                .build();
    }

    /**
     * General-purpose client for downloading PDFs from Supabase Storage.
     * No base URL — callers provide the full URL from the queue message.
     */
    @Bean
    public WebClient pdfDownloadWebClient(WebClient.Builder builder) {
        return builder.build();
    }
}
