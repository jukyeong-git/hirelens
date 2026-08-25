import { describe, expect, it, vi } from "vitest";

import {
  consumeOneEvidenceQueueMessage,
  invocationSecretMatches,
  type EdgeEvidenceConsumerDependencies,
} from "./edge-consumer";

function dependencies(
  overrides: Partial<EdgeEvidenceConsumerDependencies> = {},
): EdgeEvidenceConsumerDependencies {
  return {
    dequeue: vi.fn().mockResolvedValue(null),
    quarantineMalformed: vi.fn().mockResolvedValue(undefined),
    processRun: vi.fn().mockResolvedValue("COMPLETED"),
    settle: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("Supabase Edge evidence queue consumer", () => {
  it("requires an exact, sufficiently long invocation secret", () => {
    const secret = "a-secure-edge-invocation-secret-123";
    expect(invocationSecretMatches(secret, secret)).toBe(true);
    expect(invocationSecretMatches(`${secret}x`, secret)).toBe(false);
    expect(invocationSecretMatches(null, secret)).toBe(false);
    expect(invocationSecretMatches("short", "short")).toBe(false);
  });

  it("processes at most one dequeued message and settles after processing", async () => {
    const order: string[] = [];
    const deps = dependencies({
      dequeue: vi.fn(async () => ({
        msg_id: 17,
        message: { processing_run_id: "70000000-0000-0000-0000-000000000801" },
      })),
      processRun: vi.fn(async (): Promise<"COMPLETED"> => {
        order.push("process");
        return "COMPLETED";
      }),
      settle: vi.fn(async () => {
        order.push("settle");
        return true;
      }),
    });

    await expect(consumeOneEvidenceQueueMessage(deps)).resolves.toEqual({
      status: "PROCESSED",
      outcome: "COMPLETED",
      settled: true,
    });
    expect(order).toEqual(["process", "settle"]);
    expect(deps.processRun).toHaveBeenCalledTimes(1);
  });

  it("quarantines malformed payloads without invoking processing", async () => {
    const deps = dependencies({
      dequeue: vi.fn().mockResolvedValue({ msg_id: 18, message: { injected: true } }),
    });

    await expect(consumeOneEvidenceQueueMessage(deps)).resolves.toEqual({
      status: "MALFORMED",
    });
    expect(deps.quarantineMalformed).toHaveBeenCalledWith(18);
    expect(deps.processRun).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it("does not settle when durable processing throws", async () => {
    const deps = dependencies({
      dequeue: vi.fn().mockResolvedValue({
        msg_id: 19,
        message: { processing_run_id: "70000000-0000-0000-0000-000000000801" },
      }),
      processRun: vi.fn().mockRejectedValue(new Error("durable write failed")),
    });

    await expect(consumeOneEvidenceQueueMessage(deps)).rejects.toThrow("durable write failed");
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it("leaves a duplicate active delivery visible when settlement declines it", async () => {
    const deps = dependencies({
      dequeue: vi.fn().mockResolvedValue({
        msg_id: 20,
        message: { processing_run_id: "70000000-0000-0000-0000-000000000801" },
      }),
      processRun: vi.fn(async (): Promise<"IGNORED"> => "IGNORED"),
      settle: vi.fn().mockResolvedValue(false),
    });

    await expect(consumeOneEvidenceQueueMessage(deps)).resolves.toEqual({
      status: "PROCESSED",
      outcome: "IGNORED",
      settled: false,
    });
  });
});
