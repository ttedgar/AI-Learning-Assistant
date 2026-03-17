package com.edi.backend.service;

import com.edi.backend.exception.StorageException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;
import java.util.UUID;

/**
 * Wraps Supabase Storage REST API calls using {@link WebClient}.
 *
 * <p>The Supabase Storage API is compatible with S3 object conventions.
 * Files are stored in the {@code documents} bucket under {@code <userId>/<uuid>.pdf}
 * to scope each user's files and prevent collisions.
 *
 * <p>The backend uses the service-role key to bypass RLS — this is intentional since
 * the backend validates ownership before operating on files.
 *
 * <p>Production note: use a CDN or signed URL for the {@code fileUrl} returned to clients
 * rather than a direct Supabase Storage URL, to control access and add expiry.
 */
@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);
    private static final String BUCKET = "documents";

    private final WebClient supabaseStorageClient;
    private final String supabaseUrl;

    public StorageService(WebClient supabaseStorageClient,
                          @Value("${supabase.url}") String supabaseUrl) {
        this.supabaseStorageClient = supabaseStorageClient;
        this.supabaseUrl = supabaseUrl;
    }

    /**
     * Uploads a PDF to Supabase Storage.
     *
     * @param userId the Supabase user ID (used as the storage path prefix)
     * @param file   the multipart file to upload
     * @return the public URL of the uploaded file
     */
    public String uploadPdf(String userId, MultipartFile file) {
        String objectPath = userId + "/" + UUID.randomUUID() + ".pdf";

        try {
            supabaseStorageClient.post()
                    .uri("/object/" + BUCKET + "/" + objectPath)
                    .contentType(MediaType.APPLICATION_PDF)
                    .bodyValue(readBytes(file))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (WebClientResponseException e) {
            log.error("Supabase Storage upload failed: status={} body={}",
                    e.getStatusCode(), e.getResponseBodyAsString());
            throw new StorageException("Failed to upload file to storage", e);
        }

        return supabaseUrl + "/storage/v1/object/public/" + BUCKET + "/" + objectPath;
    }

    /**
     * Deletes a file from Supabase Storage.
     *
     * @param fileUrl the full public URL of the file to delete
     */
    public void deletePdf(String fileUrl) {
        // Extract the object path from the full URL: .../public/documents/<path>
        String objectPath = extractObjectPath(fileUrl);

        try {
            supabaseStorageClient.delete()
                    .uri("/object/" + BUCKET + "/" + objectPath)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (WebClientResponseException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                // Idempotent: file already gone is not an error
                log.warn("File not found in storage during delete, skipping: {}", objectPath);
                return;
            }
            log.error("Supabase Storage delete failed: status={} body={}",
                    e.getStatusCode(), e.getResponseBodyAsString());
            throw new StorageException("Failed to delete file from storage", e);
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (Exception e) {
            throw new StorageException("Failed to read uploaded file", e);
        }
    }

    private String extractObjectPath(String fileUrl) {
        // URL pattern: <supabaseUrl>/storage/v1/object/public/<bucket>/<path>
        String prefix = supabaseUrl + "/storage/v1/object/public/" + BUCKET + "/";
        if (fileUrl.startsWith(prefix)) {
            return fileUrl.substring(prefix.length());
        }
        // Fallback: use the last segment(s) after /documents/
        int idx = fileUrl.indexOf("/" + BUCKET + "/");
        if (idx != -1) {
            return fileUrl.substring(idx + BUCKET.length() + 2);
        }
        throw new StorageException("Cannot determine object path from URL: " + fileUrl);
    }
}
