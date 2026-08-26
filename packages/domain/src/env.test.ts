import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env";

describe("parseEnvironment", () => {
  it("provides safe local defaults without requiring credentials", () => {
    const environment = parseEnvironment({});

    expect(environment.APP_ENV).toBe("development");
    expect(environment.SUPABASE_ENV).toBe("hosted-alpha");
    expect(environment.OPENAI_MODEL).toBeUndefined();
    expect(environment.WORKER_CONCURRENCY).toBe(3);
    expect(environment.AI_MAX_TOTAL_TOKENS_PER_RUN).toBe(32_000);
  });

  it("rejects malformed configured URLs", () => {
    expect(() => parseEnvironment({ NEXT_PUBLIC_APP_URL: "not-a-url" })).toThrow(
      "NEXT_PUBLIC_APP_URL",
    );
  });

  it("enforces store:false and a coherent per-run token budget", () => {
    expect(() => parseEnvironment({ OPENAI_STORE: "true" })).toThrow("OPENAI_STORE");
    expect(() =>
      parseEnvironment({
        AI_MAX_INPUT_TOKENS: "100",
        AI_MAX_OUTPUT_TOKENS: "100",
        AI_MAX_TOTAL_TOKENS_PER_RUN: "199",
      }),
    ).toThrow("per-run total token budget");
  });
});
