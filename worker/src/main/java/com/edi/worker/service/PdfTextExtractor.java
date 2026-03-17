package com.edi.worker.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * Extracts plain text from a PDF byte array using Apache PDFBox 3.x.
 *
 * <p>PDFBox 3.x changed the entry-point from {@code PDDocument.load(byte[])}
 * to {@code Loader.loadPDF(byte[])} — see PDFBox 3.0 migration guide.
 *
 * <p>The worker sends the full extracted text to ai-service. Chunking and
 * map-reduce summarisation for long documents is handled entirely within
 * ai-service — the worker does not need to split the text.
 */
@Slf4j
@Service
public class PdfTextExtractor {

    public String extractText(byte[] pdfBytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            log.info("Extracted {} characters from PDF", text.length());
            return text;
        }
    }
}
