import type { EvidenceQueueMessage } from "../../../packages/database/src/evidence.ts";

export type EvidenceProcessingOutcome = "IGNORED" | "NEEDS_OCR" | "COMPLETED" | "FAILED";

export interface EdgeEvidenceConsumerDependencies {
  dequeue(): Promise<EvidenceQueueMessage | null>;
  quarantineMalformed(messageId: number): Promise<void>;
  processRun(processingRunId: string): Promise<EvidenceProcessingOutcome>;
  settle(messageId: number, processingRunId: string): Promise<boolean>;
}

export type EdgeEvidenceConsumerResult =
  | { status: "EMPTY" }
  | { status: "MALFORMED" }
  | { status: "PROCESSED"; outcome: EvidenceProcessingOutcome; settled: boolean };

function processingRunIdFromMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1) return null;
  const runId = record.processing_run_id;
  return typeof runId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(runId)
    ? runId
    : null;
}

export function invocationSecretMatches(provided: string | null, expected: string): boolean {
  if (!provided || expected.length < 32) return false;
  const maximumLength = Math.max(provided.length, expected.length);
  let difference = provided.length ^ expected.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function consumeOneEvidenceQueueMessage(
  dependencies: EdgeEvidenceConsumerDependencies,
): Promise<EdgeEvidenceConsumerResult> {
  const queueMessage = await dependencies.dequeue();
  if (!queueMessage) return { status: "EMPTY" };

  const processingRunId = processingRunIdFromMessage(queueMessage.message);
  if (!processingRunId) {
    await dependencies.quarantineMalformed(queueMessage.msg_id);
    return { status: "MALFORMED" };
  }

  const outcome = await dependencies.processRun(processingRunId);
  const settled = await dependencies.settle(queueMessage.msg_id, processingRunId);
  return { status: "PROCESSED", outcome, settled };
}
