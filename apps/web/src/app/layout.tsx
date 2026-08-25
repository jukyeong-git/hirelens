import type { Metadata } from "next";
import Link from "next/link";
import { listNotifications } from "@hirelens/database";

import { markNotificationReadAction, signOutAction } from "./jobs/actions";
import { GlobalHeader } from "./_components/global-header";
import { KoreanFormValidation } from "./_components/korean-form-validation";
import { visibleCopy } from "./_components/visible-copy";
import { getAuthenticatedViewer } from "../lib/supabase-server";

import "./globals.css";

export const metadata: Metadata = {
  title: "HireLens",
  description: "Evidence-first hiring judgment support",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authenticated = await getAuthenticatedViewer();
  const notifications = authenticated ? await listNotifications(authenticated.client) : [];

  return (
    <html lang="ko">
      <body>
        <KoreanFormValidation />
        <a className="skip-link" href="#main-content">
          본문으로 이동
        </a>
        <header className="global-topbar">
          <div className="global-topbar-inner">
            <Link className="product-mark" href="/careers" aria-label="HireLens 채용 공고">
              <span className="product-mark-symbol" aria-hidden="true">
                H
              </span>
              HireLens
            </Link>
            <GlobalHeader
              viewerName={authenticated ? visibleCopy(authenticated.viewer.displayName) : null}
              notifications={notifications}
              signOutAction={signOutAction}
              markNotificationReadAction={markNotificationReadAction}
            />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
