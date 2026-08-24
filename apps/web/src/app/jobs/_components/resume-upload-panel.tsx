"use client";

import { useRef, useState } from "react";

interface UploadResult {
  filename: string;
  status: "success" | "error";
  message?: string;
  applicationId?: string;
}

export function ResumeUploadPanel({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setResults([
        { filename: "선택한 파일 없음", status: "error", message: "하나 이상의 PDF를 선택하세요." },
      ]);
      return;
    }
    setUploading(true);
    setResults([]);
    const data = new FormData();
    if (!event.currentTarget.syntheticOrAnonymizedAttested.checked) {
      setResults([
        {
          filename: "업로드",
          status: "error",
          message: "합성 또는 익명화된 데모 자료임을 확인하세요.",
        },
      ]);
      return;
    }
    data.append("syntheticOrAnonymizedAttested", "true");
    files.forEach((file) => data.append("files", file));
    try {
      const response = await fetch(`/api/jobs/${jobId}/resumes`, { method: "POST", body: data });
      const payload = (await response.json()) as { error?: string; results?: UploadResult[] };
      setResults(
        payload.results ?? [
          {
            filename: "업로드",
            status: "error",
            message: payload.error ?? "업로드에 실패했습니다.",
          },
        ],
      );
      if (response.ok && payload.results?.some((result) => result.status === "success"))
        window.location.reload();
    } catch {
      setResults([
        { filename: "업로드", status: "error", message: "네트워크 오류입니다. 다시 시도하세요." },
      ]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="resume-upload-title">
      <div className="section-heading">
        <p className="eyebrow">Resume intake · Phase 3</p>
        <h2 id="resume-upload-title">합성 PDF 이력서 접수</h2>
      </div>
      <p className="section-copy">
        여러 PDF를 선택할 수 있습니다. 업로드가 완료되면 상태는{" "}
        <strong>UPLOADED — 처리가 아직 시작되지 않음</strong>으로 표시됩니다. 데모 기술 한도는
        파일당 10 MiB이며 고객 정책은 TBD입니다.
      </p>
      {enabled ? (
        <form className="scorecard-workflow-form" onSubmit={submit}>
          <label>
            합성 PDF 이력서
            <input
              ref={inputRef}
              name="files"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={uploading}
            />
          </label>
          <label>
            <input
              name="syntheticOrAnonymizedAttested"
              type="checkbox"
              required
              disabled={uploading}
            />
            업로드 파일은 합성 또는 명시적으로 익명화된 데모 자료이며 실제 지원자 자료가 아닙니다.
          </label>
          <button className="button button-primary" type="submit" disabled={uploading}>
            {uploading ? "파일별 업로드 중…" : "선택한 PDF 업로드"}
          </button>
        </form>
      ) : (
        <p className="form-alert form-alert-warning" role="status">
          승인된 Scorecard가 있는 ‘접수 준비’ Job에서만 업로드할 수 있습니다. 현재는 파일을 저장하지
          않았습니다.
        </p>
      )}
      {results.length ? (
        <div className="history-list" aria-live="polite">
          {results.map((result, index) => (
            <div
              className={`history-item ${result.status === "error" ? "upload-result-error" : "upload-result-success"}`}
              key={`${result.filename}-${index}`}
            >
              <strong>{result.filename}</strong>
              <span>
                {result.status === "success"
                  ? "UPLOADED — 처리가 아직 시작되지 않음"
                  : result.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
