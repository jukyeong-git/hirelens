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
        <h1 id="jobs-error-title">화면을 불러오지 못했습니다</h1>
        <p>연결과 권한을 확인한 뒤 다시 시도하세요.</p>
        <button className="button button-primary" type="button" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
