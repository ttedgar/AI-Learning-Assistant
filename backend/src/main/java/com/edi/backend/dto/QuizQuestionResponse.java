package com.edi.backend.dto;

import com.edi.backend.entity.QuizQuestion;
import com.edi.backend.entity.QuizType;

import java.util.List;
import java.util.UUID;

public record QuizQuestionResponse(
        UUID id,
        String question,
        QuizType type,
        String correctAnswer,
        List<String> options) {

    public static QuizQuestionResponse from(QuizQuestion q) {
        return new QuizQuestionResponse(
                q.getId(),
                q.getQuestion(),
                q.getType(),
                q.getCorrectAnswer(),
                q.getOptions());
    }
}
