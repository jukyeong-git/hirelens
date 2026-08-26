"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { visibleCopy } from "../../../_components/visible-copy";

type SubmissionState =
  | { status: "idle"; fileName?: string; fileSize?: number }
  | { status: "submitting"; fileName: string; fileSize?: number }
  | { status: "error"; message: string; fileName?: string; fileSize?: number };

export function ResumeApplicationForm({ slug }: { slug: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SubmissionState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  function applyFile(file: File | undefined) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setState({ status: "error", message: "PDF 파일만 업로드할 수 있습니다." });
      return;
    }
    if (file.size > 5_242_880) {
      setState({ status: "error", message: "파일 크기는 5 MiB 이하여야 합니다." });
      return;
    }
    setState({ status: "idle", fileName: file.name, fileSize: file.size });
  }

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    applyFile(event.currentTarget.files?.[0]);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!isSubmitting) setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (isSubmitting) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (inputRef.current) inputRef.current.files = transfer.files;
    applyFile(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.resume.files?.[0];

    if (!file) {
      setState({ status: "error", message: "PDF 이력서 파일을 선택하세요." });
      return;
    }

    setState({ status: "submitting", fileName: file.name, fileSize: file.size });
    try {
      const response = await fetch(`/api/public/postings/${slug}/applications`, {
        method: "POST",
        body: new FormData(form),
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setState({
          status: "error",
          message: visibleCopy(payload.error ?? "지원서 접수에 실패했습니다."),
          fileName: file.name,
          fileSize: file.size,
        });
        return;
      }

      formRef.current?.reset();
      router.replace(`/careers/${slug}/apply/complete`);
    } catch {
      setState({
        status: "error",
        message: "네트워크 오류입니다. 다시 시도하세요.",
        fileName: file.name,
        fileSize: file.size,
      });
    }
  }

  const selectedFileName = state.fileName;
  const selectedFileSize = state.fileSize;
  const isSubmitting = state.status === "submitting";

  function removeFile() {
    if (inputRef.current) inputRef.current.value = "";
    setState({ status: "idle" });
  }

  function formatFileSize(size: number | undefined) {
    if (size === undefined) return "PDF";
    return `${(size / 1024 / 1024).toFixed(1)} MiB · PDF`;
  }

  return (
    <>
      <form className="public-application-upload-card" onSubmit={submit} ref={formRef}>
        <div className="field public-candidate-name-field">
          <label htmlFor="candidate-name">후보자 이름</label>
          <input
            id="candidate-name"
            name="candidateName"
            type="text"
            autoComplete="name"
            minLength={1}
            maxLength={100}
            required
            disabled={isSubmitting}
          />
          <span className="field-help">
            지원서 검증이 완료되면 권한이 있는 채용 담당자에게 표시됩니다.
          </span>
        </div>

        <div
          className={`public-resume-dropzone${isDragging ? " is-dragging" : ""}${
            selectedFileName ? " is-selected" : ""
          }`}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {selectedFileName ? (
            <div className="public-resume-file">
              <span className="public-resume-file-icon" aria-hidden="true">
                PDF
              </span>
              <div className="public-resume-file-details">
                <strong>{selectedFileName}</strong>
                <span>{formatFileSize(selectedFileSize)}</span>
              </div>
              <div className="public-resume-file-actions">
                <label className="public-resume-change" htmlFor="resume-upload">
                  파일 변경
                </label>
                <button
                  className="public-resume-remove"
                  type="button"
                  aria-label="이력서 제거"
                  onClick={removeFile}
                >
                  <span aria-hidden="true">🗑</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className="public-resume-dropzone-icon" aria-hidden="true">
                ↑
              </span>
              <strong>PDF 이력서를 여기로 끌어놓으세요</strong>
              <span>파일을 끌어오거나 파일 선택을 눌러 업로드할 수 있습니다.</span>
              <label className="button button-quiet" htmlFor="resume-upload">
                파일 선택
              </label>
            </>
          )}
          <input
            id="resume-upload"
            name="resume"
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={selectFile}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="public-application-upload-actions">
          <Link className="button button-quiet" href={`/careers/${slug}`}>
            취소
          </Link>
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "지원서 접수 중…" : "지원서 제출"}
          </button>
        </div>

        {state.status === "error" ? (
          <p className="form-alert form-alert-error" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>
    </>
  );
}
