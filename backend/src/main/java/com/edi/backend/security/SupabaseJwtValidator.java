package com.edi.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

/**
 * Validates Supabase-issued JWTs and extracts their claims.
 *
 * <p>Supabase signs JWTs with HS256 using the project's JWT secret (available in the Supabase
 * dashboard under Project Settings → API → JWT Secret).
 *
 * <p><strong>Production note:</strong> For a zero-trust deployment, Supabase also supports RS256
 * with a public JWKS endpoint ({@code <project-url>/auth/v1/.well-known/jwks.json}). RS256
 * eliminates the need to share the signing secret with the backend — the backend only needs the
 * public key, which is fetched at startup and rotated automatically by Supabase.
 * See: https://supabase.com/docs/guides/auth/jwks
 */
@Component
public class SupabaseJwtValidator {

    private final SecretKey signingKey;

    public SupabaseJwtValidator(@Value("${supabase.jwt-secret}") String jwtSecret) {
        // HS256 requires a key of at least 256 bits (32 bytes). Supabase secrets are 64-char hex
        // strings (256 bits), which satisfies this requirement.
        this.signingKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Validates the JWT signature and expiry, then returns the claims payload.
     *
     * @param token raw JWT string (without "Bearer " prefix)
     * @return parsed {@link Claims}
     * @throws JwtException if the token is invalid, expired, or tampered with
     */
    public Claims validateAndExtract(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
