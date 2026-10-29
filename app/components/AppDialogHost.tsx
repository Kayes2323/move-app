"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { registerDialogHost, type DialogRequest } from "../lib/appDialog";

/** Draws Move's confirm / alert dialogs (see lib/appDialog). One at a time; later ones wait their turn. */
export function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0];
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerDialogHost((r) => setQueue((q) => [...q, r]));
    return () => registerDialogHost(null);
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      if (!current) return;
      current.resolve(ok);
      setQueue((q) => q.slice(1));
    },
    [current],
  );

  useEffect(() => {
    if (!current) return;
    // for something that can't be undone the safe button has focus; otherwise the main one
    (current.kind === "confirm" && current.tone === "danger" ? cancelRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;
  const danger = current.tone === "danger";
  return (
    <div role="presentation" onClick={() => close(false)} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby={current.message ? "app-dialog-msg" : undefined} onClick={(e) => e.stopPropagation()} className="mv-rise" style={{ width: "100%", maxWidth: 480, background: "var(--bg)", borderRadius: "28px 28px 0 0", padding: "14px 22px calc(env(safe-area-inset-bottom, 0px) + 22px)", boxShadow: "0 -10px 40px rgba(0,0,0,.35)" }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "var(--surf2)", margin: "0 auto 18px" }} />
        <h2 id="app-dialog-title" className="h2">{current.title}</h2>
        {current.message && <p id="app-dialog-msg" className="body mute" style={{ marginTop: 8, lineHeight: 1.45 }}>{current.message}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          <button ref={okRef} className="btn btn-solid" style={danger ? { background: "var(--danger)", color: "#fff" } : undefined} onClick={() => close(true)}>{current.confirmLabel ?? "OK"}</button>
          {current.kind === "confirm" && <button ref={cancelRef} className="btn btn-soft" onClick={() => close(false)}>{current.cancelLabel ?? "Cancel"}</button>}
        </div>
      </div>
    </div>
  );
}
