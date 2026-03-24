package com.edi.backend.service;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.User;
import com.edi.backend.exception.DocumentNotFoundException;
import com.edi.backend.messaging.DocumentProcessingMessage;
import com.edi.backend.messaging.DocumentProcessingProducer;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Core business logic for document upload, retrieval, and deletion.
 *
 * <h3>Upload flow</h3>
 * <ol>
 *   <li>Check rate limit (Redis/Bucket4j) — throws {@link com.edi.backend.exception.RateLimitExceededException} if exceeded.</li>
 *   <li>Upload PDF to Supabase Storage.</li>
 *   <li>Save {@link Document} entity with status=PENDING.</li>
 *   <li>Publish {@link DocumentProcessingMessage} with a correlationId to RabbitMQ.</li>
 * </ol>
 *
 * <p>The upload to Supabase Storage happens before the DB save. If the DB save fails,
 * we log a warning but don't attempt a compensating delete — the file will be orphaned
 * in storage. Production: use a saga / outbox pattern to guarantee consistency.
 *
 * <p>All methods enforce ownership — a user can only operate on their own documents.
 */
@Service
public class DocumentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);

    private final DocumentRepository documentRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;
    private final RateLimiterService rateLimiterService;
    private final DocumentProcessingProducer producer;

    public DocumentService(DocumentRepository documentRepository,
                           UserRepository userRepository,
                           StorageService storageService,
                           RateLimiterService rateLimiterService,
                           DocumentProcessingProducer producer) {
        this.documentRepository = documentRepository;
        this.userRepository = userRepository;
        this.storageService = storageService;
        this.rateLimiterService = rateLimiterService;
        this.producer = producer;
    }

    /**
     * Uploads a PDF, persists a Document record, and triggers async AI processing.
     *
     * @param supabaseUserId the authenticated user's Supabase UUID
     * @param title          document title provided by the user
     * @param file           the uploaded PDF multipart file
     * @return the saved {@link Document} entity
     */
    @Transactional
    public Document upload(String supabaseUserId, String title, MultipartFile file) {
        rateLimiterService.checkAndConsume(supabaseUserId);

        User user = resolveUser(supabaseUserId);

        String fileUrl = storageService.uploadPdf(supabaseUserId, file);
        log.info("PDF uploaded to storage for userId={}", supabaseUserId);

        Document document = documentRepository.save(new Document(user, title, fileUrl));

        String correlationId = UUID.randomUUID().toString();
        MDC.put("correlationId", correlationId);
        MDC.put("documentId", document.getId().toString());

        producer.publish(new DocumentProcessingMessage(
                correlationId,
                document.getId().toString(),
                fileUrl,
                supabaseUserId));

        log.info("Document processing initiated: documentId={} correlationId={}",
                document.getId(), correlationId);

        return document;
    }

    /**
     * Returns all documents for the authenticated user, newest first.
     */
    @Transactional(readOnly = true)
    public List<Document> listByUser(String supabaseUserId) {
        User user = resolveUser(supabaseUserId);
        return documentRepository.findByUserOrderByCreatedAtDesc(user);
    }

    /**
     * Returns a specific document belonging to the authenticated user.
     *
     * @throws DocumentNotFoundException if the document doesn't exist or belongs to another user
     */
    @Transactional(readOnly = true)
    public Document getByIdForUser(UUID documentId, String supabaseUserId) {
        User user = resolveUser(supabaseUserId);
        return documentRepository.findByIdAndUser(documentId, user)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
    }

    /**
     * Renames a document.
     *
     * @throws DocumentNotFoundException    if the document doesn't exist or belongs to another user
     * @throws IllegalArgumentException     if the new title is blank
     */
    @Transactional
    public Document rename(UUID documentId, String supabaseUserId, String newTitle) {
        if (newTitle == null || newTitle.isBlank()) {
            throw new IllegalArgumentException("Title must not be blank");
        }
        User user = resolveUser(supabaseUserId);
        Document document = documentRepository.findByIdAndUser(documentId, user)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
        document.setTitle(newTitle.strip());
        log.info("Document renamed: documentId={}", documentId);
        return documentRepository.save(document);
    }

    /**
     * Deletes a document and its associated file from Supabase Storage.
     *
     * <p>DB records (summary, flashcards, quiz) are deleted via cascade (see 001-initial-schema.sql).
     *
     * @throws DocumentNotFoundException if the document doesn't exist or belongs to another user
     */
    @Transactional
    public void delete(UUID documentId, String supabaseUserId) {
        User user = resolveUser(supabaseUserId);
        Document document = documentRepository.findByIdAndUser(documentId, user)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));

        storageService.deletePdf(document.getFileUrl());
        documentRepository.delete(document);
        log.info("Document deleted: documentId={}", documentId);
    }

    private User resolveUser(String supabaseUserId) {
        // The JWT sub claim is a UUID string; convert before querying the uuid column.
        UUID supabaseUserUuid = UUID.fromString(supabaseUserId);
        return userRepository.findBySupabaseUserId(supabaseUserUuid)
                .orElseThrow(() -> new IllegalStateException(
                        "User not found for supabaseUserId=" + supabaseUserId +
                        ". Frontend must call POST /api/v1/auth/sync first."));
    }
}
