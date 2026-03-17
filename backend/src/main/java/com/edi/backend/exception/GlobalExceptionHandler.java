package com.edi.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.net.URI;

/**
 * Translates application exceptions into RFC 7807 {@link ProblemDetail} responses.
 *
 * <p>Spring Boot 3 natively supports {@code ProblemDetail} — returning one from an
 * {@link ExceptionHandler} automatically sets the correct {@code Content-Type: application/problem+json}
 * header and serialises the standard fields ({@code type}, {@code title}, {@code status}, {@code detail}).
 *
 * <p>Production note: add a unique {@code instance} URI per error occurrence (e.g. the correlationId)
 * and ship the structured log + HTTP response to a log aggregator for correlation.
 * See RFC 7807 §3.1 for guidance on the {@code type} URI convention.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String PROBLEM_BASE_URI = "https://api.learning-assistant.app/problems/";

    @ExceptionHandler(DocumentNotFoundException.class)
    public ProblemDetail handleDocumentNotFound(DocumentNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setType(URI.create(PROBLEM_BASE_URI + "document-not-found"));
        problem.setTitle("Document Not Found");
        return problem;
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ProblemDetail handleRateLimit(RateLimitExceededException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
        problem.setType(URI.create(PROBLEM_BASE_URI + "rate-limit-exceeded"));
        problem.setTitle("Rate Limit Exceeded");
        problem.setProperty("retryAfterSeconds", 3600);
        return problem;
    }

    @ExceptionHandler(StorageException.class)
    public ProblemDetail handleStorage(StorageException ex) {
        log.error("Storage operation failed", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "File storage operation failed.");
        problem.setType(URI.create(PROBLEM_BASE_URI + "storage-error"));
        problem.setTitle("Storage Error");
        return problem;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds the maximum allowed size of 20 MB.");
        problem.setType(URI.create(PROBLEM_BASE_URI + "file-too-large"));
        problem.setTitle("File Too Large");
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        problem.setType(URI.create(PROBLEM_BASE_URI + "validation-error"));
        problem.setTitle("Validation Error");
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problem.setType(URI.create(PROBLEM_BASE_URI + "bad-request"));
        problem.setTitle("Bad Request");
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred.");
        problem.setType(URI.create(PROBLEM_BASE_URI + "internal-error"));
        problem.setTitle("Internal Server Error");
        return problem;
    }
}
