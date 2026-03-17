package com.edi.backend.exception;

/**
 * Thrown when a requested resource does not exist or does not belong to the authenticated user.
 *
 * <p>Returning 404 rather than 403 for ownership violations is intentional: from the client's
 * perspective, a resource they don't own "doesn't exist". Returning 403 would confirm the
 * resource exists, which leaks information (IDOR-adjacent concern).
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String resourceType, Object id) {
        super("%s not found: %s".formatted(resourceType, id));
    }
}
