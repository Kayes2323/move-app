"use client";
import { useEffect, useRef, useState } from "react";
import { registerToastHost, type ToastRequest } from "../lib/appToast";

/** Draws the short notices from lib/appToast ("Saved"). Each new one replaces the last. */
export function AppToastHost() {
  const [toast, setToast] = useState<(ToastRequest & { id: number }) | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    registerToastHost((t) => setToast({ ...t, id: ++seq.current }));
    return () => registerToastHost(null);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" data-toast={toast.message} style={{ position: "fixed", left: 12, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)", zIndex: 1900, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div key={toast.id} className="mv-rise" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--ink)", color: "var(--bg)", borderRadius: 24, padding: "11px 18px", fontSize: 14, fontWeight: 800, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
        {toast.tone === "ok" && (
          <svg className="ic" viewBox="0 0 24 24" style={{ width: 18, height: 18, strokeWidth: 3 }} aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
        )}
        {toast.message}
      </div>
    </div>
  );
}
