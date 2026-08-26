import { describe, expect, it } from "vitest";

import { normalizePdfText, sha256Text } from "./index";

describe("PDF text helpers", () => {
  it("normalizes whitespace deterministically before hashing", () => {
    expect(normalizePdfText("  Build\n\n systems\u0000 ")).toBe("Build systems");
    expect(sha256Text("Build systems")).toBe(
      "a557d92b51c48ebeb92972aa5fe10f38ddac828f3c11e11613a1aa5ccf9b36b3",
    );
  });
});
