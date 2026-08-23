"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell">
      <section
        className="state-card state-card-error"
        role="alert"
        aria-labelledby="jobs-error-title"
      >
        <p className="eyebrow">Retryable error</p>
        <h1 id="jobs-error-title">Job 작업 공간을 불러오지 못했습니다.</h1>
        <p>
          Supabase 연결 또는 권한을 확인한 뒤 다시 시도하세요. 이 화면에는 원문 데이터나 Secret
          key를 표시하지 않습니다.
        </p>
        <button className="button button-primary" type="button" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
