"use client";

import type { NotificationRecord } from "@hirelens/domain";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface GlobalHeaderProps {
  viewerName: string | null;
  notifications: NotificationRecord[];
  signOutAction: (formData: FormData) => void | Promise<void>;
  markNotificationReadAction: (formData: FormData) => void | Promise<void>;
}

export function GlobalHeader({
  viewerName,
  notifications,
  signOutAction,
  markNotificationReadAction,
}: GlobalHeaderProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isInternalWorkspace =
    pathname === "/jobs" || pathname.startsWith("/jobs/") || pathname.startsWith("/applications/");
  const pendingNotifications = notifications.filter((notification) => !notification.read_at);
  const unreadCount = pendingNotifications.length;
  const recentNotifications = pendingNotifications.slice(0, 5);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <nav className="global-navigation" aria-label="주요 메뉴">
      {viewerName && isInternalWorkspace ? (
        <div className="global-session">
          <div className="global-notifications" ref={popoverRef}>
            <button
              className="global-notification-button"
              type="button"
              aria-label={unreadCount > 0 ? `처리할 업무 ${unreadCount}건` : "처리할 업무"}
              aria-expanded={isOpen}
              aria-controls="global-notification-popover"
              onClick={() => setIsOpen((open) => !open)}
            >
              <svg
                aria-hidden="true"
                className="global-notification-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {unreadCount > 0 ? <b aria-hidden="true">{unreadCount}</b> : null}
            </button>
            {isOpen ? (
              <div
                className="global-notification-popover"
                id="global-notification-popover"
                role="dialog"
                aria-label="처리할 업무"
              >
                <div className="global-notification-heading">
                  <strong>처리할 업무</strong>
                  <span>{unreadCount}건 처리 필요</span>
                </div>
                {recentNotifications.length === 0 ? (
                  <p className="global-notification-empty">현재 처리할 업무가 없습니다.</p>
                ) : (
                  <div className="global-notification-list">
                    {recentNotifications.map((notification) => (
                      <div className="global-notification-item" key={notification.id}>
                        <div>
                          <strong>{notificationLabel(notification.event_type)}</strong>
                          <span>처리 필요</span>
                        </div>
                        <div className="global-notification-actions">
                          {notification.aggregate_type === "job" ? (
                            <Link href={`/jobs/${notification.aggregate_id}`}>채용 요청 열기</Link>
                          ) : notification.aggregate_type === "application" ? (
                            <Link href={`/applications/${notification.aggregate_id}`}>
                              지원서 열기
                            </Link>
                          ) : null}
                          <form action={markNotificationReadAction}>
                            <input type="hidden" name="notificationId" value={notification.id} />
                            <button type="submit">확인 완료</button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="viewer-card" aria-label="현재 사용자">
            <strong>{viewerName}</strong>
          </div>
          <form action={signOutAction}>
            <button className="button button-quiet" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      ) : (
        <>
          <Link href="/careers">채용 공고</Link>
          <Link href="/jobs">로그인</Link>
        </>
      )}
    </nav>
  );
}

function notificationLabel(eventType: NotificationRecord["event_type"]) {
  return (
    {
      SCORECARD_APPROVAL_REQUEST: "채용 요청 확인",
      REVIEW_ASSIGNMENT: "지원서 검토가 배정되었습니다",
      PROCESSING_COMPLETED: "지원서 처리가 완료되었습니다",
      PROCESSING_FAILED: "지원서 처리에 실패했습니다",
      DECISION_FOLLOW_UP: "채용 결정 후속 검토가 필요합니다",
    }[eventType] ?? "새로운 처리 요청"
  );
}
