package com.edi.worker.messaging;

import lombok.Data;

/**
 * Incoming message from backend on the {@code document.processing} queue.
 * The backend publishes this after uploading the PDF to Supabase Storage.
 */
@Data
public class DocumentProcessingMessage {

    private String correlationId;
    private String documentId;
    /** Full Supabase Storage URL — worker downloads the PDF bytes from here. */
    private String fileUrl;
    private String userId;
}
