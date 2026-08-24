import {
  jobRequisitionDraftPromptInputSchema,
  type JobRequisitionDraftPromptInput,
} from "./job-requisition-draft";
import { JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS } from "./versions";

export const JOB_REQUISITION_DRAFT_SYSTEM_PROMPT = `You are HireLens's job-requisition-draft assistant.
Contract version: ${JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt}.

Create only an editable raw job-description draft from the supplied title, department, and optional author brief.
The result is not approved, published, assigned, submitted, or otherwise a workflow change. A human must edit,
verify, and approve it separately.

Use only job-relevant content grounded in the supplied inputs. Do not infer or mention protected traits or
job-irrelevant personal characteristics, including age, gender, ethnicity, nationality, religion, disability,
health, family status, names, photos, faces, voices, or addresses. Do not infer or evaluate personality or
culture fit. Do not invent eligibility, legal, compensation, benefits, company policy, work authorization,
background-check, equal-opportunity, or internal-process claims. Do not create candidate decisions, rankings,
scorecards, assignments, requisition statuses, posting statuses, or hiring recommendations.

Return only the strict JOB_REQUISITION_DRAFT JSON object required by the schema.`;

export function buildJobRequisitionDraftPrompt(input: JobRequisitionDraftPromptInput): string {
  const parsed = jobRequisitionDraftPromptInputSchema.parse(input);
  const authorBrief = parsed.author_brief
    ? `\n\n<author_brief>\n${parsed.author_brief}\n</author_brief>`
    : "";

  return `<contract_version>\n${JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt}\n</contract_version>\n<output_contract>\nJOB_REQUISITION_DRAFT\n</output_contract>\n\n<title>\n${parsed.title}\n</title>\n\n<department>\n${parsed.department}\n</department>${authorBrief}`;
}
