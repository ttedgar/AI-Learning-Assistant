package com.edi.backend.controller;

import com.edi.backend.dto.FlashcardResponse;
import com.edi.backend.dto.QuizQuestionResponse;
import com.edi.backend.dto.SummaryResponse;
import com.edi.backend.security.AuthenticatedUser;
import com.edi.backend.service.ResultsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Endpoints for retrieving AI-generated results attached to a document.
 *
 * <p>Results are available only after the worker has completed processing
 * (document status = DONE). The frontend polls {@code GET /api/v1/documents/{id}}
 * every 3 seconds while status is PENDING or PROCESSING, then fetches results once DONE.
 */
@RestController
@RequestMapping("/api/v1/documents/{id}")
@Tag(name = "Results", description = "AI-generated summary, flashcards, and quiz for a document")
public class ResultsController {

    private final ResultsService resultsService;

    public ResultsController(ResultsService resultsService) {
        this.resultsService = resultsService;
    }

    @GetMapping("/summary")
    @Operation(summary = "Get AI-generated summary",
               description = "Returns the markdown-formatted summary. Returns 404 while processing.")
    public ResponseEntity<SummaryResponse> getSummary(
            @PathVariable UUID id,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        var summary = resultsService.getSummary(id, principal.supabaseUserId());
        return ResponseEntity.ok(SummaryResponse.from(summary));
    }

    @GetMapping("/flashcards")
    @Operation(summary = "Get AI-generated flashcards",
               description = "Returns the list of flashcard Q&A pairs. Returns 404 while processing.")
    public ResponseEntity<List<FlashcardResponse>> getFlashcards(
            @PathVariable UUID id,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        List<FlashcardResponse> flashcards = resultsService.getFlashcards(id, principal.supabaseUserId())
                .stream()
                .map(FlashcardResponse::from)
                .toList();
        return ResponseEntity.ok(flashcards);
    }

    @GetMapping("/quiz")
    @Operation(summary = "Get AI-generated quiz questions",
               description = "Returns quiz questions (multiple choice + open ended). Returns 404 while processing.")
    public ResponseEntity<List<QuizQuestionResponse>> getQuiz(
            @PathVariable UUID id,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        List<QuizQuestionResponse> questions = resultsService.getQuiz(id, principal.supabaseUserId())
                .stream()
                .map(QuizQuestionResponse::from)
                .toList();
        return ResponseEntity.ok(questions);
    }
}
