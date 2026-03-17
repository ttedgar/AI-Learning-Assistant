package com.edi.backend.service;

import com.edi.backend.entity.User;
import com.edi.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manages the synchronisation between Supabase Auth users and our local users table.
 *
 * <p>The frontend calls {@code POST /api/v1/auth/sync} immediately after completing the
 * OAuth flow so the backend has a local user record with an internal UUID for all FK relationships.
 *
 * <p>This upsert is idempotent — repeated calls with the same {@code supabaseUserId} return the
 * existing user without error. This is intentional: the frontend may call sync on every login.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Upserts the Supabase user into the local users table.
     *
     * @param supabaseUserId the Supabase Auth UUID ({@code sub} claim from JWT)
     * @param email          the user's email address
     * @return the local {@link User} entity (created or existing)
     */
    @Transactional
    public User syncUser(String supabaseUserId, String email) {
        return userRepository.findBySupabaseUserId(supabaseUserId)
                .orElseGet(() -> {
                    log.info("Creating new local user for supabaseUserId={}", supabaseUserId);
                    return userRepository.save(new User(supabaseUserId, email));
                });
    }
}
