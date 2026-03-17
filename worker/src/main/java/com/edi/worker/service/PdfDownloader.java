package com.edi.worker.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Downloads a PDF from an arbitrary URL (Supabase Storage) and returns the raw bytes.
 *
 * <p>Uses a blocking {@code .block()} call because the worker's listener thread
 * is inherently blocking — there is no benefit to non-blocking I/O here.
 * Production note: if the worker were scaled to high concurrency, switching to a
 * fully reactive pipeline (Project Reactor) would reduce thread count.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfDownloader {

    @Qualifier("pdfDownloadWebClient")
    private final WebClient pdfDownloadWebClient;

    public byte[] download(String url) {
        log.info("Downloading PDF from {}", url);
        byte[] bytes = pdfDownloadWebClient.get()
                .uri(url)
                .retrieve()
                .bodyToMono(byte[].class)
                .block();

        if (bytes == null || bytes.length == 0) {
            throw new IllegalStateException("PDF download returned empty body for URL: " + url);
        }

        log.info("Downloaded {} bytes", bytes.length);
        return bytes;
    }
}
