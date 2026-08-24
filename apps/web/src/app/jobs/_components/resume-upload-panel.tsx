"use client";

import { useRef, useState } from "react";

import { visibleCopy } from "../../_components/visible-copy";

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
    files.forEach((file) => data.append("files", file));
    try {
      const response = await fetch(`/api/jobs/${jobId}/resumes`, { method: "POST", body: data });
      const payload = (await response.json()) as { error?: string; results?: UploadResult[] };
      setResults(
        payload.results ?? [
          {
            filename: "업로드",
            status: "error",
            message: visibleCopy(payload.error ?? "업로드에 실패했습니다."),
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
        <p className="eyebrow">Resume intake</p>
        <h2 id="resume-upload-title">PDF 이력서 접수</h2>
      </div>
      <p className="section-copy">PDF 다중 선택 · 파일당 10 MiB · 업로드 후 처리 대기</p>
      {enabled ? (
        <form className="scorecard-workflow-form" onSubmit={submit}>
          <label>
            PDF 이력서
            <input
              ref={inputRef}
              name="files"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={uploading}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={uploading}>
            {uploading ? "파일별 업로드 중…" : "선택한 PDF 업로드"}
          </button>
        </form>
      ) : (
        <p className="form-alert form-alert-warning" role="status">
          승인된 지원서 검토 기준이 있는 ‘접수 준비’ Job에서만 업로드할 수 있습니다. 현재는 파일을
          저장하지 않았습니다.
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
                  : visibleCopy(result.message ?? "업로드 실패")}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
