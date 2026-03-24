package com.edi.worker.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.edi.worker.exception.RateLimitException;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;
import reactor.rabbitmq.RabbitFlux;
import reactor.rabbitmq.Receiver;
import reactor.rabbitmq.ReceiverOptions;
import reactor.rabbitmq.Sender;
import reactor.rabbitmq.SenderOptions;
import reactor.util.retry.Retry;

import java.time.Duration;

/**
 * RabbitMQ topology for the worker.
 *
 * <p>Mirrors the backend's topology declaration — Spring AMQP's {@code RabbitAdmin}
 * is idempotent so declaring the same durable queues on startup is safe.
 *
 * <p>Retry strategy: 3 total attempts (1 initial + 2 retries), exponential back-off
 * 1 s → 2 s, capped at 4 s. Configured as a {@link Retry} bean so tests can inject
 * a no-backoff variant without modifying the consumer.
 *
 * <p>After all retries are exhausted, the consumer publishes a FAILED result to
 * {@code document.processed} and nacks the message, which is routed to the DLQ
 * via the dead-letter exchange configured on {@code document.processing}.
 *
 * <p>Production note: at scale, retry delays would be configured per message type,
 * and the DLQ would be monitored with Datadog/PagerDuty alerts on queue depth.
 */
@Configuration
public class RabbitMqConfig {

    public static final String DOCUMENT_PROCESSING_QUEUE = "document.processing";
    public static final String DOCUMENT_PROCESSED_QUEUE  = "document.processed";
    public static final String DOCUMENT_STATUS_QUEUE     = "document.status";
    public static final String DOCUMENT_PROCESSING_DLQ   = "document.processing.dlq";
    public static final String DOCUMENT_EXCHANGE         = "document.direct";

    // ── Queue / Exchange declarations ────────────────────────────────────────

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

    /**
     * Status queue — worker publishes IN_PROGRESS here as the first step of processing.
     * No DLQ: the backend consumer is idempotent via guarded UPDATE.
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

    // ── Reactor RabbitMQ ─────────────────────────────────────────────────────

    /**
     * Reactor RabbitMQ {@link Receiver} — replaces {@code @RabbitListener}.
     *
     * <p>Extracts the underlying AMQP client {@code ConnectionFactory} from Spring's
     * {@code CachingConnectionFactory} wrapper so Reactor RabbitMQ can manage its own
     * connection lifecycle independently of Spring AMQP's connection pool.
     *
     * <p>Production note: configure {@code ReceiverOptions} with a dedicated connection name
     * (e.g. {@code "worker-consumer"}) for easier identification in the RabbitMQ management UI.
     */
    @Bean
    public Receiver receiver(ConnectionFactory springConnectionFactory) {
        com.rabbitmq.client.ConnectionFactory rabbitCf =
                ((CachingConnectionFactory) springConnectionFactory).getRabbitConnectionFactory();
        return RabbitFlux.createReceiver(new ReceiverOptions().connectionFactory(rabbitCf));
    }

    /**
     * Reactor RabbitMQ {@link Sender} — used for all outbound publishes with
     * publisher confirms (Step 6).
     *
     * <p>Uses a separate connection from the {@link Receiver} so that consumer and
     * publisher channel pools do not compete. This matches the RabbitMQ best-practice
     * recommendation of one connection per logical direction.
     *
     * <p>{@code sendWithPublishConfirms} calls {@code channel.confirmSelect()} internally —
     * no additional broker or connection-factory configuration is required.
     *
     * <p>Production note: name the connection "worker-publisher" via
     * {@code SenderOptions.connectionSupplier} for visibility in the management UI.
     */
    @Bean
    public Sender sender(ConnectionFactory springConnectionFactory) {
        com.rabbitmq.client.ConnectionFactory rabbitCf =
                ((CachingConnectionFactory) springConnectionFactory).getRabbitConnectionFactory();
        return RabbitFlux.createSender(new SenderOptions().connectionFactory(rabbitCf));
    }

    /**
     * Retry specification: 3 total attempts (1 initial + 2 retries).
     *
     * <p>Backoff is exception-type-aware:
     * <ul>
     *   <li>{@link RateLimitException} (Gemini 429): 65 s fixed delay. The Gemini free-tier
     *       RPM quota window resets every 60 s; 65 s gives a 5-second buffer. Without this,
     *       fast retries after a 429 exhaust the daily RPD quota in minutes (the retry storm
     *       pattern observed in production on 2026-03-XX).</li>
     *   <li>All other failures: exponential back-off 1 s → 2 s (infrastructure errors,
     *       transient network issues, ai-service 502s).</li>
     * </ul>
     *
     * <p>Extracted as a bean so integration and unit tests can inject {@code Retry.max(2)}
     * without backoff to avoid slow test suites.
     *
     * <p>Production note: with a paid Gemini tier the Retry-After header value should be
     * respected instead of a fixed 65 s delay. Stateful retry
     * ({@code Retry.backoff(...).transientErrors(true)}) would survive worker restarts.
     */
    @Bean
    public Retry documentProcessingRetry() {
        return Retry.from(companion -> companion.flatMap(signal -> {
            if (signal.totalRetries() >= 2) {
                // Retries exhausted — propagate to onErrorResume in the consumer.
                return Mono.error(Exceptions.retryExhausted(
                        "Processing exhausted after " + (signal.totalRetries() + 1) + " attempts",
                        signal.failure()));
            }
            boolean isRateLimit = signal.failure() instanceof RateLimitException;
            // 1 s on first retry, 2 s on second retry; or 65 s flat for rate-limit errors.
            Duration delay = isRateLimit
                    ? Duration.ofSeconds(65)
                    : Duration.ofSeconds(1L << signal.totalRetries());
            return Mono.delay(delay);
        }));
    }
}
