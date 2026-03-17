package com.edi.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Configures a {@link WebClient} pre-wired for Supabase Storage REST calls.
 *
 * <p>The client uses the Supabase service-role key for all requests — this key bypasses
 * Supabase RLS so the backend can manage any user's files.
 *
 * <p>Production note: WebClient is non-blocking; when running on virtual threads (JDK 21)
 * the blocking {@code .block()} calls in {@link com.edi.backend.service.StorageService}
 * are safe. On a traditional thread pool they pin a carrier thread. If high storage throughput
 * is required, switch to a fully reactive pipeline with Spring WebFlux.
 */
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient supabaseStorageClient(
            @Value("${supabase.url}") String supabaseUrl,
            @Value("${supabase.service-key}") String serviceKey) {

        return WebClient.builder()
                .baseUrl(supabaseUrl + "/storage/v1")
                .defaultHeader("Authorization", "Bearer " + serviceKey)
                .defaultHeader("apikey", serviceKey)
                .build();
    }
}
