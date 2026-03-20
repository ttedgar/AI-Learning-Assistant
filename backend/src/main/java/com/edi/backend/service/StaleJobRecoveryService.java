package com.edi.backend.service;

import com.edi.backend.entity.Document;
import com.edi.backend.messaging.DocumentProcessingMessage;
import com.edi.backend.messaging.DocumentProcessingProducer;
import com.edi.backend.repository.DocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Scheduled recovery job for stuck documents.
 *
 * <p>Runs every 60 seconds and handles two failure scenarios:
 *
 * <h3>Path 1 — Stale IN_PROGRESS (worker crash / lease expired)</h3>
 * <p>A document is IN_PROGRESS but its {@code leaseUntil} has passed. This happens when:
 * <ul>
 *   <li>The worker JVM crashed after setting IN_PROGRESS but before publishing the result.</li>
 *   <li>The AI service timed out on all retries and the worker failed to publish a FAILED result.</li>
 *   <li>The {@code document.processed} message was lost in transit (before publisher confirms — Step 6).</li>
 * </ul>
 * Fix: reset to PENDING and republish {@code document.processing} so the worker picks it up again.
 *
 * <h3>Path 2 — Stuck PENDING (publish failure on upload)</h3>
 * <p>A document has been PENDING for > 15 minutes and has never started processing
 * ({@code processingStartedAt IS NULL}). This happens when:
 * <ul>
 *   <li>The upload dual-write succeeded in the DB but the RabbitMQ publish failed (temporary outage).</li>
 *   <li>RabbitMQ was unavailable at upload time and the message was lost (no confirms yet — Step 6).</li>
 * </ul>
 * Fix: republish {@code document.processing} directly (no status reset needed — already PENDING).
 *
 * <h3>Idempotency</h3>
 * <p>Republishing is safe because:
 * <ul>
 *   <li>The worker's per-document pipeline is idempotent (all AI calls are at-least-once safe).</li>
 *   <li>The backend consumer uses {@code ON CONFLICT DO NOTHING} on result inserts.</li>
 *   <li>All state transitions are guarded — duplicate events return 0 rows and ack silently.</li>
 * </ul>
 *
 * <h3>Known gap (production: use transactional outbox)</h3>
 * <p>If the DB reset (PENDING) succeeds but the RabbitMQ republish fails mid-batch,
 * the affected documents are left as PENDING with {@code processingStartedAt IS NOT NULL}.
 * They will not be re-detected on subsequent runs (Path 1 looks for IN_PROGRESS; Path 2
 * requires {@code processingStartedAt IS NULL}). Production fix: transactional outbox —
 * write the republish event to an outbox table in the same DB transaction, then relay
 * asynchronously. This eliminates the dual-write gap entirely.
 */
@Service
public class StaleJobRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(StaleJobRecoveryService.class);

    /**
     * Documents stuck in PENDING for longer than this without ever starting are considered lost.
     * 15 minutes gives RabbitMQ time to redeliver (consumer timeout is up to 30 min) while
     * still detecting genuine dual-write failures within a reasonable window.
     */
    static final Duration STUCK_PENDING_THRESHOLD = Duration.ofMinutes(15);

    private final DocumentRepository       documentRepository;
    private final DocumentProcessingProducer producer;

    public StaleJobRecoveryService(DocumentRepository documentRepository,
                                   DocumentProcessingProducer producer) {
        this.documentRepository = documentRepository;
        this.producer            = producer;
    }

    /**
     * Recovery scan. Runs every 60 seconds with a 60-second initial delay (allows the app
     * to fully start before the first scan). Uses {@code fixedDelay} (not {@code fixedRate})
     * so scans never overlap — important if the DB is slow or there are many stale documents.
     *
     * <p>Production: add a distributed lock (Redis + Redisson {@code RLock}) so only one
     * backend replica runs the recovery job at a time. Without a lock, two replicas will
     * both find the same stale documents, both reset them, and both republish — the worker
     * will receive duplicates, but idempotency guards handle it. For this single-instance
     * deployment, the lock is unnecessary.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    @Transactional
    public void recoverStaleJobs() {
        Instant now = Instant.now();

        recoverStaleInProgress(now);
        recoverStuckPending(now);
    }

    private void recoverStaleInProgress(Instant now) {
        // Use the current timestamp as a unique marker so findRecentlyResetDocuments
        // can identify exactly this batch. The marker is written into lease_until by
        // the UPDATE and then used as the lower-bound in the SELECT.
        Instant leaseMarker = now;

        int resetCount = documentRepository.resetStaleInProgressJobs(now, leaseMarker);

        if (resetCount == 0) {
            return; // Nothing stale — common path
        }

        log.warn("Recovery [stale-IN_PROGRESS]: reset {} documents to PENDING", resetCount);

        // Read the documents we just reset — same transaction, so we see our own writes.
        // FetchType.LAZY on user requires an extra query per document; acceptable for small batches.
        // Production: use a JOIN FETCH query or native RETURNING clause to avoid N+1.
        List<Document> toRepublish = documentRepository.findRecentlyResetDocuments(leaseMarker);

        toRepublish.forEach(doc -> {
            log.warn("Recovery [stale-IN_PROGRESS]: republishing documentId={}", doc.getId());
            republish(doc);
        });

        log.warn("Recovery [stale-IN_PROGRESS]: republished {} messages", toRepublish.size());
    }

    private void recoverStuckPending(Instant now) {
        Instant cutoff = now.minus(STUCK_PENDING_THRESHOLD);
        List<Document> stuck = documentRepository.findStuckPendingDocuments(cutoff);

        if (stuck.isEmpty()) {
            return;
        }

        log.warn("Recovery [stuck-PENDING]: found {} documents stuck for >{} min",
                stuck.size(), STUCK_PENDING_THRESHOLD.toMinutes());

        stuck.forEach(doc -> {
            log.warn("Recovery [stuck-PENDING]: republishing documentId={} createdAt={}",
                    doc.getId(), doc.getCreatedAt());
            republish(doc);
        });
    }

    /**
     * Generates a fresh {@code correlationId} and republishes the document to
     * {@code document.processing}. The new correlationId traces this specific retry
     * attempt through all downstream services.
     */
    private void republish(Document doc) {
        producer.publish(new DocumentProcessingMessage(
                UUID.randomUUID().toString(),   // fresh correlationId for this retry attempt
                doc.getId().toString(),
                doc.getFileUrl(),
                doc.getUser().getId().toString()
        ));
    }
}
