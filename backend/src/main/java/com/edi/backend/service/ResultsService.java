package com.edi.backend.service;

import com.edi.backend.entity.Flashcard;
import com.edi.backend.entity.QuizQuestion;
import com.edi.backend.entity.Summary;
import com.edi.backend.exception.DocumentNotFoundException;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.repository.FlashcardRepository;
import com.edi.backend.repository.QuizQuestionRepository;
import com.edi.backend.repository.SummaryRepository;
import com.edi.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Retrieves AI-generated results (summary, flashcards, quiz) for a document.
 *
 * <p>All methods enforce ownership: the requesting user must own the document.
 * If a result is not yet available (processing still in progress or failed),
 * a 404 is returned with a descriptive message so the frontend can differentiate
 * "still processing" from "not found".
 */
@Service
public class ResultsService {

    private final DocumentRepository documentRepository;
    private final UserRepository userRepository;
    private final SummaryRepository summaryRepository;
    private final FlashcardRepository flashcardRepository;
    private final QuizQuestionRepository quizQuestionRepository;

    public ResultsService(DocumentRepository documentRepository,
                          UserRepository userRepository,
                          SummaryRepository summaryRepository,
                          FlashcardRepository flashcardRepository,
                          QuizQuestionRepository quizQuestionRepository) {
        this.documentRepository = documentRepository;
        this.userRepository = userRepository;
        this.summaryRepository = summaryRepository;
        this.flashcardRepository = flashcardRepository;
        this.quizQuestionRepository = quizQuestionRepository;
    }

    @Transactional(readOnly = true)
    public Summary getSummary(UUID documentId, String supabaseUserId) {
        verifyOwnership(documentId, supabaseUserId);
        return summaryRepository.findByDocumentId(documentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Summary not yet available for document: " + documentId));
    }

    @Transactional(readOnly = true)
    public List<Flashcard> getFlashcards(UUID documentId, String supabaseUserId) {
        verifyOwnership(documentId, supabaseUserId);
        List<Flashcard> flashcards = flashcardRepository.findByDocumentId(documentId);
        if (flashcards.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Flashcards not yet available for document: " + documentId);
        }
        return flashcards;
    }

    @Transactional(readOnly = true)
    public List<QuizQuestion> getQuiz(UUID documentId, String supabaseUserId) {
        verifyOwnership(documentId, supabaseUserId);
        List<QuizQuestion> questions = quizQuestionRepository.findByDocumentId(documentId);
        if (questions.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Quiz not yet available for document: " + documentId);
        }
        return questions;
    }

    private void verifyOwnership(UUID documentId, String supabaseUserId) {
        var user = userRepository.findBySupabaseUserId(supabaseUserId)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
        documentRepository.findByIdAndUser(documentId, user)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
    }
}
