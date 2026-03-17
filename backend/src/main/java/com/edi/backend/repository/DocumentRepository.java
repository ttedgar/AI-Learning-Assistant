package com.edi.backend.repository;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<Document, UUID> {

    List<Document> findByUserOrderByCreatedAtDesc(User user);

    Optional<Document> findByIdAndUser(UUID id, User user);
}
