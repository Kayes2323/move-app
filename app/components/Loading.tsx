/** Full-screen wait state shared by every data screen. */
export function Loading({ label }: { label: string }) {
  return (
    <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 16 }} aria-busy="true">
      <div className="spinner" />
      <p className="body mute">{label}</p>
    </main>
  );
}
