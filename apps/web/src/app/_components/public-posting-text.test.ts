import { describe, expect, it } from "vitest";

import { parsePublicPostingText } from "./public-posting-text";

describe("public posting text", () => {
  it("turns literal and actual line breaks into separate paragraphs", () => {
    expect(parsePublicPostingText("첫 문단\\n둘째 문단\n셋째 문단")).toEqual([
      { type: "paragraph", text: "첫 문단" },
      { type: "paragraph", text: "둘째 문단" },
      { type: "paragraph", text: "셋째 문단" },
    ]);
  });

  it("groups inline middle-dot, bullet, and hyphen items into a semantic list", () => {
    expect(parsePublicPostingText("· API 설계 · 장애 대응 • 문서화 - 협업")).toEqual([
      {
        type: "list",
        items: ["API 설계", "장애 대응", "문서화", "협업"],
      },
    ]);
  });
});
