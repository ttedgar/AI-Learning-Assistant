package com.edi.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Translates application exceptions into RFC 7807 {@link ProblemDetail} responses.
 *
 * <p>Spring Boot 3 natively supports {@code ProblemDetail} — returning one from an
 * {@link ExceptionHandler} automatically sets the correct {@code Content-Type: application/problem+json}
 * header and serialises the standard fields ({@code type}, {@code title}, {@code status}, {@code detail}).
 *
 * <p>Type URIs use relative paths (e.g. {@code /errors/not-found}) for portability across
 * environments. Production: replace with absolute URIs pointing to a machine-readable error
 * catalogue (e.g. {@code https://api.yourapp.com/problems/not-found}).
 *
 * <p>Production note: add a unique {@code instance} URI per error occurrence (e.g. the correlationId)
 * and ship the structured log + HTTP response to a log aggregator for correlation.
 * See RFC 7807 §3.1 for guidance on the {@code type} URI convention.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // Relative URIs for portability; production: make absolute and point to error catalogue.
    private static final URI TYPE_NOT_FOUND    = URI.create("/errors/not-found");
    private static final URI TYPE_INTERNAL     = URI.create("/errors/internal");
    private static final URI TYPE_VALIDATION   = URI.create("/errors/validation");
    private static final URI TYPE_RATE_LIMIT   = URI.create("/errors/rate-limit-exceeded");
    private static final URI TYPE_STORAGE      = URI.create("/errors/storage-error");
    private static final URI TYPE_FILE_TOO_BIG = URI.create("/errors/file-too-large");
    private static final URI TYPE_BAD_REQUEST  = URI.create("/errors/bad-request");

    /**
     * Handles the generic "resource not found" exception used for any entity type.
     * Returns 404 rather than 403 even for ownership violations — leaking resource existence
     * would be an IDOR-adjacent information disclosure.
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleResourceNotFound(ResourceNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setType(TYPE_NOT_FOUND);
        problem.setTitle("Resource Not Found");
        return problem;
    }

    /**
     * Convenience overload for the document-specific subtype so existing service code
     * that throws {@link DocumentNotFoundException} also produces a 404.
     */
    @ExceptionHandler(DocumentNotFoundException.class)
    public ProblemDetail handleDocumentNotFound(DocumentNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setType(TYPE_NOT_FOUND);
        problem.setTitle("Document Not Found");
        return problem;
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ProblemDetail handleRateLimit(RateLimitExceededException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
        problem.setType(TYPE_RATE_LIMIT);
        problem.setTitle("Rate Limit Exceeded");
        problem.setProperty("retryAfterSeconds", 3600);
        return problem;
    }

    @ExceptionHandler(StorageException.class)
    public ProblemDetail handleStorage(StorageException ex) {
        log.error("Storage operation failed", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "File storage operation failed.");
        problem.setType(TYPE_STORAGE);
        problem.setTitle("Storage Error");
        return problem;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds the maximum allowed size of 20 MB.");
        problem.setType(TYPE_FILE_TOO_BIG);
        problem.setTitle("File Too Large");
        return problem;
    }

    /**
     * Bean validation failures. The {@code errors} extension field is a map of
     * {@code fieldName → firstViolationMessage}, matching RFC 7807 extension conventions.
     *
     * <p>Production: consider returning all violations per field rather than just the first.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        fe -> fe.getField(),
                        fe -> fe.getDefaultMessage() != null ? fe.getDefaultMessage() : "invalid",
                        (first, second) -> first   // keep first message if field has multiple violations
                ));
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Request validation failed");
        problem.setType(TYPE_VALIDATION);
        problem.setTitle("Validation Error");
        problem.setProperty("errors", fieldErrors);
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problem.setType(TYPE_BAD_REQUEST);
        problem.setTitle("Bad Request");
        return problem;
    }

    /**
     * Handles unique-constraint violations from concurrent auth/sync requests.
     *
     * <p>When two requests race to create the same user (e.g., concurrent uploads),
     * one succeeds and the other gets a unique constraint violation on supabase_user_id.
     * The user exists — treat this as success (200-equivalent) rather than an error,
     * but return 409 so the caller can distinguish it from a genuine 200.
     * The frontend auth/sync call ignores non-200 responses, so this is safe.
     *
     * <p>Production: use an UPSERT (INSERT ... ON CONFLICT DO UPDATE) in the repository
     * to eliminate the race condition entirely and always return 200.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation (likely concurrent insert): {}", ex.getMostSpecificCause().getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, "Resource already exists.");
        problem.setType(URI.create("/errors/conflict"));
        problem.setTitle("Conflict");
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred.");
        problem.setType(TYPE_INTERNAL);
        problem.setTitle("Internal Server Error");
        return problem;
    }
}
