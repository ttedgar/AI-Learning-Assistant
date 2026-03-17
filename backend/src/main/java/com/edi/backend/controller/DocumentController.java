package com.edi.backend.controller;

import com.edi.backend.dto.DocumentResponse;
import com.edi.backend.security.AuthenticatedUser;
import com.edi.backend.service.DocumentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Document management endpoints — upload, list, get, delete.
 *
 * <p>All endpoints are scoped to the authenticated user: a user can only access
 * documents they own. Ownership is enforced in the service layer.
 */
@RestController
@RequestMapping("/api/v1/documents")
@Tag(name = "Documents", description = "PDF document upload and management")
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    @Operation(summary = "List user's documents",
               description = "Returns all documents for the authenticated user, newest first.")
    public ResponseEntity<List<DocumentResponse>> listDocuments(
            @AuthenticationPrincipal AuthenticatedUser principal) {

        List<DocumentResponse> documents = documentService.listByUser(principal.supabaseUserId())
                .stream()
                .map(DocumentResponse::from)
                .toList();
        return ResponseEntity.ok(documents);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a PDF document",
               description = "Uploads a PDF to Supabase Storage, creates a document record " +
                             "(status=PENDING), and publishes a processing message to RabbitMQ. " +
                             "Rate limited to 10 uploads per hour per user.")
    public ResponseEntity<DocumentResponse> uploadDocument(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam("title") String title,
            @RequestParam("file") @Parameter(description = "PDF file, max 20 MB") MultipartFile file) {

        validatePdf(file);
        var document = documentService.upload(principal.supabaseUserId(), title, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(DocumentResponse.from(document));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get document metadata")
    public ResponseEntity<DocumentResponse> getDocument(
            @PathVariable UUID id,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        var document = documentService.getByIdForUser(id, principal.supabaseUserId());
        return ResponseEntity.ok(DocumentResponse.from(document));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a document",
               description = "Deletes the document record and its file from Supabase Storage. " +
                             "Associated summary, flashcards, and quiz are cascade-deleted.")
    public ResponseEntity<Void> deleteDocument(
            @PathVariable UUID id,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        documentService.delete(id, principal.supabaseUserId());
        return ResponseEntity.noContent().build();
    }

    private void validatePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File must not be empty");
        }
        String contentType = file.getContentType();
        if (!"application/pdf".equals(contentType)) {
            throw new IllegalArgumentException("Only PDF files are accepted");
        }
    }
}
