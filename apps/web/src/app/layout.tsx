import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "HireLens",
  description: "Evidence-first hiring judgment support",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
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
            <nav className="global-navigation" aria-label="주요 메뉴">
              <Link href="/careers">채용 공고</Link>
              <Link href="/jobs">로그인</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
