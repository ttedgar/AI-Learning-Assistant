package com.edi.backend.exception;

public class RateLimitExceededException extends RuntimeException {

    public RateLimitExceededException() {
        super("Upload rate limit exceeded. Maximum 10 uploads per hour.");
    }
}
