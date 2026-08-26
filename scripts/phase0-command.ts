import { readFileSync } from "node:fs";

import {
  parseJobRequisitionDraft,
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
    `AI contract eval passed: ${scorecardDraft.criteria.length} scorecard criteria, ${scorecardDraft.ambiguous_phrases.length} ambiguous phrases, requisition ${Object.keys(requisitionDraft).length} structured fields, evidence ${evidenceGolden.version} (${acceptedEvidenceCases} accepted, ${evidenceGolden.cases.length - acceptedEvidenceCases} expected quarantine).`,
  );
} else {
  console.log(messages[command]);
}
