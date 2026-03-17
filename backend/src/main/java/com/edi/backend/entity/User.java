package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Local representation of a Supabase Auth user.
 *
 * <p>We keep our own UUID ({@code id}) so internal FK relationships are never coupled to
 * Supabase's user IDs. {@code supabaseUserId} is a unique index used for the JWT → user lookup.
 *
 * <p>Created / updated via {@code POST /api/v1/auth/sync} after the frontend completes
 * the OAuth flow (the backend cannot receive the Supabase auth callback directly).
 *
 * <p>Production: {@code created_at} would be accompanied by {@code updated_at} and a soft-delete
 * flag, enabling GDPR-compliant account deletion auditing.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "supabase_user_id", nullable = false, unique = true)
    private String supabaseUserId;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public User(String supabaseUserId, String email) {
        this.supabaseUserId = supabaseUserId;
        this.email = email;
    }
}
