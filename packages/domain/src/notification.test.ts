import { describe, expect, it } from "vitest";

import { markNotificationReadInputSchema, notificationEventTypeSchema } from "./notification";

describe("notification contracts", () => {
  it("allows only declared safe event types", () => {
    expect(notificationEventTypeSchema.safeParse("SCORECARD_APPROVAL_REQUEST").success).toBe(true);
    expect(notificationEventTypeSchema.safeParse("FREE_TEXT").success).toBe(false);
  });

  it("requires an opaque notification id to mark a notification read", () => {
    expect(markNotificationReadInputSchema.safeParse({ notificationId: "invalid" }).success).toBe(
      false,
    );
  });
});
