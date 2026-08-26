import { describe, expect, it } from "vitest";

import type { EvidenceItemRecord } from "@hirelens/domain";

import {
  countSupportedOrPartialCriteriaByRun,
  sortByEvidenceCountDescending,
} from "./candidate-triage";

function evidenceItem(
  processingRunId: string,
  criterionId: string,
  status: EvidenceItemRecord["status"],
  sourceOrdinal = 1,
): EvidenceItemRecord {
  return {
    id: `${processingRunId}-${criterionId}-${sourceOrdinal}`,
    processing_run_id: processingRunId,
    criterion_id: criterionId,
    status,
    source_ordinal: sourceOrdinal,
    resume_page_id: null,
    exact_quote: null,
    interpretation: null,
    uncertainty: null,
    suggested_interview_question: null,
    source_quote_hash: null,
    source_page_hash: null,
    created_at: "2026-08-27T00:00:00.000Z",
  };
}

describe("candidate triage evidence summary", () => {
  it("counts only unique SUPPORTED and PARTIAL criteria per processing run", () => {
    const counts = countSupportedOrPartialCriteriaByRun([
      evidenceItem("run-1", "criterion-1", "SUPPORTED", 1),
      evidenceItem("run-1", "criterion-1", "SUPPORTED", 2),
      evidenceItem("run-1", "criterion-2", "PARTIAL"),
      evidenceItem("run-1", "criterion-3", "NOT_FOUND", 0),
      evidenceItem("run-1", "criterion-4", "CONTRADICTED"),
      evidenceItem("run-1", "criterion-5", "HUMAN_ONLY", 0),
      evidenceItem("run-2", "criterion-6", "PARTIAL"),
    ]);

    expect(counts.get("run-1")).toBe(2);
    expect(counts.get("run-2")).toBe(1);
  });

  it("sorts larger counts first and preserves the input order for ties", () => {
    const items = [
      { id: "newer-zero", evidenceCount: 0 },
      { id: "first-two", evidenceCount: 2 },
      { id: "second-two", evidenceCount: 2 },
      { id: "one", evidenceCount: 1 },
    ];

    expect(sortByEvidenceCountDescending(items).map((item) => item.id)).toEqual([
      "first-two",
      "second-two",
      "one",
      "newer-zero",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "newer-zero",
      "first-two",
      "second-two",
      "one",
    ]);
  });
});
