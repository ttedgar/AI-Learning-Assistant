package com.edi.backend.repository;

import com.edi.backend.entity.Summary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SummaryRepository extends JpaRepository<Summary, UUID> {

    Optional<Summary> findByDocumentId(UUID documentId);
}
