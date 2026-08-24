export const PDF_PACKAGE_NAME = "@hirelens/pdf" as const;

import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractedPdfPage {
  pageNumber: number;
  rawText: string;
  normalizedText: string;
  rawTextSha256: string;
  normalizedTextSha256: string;
}

export class PdfExtractionError extends Error {
  constructor(
    public readonly category: "PDF_INVALID" | "PDF_ENCRYPTED" | "PDF_EXTRACTION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export function normalizePdfText(value: string): string {
  return value
    .normalize("NFKC")
    .split("\0")
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function extractPdfPages(data: Uint8Array): Promise<ExtractedPdfPage[]> {
  try {
    const loadingTask = getDocument({ data, isEvalSupported: false });
    const document = await loadingTask.promise;
    const pages: ExtractedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const rawText = content.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      const normalizedText = normalizePdfText(rawText);
      pages.push({
        pageNumber,
        rawText,
        normalizedText,
        rawTextSha256: sha256Text(rawText),
        normalizedTextSha256: sha256Text(normalizedText),
      });
    }

    return pages;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF extraction failed";
    if (/password|encrypted/iu.test(message)) {
      throw new PdfExtractionError("PDF_ENCRYPTED", "PDF is encrypted");
    }
    if (/invalid|xref|format|pdf/i.test(message)) {
      throw new PdfExtractionError("PDF_INVALID", "PDF is invalid");
    }
    throw new PdfExtractionError("PDF_EXTRACTION_FAILED", "PDF extraction failed");
  }
}
