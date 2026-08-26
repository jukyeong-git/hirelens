"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApplicationMode = "choice" | "manual";

export function PublicApplicationForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ApplicationMode>("choice");

  function close() {
    setOpen(false);
    setMode("choice");
  }

  return (
    <>
      <button
        className="button button-primary public-apply-trigger"
        type="button"
        onClick={() => setOpen(true)}
      >
        지원하기
      </button>
      {open ? (
        <div className="public-application-modal-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="public-application-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-application-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="public-application-modal-header">
              <div>
                <h2 id="public-application-modal-title">지원 방식 선택</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="지원 창 닫기"
                onClick={close}
              >
                ×
              </button>
            </header>

            {mode === "choice" ? (
              <div className="public-application-choice-list">
                <button
                  type="button"
                  onClick={() => router.push(`/careers/${slug}/apply?mode=resume`)}
                >
                  <strong>이력서로 지원</strong>
                  <span>PDF 이력서를 제출하면 지원서 접수와 검토 처리를 시작합니다.</span>
                  <small>PDF · 파일당 5 MiB · 비공개 저장</small>
                </button>
                <button type="button" onClick={() => setMode("manual")}>
                  <strong>수기 지원</strong>
                  <span>지원 정보를 직접 입력하는 방식으로 진행합니다.</span>
                  <small>이름과 연락처를 직접 입력</small>
                </button>
              </div>
            ) : null}

            {mode === "manual" ? (
              <div className="public-application-modal-content">
                <button className="text-button" type="button" onClick={() => setMode("choice")}>
                  ← 지원 방식 다시 선택
                </button>
                <h3>수기 지원</h3>
                <div className="manual-application-preview" aria-label="수기 지원 입력 항목">
                  <label>
                    이름
                    <input type="text" placeholder="이름 입력" />
                  </label>
                  <label>
                    이메일
                    <input type="email" placeholder="이메일 입력" />
                  </label>
                  <label>
                    전화번호
                    <input type="tel" placeholder="전화번호 입력" />
                  </label>
                  <label>
                    경력 요약
                    <textarea placeholder="경력과 지원 동기를 입력하세요." rows={4} />
                  </label>
                </div>
                <p className="form-alert form-alert-warning" role="status">
                  수기 지원 저장 연동은 다음 단계에서 연결됩니다.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
