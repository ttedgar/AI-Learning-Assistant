package com.edi.backend.repository;

import com.edi.backend.entity.Flashcard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FlashcardRepository extends JpaRepository<Flashcard, UUID> {

    List<Flashcard> findByDocumentId(UUID documentId);

    void deleteByDocumentId(UUID documentId);
}
