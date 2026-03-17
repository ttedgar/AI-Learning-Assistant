package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of the authenticated Supabase user.
 *
 * <p>We maintain a local users table rather than relying solely on the Supabase auth schema
 * because: (a) we can add application-specific fields (rate limit counters, preferences) without
 * touching Supabase's managed auth tables; (b) FK integrity is enforced at the PostgreSQL level.
 *
 * <p>{@code supabaseUserId} is the {@code sub} claim from the JWT — the stable identifier that
 * ties our local record to the Supabase identity.
 */
@Entity
@Table(
        name = "users",
        indexes = @Index(name = "idx_users_supabase_user_id", columnList = "supabase_user_id")
)
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    // Production note: supabase_user_id is stored as uuid in Postgres (Supabase's native type
    // for auth.uid()). The JWT sub claim is a UUID string; callers must UUID.fromString(sub).
    @Column(name = "supabase_user_id", unique = true, nullable = false, columnDefinition = "uuid")
    private UUID supabaseUserId;

    @Column(nullable = false)
    private String email;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    /**
     * Equality based on {@code id} only — avoids triggering lazy proxy loading.
     * See: https://docs.jboss.org/hibernate/orm/6.4/userguide/html_single/Hibernate_User_Guide.html#mapping-model-pojo-equalshashcode
     */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        // Constant hashCode is correct for JPA entities: avoids hash-code change
        // when an entity moves from transient (id == null) to persistent state.
        return getClass().hashCode();
    }
}
