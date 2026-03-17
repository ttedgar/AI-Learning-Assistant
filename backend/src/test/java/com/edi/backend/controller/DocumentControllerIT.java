package com.edi.backend.controller;

import com.edi.backend.TestcontainersConfiguration;
import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import com.edi.backend.entity.User;
import com.edi.backend.messaging.DocumentProcessingProducer;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.repository.UserRepository;
import com.edi.backend.service.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration test for {@link DocumentController}.
 *
 * <p>Runs the full Spring context against real PostgreSQL, RabbitMQ, and Redis containers.
 * {@link StorageService} and {@link DocumentProcessingProducer} are mocked to avoid
 * Supabase network calls and actual queue writes in the test environment.
 *
 * <p>Authentication is set directly on the {@link SecurityContextHolder} rather than
 * issuing a real JWT, keeping tests fast while exercising the full controller → service → DB chain.
 */
@Testcontainers(disabledWithoutDocker = true)
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class DocumentControllerIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private DocumentRepository documentRepository;

    @MockitoBean private StorageService storageService;
    @MockitoBean private DocumentProcessingProducer producer;

    private static final String SUPABASE_USER_ID = "integration-test-user";
    private static final String STORAGE_URL = "https://supabase.co/storage/documents/user/test.pdf";

    private User testUser;

    @BeforeEach
    void setUp() {
        documentRepository.deleteAll();
        userRepository.deleteAll();
        testUser = userRepository.save(new User(SUPABASE_USER_ID, "integration@test.com"));
        authenticateAs(SUPABASE_USER_ID);
    }

    @Test
    void listDocuments_emptyForNewUser_returns200() throws Exception {
        mockMvc.perform(get("/api/v1/documents"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void uploadDocument_validPdf_returns201AndPendingStatus() throws Exception {
        when(storageService.uploadPdf(eq(SUPABASE_USER_ID), any())).thenReturn(STORAGE_URL);
        doNothing().when(producer).publish(any());

        MockMultipartFile file = new MockMultipartFile(
                "file", "document.pdf", "application/pdf", "pdf-content".getBytes());

        mockMvc.perform(multipart("/api/v1/documents")
                        .file(file)
                        .param("title", "My Test Document"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("My Test Document"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.fileUrl").value(STORAGE_URL));

        // Verify persisted to DB
        List<Document> docs = documentRepository.findAll();
        assertThat(docs).hasSize(1);
        assertThat(docs.get(0).getStatus()).isEqualTo(DocumentStatus.PENDING);
        assertThat(docs.get(0).getTitle()).isEqualTo("My Test Document");

        // Verify producer called
        verify(producer).publish(any());
    }

    @Test
    void uploadDocument_nonPdfFile_returns400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "document.txt", "text/plain", "text content".getBytes());

        mockMvc.perform(multipart("/api/v1/documents")
                        .file(file)
                        .param("title", "Not a PDF"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(storageService, producer);
    }

    @Test
    void getDocument_existingDocument_returns200() throws Exception {
        Document doc = documentRepository.save(new Document(testUser, "Existing Doc", STORAGE_URL));

        mockMvc.perform(get("/api/v1/documents/{id}", doc.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(doc.getId().toString()))
                .andExpect(jsonPath("$.title").value("Existing Doc"));
    }

    @Test
    void getDocument_unknownId_returns404() throws Exception {
        mockMvc.perform(get("/api/v1/documents/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Document Not Found"));
    }

    @Test
    void deleteDocument_existingDocument_returns204AndRemovesFromDb() throws Exception {
        Document doc = documentRepository.save(new Document(testUser, "To Delete", STORAGE_URL));
        doNothing().when(storageService).deletePdf(any());

        mockMvc.perform(delete("/api/v1/documents/{id}", doc.getId()))
                .andExpect(status().isNoContent());

        assertThat(documentRepository.findById(doc.getId())).isEmpty();
        verify(storageService).deletePdf(STORAGE_URL);
    }

    private void authenticateAs(String supabaseUserId) {
        var principal = new com.edi.backend.security.AuthenticatedUser(supabaseUserId, "test@test.com");
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
