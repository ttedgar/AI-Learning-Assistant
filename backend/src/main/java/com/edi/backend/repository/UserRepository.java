package com.edi.backend.repository;

import com.edi.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findBySupabaseUserId(String supabaseUserId);

    boolean existsBySupabaseUserId(String supabaseUserId);
}
