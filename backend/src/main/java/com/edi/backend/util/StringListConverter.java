package com.edi.backend.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Collections;
import java.util.List;

/**
 * JPA converter that serialises a {@code List<String>} to/from a JSON string,
 * allowing storage in a PostgreSQL {@code jsonb} column.
 *
 * <p>This approach is used rather than Hibernate's {@code @JdbcTypeCode(SqlTypes.JSON)} to keep
 * the mapping portable and explicit. In a production codebase with Hibernate 6+ you would use
 * {@code @JdbcTypeCode(SqlTypes.JSON)} with a dedicated Jackson integration module.
 */
@Converter
public class StringListConverter implements AttributeConverter<List<String>, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(List<String> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialise List<String> to JSON", e);
        }
    }

    @Override
    public List<String> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return MAPPER.readValue(dbData, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to deserialise JSON to List<String>", e);
        }
    }
}
