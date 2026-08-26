import type { NotificationRecord } from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const notificationSelect =
  "id,recipient_id,event_type,aggregate_type,aggregate_id,relevant_version,safe_metadata,read_at,created_at";

export async function listNotifications(client: SupabaseRestClient): Promise<NotificationRecord[]> {
  const params = new URLSearchParams({
    select: notificationSelect,
    read_at: "is.null",
    order: "created_at.desc",
  });
  return client.request<NotificationRecord[]>(`/rest/v1/notifications?${params.toString()}`);
}

export async function markNotificationRead(
  client: SupabaseRestClient,
  notificationId: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/mark_notification_read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_notification_id: notificationId }),
  });
}
