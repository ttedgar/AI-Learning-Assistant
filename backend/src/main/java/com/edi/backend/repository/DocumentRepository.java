package com.edi.backend.repository;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import com.edi.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    List<Document> findByUserOrderByCreatedAtDesc(User user);

    Optional<Document> findByIdAndUser(UUID id, User user);

    List<Document> findByStatus(DocumentStatus status);
}
