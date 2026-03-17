package com.edi.backend.repository;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    List<Document> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Document> findByIdAndUserId(UUID id, UUID userId);

    List<Document> findByStatus(DocumentStatus status);
}
