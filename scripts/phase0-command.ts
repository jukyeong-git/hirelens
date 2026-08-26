import { readFileSync } from "node:fs";

import {
  parseJobRequisitionDraft,
  validateFrameworkRevision,
  validateEvidenceExtraction,
  validateScorecardDraft,
  EvidenceValidationError,
} from "../packages/ai/src/index";

const command = process.argv[2];

const messages: Record<string, string> = {
  "test:integration":
    "Phase 0: integration test harness is reserved; no integration contracts exist yet.",
  "test:e2e": "Phase 0: E2E harness is reserved; no product flows exist yet.",
};

if (!command || (!(command in messages) && command !== "eval:ai")) {
  console.error(`Unknown Phase 0 command: ${command ?? "(missing)"}`);
  process.exitCode = 1;
} else if (command === "eval:ai") {
  const scorecardFixture = JSON.parse(
    readFileSync(
      new URL("../packages/ai/fixtures/scorecard-draft.valid.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  const rawJobDescription =
    "Build reliable backend services. Experience operating production services and responding to incidents is required. Clear written communication is preferred.";
  const scorecardDraft = validateScorecardDraft(scorecardFixture, {
    raw_job_description: rawJobDescription,
  });
  const requisitionFixture = JSON.parse(
    readFileSync(
      new URL("../packages/ai/fixtures/job-requisition-draft.valid.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  const requisitionDraft = parseJobRequisitionDraft(requisitionFixture);
  const revisionFixture = JSON.parse(
    readFileSync(
      new URL("../packages/ai/fixtures/framework-revision.valid.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  const frameworkRevision = validateFrameworkRevision(revisionFixture, {
    finding_lineage_id: "11111111-1111-4111-8111-111111111111",
    finding: {
      supported_observations: 6,
      level_insufficient_count: 4,
      mismatch_ratio: 4 / 6,
      confirmed_observation_count: 6,
      false_claim_excluded_count: 1,
      ai_misread_excluded_count: 0,
    },
    current_criterion: {
      name: "Kubernetes experience",
      type: "REQUIRED",
      definition: "Use of Kubernetes is stated.",
      accepted_evidence: ["Kubernetes use is stated"],
      alternative_evidence: [],
      excluded_evidence: [],
      partial_evidence_guidance: null,
      evidence_fields: [],
      resume_assessable: true,
      suggested_interview_question: null,
    },
    mismatch_quotes: ["Built a Kubernetes deployment pipeline."],
    matched_quotes: ["Owned production clusters and incident response."],
  });
  const evidenceGolden = JSON.parse(
    readFileSync(new URL("../tests/ai-evals/evidence-golden.json", import.meta.url), "utf8"),
  ) as {
    version: string;
    cases: Array<{
      id: string;
      criterion_id: string;
      pages: Array<{ page_number: number; text: string }>;
      output: unknown;
      expected_status?: string;
      expected_error?: string;
      human_only?: boolean;
    }>;
  };
  let acceptedEvidenceCases = 0;
  for (const fixture of evidenceGolden.cases) {
    try {
      const evidence = validateEvidenceExtraction(fixture.output, {
        allowedCriterionIds: new Set([fixture.criterion_id]),
        humanOnlyCriterionIds: fixture.human_only ? new Set([fixture.criterion_id]) : new Set(),
        pageTextByNumber: new Map(fixture.pages.map((page) => [page.page_number, page.text])),
      });
      if (fixture.expected_error) throw new Error(`${fixture.id} unexpectedly passed`);
      if (evidence.results[0]?.status !== fixture.expected_status)
        throw new Error(`${fixture.id} status mismatch`);
      const serialized = JSON.stringify(evidence).toLowerCase();
      if (
        /culture fit|personality|hire probability|accept candidate|reject candidate/u.test(
          serialized,
        )
      )
        throw new Error(`${fixture.id} contains prohibited inference or decision language`);
      if (fixture.expected_status === "NOT_FOUND" && !serialized.includes("submitted material"))
        throw new Error(`${fixture.id} lacks careful absence language`);
      acceptedEvidenceCases += 1;
    } catch (error) {
      if (
        !fixture.expected_error ||
        !(error instanceof EvidenceValidationError) ||
        !error.issues.some((issue) => issue.code === fixture.expected_error)
      )
        throw error;
    }
  }
  console.log(
    `AI contract eval passed: ${scorecardDraft.criteria.length} scorecard criteria, ${scorecardDraft.ambiguous_phrases.length} ambiguous phrases, requisition ${Object.keys(requisitionDraft).length} structured fields, revision ${frameworkRevision.change_type}, evidence ${evidenceGolden.version} (${acceptedEvidenceCases} accepted, ${evidenceGolden.cases.length - acceptedEvidenceCases} expected quarantine).`,
  );
} else {
  console.log(messages[command]);
}
