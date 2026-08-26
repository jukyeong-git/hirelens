import type { EvidenceItemRecord } from "@hirelens/domain";

const COUNTED_EVIDENCE_STATUSES = new Set<EvidenceItemRecord["status"]>([
  "SUPPORTED",
  "PARTIAL",
]);

export function countSupportedOrPartialCriteriaByRun(
  evidenceItems: EvidenceItemRecord[],
): Map<string, number> {
  const criterionIdsByRun = new Map<string, Set<string>>();

  for (const item of evidenceItems) {
    if (!COUNTED_EVIDENCE_STATUSES.has(item.status)) continue;

    const criterionIds = criterionIdsByRun.get(item.processing_run_id) ?? new Set<string>();
    criterionIds.add(item.criterion_id);
    criterionIdsByRun.set(item.processing_run_id, criterionIds);
  }

  return new Map(
    [...criterionIdsByRun].map(([processingRunId, criterionIds]) => [
      processingRunId,
      criterionIds.size,
    ]),
  );
}

export function sortByEvidenceCountDescending<T extends { evidenceCount: number }>(items: T[]): T[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort(
      (left, right) =>
        right.item.evidenceCount - left.item.evidenceCount ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ item }) => item);
}
