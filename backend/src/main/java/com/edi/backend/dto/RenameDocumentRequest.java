package com.edi.backend.dto;

/**
 * Request body for PATCH /api/v1/documents/{id}.
 * Only the title can be changed — file, status, and results are immutable after upload.
 */
public record RenameDocumentRequest(String title) {}
