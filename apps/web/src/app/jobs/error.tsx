"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell" id="main-content">
      <section
        className="state-card state-card-error"
        role="alert"
        aria-labelledby="jobs-error-title"
      >
        <p className="eyebrow">Retryable error</p>
        <h1 id="jobs-error-title">작업 공간 로드 실패</h1>
        <p>연결 또는 권한 확인 후 재시도</p>
        <button className="button button-primary" type="button" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
