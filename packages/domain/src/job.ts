import { z } from "zod";

export const appRoleSchema = z.enum([
  "ADMIN",
  "RECRUITER",
  "HIRING_MANAGER",
  "REQUISITION_APPROVER",
]);
export type AppRole = z.infer<typeof appRoleSchema>;

export const jobStatusSchema = z.enum([
  "DRAFT",
  "SCORECARD_PENDING_APPROVAL",
  "READY_FOR_INTAKE",
  "ARCHIVED",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const requisitionStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "RETURNED",
]);
export type RequisitionStatus = z.infer<typeof requisitionStatusSchema>;

export const postingStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);
export type PostingStatus = z.infer<typeof postingStatusSchema>;

const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

const jobDescriptionSectionsSchema = z.object({
  roleSummary: z.string().trim().min(1).max(4_000),
  responsibilities: z.string().trim().min(1).max(10_000),
  requirements: z.string().trim().min(1).max(10_000),
  preferredQualifications: z.string().trim().min(1).max(10_000),
});
export type JobDescriptionSections = z.infer<typeof jobDescriptionSectionsSchema>;

export function serializeJobDescriptionSections(sections: JobDescriptionSections): string {
  const parsed = jobDescriptionSectionsSchema.parse(sections);
  return `역할 개요\n${parsed.roleSummary}\n\n주요 책임\n${parsed.responsibilities}\n\n자격 요건\n${parsed.requirements}\n\n우대 사항\n${parsed.preferredQualifications}`;
}

const createJobFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(120),
  hiringNeed: z.string().trim().min(1).max(4_000),
  ...jobDescriptionSectionsSchema.shape,
  recruiterId: postgresUuidSchema,
  hiringManagerId: postgresUuidSchema,
});
export const createJobInputSchema = createJobFieldsSchema.transform((input) => ({
  ...input,
  rawJobDescription: serializeJobDescriptionSections(input),
}));
export type CreateJobInput = z.infer<typeof createJobInputSchema>;

