package com.edi.worker.config;

import com.edi.worker.recovery.DocumentProcessingRecoverer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.interceptor.RetryOperationsInterceptor;

/**
 * RabbitMQ topology for the worker.
 *
 * <p>Mirrors the backend's topology declaration — Spring AMQP's {@code RabbitAdmin}
 * is idempotent so declaring the same durable queues on startup is safe.
 *
 * <p>Retry strategy: 3 attempts, exponential back-off 1 s → 2 s.
 * After exhausting retries, the {@link DocumentProcessingRecoverer} publishes a
 * FAILED result and the message is routed to the DLQ via the dead-letter exchange
 * configured on {@code document.processing}.
 *
 * <p>Production note: at scale, retry delays would be configured per message type,
 * and the DLQ would be monitored with Datadog/PagerDuty alerts on queue depth.
 */
@Configuration
public class RabbitMqConfig {

    public static final String DOCUMENT_PROCESSING_QUEUE = "document.processing";
    public static final String DOCUMENT_PROCESSED_QUEUE  = "document.processed";
    public static final String DOCUMENT_PROCESSING_DLQ   = "document.processing.dlq";
    public static final String DOCUMENT_EXCHANGE         = "document.direct";

    // ── Queue / Exchange declarations ───────────────────────────────────────

    @Bean
    public DirectExchange documentExchange() {
        return new DirectExchange(DOCUMENT_EXCHANGE, true, false);
    }

    /**
     * Dead-letter queue — terminal destination for messages that exhausted all retries.
     * Ops can replay messages manually after the root cause is fixed.
     */
    @Bean
    public Queue documentProcessingDlq() {
        return QueueBuilder.durable(DOCUMENT_PROCESSING_DLQ).build();
    }

    /**
     * Main processing queue. x-dead-letter-exchange="" routes rejected messages
     * through the default exchange to {@code document.processing.dlq} by queue name.
     */
    @Bean
    public Queue documentProcessingQueue() {
        return QueueBuilder.durable(DOCUMENT_PROCESSING_QUEUE)
                .withArgument("x-dead-letter-exchange", "")
                .withArgument("x-dead-letter-routing-key", DOCUMENT_PROCESSING_DLQ)
                .build();
    }

    @Bean
    public Queue documentProcessedQueue() {
        return QueueBuilder.durable(DOCUMENT_PROCESSED_QUEUE).build();
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

    // ── Serialisation ────────────────────────────────────────────────────────

    @Bean
    public Jackson2JsonMessageConverter messageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         Jackson2JsonMessageConverter messageConverter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(messageConverter);
        return template;
    }

    // ── Retry + DLQ ──────────────────────────────────────────────────────────

    /**
     * Listener container factory with stateless retry interceptor.
     *
     * <p>3 attempts, exponential back-off: 1 s initial, ×2 multiplier, 4 s cap.
     * After all attempts fail, {@link DocumentProcessingRecoverer} publishes a
     * FAILED result to {@code document.processed} then throws
     * {@link org.springframework.amqp.AmqpRejectAndDontRequeueException}
     * so the original message is nack'd and routed to the DLQ.
     *
     * <p>Production note: stateful retry (vs stateless) would be preferred for
     * long-running workloads so retry state survives worker restarts. Stateless
     * suffices here — messages are small and processing is fast.
     */
    @Bean
    public SimpleRabbitListenerContainerFactory retryableListenerContainerFactory(
            ConnectionFactory connectionFactory,
            Jackson2JsonMessageConverter messageConverter,
            MessageRecoverer documentProcessingRecoverer) {

        RetryOperationsInterceptor retryInterceptor = RetryInterceptorBuilder.stateless()
                .maxAttempts(3)
                .backOffOptions(1_000, 2.0, 4_000)   // 1 s, 2 s (cap 4 s)
                .recoverer(documentProcessingRecoverer)
                .build();

        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setAdviceChain(retryInterceptor);
        // Do not requeue on listener exception — let DLX routing handle it
        factory.setDefaultRequeueRejected(false);
        return factory;
    }
}
