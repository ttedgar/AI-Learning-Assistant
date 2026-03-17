package com.edi.backend.security;

/**
 * Holds the identity claims extracted from a validated Supabase JWT.
 *
 * <p>Used as the principal in Spring Security's {@link org.springframework.security.authentication.UsernamePasswordAuthenticationToken}.
 *
 * <p>We intentionally do NOT look up the internal {@link com.edi.backend.entity.User} inside the
 * JWT filter — that avoids a DB query on every request and prevents a chicken-and-egg problem
 * on the first {@code POST /api/v1/auth/sync} call (before the user row exists).
 * Service methods resolve the internal User lazily when they need it.
 *
 * @param supabaseUserId the Supabase Auth UUID from the JWT {@code sub} claim
 * @param email          the email from the JWT {@code email} claim
 */
public record AuthenticatedUser(String supabaseUserId, String email) {}
