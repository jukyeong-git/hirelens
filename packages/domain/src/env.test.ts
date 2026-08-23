import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env";

describe("parseEnvironment", () => {
  it("provides safe local defaults without requiring credentials", () => {
    const environment = parseEnvironment({});

    expect(environment.APP_ENV).toBe("development");
    expect(environment.SUPABASE_ENV).toBe("hosted-alpha");
    expect(environment.OPENAI_MODEL).toBeUndefined();
    expect(environment.WORKER_CONCURRENCY).toBe(3);
  });

  it("rejects malformed configured URLs", () => {
    expect(() => parseEnvironment({ NEXT_PUBLIC_APP_URL: "not-a-url" })).toThrow(
      "NEXT_PUBLIC_APP_URL",
    );
  });
});
