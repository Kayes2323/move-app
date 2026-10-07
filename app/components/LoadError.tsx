"use client";

/** Shown when a screen's data can't be loaded (offline, database error) instead of spinning forever. */
export function LoadError({ message = "Couldn't load your data.", onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
      <p className="h2">{message}</p>
      <p className="body mute">Check your connection and try again.</p>
      <button className="btn btn-solid" style={{ width: "auto", marginTop: 8 }} onClick={onRetry}>Try again</button>
    </main>
  );
}
