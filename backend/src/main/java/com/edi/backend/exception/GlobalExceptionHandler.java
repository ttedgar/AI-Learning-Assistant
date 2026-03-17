package com.edi.backend.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Global exception handler that converts all unhandled exceptions to RFC 7807 Problem Details.
 *
 * <p>Spring Boot 3+ natively supports {@link ProblemDetail} as a return type from
 * {@code @ExceptionHandler} methods. The response content-type is automatically set to
 * {@code application/problem+json}.
 *
 * <p>RFC 7807 fields:
 * <ul>
 *   <li>{@code type} — URI identifying the problem type (here we use a path-based convention)</li>
 *   <li>{@code title} — short, human-readable summary</li>
 *   <li>{@code status} — HTTP status code</li>
 *   <li>{@code detail} — human-readable explanation of this specific occurrence</li>
 *   <li>{@code instance} — URI of the request that caused the problem</li>
 * </ul>
 *
 * <p>Note: security-layer errors (invalid JWT etc.) are handled directly in
 * {@link com.edi.backend.security.JwtAuthenticationFilter} and the configured
 * {@link org.springframework.security.web.AuthenticationEntryPoint}, because they occur before
 * the DispatcherServlet and this {@code @ControllerAdvice} is not active there.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleResourceNotFound(ResourceNotFoundException ex, WebRequest request) {
        log.warn("Resource not found: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setType(URI.create("/errors/not-found"));
        problem.setTitle("Resource Not Found");
        problem.setInstance(URI.create(request.getDescription(false).replace("uri=", "")));
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex, WebRequest request) {
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        fe -> fe.getDefaultMessage() != null ? fe.getDefaultMessage() : "Invalid value",
                        (a, b) -> a  // keep first if duplicate field
                ));

        log.warn("Validation failed: {}", fieldErrors);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Request validation failed");
        problem.setType(URI.create("/errors/validation"));
        problem.setTitle("Validation Error");
        problem.setInstance(URI.create(request.getDescription(false).replace("uri=", "")));
        problem.setProperty("errors", fieldErrors);
        return problem;
    }

    /**
     * Catch-all for unexpected exceptions.
     *
     * <p>The detail message is intentionally generic in production to avoid leaking internal
     * stack information to clients. The full exception is logged server-side for diagnostics.
     */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGenericException(Exception ex, WebRequest request) {
        log.error("Unhandled exception for request {}", request.getDescription(false), ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred. Please try again later.");
        problem.setType(URI.create("/errors/internal"));
        problem.setTitle("Internal Server Error");
        problem.setInstance(URI.create(request.getDescription(false).replace("uri=", "")));
        return problem;
    }
}
