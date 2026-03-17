package com.edi.backend.dto;

import com.edi.backend.entity.Flashcard;

import java.util.UUID;

public record FlashcardResponse(UUID id, String question, String answer) {

    public static FlashcardResponse from(Flashcard flashcard) {
        return new FlashcardResponse(
                flashcard.getId(),
                flashcard.getQuestion(),
                flashcard.getAnswer());
    }
}
