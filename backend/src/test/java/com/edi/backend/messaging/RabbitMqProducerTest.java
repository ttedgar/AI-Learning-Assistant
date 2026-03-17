package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * Unit test for {@link DocumentProcessingProducer}.
 *
 * <p>Verifies that the producer calls {@link RabbitTemplate#convertAndSend} with the
 * correct exchange, routing key, and message payload — including the correlationId.
 */
@ExtendWith(MockitoExtension.class)
class RabbitMqProducerTest {

    @Mock
    private RabbitTemplate rabbitTemplate;

    @InjectMocks
    private DocumentProcessingProducer producer;

    @Test
    void publish_sendsToCorrectExchangeAndQueue() {
        String correlationId = UUID.randomUUID().toString();
        String documentId = UUID.randomUUID().toString();
        DocumentProcessingMessage message = new DocumentProcessingMessage(
                correlationId,
                documentId,
                "https://storage/file.pdf",
                "user-123");

        producer.publish(message);

        ArgumentCaptor<Object> msgCaptor = ArgumentCaptor.forClass(Object.class);
        verify(rabbitTemplate).convertAndSend(
                eq(RabbitMqConfig.DOCUMENT_EXCHANGE),
                eq(RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE),
                msgCaptor.capture());

        DocumentProcessingMessage sent = (DocumentProcessingMessage) msgCaptor.getValue();
        assertThat(sent.correlationId()).isEqualTo(correlationId);
        assertThat(sent.documentId()).isEqualTo(documentId);
        assertThat(sent.fileUrl()).isEqualTo("https://storage/file.pdf");
        assertThat(sent.userId()).isEqualTo("user-123");
    }
}
