"use client";

import { useRef, useState } from "react";

import { visibleCopy } from "../../_components/visible-copy";

type ApplicationMode = "choice" | "resume" | "manual";
type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function PublicApplicationForm({ slug }: { slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ApplicationMode>("choice");
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  function close() {
    setOpen(false);
    setMode("choice");
    setState({ status: "idle" });
  }

  async function submitResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.resume.files?.[0];

    if (!file) {
      setState({ status: "error", message: "PDF 이력서 파일을 선택하세요." });
      return;
    }
    setState({ status: "submitting" });
    try {
      const response = await fetch("/api/public/postings/" + slug + "/applications", {
        method: "POST",
        body: new FormData(form),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setState({
          status: "error",
          message: visibleCopy(payload.error ?? "지원서 접수에 실패했습니다."),
        });
        return;
      }
      formRef.current?.reset();
      setState({
        status: "success",
        message: visibleCopy(payload.message ?? "지원서가 접수되었습니다."),
      });
    } catch {
      setState({ status: "error", message: "네트워크 오류입니다. 다시 시도하세요." });
    }
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
                <p className="eyebrow">Application</p>
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
                <button type="button" onClick={() => setMode("resume")}>
                  <strong>이력서로 자동 채움</strong>
                  <span>PDF 이력서를 제출하면 지원서 접수와 검토 처리를 시작합니다.</span>
                  <small>PDF · 파일당 10 MiB · 비공개 저장</small>
                </button>
                <button type="button" onClick={() => setMode("manual")}>
                  <strong>수기 지원</strong>
                  <span>지원 정보를 직접 입력하는 방식으로 진행합니다.</span>
                  <small>이름과 연락처를 직접 입력</small>
                </button>
              </div>
            ) : null}

            {mode === "resume" ? (
              <div className="public-application-modal-content">
                <button className="text-button" type="button" onClick={() => setMode("choice")}>
                  ← 지원 방식 다시 선택
                </button>
                <h3>이력서로 자동 채움</h3>
                <p className="section-copy">
                  PDF 이력서를 제출하면 지원서 접수 후 검토 처리를 시작합니다.
                </p>
                <form className="scorecard-workflow-form" onSubmit={submitResume} ref={formRef}>
                  <label>
                    접속 코드
                    <input
                      name="demoAccessCode"
                      type="password"
                      autoComplete="off"
                      required
                      disabled={state.status === "submitting"}
                    />
                  </label>
                  <label>
                    PDF 이력서
                    <input
                      name="resume"
                      type="file"
                      accept="application/pdf,.pdf"
                      required
                      disabled={state.status === "submitting"}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={state.status === "submitting"}
                  >
                    {state.status === "submitting" ? "접수 중…" : "지원서 제출"}
                  </button>
                </form>
                {state.status === "success" ? (
                  <p className="form-alert form-alert-success" role="status">
                    {state.message}
                  </p>
                ) : null}
                {state.status === "error" ? (
                  <p className="form-alert form-alert-error" role="alert">
                    {state.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === "manual" ? (
              <div className="public-application-modal-content">
                <button className="text-button" type="button" onClick={() => setMode("choice")}>
                  ← 지원 방식 다시 선택
                </button>
                <h3>수기 지원</h3>
                <p className="section-copy">지원 정보를 직접 입력하는 화면입니다.</p>
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
