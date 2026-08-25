import type {
  EvidenceAdapter,
  EvidenceAdapterResult,
} from "../../../packages/ai/src/evidence-adapter.ts";
import { EVIDENCE_CONTRACT_VERSIONS } from "@hirelens/ai";
import {
  claimEvidenceProcessingRun,
  loadEvidenceAnalysisContext,
  markEvidenceValidating,
  persistValidatedEvidence,
  recordProcessingFailure,
  renewEvidenceProcessingLease,
} from "../../../packages/database/src/evidence.ts";
import type { SupabaseRestClient } from "../../../packages/database/src/rest.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEvidenceRunProcessor, minimizeDirectIdentifiers } from "./evidence-processor";

vi.mock("../../../packages/database/src/evidence.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../packages/database/src/evidence.ts")>()),
  claimEvidenceProcessingRun: vi.fn(),
  completeExtractionForEvidence: vi.fn(),
  loadEvidenceAnalysisContext: vi.fn(),
  markEvidenceNeedsOcr: vi.fn(),
  markEvidenceValidating: vi.fn(),
  persistValidatedEvidence: vi.fn(),
  recordProcessingFailure: vi.fn(),
  renewEvidenceProcessingLease: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("evidence worker PII minimization", () => {
  it("masks direct identifiers while preserving job-relevant evidence", () => {
    const minimized = minimizeDirectIdentifiers(
      "Name: Synthetic Person\nsynthetic@example.test +1 (555) 010-1234\nOperated production services.",
    );
    expect(minimized).not.toContain("Synthetic Person");
    expect(minimized).not.toContain("synthetic@example.test");
    expect(minimized).not.toContain("555");
    expect(minimized).toContain("Operated production services.");
  });

  it("masks a standalone Latin name header", () => {
    const minimized = minimizeDirectIdentifiers("Avery Example\nSoftware Engineer\nBuilt APIs.");
    expect(minimized).not.toContain("Avery Example");
    expect(minimized).toContain("Software Engineer");
    expect(minimized).toContain("Built APIs.");
  });

  it("masks a standalone Korean name header", () => {
    const minimized = minimizeDirectIdentifiers("김철수\n소프트웨어 엔지니어\nAPI를 운영했습니다.");
    expect(minimized).not.toContain("김철수");
    expect(minimized).toContain("소프트웨어 엔지니어");
  });

  it("masks postal addresses independently of the name", () => {
    const minimized = minimizeDirectIdentifiers(
      "Software Engineer\n123 Example Road\nSingapore 123456\nBuilt APIs.",
    );
    expect(minimized).not.toContain("123 Example Road");
    expect(minimized).not.toContain("Singapore 123456");
    expect(minimized).toContain("Software Engineer");
    expect(minimized).toContain("Built APIs.");
  });
});

describe("evidence processing lease heartbeat", () => {
  it("renews throughout long processing and clears the heartbeat timer after completion", async () => {
    vi.useFakeTimers();
    const processingRunId = "70000000-0000-0000-0000-000000000901";
    const leaseToken = "71000000-0000-0000-0000-000000000901";
    const criterionId = "72000000-0000-0000-0000-000000000901";
    const client = { request: vi.fn() } as unknown as SupabaseRestClient;

    vi.mocked(claimEvidenceProcessingRun).mockResolvedValue({
      processing_run_id: processingRunId,
      resume_file_id: "60000000-0000-0000-0000-000000000901",
      storage_path: "opaque/synthetic-heartbeat.pdf",
      attempt_count: 1,
      stage: "ANALYZING",
      pipeline_version: EVIDENCE_CONTRACT_VERSIONS.pipeline,
      lease_token: leaseToken,
    });
    vi.mocked(loadEvidenceAnalysisContext).mockResolvedValue({
      processing_run_id: processingRunId,
      application_id: "50000000-0000-0000-0000-000000000901",
      resume_file_id: "60000000-0000-0000-0000-000000000901",
      scorecard_version_id: "20000000-0000-0000-0000-000000000001",
      pipeline_version: EVIDENCE_CONTRACT_VERSIONS.pipeline,
      criteria: [
        {
          criterion_id: criterionId,
          type: "REQUIRED",
          definition: "Synthetic reliability evidence",
          accepted_evidence: ["Operated a synthetic service"],
          alternative_evidence: [],
          resume_assessable: true,
          suggested_interview_question: null,
        },
      ],
      pages: [
        {
          page_id: "73000000-0000-0000-0000-000000000901",
          page_number: 1,
          normalized_text: "Synthetic resume page without direct evidence.",
          normalized_text_sha256: "a".repeat(64),
        },
      ],
    });
    vi.mocked(renewEvidenceProcessingLease).mockResolvedValue(undefined);
    vi.mocked(markEvidenceValidating).mockResolvedValue(undefined);
    vi.mocked(persistValidatedEvidence).mockResolvedValue(undefined);
    vi.mocked(recordProcessingFailure).mockResolvedValue(undefined);

    let resolveAdapter!: (result: EvidenceAdapterResult) => void;
    const adapterResult = new Promise<EvidenceAdapterResult>((resolve) => {
      resolveAdapter = resolve;
    });
    const versions = { ...EVIDENCE_CONTRACT_VERSIONS, model: "synthetic-test-model" };
    const adapter = Object.assign(
      vi.fn(() => adapterResult),
      { versions },
    ) as EvidenceAdapter;
    const processRun = createEvidenceRunProcessor({
      client,
      adapter,
      downloadResume: vi.fn(),
    });

    const processing = processRun(processingRunId);
    await vi.advanceTimersByTimeAsync(0);
    expect(adapter).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(renewEvidenceProcessingLease).toHaveBeenCalledTimes(2);
    expect(renewEvidenceProcessingLease).toHaveBeenNthCalledWith(
      1,
      client,
      processingRunId,
      leaseToken,
    );

    resolveAdapter({
      evidence: {
        results: [
          {
            criterion_id: criterionId,
            status: "NOT_FOUND",
            evidence: [],
            interpretation: "No supporting evidence was found in the submitted material.",
            uncertainty: "The synthetic page may not describe every capability.",
            suggested_interview_question: "Describe a relevant synthetic example.",
          },
        ],
      },
      versions,
      usage: {
        providerRequestId: "synthetic-request-901",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        estimatedCostMicrousd: 0,
        durationMs: 120_000,
      },
    });
    await expect(processing).resolves.toBe("COMPLETED");
    expect(vi.getTimerCount()).toBe(0);

    const renewalsAfterCompletion = vi.mocked(renewEvidenceProcessingLease).mock.calls.length;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(renewEvidenceProcessingLease).toHaveBeenCalledTimes(renewalsAfterCompletion);
  });
});
