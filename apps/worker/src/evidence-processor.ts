import { createHash } from "node:crypto";

import { EvidenceAdapterError, type EvidenceAdapter } from "@hirelens/ai/server";
import { EvidenceValidationError, validateEvidenceExtraction } from "@hirelens/ai";
import type { SupabaseRestClient } from "@hirelens/database";
import {
  claimEvidenceProcessingRun,
  completeExtractionForEvidence,
  loadEvidenceAnalysisContext,
  markEvidenceValidating,
  markEvidenceNeedsOcr,
  persistValidatedEvidence,
  recordProcessingFailure,
} from "@hirelens/database";
import type { ProcessingFailureCategory } from "@hirelens/domain";
import { extractPdfPages, PdfExtractionError } from "@hirelens/pdf";

export function minimizeDirectIdentifiers(value: string): string {
  const lines = value.split(/\r?\n/u);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex >= 0 && lines.slice(firstContentIndex + 1).some((line) => line.trim())) {
    const header = lines[firstContentIndex].trim();
    const looksLikeLatinName = /^(?:[A-Z][A-Za-z'-]{1,30}\s+){1,3}[A-Z][A-Za-z'-]{1,30}$/u.test(
      header,
    );
    const looksLikeKoreanName = /^[가-힣]{2,4}$/u.test(header);
    const looksLikeJobTitle =
      /\b(?:engineer|developer|manager|architect|designer|analyst|recruiter|specialist)\b/iu.test(
        header,
      );
    if ((looksLikeLatinName && !looksLikeJobTitle) || looksLikeKoreanName) {
      lines[firstContentIndex] = "[NAME REDACTED]";
    }
  }

  return lines
    .join("\n")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[EMAIL REDACTED]")
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/gu, "[PHONE REDACTED]")
    .replace(/\bhttps?:\/\/\S+/giu, "[URL REDACTED]")
    .replace(
      /^(\s*(?:name|full name|address|주소|성명|이름)\s*[:：]).+$/gimu,
      "$1 [DIRECT IDENTIFIER REDACTED]",
    )
    .replace(
      /^(?:[A-Z][a-z]{1,30}\s+){1,3}[A-Z][a-z]{1,30}(?=\s+(?:resume|summary|profile|experience|skills)\b)/iu,
      "[NAME REDACTED]",
    )
    .replace(/^[가-힣]{2,4}(?=\s+(?:이력서|경력|프로필|기술)\b)/u, "[NAME REDACTED]")
    .replace(
      /\b\d{1,6}\s+[A-Za-z0-9 .'-]{2,60}\s(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b\.?/giu,
      "[ADDRESS REDACTED]",
    )
    .replace(/\bSingapore\s+\d{6}\b/giu, "[ADDRESS REDACTED]");
}

function sha256(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFKC").replace(/\s+/gu, " ").trim(), "utf8")
    .digest("hex");
}

