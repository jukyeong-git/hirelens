import { readFileSync } from "node:fs";

import { validateScorecardDraft } from "../packages/ai/src/index";

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
  const fixture = JSON.parse(
    readFileSync(
      new URL("../packages/ai/fixtures/scorecard-draft.valid.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  const rawJobDescription =
    "Build reliable backend services. Experience operating production services and responding to incidents is required. Clear written communication is preferred.";
  const draft = validateScorecardDraft(fixture, { raw_job_description: rawJobDescription });
  console.log(
    `AI contract eval passed: ${draft.criteria.length} criteria, ${draft.ambiguous_phrases.length} ambiguous phrases.`,
  );
} else {
  console.log(messages[command]);
}