export const updateJobBasicInfoInputSchema = createJobFieldsSchema
  .omit({ hiringManagerId: true })
  .extend({
    jobId: postgresUuidSchema,
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .transform((input) => ({
    ...input,
    rawJobDescription: serializeJobDescriptionSections(input),
  }));
export type UpdateJobBasicInfoInput = z.infer<typeof updateJobBasicInfoInputSchema>;

export const discardJobDraftInputSchema = z.object({
  jobId: postgresUuidSchema,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
export type DiscardJobDraftInput = z.infer<typeof discardJobDraftInputSchema>;

/**
 * Minimal human-authored inputs for a transient AI requisition draft. Hiring
 * need is persisted with the requisition but deliberately excluded from the
 * AI request.
 */
export const jobRequisitionDraftInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(120),
  })
  .strict();
export type JobRequisitionDraftInput = z.infer<typeof jobRequisitionDraftInputSchema>;

const requisitionReasonSchema = z.string().trim().min(1).max(1000);

export const assignRequisitionApproverInputSchema = z.object({
  jobId: postgresUuidSchema,
  approverId: postgresUuidSchema,
});
export type AssignRequisitionApproverInput = z.infer<typeof assignRequisitionApproverInputSchema>;

export const submitRequisitionInputSchema = z.object({
  jobId: postgresUuidSchema,
});
export type SubmitRequisitionInput = z.infer<typeof submitRequisitionInputSchema>;

export const resolveRequisitionApprovalInputSchema = z.object({
  jobId: postgresUuidSchema,
  status: z.enum(["APPROVED", "RETURNED"]),
  reason: requisitionReasonSchema,
});
export type ResolveRequisitionApprovalInput = z.infer<typeof resolveRequisitionApprovalInputSchema>;

export const jobPostingActionInputSchema = z.object({
  jobId: postgresUuidSchema,
});
export type JobPostingActionInput = z.infer<typeof jobPostingActionInputSchema>;

export const jobPostingContentInputSchema = z.object({
  jobId: postgresUuidSchema,
  publicTitle: z.string().trim().min(1).max(120),
  publicSummary: z.string().trim().min(1).max(4_000),
  publicResponsibilities: z.string().trim().min(1).max(10_000),
  publicRequirements: z.string().trim().min(1).max(10_000),
  publicLocation: z.string().trim().min(1).max(200),
  publicEmploymentType: z.string().trim().min(1).max(120),
});
export type JobPostingContentInput = z.infer<typeof jobPostingContentInputSchema>;

export interface ProfileRecord {
  id: string;
  display_name: string;
  role: AppRole;
}

export interface JobRecord {
  id: string;
  title: string;
  department: string;
  hiring_need: string;
  raw_job_description: string;
  status: JobStatus;
  requisition_status: RequisitionStatus;
  recruiter_id: string;
  hiring_manager_id: string;
  requisition_approver_id: string | null;
  is_synthetic_demo: boolean;
  submitted_at: string | null;
  approval_reason: string | null;
  approved_or_returned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JobSummary = Omit<JobRecord, "raw_job_description">;

export interface PublicPostingContentDraft {
  summary: string;
  responsibilities: string;
  requirements: string;
}

export function parseJobDescriptionSections(rawJobDescription: string): JobDescriptionSections {
  const sections = parseJobDescriptionSectionMap(rawJobDescription);
  const hasStructuredContent = Object.values(sections).some((value) => value.length > 0);
  return {
    roleSummary: hasStructuredContent ? sections.summary : rawJobDescription.trim(),
    responsibilities: sections.responsibilities,
    requirements: sections.requirements,
    preferredQualifications: sections.preferredQualifications,
  };
}

const postingSectionAliases = {
  summary: ["역할 개요", "직무 개요", "포지션 소개"],
  responsibilities: ["주요 책임", "주요 업무"],
  requirements: ["자격 요건", "필수 자격"],
} as const;
const preferredSectionAliases = ["우대 사항", "우대 자격"] as const;

function parseJobDescriptionSectionMap(rawJobDescription: string) {
  const sections = {
    summary: [] as string[],
    responsibilities: [] as string[],
    requirements: [] as string[],
    preferredQualifications: [] as string[],
  };
  let activeSection: keyof typeof sections | null = null;

  for (const rawLine of rawJobDescription.split(/\r?\n/u)) {
    const normalizedHeading = rawLine
      .trim()
      .replace(/^#{1,6}\s*/u, "")
      .replace(/[:：]\s*$/u, "")
      .trim();
    const matchedSection = (
      Object.entries(postingSectionAliases) as Array<
        [keyof PublicPostingContentDraft, readonly string[]]
      >
    ).find(([, aliases]) => aliases.includes(normalizedHeading))?.[0];

    if (matchedSection) activeSection = matchedSection;
    else if (
      preferredSectionAliases.includes(
        normalizedHeading as (typeof preferredSectionAliases)[number],
      )
    )
      activeSection = "preferredQualifications";
    else if (normalizedHeading === "근무 조건 및 기타 사항") activeSection = null;
    else if (activeSection) sections[activeSection].push(rawLine.trimEnd());
  }

  return {
    summary: sections.summary.join("\n").trim(),
    responsibilities: sections.responsibilities.join("\n").trim(),
    requirements: sections.requirements.join("\n").trim(),
    preferredQualifications: sections.preferredQualifications.join("\n").trim(),
  };
}

export function derivePublicPostingContentDraft(
  rawJobDescription: string,
): PublicPostingContentDraft {
  const sections = parseJobDescriptionSectionMap(rawJobDescription);
  return {
    summary: sections.summary,
    responsibilities: sections.responsibilities,
    requirements: sections.requirements,
  };
}

export interface JobListItem extends JobSummary {
  recruiter_name: string | null;
  hiring_manager_name: string | null;
}

export interface RequisitionStatusHistoryRecord {
  id: string;
  job_id: string;
  actor_id: string;
  actor_role: AppRole;
  prior_status: RequisitionStatus;
  new_status: RequisitionStatus;
  reason: string | null;
  created_at: string;
}

export interface JobPostingRecord {
  id: string;
  job_id: string;
  status: PostingStatus;
  public_slug: string;
  public_title: string | null;
  public_summary: string | null;
  public_responsibilities: string | null;
  public_requirements: string | null;
  public_location: string | null;
  public_employment_type: string | null;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicJobPostingRecord {
  public_slug: string;
  title: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  location: string;
  employment_type: string;
}

export interface PublicJobPostingSummary {
  public_slug: string;
  title: string;
  summary: string;
  location: string;
  employment_type: string;
}

export interface JobPostingStatusHistoryRecord {
  id: string;
  job_posting_id: string;
  job_id: string;
  actor_id: string;
  actor_role: AppRole;
  prior_status: PostingStatus | null;
  new_status: PostingStatus;
  created_at: string;
}
