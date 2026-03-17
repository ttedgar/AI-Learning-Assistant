package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes {@link DocumentProcessingMessage} to the {@code document.processing} queue.
 *
 * <p>Uses {@link RabbitTemplate} with the pre-configured direct exchange.
 * The {@code correlationId} from the message is already in MDC at this point
 * (set in the request-handling thread by the upload flow).
 *
 * <p>Production note: add publisher confirms ({@code spring.rabbitmq.publisher-confirm-type=correlated})
 * and publisher returns to detect silent message loss. For guaranteed delivery,
 * consider a transactional outbox pattern (write to DB and queue in one transaction).
 */
@Component
public class DocumentProcessingProducer {

    private static final Logger log = LoggerFactory.getLogger(DocumentProcessingProducer.class);

    private final RabbitTemplate rabbitTemplate;

    public DocumentProcessingProducer(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publish(DocumentProcessingMessage message) {
        log.info("Publishing document.processing message for documentId={} correlationId={}",
                message.documentId(), message.correlationId());
        rabbitTemplate.convertAndSend(
                RabbitMqConfig.DOCUMENT_EXCHANGE,
                RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE,
                message);
    }
}
