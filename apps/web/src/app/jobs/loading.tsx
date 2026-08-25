export default function Loading() {
  return (
    <main className="app-shell" id="main-content" aria-busy="true" aria-live="polite">
      <div className="loading-card">
        <span className="loading-bar loading-bar-short" />
        <span className="loading-bar" />
        <span className="loading-bar loading-bar-wide" />
        <p>작업 공간 로딩 중…</p>
      </div>
    </main>
  );
}
