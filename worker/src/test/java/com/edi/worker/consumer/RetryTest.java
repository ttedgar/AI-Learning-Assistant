package com.edi.worker.consumer;

import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.retry.backoff.NoBackOffPolicy;
import org.springframework.retry.policy.SimpleRetryPolicy;
import org.springframework.retry.support.RetryTemplate;

import java.util.concurrent.atomic.AtomicInteger;

import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies the 3-attempt retry behaviour configured for the worker consumer.
 *
 * <p>The actual AMQP container retry interceptor is tested end-to-end in
 * {@link com.edi.worker.integration.WorkerConsumerIT}. This unit test isolates
 * the retry count and backoff policy using a {@link RetryTemplate} configured
 * identically to production, but with {@link NoBackOffPolicy} so the test
 * does not wait 7 seconds in CI.
 */
class RetryTest {

    private final PdfDownloader    pdfDownloader    = Mockito.mock(PdfDownloader.class);
    private final PdfTextExtractor pdfTextExtractor = Mockito.mock(PdfTextExtractor.class);
    private final AiServiceClient  aiServiceClient  = Mockito.mock(AiServiceClient.class);
    private final RabbitTemplate   rabbitTemplate   = Mockito.mock(RabbitTemplate.class);

    private final DocumentProcessingConsumer consumer = new DocumentProcessingConsumer(
            pdfDownloader, pdfTextExtractor, aiServiceClient, rabbitTemplate);

    private DocumentProcessingMessage sampleMessage() {
        DocumentProcessingMessage msg = new DocumentProcessingMessage();
        msg.setCorrelationId("corr-123");
        msg.setDocumentId("doc-456");
        msg.setFileUrl("https://example.com/doc.pdf");
        msg.setUserId("user-789");
        return msg;
    }

    @Test
    void retryTemplate_invokesTargetThreeTimesBeforeGivingUp() throws Exception {
        when(pdfDownloader.download(anyString()))
                .thenThrow(new RuntimeException("ai-service unavailable"));

        RetryTemplate retryTemplate = buildRetryTemplate(3);

        AtomicInteger callCount = new AtomicInteger(0);

        assertThatThrownBy(() ->
                retryTemplate.execute(ctx -> {
                    callCount.incrementAndGet();
                    consumer.consume(sampleMessage());
                    return null;
                })
        ).isInstanceOf(RuntimeException.class)
         .hasMessageContaining("ai-service unavailable");

        assertThat(callCount.get()).isEqualTo(3);
    }

    @Test
    void retryTemplate_succeedsOnThirdAttempt() throws Exception {
        byte[] fakePdf = new byte[]{};
        when(pdfDownloader.download(anyString()))
                .thenThrow(new RuntimeException("transient error"))
                .thenThrow(new RuntimeException("transient error"))
                .thenReturn(fakePdf);
        when(pdfTextExtractor.extractText(fakePdf)).thenReturn("extracted text");
        when(aiServiceClient.summarize(anyString())).thenReturn(Mono.just("summary"));
        when(aiServiceClient.generateFlashcards(anyString())).thenReturn(Mono.just(java.util.List.of()));
        when(aiServiceClient.generateQuiz(anyString())).thenReturn(Mono.just(java.util.List.of()));

        RetryTemplate retryTemplate = buildRetryTemplate(3);

        retryTemplate.execute(ctx -> {
            consumer.consume(sampleMessage());
            return null;
        });

        // pdfDownloader.download called 3 times (fail, fail, succeed)
        verify(pdfDownloader, times(3)).download(anyString());
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    /**
     * Matches the production retry config but uses NoBackOffPolicy so the test
     * runs in milliseconds rather than seconds.
     */
    private RetryTemplate buildRetryTemplate(int maxAttempts) {
        RetryTemplate template = new RetryTemplate();
        template.setRetryPolicy(new SimpleRetryPolicy(maxAttempts));
        template.setBackOffPolicy(new NoBackOffPolicy());
        return template;
    }
}
