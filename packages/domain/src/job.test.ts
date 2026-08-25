import { describe, expect, it } from "vitest";

import {
  appRoleSchema,
  assignRequisitionApproverInputSchema,
  createJobInputSchema,
  jobPostingActionInputSchema,
  jobPostingContentInputSchema,
  jobRequisitionDraftInputSchema,
  postingStatusSchema,
  resolveRequisitionApprovalInputSchema,
  submitRequisitionInputSchema,
} from "./job";

const validInput = {
  title: "Backend Engineer",
  department: "Engineering",
  hiringNeed: "Expand the backend team for the next release.",
  rawJobDescription: "Build reliable backend services for the synthetic demo.",
  recruiterId: "00000000-0000-0000-0000-000000000002",
  hiringManagerId: "00000000-0000-0000-0000-000000000003",
};

describe("createJobInputSchema", () => {
  it("trims required text fields", () => {
    const result = createJobInputSchema.parse({
      ...validInput,
      title: "  Backend Engineer  ",
      department: " Engineering ",
      hiringNeed: " Expand the backend team. ",
      rawJobDescription: "  Synthetic description  ",
    });

    expect(result.title).toBe("Backend Engineer");
    expect(result.department).toBe("Engineering");
    expect(result.hiringNeed).toBe("Expand the backend team.");
    expect(result.rawJobDescription).toBe("Synthetic description");
  });

  it("rejects an empty required field", () => {
    const result = createJobInputSchema.safeParse({ ...validInput, title: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects invalid participant identifiers", () => {
    const result = createJobInputSchema.safeParse({ ...validInput, hiringManagerId: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("bounds the job description size", () => {
    const result = createJobInputSchema.safeParse({
      ...validInput,
      rawJobDescription: "x".repeat(20_001),
    });

    expect(result.success).toBe(false);
  });
});

describe("jobRequisitionDraftInputSchema", () => {
  it("accepts only title and department for an AI draft request", () => {
    expect(
      jobRequisitionDraftInputSchema.parse({
        title: " Backend Engineer ",
        department: " Engineering ",
      }),
    ).toEqual({
      title: "Backend Engineer",
      department: "Engineering",
    });
  });

  it("rejects a hiring need from the AI draft boundary", () => {
    expect(
      jobRequisitionDraftInputSchema.safeParse({
        title: " ",
        department: "Engineering",
      }).success,
    ).toBe(false);
    expect(
      jobRequisitionDraftInputSchema.safeParse({
        title: "Backend Engineer",
        department: "Engineering",
        hiringNeed: "Expand the backend team.",
      }).success,
    ).toBe(false);
  });

  it("enforces title and department bounds at the AI draft boundary", () => {
    expect(
      jobRequisitionDraftInputSchema.safeParse({
        title: "x".repeat(121),
        department: "Engineering",
      }).success,
    ).toBe(false);
    expect(
      jobRequisitionDraftInputSchema.safeParse({
        title: "Backend Engineer",
        department: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      jobRequisitionDraftInputSchema.parse({
        title: "x".repeat(120),
        department: "x".repeat(120),
      }),
    ).toMatchObject({
      title: "x".repeat(120),
      department: "x".repeat(120),
    });
  });
});

describe("requisition approval contracts", () => {
  const jobId = "10000000-0000-0000-0000-000000000001";
  const approverId = "00000000-0000-0000-0000-000000000005";

  it("includes the designated requisition approver role", () => {
    expect(appRoleSchema.parse("REQUISITION_APPROVER")).toBe("REQUISITION_APPROVER");
    expect(appRoleSchema.safeParse("WORKER").success).toBe(false);
  });

  it("validates an approver assignment and a submission", () => {
    expect(assignRequisitionApproverInputSchema.parse({ jobId, approverId })).toEqual({
      jobId,
      approverId,
    });
    expect(submitRequisitionInputSchema.parse({ jobId })).toEqual({ jobId });
  });

  it("requires a bounded human reason for approval or return", () => {
    expect(
      resolveRequisitionApprovalInputSchema.safeParse({
        jobId,
        status: "APPROVED",
        reason: "   ",
      }).success,
    ).toBe(false);
    expect(
      resolveRequisitionApprovalInputSchema.safeParse({
        jobId,
        status: "RETURNED",
        reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
    expect(
      resolveRequisitionApprovalInputSchema.parse({
        jobId,
        status: "RETURNED",
        reason: " Please clarify the approved headcount. ",
      }),
    ).toEqual({
      jobId,
      status: "RETURNED",
      reason: "Please clarify the approved headcount.",
    });
    expect(
      resolveRequisitionApprovalInputSchema.safeParse({
        jobId,
        status: "PENDING_APPROVAL",
        reason: "This is not a resolution.",
      }).success,
    ).toBe(false);
  });
});

describe("job posting contracts", () => {
  const jobId = "10000000-0000-0000-0000-000000000001";

  it("uses the independent terminal posting state machine", () => {
    expect(postingStatusSchema.options).toEqual(["DRAFT", "PUBLISHED", "CLOSED"]);
    expect(postingStatusSchema.safeParse("REOPENED").success).toBe(false);
  });

  it("requires a UUID job identifier for every posting transition", () => {
    expect(jobPostingActionInputSchema.parse({ jobId })).toEqual({ jobId });
    expect(jobPostingActionInputSchema.safeParse({ jobId: "not-a-uuid" }).success).toBe(false);
  });

  it("requires complete bounded candidate-facing content", () => {
    const result = jobPostingContentInputSchema.parse({
      jobId,
      publicTitle: " Senior Backend Engineer ",
      publicSummary: " Build reliable platform services. ",
      publicResponsibilities: " Design APIs\nReview changes ",
      publicRequirements: " TypeScript\nPostgreSQL ",
      publicLocation: " Singapore · Hybrid ",
      publicEmploymentType: " Full-time ",
    });

    expect(result.publicTitle).toBe("Senior Backend Engineer");
    expect(result.publicEmploymentType).toBe("Full-time");
    expect(
      jobPostingContentInputSchema.safeParse({
        ...result,
        publicRequirements: "   ",
      }).success,
    ).toBe(false);
  });
});
