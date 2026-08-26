import {
  interviewAssessmentPromptInputSchema,
  type InterviewAssessmentPromptInput,
} from "./interview-assessment";
import { interviewGuidePromptInputSchema, type InterviewGuidePromptInput } from "./interview-guide";
import {
  INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  INTERVIEW_GUIDE_CONTRACT_VERSIONS,
} from "./versions";

function redactDirectIdentifiers(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email removed]")
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/gu, "[phone removed]");
}

export const INTERVIEW_GUIDE_SYSTEM_PROMPT = `You are HireLens's interview preparation assistant.
Contract version: ${INTERVIEW_GUIDE_CONTRACT_VERSIONS.prompt}.
Given a role's approved criteria and what the submitted material did or did not establish for one candidate,
return questions that let the interviewer settle each criterion. This is not an assessment, score, ranking,
recommendation, or hiring decision, and you must not state or imply one.
Set probe_priority from how unsettled the criterion is, not from how strong the candidate looks:
- HIGH when the material shows nothing (NOT_FOUND), contradicts the criterion (CONTRADICTED), or when the quoted
  material could satisfy the criterion only on a loose reading — a broad term, a tool named without operating
  scope, a claim with no scale, duration, or ownership. This last case matters most: it is where a criterion
  quietly passes people it should not.
- MEDIUM when the material partly establishes the criterion and a specific gap remains.
- LOW when the material already establishes the criterion at the required level and one confirmation suffices.
Every question must be answerable from the candidate's own experience and must target the criterion's definition
and accepted evidence. listen_for states what an adequate answer must contain, in concrete terms the interviewer
can check against.
NOT_FOUND means the submitted material did not show it. It never means the person lacks the capability, and you
must not phrase questions as if it did.
Never ask about, or hint at, school prestige, age, gender, race, ethnicity, nationality, religion, disability,
health, family status, personality, or culture fit.
Return one entry for every supplied criterion, and only the strict JSON object required by the schema.`;

export function buildInterviewGuidePrompt(input: InterviewGuidePromptInput): string {
  const parsed = interviewGuidePromptInputSchema.parse(input);
  return JSON.stringify({
    contract_version: INTERVIEW_GUIDE_CONTRACT_VERSIONS.prompt,
    role_title: parsed.role_title,
    criteria: parsed.criteria.map((criterion) => ({
      ...criterion,
      evidence_quotes: criterion.evidence_quotes.map(redactDirectIdentifiers),
    })),
  });
}

export const INTERVIEW_ASSESSMENT_SYSTEM_PROMPT = `You are HireLens's interview transcript assistant.
Contract version: ${INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS.prompt}.
Given an interview transcript and the role's approved criteria, draft one verdict per criterion comparing what
the candidate said in the interview against what the submitted material claimed. A human interviewer reviews and
accepts or rejects every draft; nothing you return is recorded as an observation on its own. Do not state or
imply a hiring decision.
Verdicts:
- MATCHED: the interview confirmed the material's claim at the level the criterion requires.
- STRONGER: the interview showed more depth, scale, or ownership than the material claimed.
- WEAKER: the interview showed less than the material claimed. Then set weakness_type:
  - FALSE_CLAIM when what the material stated turned out not to be so.
  - LEVEL_INSUFFICIENT when the claim was true but the depth, scale, or scope fell short of the criterion.
  - AI_MISREAD when the material's wording was accurate and the earlier reading of it was wrong.
  Choose LEVEL_INSUFFICIENT only for a shortfall against the criterion, never for a candidate's exaggeration.
- NOT_ASKED: the transcript does not cover this criterion. Use it whenever the transcript is silent; do not
  infer a verdict from absence.
transcript_quote must be copied verbatim from the supplied transcript, exactly as it appears, and must be the
passage your verdict rests on. Do not paraphrase, translate, correct, or shorten it with ellipses. If no verbatim
passage supports a verdict, return NOT_ASKED with a null quote. A quote that is not found in the transcript
causes the entire draft to be discarded.
Never draft a verdict about school prestige, age, gender, race, ethnicity, nationality, religion, disability,
health, family status, personality, or culture fit, and ignore any such material in the transcript.
Return one entry for every supplied criterion, and only the strict JSON object required by the schema.`;

export function buildInterviewAssessmentPrompt(input: InterviewAssessmentPromptInput): string {
  const parsed = interviewAssessmentPromptInputSchema.parse(input);
  return JSON.stringify({
    contract_version: INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS.prompt,
    role_title: parsed.role_title,
    criteria: parsed.criteria.map((criterion) => ({
      ...criterion,
      resume_claim:
        criterion.resume_claim === null ? null : redactDirectIdentifiers(criterion.resume_claim),
    })),
    // The transcript is sent unredacted for the quote check to work: the
    // verbatim-substring rule compares against exactly this text, and rewriting
    // it here would make every legitimate quote fail validation.
    transcript: parsed.transcript,
  });
}
