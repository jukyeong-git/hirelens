export default function Loading() {
  return (
    <main className="app-shell" aria-busy="true" aria-live="polite">
      <div className="loading-card">
        <span className="loading-bar loading-bar-short" />
        <span className="loading-bar" />
        <span className="loading-bar loading-bar-wide" />
        <p>Job 작업 공간을 불러오는 중입니다…</p>
      </div>
    </main>
  );
}
