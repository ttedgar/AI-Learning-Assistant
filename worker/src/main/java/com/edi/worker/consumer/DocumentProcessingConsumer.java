package com.edi.worker.consumer;

import com.edi.worker.config.RabbitMqConfig;
import com.edi.worker.messaging.DocumentProcessedMessage;
import com.edi.worker.messaging.DocumentProcessedMessage.FlashcardDto;
import com.edi.worker.messaging.DocumentProcessedMessage.QuizQuestionDto;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Consumes messages from {@code document.processing} and orchestrates the full
 * processing pipeline: download → extract → AI → publish result.
 *
 * <p>The worker never touches the database (single writer principle). All results
 * are returned via the {@code document.processed} queue for the backend to persist.
 *
 * <p>correlationId from the incoming message is placed into MDC so every log line
 * during processing carries it for distributed tracing.
 * Production note: replace manual MDC propagation with OpenTelemetry + Jaeger.
 *
 * <p>Retry behaviour is configured on {@code retryableListenerContainerFactory}:
 * 3 attempts, exponential back-off (1 s, 2 s). After exhausting retries,
 * {@link com.edi.worker.recovery.DocumentProcessingRecoverer} publishes a FAILED
 * result and routes the original message to the DLQ.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DocumentProcessingConsumer {

    private final PdfDownloader      pdfDownloader;
    private final PdfTextExtractor   pdfTextExtractor;
    private final AiServiceClient    aiServiceClient;
    private final RabbitTemplate     rabbitTemplate;

    @RabbitListener(
            queues          = RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE,
            containerFactory = "retryableListenerContainerFactory")
    public void consume(DocumentProcessingMessage message) throws Exception {
        MDC.put("correlationId", message.getCorrelationId());
        MDC.put("documentId",    message.getDocumentId());

        try {
            log.info("Starting document processing for documentId={}", message.getDocumentId());

            // 1. Download PDF bytes from Supabase Storage
            byte[] pdfBytes = pdfDownloader.download(message.getFileUrl());

            // 2. Extract plain text via PDFBox
            String text = pdfTextExtractor.extractText(pdfBytes);

            // 3. Call ai-service — chunking / map-reduce is handled inside ai-service
            String            summary    = aiServiceClient.summarize(text);
            List<FlashcardDto> flashcards = aiServiceClient.generateFlashcards(text);
            List<QuizQuestionDto> quiz   = aiServiceClient.generateQuiz(text);

            // 4. Publish DONE result — backend saves everything to DB
            DocumentProcessedMessage result = DocumentProcessedMessage.builder()
                    .correlationId(message.getCorrelationId())
                    .documentId(message.getDocumentId())
                    .status("DONE")
                    .summary(summary)
                    .flashcards(flashcards)
                    .quiz(quiz)
                    .build();

            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.DOCUMENT_EXCHANGE,
                    RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                    result);

            log.info("Document processing completed successfully for documentId={}",
                    message.getDocumentId());

        } catch (Exception e) {
            // Re-throw so the retry interceptor can retry.
            // After 3 failures, DocumentProcessingRecoverer takes over.
            log.error("Document processing failed for documentId={}: {}",
                    message.getDocumentId(), e.getMessage());
            throw e;
        } finally {
            MDC.clear();
        }
    }
}
