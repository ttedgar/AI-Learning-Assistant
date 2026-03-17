package com.edi.backend.dto;

import com.edi.backend.entity.Summary;

import java.util.UUID;

public record SummaryResponse(UUID id, UUID documentId, String content) {

    public static SummaryResponse from(Summary summary) {
        return new SummaryResponse(
                summary.getId(),
                summary.getDocument().getId(),
                summary.getContent());
    }
}
