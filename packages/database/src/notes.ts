import type { ReviewNoteRecord, ReviewNoteVersionRecord } from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const noteSelect = "id,application_id,author_id,deleted_at,deleted_by,created_at,updated_at";
const versionSelect = "id,note_id,version_number,body,created_by,created_at";

export async function listReviewNotes(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<ReviewNoteRecord[]> {
  const params = new URLSearchParams({
    select: noteSelect,
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<ReviewNoteRecord[]>(`/rest/v1/review_notes?${params.toString()}`);
}

export async function listReviewNoteVersions(
  client: SupabaseRestClient,
  noteId: string,
): Promise<ReviewNoteVersionRecord[]> {
  const params = new URLSearchParams({
    select: versionSelect,
    note_id: `eq.${noteId}`,
    order: "version_number.desc",
  });
  return client.request<ReviewNoteVersionRecord[]>(
    `/rest/v1/review_note_versions?${params.toString()}`,
  );
}

export async function createReviewNote(
  client: SupabaseRestClient,
  applicationId: string,
  body: string,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_review_note", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ target_application_id: applicationId, note_body: body }),
  });
}

export async function updateReviewNote(
  client: SupabaseRestClient,
  noteId: string,
  body: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/update_review_note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_note_id: noteId, note_body: body }),
  });
}

export async function setReviewNoteDeleted(
  client: SupabaseRestClient,
  noteId: string,
  shouldDelete: boolean,
  reason: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/set_review_note_deleted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_note_id: noteId,
      should_delete: shouldDelete,
      action_reason: reason,
    }),
  });
}
