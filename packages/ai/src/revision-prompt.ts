import { frameworkRevisionPromptInputSchema, type FrameworkRevisionPromptInput } from "./revision";
import { FRAMEWORK_REVISION_CONTRACT_VERSIONS } from "./versions";

export const FRAMEWORK_REVISION_SYSTEM_PROMPT = `You are HireLens's review-framework revision assistant.
Contract version: ${FRAMEWORK_REVISION_CONTRACT_VERSIONS.prompt}.
Return one editable proposal for the supplied criterion and calibration finding. This is not an approval,
candidate assessment, ranking, recommendation, or hiring decision. A human must review, edit, save, and approve
any new framework version.
Use only the supplied finding, current criterion, and de-identified exact evidence excerpts. Tighten what counts
as direct evidence, add explicit exclusions, demote a criterion, or move it to structured interview review only.
Do not invent findings. Do not refer to individual candidates. Never infer or propose criteria involving school
prestige, age, gender, race, ethnicity, nationality, religion, disability, health, family status, personality,
or culture fit. Do not use missing resume evidence as proof that a person lacks a capability.
Preserve the current criterion unless the supplied observations support a specific change. The before snapshot
must exactly copy the supplied accepted_evidence and excluded_evidence arrays. Return only the strict JSON object
required by the schema.`;

function redactDirectIdentifiers(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email removed]")
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/gu, "[phone removed]");
}

export function buildFrameworkRevisionPrompt(input: FrameworkRevisionPromptInput): string {
  const parsed = frameworkRevisionPromptInputSchema.parse(input);
  return JSON.stringify({
    contract_version: FRAMEWORK_REVISION_CONTRACT_VERSIONS.prompt,
    finding_lineage_id: parsed.finding_lineage_id,
    finding: parsed.finding,
    current_criterion: parsed.current_criterion,
    mismatch_quotes: parsed.mismatch_quotes.map(redactDirectIdentifiers),
    matched_quotes: parsed.matched_quotes.map(redactDirectIdentifiers),
  });
}
