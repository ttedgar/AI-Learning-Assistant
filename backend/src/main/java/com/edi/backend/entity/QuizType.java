package com.edi.backend.entity;

/**
 * Quiz question format.
 *
 * <p>MULTIPLE_CHOICE — four options, one correct. The {@code options} JSON column
 * on {@link QuizQuestion} is populated only for this type.
 *
 * <p>OPEN_ENDED — free-text answer; {@code options} is null.
 * Production: open-ended answers could be evaluated via an AI grading service
 * instead of a simple string match.
 */
public enum QuizType {
    MULTIPLE_CHOICE,
    OPEN_ENDED
}
