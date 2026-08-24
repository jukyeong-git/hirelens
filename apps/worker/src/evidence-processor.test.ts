import { describe, expect, it } from "vitest";

import { minimizeDirectIdentifiers } from "./evidence-processor";

describe("evidence worker PII minimization", () => {
  it("masks direct identifiers while preserving job-relevant evidence", () => {
    const minimized = minimizeDirectIdentifiers(
      "Name: Synthetic Person\nsynthetic@example.test +1 (555) 010-1234\nOperated production services.",
    );
    expect(minimized).not.toContain("Synthetic Person");
    expect(minimized).not.toContain("synthetic@example.test");
    expect(minimized).not.toContain("555");
    expect(minimized).toContain("Operated production services.");
  });

  it("masks a standalone Latin name header", () => {
    const minimized = minimizeDirectIdentifiers("Avery Example\nSoftware Engineer\nBuilt APIs.");
    expect(minimized).not.toContain("Avery Example");
    expect(minimized).toContain("Software Engineer");
    expect(minimized).toContain("Built APIs.");
  });

  it("masks a standalone Korean name header", () => {
    const minimized = minimizeDirectIdentifiers("김철수\n소프트웨어 엔지니어\nAPI를 운영했습니다.");
    expect(minimized).not.toContain("김철수");
    expect(minimized).toContain("소프트웨어 엔지니어");
  });

  it("masks postal addresses independently of the name", () => {
    const minimized = minimizeDirectIdentifiers(
      "Software Engineer\n123 Example Road\nSingapore 123456\nBuilt APIs.",
    );
    expect(minimized).not.toContain("123 Example Road");
    expect(minimized).not.toContain("Singapore 123456");
    expect(minimized).toContain("Software Engineer");
    expect(minimized).toContain("Built APIs.");
  });
});
