package com.edi.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/v1/auth/sync}.
 *
 * <p>The frontend sends this after completing the Supabase OAuth flow.
 * The backend upserts the user into the local users table so all FK relationships
 * reference our internal UUID rather than the Supabase user ID.
 */
public record AuthSyncRequest(
        @NotBlank String supabaseUserId,
        @NotBlank @Email String email) {}
