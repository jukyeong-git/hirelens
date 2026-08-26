export const PDF_PACKAGE_NAME = "@hirelens/pdf" as const;

import { createHash } from "node:crypto";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

class EdgeDomMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(initial?: string | number[]) {
    if (Array.isArray(initial) && initial.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = initial;
    }
  }

  multiplySelf(other: EdgeDomMatrix): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * other.a + c * other.b;
    this.b = b * other.a + d * other.b;
    this.c = a * other.c + c * other.d;
    this.d = b * other.c + d * other.d;
    this.e = a * other.e + c * other.f + e;
    this.f = b * other.e + d * other.f + f;
    return this;
  }

  preMultiplySelf(other: EdgeDomMatrix): this {
    const current = new EdgeDomMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
    this.a = other.a;
    this.b = other.b;
    this.c = other.c;
    this.d = other.d;
    this.e = other.e;
    this.f = other.f;
    return this.multiplySelf(current);
  }

  translate(tx = 0, ty = 0): EdgeDomMatrix {
    return new EdgeDomMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(
      new EdgeDomMatrix([1, 0, 0, 1, tx, ty]),
    );
  }

  scale(scaleX = 1, scaleY = scaleX): EdgeDomMatrix {
    return new EdgeDomMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(
      new EdgeDomMatrix([scaleX, 0, 0, scaleY, 0, 0]),
    );
  }

  invertSelf(): this {
    const determinant = this.a * this.d - this.b * this.c;
    if (determinant === 0) return this;
    const { a, b, c, d, e, f } = this;
    this.a = d / determinant;
    this.b = -b / determinant;
    this.c = -c / determinant;
    this.d = a / determinant;
    this.e = (c * f - d * e) / determinant;
    this.f = (b * e - a * f) / determinant;
    return this;
  }
}

let pdfJsModulePromise: Promise<PdfJsModule> | undefined;

function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof globalThis.DOMMatrix === "undefined") {
    Object.defineProperty(globalThis, "DOMMatrix", {
      configurable: true,
      value: EdgeDomMatrix,
      writable: true,
    });
  }
  pdfJsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfJsModulePromise;
}

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
  return value.normalize("NFKC").split("\0").join("").replace(/\s+/gu, " ").trim();
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function extractPdfPages(data: Uint8Array): Promise<ExtractedPdfPage[]> {
  try {
    const { getDocument } = await loadPdfJs();
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
