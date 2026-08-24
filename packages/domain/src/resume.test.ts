import { describe, expect, it } from "vitest";

import { createResumeUploadReservationInputSchema } from "./resume";

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
  syntheticOrAnonymizedAttested: true,
};

describe("resume intake contracts", () => {
  it("accepts a bounded PDF registration request without a candidate label", () => {
    expect(createResumeUploadReservationInputSchema.safeParse(input).success).toBe(true);
    expect("candidateLabel" in createResumeUploadReservationInputSchema.parse(input)).toBe(false);
  });

  it("rejects oversized files, non-PDF MIME types, and unknown fields", () => {
    expect(
      createResumeUploadReservationInputSchema.safeParse({ ...input, byteSize: 10_485_761 })
        .success,
    ).toBe(false);
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
    expect(
      createResumeUploadReservationInputSchema.safeParse({
        ...input,
        syntheticOrAnonymizedAttested: false,
      }).success,
    ).toBe(false);
  });
});
