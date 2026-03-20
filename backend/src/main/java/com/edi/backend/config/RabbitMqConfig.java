package com.edi.backend.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ topology declaration.
 *
 * <p>Exchange type: Direct — each queue bound with its own routing key.
 * Spring AMQP's RabbitAdmin auto-declares these on startup if they don't exist.
 *
 * <p>Topology:
 * <pre>
 *   [backend] --> document.direct (DirectExchange)
 *                   |-- routing key "document.processing"  --> document.processing  (queue)
 *                   |-- routing key "document.processed"   --> document.processed   (queue)
 *
 *   document.processing queue carries x-dead-letter-exchange="" and
 *   x-dead-letter-routing-key="document.processing.dlq".
 *   After 3 failed retries (configured in worker), RabbitMQ routes the
 *   rejected message through the default exchange to document.processing.dlq.
 *
 *   Production note: in a multi-region deployment, each region would have its own
 *   shovel/federation topology. For this scale, a single RabbitMQ node suffices.
 * </pre>
 */
@Configuration
public class RabbitMqConfig {

    // Queue names — shared constants used by producers and consumers in this service
    public static final String DOCUMENT_PROCESSING_QUEUE = "document.processing";
    public static final String DOCUMENT_PROCESSED_QUEUE  = "document.processed";
    public static final String DOCUMENT_STATUS_QUEUE     = "document.status";
    public static final String DOCUMENT_PROCESSING_DLQ   = "document.processing.dlq";

    // Exchange name
    public static final String DOCUMENT_EXCHANGE = "document.direct";

    @Bean
    public DirectExchange documentExchange() {
        // durable=true: survives broker restart; autoDelete=false: never deleted automatically
        return new DirectExchange(DOCUMENT_EXCHANGE, true, false);
    }

    /**
     * Dead letter queue — terminal destination for messages that exhausted all retries.
     * Ops can replay messages from here after root-cause is fixed.
     * Production: alerting on queue depth triggers a PagerDuty incident.
     */
    @Bean
    public Queue documentProcessingDlq() {
        return QueueBuilder.durable(DOCUMENT_PROCESSING_DLQ).build();
    }

    /**
     * Main processing queue. x-dead-letter-exchange="": uses the RabbitMQ default exchange
     * so dead letters route directly by queue name (x-dead-letter-routing-key).
     * Retry count is enforced in the worker via Spring Retry + exponential backoff.
     */
    @Bean
    public Queue documentProcessingQueue() {
        return QueueBuilder.durable(DOCUMENT_PROCESSING_QUEUE)
                // "" = default exchange; message is routed to DOCUMENT_PROCESSING_DLQ by name
                .withArgument("x-dead-letter-exchange", "")
                .withArgument("x-dead-letter-routing-key", DOCUMENT_PROCESSING_DLQ)
                .build();
    }

    /**
     * Result queue — worker publishes here after processing.
     * No DLQ: the backend consumer is idempotent and won't reject messages.
     */
    @Bean
    public Queue documentProcessedQueue() {
        return QueueBuilder.durable(DOCUMENT_PROCESSED_QUEUE).build();
    }

    /**
     * Status queue — worker publishes IN_PROGRESS here as the first step of processing.
     * No DLQ: the status consumer is idempotent (guarded transition returns 0 on replay).
     * Out-of-order delivery is safe: late IN_PROGRESS events after DONE/FAILED are silently
     * acked because the guarded UPDATE returns 0 rows (status is no longer PENDING).
     */
    @Bean
    public Queue documentStatusQueue() {
        return QueueBuilder.durable(DOCUMENT_STATUS_QUEUE).build();
    }

    @Bean
    public Binding documentProcessingBinding(Queue documentProcessingQueue,
                                              DirectExchange documentExchange) {
        return BindingBuilder.bind(documentProcessingQueue)
                .to(documentExchange)
                .with(DOCUMENT_PROCESSING_QUEUE);
    }

    @Bean
    public Binding documentProcessedBinding(Queue documentProcessedQueue,
                                             DirectExchange documentExchange) {
        return BindingBuilder.bind(documentProcessedQueue)
                .to(documentExchange)
                .with(DOCUMENT_PROCESSED_QUEUE);
    }

    @Bean
    public Binding documentStatusBinding(Queue documentStatusQueue,
                                         DirectExchange documentExchange) {
        return BindingBuilder.bind(documentStatusQueue)
                .to(documentExchange)
                .with(DOCUMENT_STATUS_QUEUE);
    }
}
