import { z } from "zod";

export const appRoleSchema = z.enum(["ADMIN", "RECRUITER", "HIRING_MANAGER"]);
export type AppRole = z.infer<typeof appRoleSchema>;

export const jobStatusSchema = z.enum([
  "DRAFT",
  "SCORECARD_PENDING_APPROVAL",
  "READY_FOR_INTAKE",
  "ARCHIVED",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

export const createJobInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(120),
  rawJobDescription: z.string().trim().min(1).max(20_000),
  recruiterId: postgresUuidSchema,
  hiringManagerId: postgresUuidSchema,
});
export type CreateJobInput = z.infer<typeof createJobInputSchema>;

export interface ProfileRecord {
  id: string;
  display_name: string;
  role: AppRole;
}

export interface JobRecord {
  id: string;
  title: string;
  department: string;
  raw_job_description: string;
  status: JobStatus;
  recruiter_id: string;
  hiring_manager_id: string;
  created_at: string;
  updated_at: string;
}

export type JobSummary = Omit<JobRecord, "raw_job_description">;

export interface JobListItem extends JobSummary {
  recruiter_name: string | null;
  hiring_manager_name: string | null;
}
