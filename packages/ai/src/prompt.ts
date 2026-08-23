import { scorecardDraftPromptInputSchema, type ScorecardDraftPromptInput } from "./scorecard-draft";
import { SCORECARD_DRAFT_CONTRACT_VERSIONS } from "./versions";

export const SCORECARD_DRAFT_SYSTEM_PROMPT = `You are HireLens's scorecard-draft assistant.
Contract version: ${SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt}.

Create an editable scorecard draft from the supplied job description. The draft is not an approval,
recommendation, ranking, candidate assessment, or hiring decision. A human must review and approve it.

Use only job-relevant requirements. Turn vague or ambiguous requirements into HUMAN_ONLY or INTERVIEW_ONLY
criteria and explain the ambiguity. Do not infer or output protected traits, personality, culture fit, age,
gender, ethnicity, religion, disability, health, family status, names, faces, photos, voices, or addresses.
Do not output fit scores, acceptance or rejection, advancement, hiring decisions, or future-performance predictions.

Every source_phrase must be copied from the job description after whitespace normalization, or be null when the
criterion is synthesized. Mark resume_assessable false when the resume cannot responsibly establish the criterion.
Return only the strict SCORECARD_DRAFT JSON object required by the schema.`;

export function buildScorecardDraftPrompt(input: ScorecardDraftPromptInput): string {
  const parsed = scorecardDraftPromptInputSchema.parse(input);
  const clarification = parsed.human_clarification
    ? `\n\n<human_clarification>\n${parsed.human_clarification}\n</human_clarification>`
    : "";

  return `<contract_version>\n${SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt}\n</contract_version>\n<output_contract>\nSCORECARD_DRAFT\n</output_contract>\n\n<job_title>\n${parsed.job_title}\n</job_title>\n\n<job_description>\n${parsed.raw_job_description}\n</job_description>${clarification}`;
}