function classifyFailure(error: unknown): {
  category: ProcessingFailureCategory;
  retryable: boolean;
  quarantined: boolean;
  detail: string;
} {
  if (error instanceof PdfExtractionError)
    return {
      category: error.category,
      retryable: false,
      quarantined: false,
      detail: error.category,
    };
  if (error instanceof EvidenceAdapterError) {
    const categoryByCode: Partial<Record<EvidenceAdapterError["code"], ProcessingFailureCategory>> =
      {
        TIMEOUT: "AI_TIMEOUT",
        NETWORK_ERROR: "AI_NETWORK_ERROR",
        RATE_LIMIT: "AI_RATE_LIMIT",
        PROVIDER_ERROR: "AI_PROVIDER_ERROR",
        REFUSAL: "AI_REFUSAL",
        INCOMPLETE: "AI_INCOMPLETE",
        INVALID_SCHEMA: "AI_SCHEMA_INVALID",
        INVALID_JSON: "AI_SCHEMA_INVALID",
        MISSING_OUTPUT: "AI_SCHEMA_INVALID",
        UNKNOWN_CRITERION: "AI_UNKNOWN_CRITERION",
        INVALID_PAGE: "AI_INVALID_PAGE",
        QUOTE_MISMATCH: "AI_QUOTE_MISMATCH",
        BUDGET_EXCEEDED: "AI_BUDGET_EXCEEDED",
        INVALID_USAGE: "AI_USAGE_INVALID",
      };
    const category = categoryByCode[error.code] ?? "AI_PROVIDER_ERROR";
    return {
      category,
      retryable: error.retryable,
      quarantined: error.quarantined || ["INVALID_JSON", "MISSING_OUTPUT"].includes(error.code),
      detail: error.code,
    };
  }
  if (error instanceof EvidenceValidationError) {
    const codes = new Set(error.issues.map((issue) => issue.code));
    return {
      category: codes.has("QUOTE_NOT_FOUND")
        ? "AI_QUOTE_MISMATCH"
        : codes.has("INVALID_PAGE_NUMBER")
          ? "AI_INVALID_PAGE"
          : "AI_UNKNOWN_CRITERION",
      retryable: false,
      quarantined: true,
      detail: "SOURCE_VALIDATION_FAILED",
    };
  }
  const typed = error as { category?: ProcessingFailureCategory; retryable?: boolean };
  if (typed.category && ["STORAGE_UNAVAILABLE", "STORAGE_DOWNLOAD_FAILED"].includes(typed.category))
    return {
      category: typed.category,
      retryable: typed.retryable === true,
      quarantined: false,
      detail: typed.category,
    };
  return {
    category: "EVIDENCE_PERSISTENCE_FAILED",
    retryable: true,
    quarantined: false,
    detail: "EVIDENCE_PERSISTENCE_FAILED",
  };
}

export interface EvidenceProcessorDependencies {
  client: SupabaseRestClient;
  adapter: EvidenceAdapter;
  downloadResume(path: string): Promise<Uint8Array>;
}

export function createEvidenceRunProcessor(dependencies: EvidenceProcessorDependencies) {
  return async (
    processingRunId: string,
  ): Promise<"IGNORED" | "NEEDS_OCR" | "COMPLETED" | "FAILED"> => {
    const claimed = await claimEvidenceProcessingRun(dependencies.client, processingRunId);
    if (!claimed) return "IGNORED";
    try {
      if (claimed.stage === "EXTRACTING") {
        const pages = await extractPdfPages(
          await dependencies.downloadResume(claimed.storage_path),
        );
        if (pages.every((page) => page.normalizedText.length === 0)) {
          await markEvidenceNeedsOcr(dependencies.client, processingRunId);
          return "NEEDS_OCR";
        }
        await completeExtractionForEvidence(dependencies.client, { processingRunId, pages });
      }
      const context = await loadEvidenceAnalysisContext(dependencies.client, processingRunId);
      const result = await dependencies.adapter({
        criteria: context.criteria,
        pages: context.pages.map((page) => ({
          page_number: page.page_number,
          text: minimizeDirectIdentifiers(page.normalized_text),
        })),
      });
      validateEvidenceExtraction(result.evidence, {
        allowedCriterionIds: new Set(context.criteria.map((criterion) => criterion.criterion_id)),
        humanOnlyCriterionIds: new Set(
          context.criteria
            .filter((criterion) => !criterion.resume_assessable)
            .map((criterion) => criterion.criterion_id),
        ),
        pageTextByNumber: new Map(
          context.pages.map((page) => [page.page_number, page.normalized_text]),
        ),
      });
      await markEvidenceValidating(
        dependencies.client,
        processingRunId,
        result.versions,
        result.usage,
      );
      const pageHashes = new Map(
        context.pages.map((page) => [page.page_number, page.normalized_text_sha256]),
      );
      await persistValidatedEvidence(dependencies.client, {
        processingRunId,
        results: result.evidence.results.map((criterion) => ({
          ...criterion,
          evidence: criterion.evidence.map((source) => ({
            ...source,
            source_quote_hash: sha256(source.exact_quote),
            source_page_hash: pageHashes.get(source.page_number)!,
          })),
        })),
      });
      return "COMPLETED";
    } catch (error) {
      const failure = classifyFailure(error);
      await recordProcessingFailure(
        dependencies.client,
        processingRunId,
        failure.category,
        failure,
      );
      return "FAILED";
    }
  };
}
