import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const notificationEventTypeSchema = z.enum([
  "SCORECARD_APPROVAL_REQUEST",
  "REVIEW_ASSIGNMENT",
  "PROCESSING_COMPLETED",
  "PROCESSING_FAILED",
  "DECISION_FOLLOW_UP",
  // Raised when a post-interview review pushes a criterion past the calibration
  // threshold. `relevant_version` carries the criterion lineage id.
  "CRITERION_REVIEW_REQUIRED",
]);

export const markNotificationReadInputSchema = z.object({ notificationId: uuidSchema }).strict();

export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadInputSchema>;

export interface NotificationRecord {
  id: string;
  recipient_id: string;
  event_type: NotificationEventType;
  aggregate_type: string;
  aggregate_id: string;
  relevant_version: string;
  safe_metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
