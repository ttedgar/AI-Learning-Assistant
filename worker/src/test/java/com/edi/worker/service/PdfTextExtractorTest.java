package com.edi.worker.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PdfTextExtractorTest {

    private final PdfTextExtractor extractor = new PdfTextExtractor();

    @Test
    void extractText_returnsTextFromSinglePagePdf() throws IOException {
        byte[] pdfBytes = buildSinglePagePdf("Hello World from PDFBox");

        String text = extractor.extractText(pdfBytes);

        assertThat(text).contains("Hello World from PDFBox");
    }

    @Test
    void extractText_returnsTextFromMultiPagePdf() throws IOException {
        byte[] pdfBytes = buildMultiPagePdf("Page One Content", "Page Two Content");

        String text = extractor.extractText(pdfBytes);

        assertThat(text)
                .contains("Page One Content")
                .contains("Page Two Content");
    }

    @Test
    void extractText_throwsOnInvalidBytes() {
        byte[] garbage = "not a pdf".getBytes();

        assertThatThrownBy(() -> extractor.extractText(garbage))
                .isInstanceOf(IOException.class);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private byte[] buildSinglePagePdf(String text) throws IOException {
        return buildMultiPagePdf(text);
    }

    private byte[] buildMultiPagePdf(String... pageTexts) throws IOException {
        try (PDDocument doc = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            for (String pageText : pageTexts) {
                PDPage page = new PDPage();
                doc.addPage(page);
                try (PDPageContentStream stream = new PDPageContentStream(doc, page)) {
                    stream.beginText();
                    stream.setFont(font, 12);
                    stream.newLineAtOffset(50, 700);
                    stream.showText(pageText);
                    stream.endText();
                }
            }

            doc.save(out);
            return out.toByteArray();
        }
    }
}
