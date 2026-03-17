package com.edi.backend.repository;

import com.edi.backend.entity.Summary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SummaryRepository extends JpaRepository<Summary, UUID> {

    Optional<Summary> findByDocumentId(UUID documentId);
}
