import { describe, expect, it } from "vitest";

import { createJobInputSchema } from "./job";

const validInput = {
  title: "Backend Engineer",
  department: "Engineering",
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
      rawJobDescription: "  Synthetic description  ",
    });

    expect(result.title).toBe("Backend Engineer");
    expect(result.department).toBe("Engineering");
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
