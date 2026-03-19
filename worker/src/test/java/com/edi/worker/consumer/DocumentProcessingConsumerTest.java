package com.edi.worker.consumer;

import com.edi.worker.messaging.DocumentProcessedMessage;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import reactor.core.publisher.Mono;
import reactor.rabbitmq.Receiver;
import reactor.test.StepVerifier;
import reactor.util.retry.Retry;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link DocumentProcessingConsumer#buildProcessingPipeline}.
 *
 * <p>A no-backoff {@link Retry#max(long)} spec is injected instead of the production
 * {@code Retry.backoff(...)} bean, so tests run in milliseconds without real delays.
 *
 * <p>The AMQP layer (Receiver, ack/nack) is not tested here — that is covered by
 * {@link com.edi.worker.integration.WorkerConsumerIT} end-to-end via Testcontainers.
 */
class DocumentProcessingConsumerTest {

    private final Receiver         receiver         = mock(Receiver.class);
    private final PdfDownloader    pdfDownloader    = mock(PdfDownloader.class);
    private final PdfTextExtractor pdfTextExtractor = mock(PdfTextExtractor.class);
    private final AiServiceClient  aiServiceClient  = mock(AiServiceClient.class);
    private final RabbitTemplate   rabbitTemplate   = mock(RabbitTemplate.class);
    private final ObjectMapper     objectMapper     = new ObjectMapper();

    // No backoff — avoids waiting 7 seconds in tests while preserving attempt count
    private final Retry testRetry = Retry.max(2);

    private final DocumentProcessingConsumer consumer = new DocumentProcessingConsumer(
            receiver, pdfDownloader, pdfTextExtractor, aiServiceClient,
            rabbitTemplate, objectMapper, testRetry);

    private DocumentProcessingMessage sampleMessage() {
        DocumentProcessingMessage msg = new DocumentProcessingMessage();
        msg.setCorrelationId("corr-123");
        msg.setDocumentId("doc-456");
        msg.setFileUrl("https://example.com/doc.pdf");
        msg.setUserId("user-789");
        return msg;
    }

    @Test
    void pipeline_completesSuccessfully_andPublishesDoneResult() throws Exception {
        byte[] fakePdf = new byte[]{1, 2, 3};
        when(pdfDownloader.download(anyString())).thenReturn(fakePdf);
        when(pdfTextExtractor.extractText(fakePdf)).thenReturn("extracted text");
        when(aiServiceClient.summarize(anyString())).thenReturn(Mono.just("summary"));
        when(aiServiceClient.generateFlashcards(anyString())).thenReturn(Mono.just(List.of(
                DocumentProcessedMessage.FlashcardDto.builder()
                        .question("Q1").answer("A1").build())));
        when(aiServiceClient.generateQuiz(anyString())).thenReturn(Mono.just(List.of()));

        StepVerifier.create(consumer.buildProcessingPipeline(sampleMessage()))
                .verifyComplete();

        verify(rabbitTemplate, times(1))
                .convertAndSend(anyString(), anyString(), any(DocumentProcessedMessage.class));
    }

    @Test
    void pipeline_retriesThreeTimesBeforeEmittingError() {
        AtomicInteger callCount = new AtomicInteger();
        when(pdfDownloader.download(anyString())).thenAnswer(inv -> {
            callCount.incrementAndGet();
            throw new RuntimeException("persistent failure");
        });

        StepVerifier.create(consumer.buildProcessingPipeline(sampleMessage()))
                .expectError()
                .verify();

        // 1 initial attempt + 2 retries = 3 total
        assertThat(callCount.get()).isEqualTo(3);
    }

    @Test
    void pipeline_succeedsOnThirdAttempt() throws Exception {
        byte[] fakePdf = new byte[]{1, 2, 3};
        when(pdfDownloader.download(anyString()))
                .thenThrow(new RuntimeException("transient"))
                .thenThrow(new RuntimeException("transient"))
                .thenReturn(fakePdf);
        when(pdfTextExtractor.extractText(fakePdf)).thenReturn("text");
        when(aiServiceClient.summarize(anyString())).thenReturn(Mono.just("summary"));
        when(aiServiceClient.generateFlashcards(anyString())).thenReturn(Mono.just(List.of()));
        when(aiServiceClient.generateQuiz(anyString())).thenReturn(Mono.just(List.of()));

        StepVerifier.create(consumer.buildProcessingPipeline(sampleMessage()))
                .verifyComplete();

        verify(pdfDownloader, times(3)).download(anyString());
        verify(rabbitTemplate, times(1))
                .convertAndSend(anyString(), anyString(), any(DocumentProcessedMessage.class));
    }
}
