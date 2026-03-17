package com.edi.backend.dto;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * API representation of a {@link Document}.
 * Never expose the internal {@link com.edi.backend.entity.User} entity directly —
 * only the user's own documents are ever returned, so {@code userId} is informational only.
 */
public record DocumentResponse(
        UUID id,
        String title,
        String fileUrl,
        DocumentStatus status,
        Instant createdAt) {

    public static DocumentResponse from(Document document) {
        return new DocumentResponse(
                document.getId(),
                document.getTitle(),
                document.getFileUrl(),
                document.getStatus(),
                document.getCreatedAt());
    }
}
