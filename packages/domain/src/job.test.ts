import { describe, expect, it } from "vitest";

import {
  appRoleSchema,
  assignRequisitionApproverInputSchema,
  createJobInputSchema,
  derivePublicPostingContentDraft,
  discardJobDraftInputSchema,
  jobPostingActionInputSchema,
  jobPostingContentInputSchema,
  jobRequisitionDraftInputSchema,
  parseJobDescriptionSections,
  postingStatusSchema,
  resolveRequisitionApprovalInputSchema,
  submitRequisitionInputSchema,
  updateJobBasicInfoInputSchema,
} from "./job";

describe("derivePublicPostingContentDraft", () => {
  it("derives public posting fields from the Hiring Manager job description", () => {
    expect(
      derivePublicPostingContentDraft(`역할 개요
백엔드 서비스를 설계하고 운영합니다.

주요 책임
- API를 설계합니다.
- 장애 대응 체계를 개선합니다.

자격 요건
- 백엔드 개발 경험

우대 사항
- 클라우드 운영 경험`),
    ).toEqual({
      summary: "백엔드 서비스를 설계하고 운영합니다.",
      responsibilities: "- API를 설계합니다.\n- 장애 대응 체계를 개선합니다.",
      requirements: "- 백엔드 개발 경험",
      preferredQualifications: "- 클라우드 운영 경험",
    });
  });
});

const validInput = {
  title: "Backend Engineer",
  department: "Engineering",
  hiringNeed: "Expand the backend team for the next release.",
  roleSummary: "Build reliable backend services.",
  responsibilities: "Design and operate APIs.",
  requirements: "Backend development experience.",
  preferredQualifications: "Cloud operations experience.",
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
      roleSummary: "  Synthetic summary  ",
    });

    expect(result.title).toBe("Backend Engineer");
    expect(result.department).toBe("Engineering");
    expect(result.hiringNeed).toBe("Expand the backend team.");
    expect(result.rawJobDescription).toContain("역할 개요\nSynthetic summary");
    expect(result.rawJobDescription).toContain("우대 사항\nCloud operations experience.");
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
      responsibilities: "x".repeat(10_001),
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

describe("updateJobBasicInfoInputSchema", () => {
  it("accepts editable basic information with a concurrency token", () => {
    const result = updateJobBasicInfoInputSchema.parse({
      jobId: "10000000-0000-0000-0000-000000000001",
      expectedUpdatedAt: "2026-08-26T00:00:00.000Z",
      title: " Backend Engineer ",
      department: " Engineering ",
      hiringNeed: " Replacement hire ",
      roleSummary: " Build backend services. ",
      responsibilities: " Design APIs. ",
      requirements: " Backend experience. ",
      preferredQualifications: " Cloud experience. ",
      recruiterId: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.title).toBe("Backend Engineer");
    expect(result.hiringNeed).toBe("Replacement hire");
  });
});

describe("job description sections", () => {
  it("parses the canonical structured representation", () => {
    expect(
      parseJobDescriptionSections(createJobInputSchema.parse(validInput).rawJobDescription),
    ).toEqual({
      roleSummary: validInput.roleSummary,
      responsibilities: validInput.responsibilities,
      requirements: validInput.requirements,
      preferredQualifications: validInput.preferredQualifications,
    });
  });

  it("preserves an unstructured legacy description as the role summary", () => {
    expect(parseJobDescriptionSections("Legacy description")).toEqual({
      roleSummary: "Legacy description",
      responsibilities: "",
      requirements: "",
      preferredQualifications: "",
    });
  });

  it("parses supported legacy headings with markdown, colons, and CRLF", () => {
    expect(
      parseJobDescriptionSections(
        "## 직무 개요:\r\n요약\r\n## 주요 업무:\r\n업무\r\n## 필수 자격:\r\n자격\r\n## 우대 자격:\r\n우대",
      ),
    ).toEqual({
      roleSummary: "요약",
      responsibilities: "업무",
      requirements: "자격",
      preferredQualifications: "우대",
    });
  });
});

describe("discardJobDraftInputSchema", () => {
  it("requires a job id and optimistic concurrency timestamp", () => {
    expect(
      discardJobDraftInputSchema.parse({
        jobId: "10000000-0000-0000-0000-000000000001",
        expectedUpdatedAt: "2026-08-26T00:00:00.000Z",
      }),
    ).toEqual({
      jobId: "10000000-0000-0000-0000-000000000001",
      expectedUpdatedAt: "2026-08-26T00:00:00.000Z",
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
      publicPreferredQualifications: " Cloud operations experience ",
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
