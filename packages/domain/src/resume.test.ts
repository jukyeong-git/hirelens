import { describe, expect, it } from "vitest";

import {
  MAXIMUM_RESUME_BYTES,
  createResumeUploadReservationInputSchema,
  publicResumeSubmissionInputSchema,
} from "./resume";

const input = {
  jobId: "10000000-0000-0000-0000-000000000001",
  candidateId: "40000000-0000-0000-0000-000000000100",
  applicationId: "50000000-0000-0000-0000-000000000100",
  resumeFileId: "60000000-0000-0000-0000-000000000100",
  storagePath:
    "10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000100/60000000-0000-0000-0000-000000000100.pdf",
  originalFilename: "synthetic-resume.pdf",
  mimeType: "application/pdf",
  byteSize: 1_024,
  sha256: "a".repeat(64),
};

describe("resume intake contracts", () => {
  it("accepts a bounded PDF registration request without a candidate label", () => {
    expect(createResumeUploadReservationInputSchema.safeParse(input).success).toBe(true);
    expect("candidateLabel" in createResumeUploadReservationInputSchema.parse(input)).toBe(false);
  });

  it("does not ask for or accept content classification or notice fields", () => {
    expect(
      createResumeUploadReservationInputSchema.safeParse({
        ...input,
        dataClassification: "REAL_APPLICANT",
      }).success,
    ).toBe(false);
    expect(
      createResumeUploadReservationInputSchema.safeParse({
        ...input,
        noticeAcknowledged: true,
      }).success,
    ).toBe(false);
  });

  it("rejects oversized files, non-PDF MIME types, and unknown fields", () => {
    expect(
      createResumeUploadReservationInputSchema.safeParse({ ...input, byteSize: MAXIMUM_RESUME_BYTES + 1 })
        .success,
    ).toBe(false);
    expect(
      createResumeUploadReservationInputSchema.safeParse({ ...input, byteSize: MAXIMUM_RESUME_BYTES })
        .success,
    ).toBe(true);
    expect(
      createResumeUploadReservationInputSchema.safeParse({ ...input, mimeType: "text/plain" })
        .success,
    ).toBe(false);
    expect(
      createResumeUploadReservationInputSchema.safeParse({
        ...input,
        candidateLabel: "Unsafe input",
      }).success,
    ).toBe(false);
  });

  it("accepts a public PDF submission without content-policy fields or a client path", () => {
    const publicInput = {
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      resumeFileId: input.resumeFileId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256: input.sha256,
    };
    expect(
      publicResumeSubmissionInputSchema.safeParse({
        ...publicInput,
        publicSlug: "deadbeefdeadbeefdeadbeefdeadbeef",
      }).success,
    ).toBe(true);
    expect(
      publicResumeSubmissionInputSchema.safeParse({
        ...publicInput,
        publicSlug: "not-public",
      }).success,
    ).toBe(false);
    expect(
      publicResumeSubmissionInputSchema.safeParse({
        ...publicInput,
        publicSlug: "deadbeefdeadbeefdeadbeefdeadbeef",
        storagePath: "client-controlled.pdf",
      }).success,
    ).toBe(false);
  });
});
