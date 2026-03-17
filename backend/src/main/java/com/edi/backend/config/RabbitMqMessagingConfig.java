package com.edi.backend.config;

import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configures RabbitMQ to use JSON serialisation for all messages.
 *
 * <p>Spring AMQP defaults to Java serialisation, which is brittle and not language-agnostic.
 * Jackson JSON is used instead so messages can be inspected in the RabbitMQ management UI
 * and consumed by non-Java services in the future.
 *
 * <p>Production note: for schema evolution, use Avro or Protobuf with a Schema Registry
 * (Confluent Schema Registry or AWS Glue) to enforce backward/forward compatibility.
 */
@Configuration
public class RabbitMqMessagingConfig {

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         MessageConverter jsonMessageConverter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter);
        return template;
    }
}
