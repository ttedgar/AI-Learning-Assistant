package com.edi.backend.entity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.List;

/**
 * JPA converter for the {@code options} JSONB column on {@link QuizQuestion}.
 *
 * <p>Serialises {@code List<String>} to a JSON string for storage and deserialises on read.
 *
 * <p>Production note: the hypersistence-utils {@code JsonType} is the preferred approach
 * for JSONB columns — it integrates with Hibernate's type system and handles nulls,
 * arrays, and nested objects cleanly without a custom converter.
 */
@Converter
public class StringListJsonConverter implements AttributeConverter<List<String>, String> {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(List<String> attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            return OBJECT_MAPPER.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize options list to JSON", e);
        }
    }

    @Override
    public List<String> convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        try {
            return OBJECT_MAPPER.readValue(dbData, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to deserialize options JSON", e);
        }
    }
}
