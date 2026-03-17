package com.edi.backend.repository;

import com.edi.backend.entity.QuizQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, UUID> {

    List<QuizQuestion> findByDocumentId(UUID documentId);

    void deleteByDocumentId(UUID documentId);
}
