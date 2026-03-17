package com.edi.backend.repository;

import com.edi.backend.entity.Flashcard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, UUID> {

    List<Flashcard> findByDocumentId(UUID documentId);

    void deleteByDocumentId(UUID documentId);
}
