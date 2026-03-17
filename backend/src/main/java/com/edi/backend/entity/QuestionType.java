package com.edi.backend.entity;

/**
 * Discriminates quiz question rendering and answer validation strategies.
 *
 * <p>MULTIPLE_CHOICE: a set of options is shown; the user selects one; answer is revealed by colour.
 * <p>OPEN_ENDED: the user types a free-text answer; the correct answer is revealed on submission.
 */
public enum QuestionType {
    MULTIPLE_CHOICE,
    OPEN_ENDED
}
