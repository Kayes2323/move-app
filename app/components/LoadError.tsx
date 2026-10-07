"use client";

/** Shown when a screen's data can't be loaded (offline, database error) instead of spinning forever. */
export function LoadError({ message = "Couldn't load your data.", onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "32px", textAlign: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#0F0F0F", fontSize: "16px", fontWeight: 700 }}>{message}</p>
      <p style={{ color: "#6B7280", fontSize: "13px" }}>Check your connection and try again.</p>
      <button onClick={onRetry} style={{ minHeight: "48px", padding: "0 28px", borderRadius: "24px", border: 0, background: "#0F0F0F", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>Try again</button>
    </main>
  );
}
