package com.edi.worker.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.codec.CodecConfigurer;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

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
        // 5-minute response timeout: ai-service map-reduce over long docs with
        // rate-limit pauses between chunks can take 2-3 minutes on the free Gemini tier.
        // Production note: a paid quota removes per-minute limits; timeout can drop to 60 s.
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofMinutes(5));
        return builder
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .baseUrl(aiServiceUrl)
                .defaultHeader("X-Internal-Api-Key", internalApiKey)
                .build();
    }

    /**
     * General-purpose client for downloading PDFs from Supabase Storage.
     * No base URL — callers provide the full URL from the queue message.
     *
     * <p>The default Spring WebClient buffer limit is 256 KB, which is too small for
     * typical PDF files. We raise it to 10 MB here.
     *
     * <p>Production note: for very large files (>10 MB) a streaming approach using
     * {@code bodyToFlux(DataBuffer.class)} written directly to a temp file would avoid
     * holding the entire PDF in memory. For CV-project scale, buffering 10 MB is acceptable.
     */
    @Bean
    public WebClient pdfDownloadWebClient(WebClient.Builder builder) {
        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer.defaultCodecs()
                        .maxInMemorySize(10 * 1024 * 1024)) // 10 MB
                .build();
        return builder
                .exchangeStrategies(strategies)
                .build();
    }
}
