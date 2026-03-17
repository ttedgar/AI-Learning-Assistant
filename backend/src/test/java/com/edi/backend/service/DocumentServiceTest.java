package com.edi.backend.service;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import com.edi.backend.entity.User;
import com.edi.backend.exception.DocumentNotFoundException;
import com.edi.backend.messaging.DocumentProcessingMessage;
import com.edi.backend.messaging.DocumentProcessingProducer;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link DocumentService}.
 *
 * <p>Uses Mockito to isolate the service from all dependencies.
 * No Spring context is loaded — these run fast and test pure business logic.
 */
@ExtendWith(MockitoExtension.class)
class DocumentServiceTest {

    @Mock private DocumentRepository documentRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageService storageService;
    @Mock private RateLimiterService rateLimiterService;
    @Mock private DocumentProcessingProducer producer;

    @InjectMocks
    private DocumentService documentService;

    private User testUser;
    private final String supabaseUserId = "supabase-user-123";

    @BeforeEach
    void setUp() {
        testUser = new User(supabaseUserId, "user@example.com");
        // lenient: some tests throw before the user repository is reached (e.g. rate limit exceeded)
        lenient().when(userRepository.findBySupabaseUserId(supabaseUserId))
                .thenReturn(Optional.of(testUser));
    }

    // --- upload ---

    @Test
    void upload_success_savesDocumentAndPublishesMessage() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "test.pdf", "application/pdf", "pdf-bytes".getBytes());
        String fileUrl = "https://supabase.co/storage/documents/user/uuid.pdf";

        when(storageService.uploadPdf(supabaseUserId, file)).thenReturn(fileUrl);
        Document savedDoc = new Document(testUser, "Test Doc", fileUrl);
        savedDoc.setId(UUID.randomUUID()); // simulate DB-generated UUID
        when(documentRepository.save(any(Document.class))).thenReturn(savedDoc);

        Document result = documentService.upload(supabaseUserId, "Test Doc", file);

        assertThat(result.getTitle()).isEqualTo("Test Doc");
        assertThat(result.getFileUrl()).isEqualTo(fileUrl);
        assertThat(result.getStatus()).isEqualTo(DocumentStatus.PENDING);

        verify(rateLimiterService).checkAndConsume(supabaseUserId);
        verify(storageService).uploadPdf(supabaseUserId, file);
        verify(documentRepository).save(any(Document.class));

        ArgumentCaptor<DocumentProcessingMessage> msgCaptor =
                ArgumentCaptor.forClass(DocumentProcessingMessage.class);
        verify(producer).publish(msgCaptor.capture());
        assertThat(msgCaptor.getValue().fileUrl()).isEqualTo(fileUrl);
        assertThat(msgCaptor.getValue().userId()).isEqualTo(supabaseUserId);
        assertThat(msgCaptor.getValue().correlationId()).isNotNull();
    }

    @Test
    void upload_rateLimitExceeded_doesNotUploadOrSave() {
        doThrow(new com.edi.backend.exception.RateLimitExceededException())
                .when(rateLimiterService).checkAndConsume(supabaseUserId);

        MockMultipartFile file = new MockMultipartFile(
                "file", "test.pdf", "application/pdf", new byte[0]);

        assertThatThrownBy(() -> documentService.upload(supabaseUserId, "title", file))
                .isInstanceOf(com.edi.backend.exception.RateLimitExceededException.class);

        verifyNoInteractions(storageService, documentRepository, producer);
    }

    // --- listByUser ---

    @Test
    void listByUser_returnsOnlyUserDocuments() {
        Document doc1 = new Document(testUser, "Doc A", "url-a");
        Document doc2 = new Document(testUser, "Doc B", "url-b");
        when(documentRepository.findByUserOrderByCreatedAtDesc(testUser))
                .thenReturn(List.of(doc1, doc2));

        List<Document> result = documentService.listByUser(supabaseUserId);

        assertThat(result).hasSize(2).containsExactly(doc1, doc2);
    }

    // --- getByIdForUser ---

    @Test
    void getByIdForUser_found_returnsDocument() {
        UUID docId = UUID.randomUUID();
        Document doc = new Document(testUser, "Doc", "url");
        when(documentRepository.findByIdAndUser(docId, testUser)).thenReturn(Optional.of(doc));

        Document result = documentService.getByIdForUser(docId, supabaseUserId);

        assertThat(result).isEqualTo(doc);
    }

    @Test
    void getByIdForUser_notFound_throwsDocumentNotFoundException() {
        UUID docId = UUID.randomUUID();
        when(documentRepository.findByIdAndUser(docId, testUser)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> documentService.getByIdForUser(docId, supabaseUserId))
                .isInstanceOf(DocumentNotFoundException.class);
    }

    // --- delete ---

    @Test
    void delete_success_deletesStorageAndEntity() {
        UUID docId = UUID.randomUUID();
        Document doc = new Document(testUser, "Doc", "https://storage/file.pdf");
        when(documentRepository.findByIdAndUser(docId, testUser)).thenReturn(Optional.of(doc));

        documentService.delete(docId, supabaseUserId);

        verify(storageService).deletePdf("https://storage/file.pdf");
        verify(documentRepository).delete(doc);
    }

    @Test
    void delete_documentNotFound_throwsDocumentNotFoundException() {
        UUID docId = UUID.randomUUID();
        when(documentRepository.findByIdAndUser(docId, testUser)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> documentService.delete(docId, supabaseUserId))
                .isInstanceOf(DocumentNotFoundException.class);

        verifyNoInteractions(storageService);
    }
}
