"use client";
import { useEffect } from "react";
import type { ActivityMode } from "../lib/activityMode";

export interface StartContext {
  /** The route the user is following, if they chose one: "Dhaka → Chandpur · 12.4 of 132 km". */
  journeyLine: string | null;
  /** The active Territory: its name when it is open, "" when chosen but not open yet, null when none was chosen. */
  territory: { name: string; open: boolean } | null;
}

const Tile = ({ children, tone }: { children: React.ReactNode; tone: "route" | "territory" }) => (
  <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: tone === "route" ? "var(--on-acc)" : "#3A2A00", background: tone === "route" ? "var(--grad)" : "linear-gradient(135deg, #F5C542, #D9A520)", boxShadow: tone === "route" ? "0 8px 22px var(--glow)" : "0 8px 22px rgba(217,165,32,.35)" }}>
    {children}
  </span>
);

function Option({ tone, title, text, hint, onClick, autoFocus }: { tone: "route" | "territory"; title: string; text: string; hint: string; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button onClick={onClick} autoFocus={autoFocus} aria-label={`${title}. ${text}`} className="mv-option" style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left", cursor: "pointer", color: "var(--ink)", background: "var(--surf)", border: "1px solid var(--cardbd)", borderRadius: 26, padding: "16px 16px 16px 16px", minHeight: 96 }}>
      <Tile tone={tone}>
        {tone === "route" ? (
          <svg className="ic" viewBox="0 0 24 24" style={{ width: 28, height: 28 }}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h6a3 3 0 000-6h-4a3 3 0 010-6h6" /></svg>
        ) : (
          <span style={{ fontSize: 28, lineHeight: 1 }}>👑</span>
        )}
      </Tile>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="blk" style={{ display: "block", fontSize: 20, letterSpacing: 0.5 }}>{title}</span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600, marginTop: 3 }}>{text}</span>
        <span className="mute" style={{ display: "block", fontSize: 12, fontWeight: 600, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>
      </span>
      <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}

/**
 * START MOVING: why are you moving today? Two real choices, Route or Territory, and a quiet third for a free move. Picking one only
 * says which context the move belongs to; the caller takes the user into that flow. Nothing is started here and nothing is assumed.
 */
export function StartMovingSheet({ context, onSelect, onClose }: { context: StartContext; onSelect: (mode: ActivityMode) => void; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const t = context.territory;
  const territoryHint = !t ? "Choose your Territory first" : t.open ? `${t.name} · your Territory` : "Your Territory isn't open yet";
  const routeHint = context.journeyLine ?? "Choose a route to follow";

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="start-title" onClick={(e) => e.stopPropagation()} className="mv-rise" style={{ width: "100%", maxWidth: 480, background: "var(--bg)", borderRadius: "30px 30px 0 0", padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 22px)", boxShadow: "0 -12px 44px rgba(0,0,0,.4)", maxHeight: "92dvh", overflowY: "auto" }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: "var(--surf2)", margin: "0 auto 14px" }} />
        <div className="bar" style={{ alignItems: "flex-start" }}>
          <div>
            <p className="lab" style={{ color: "var(--acc-text)" }}>Start moving</p>
            <h2 id="start-title" className="h1" style={{ marginTop: 6, fontSize: 26 }}>How do you want to move today?</h2>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <Option tone="route" title="ROUTE" text="Follow a Journey route" hint={routeHint} onClick={() => onSelect("JOURNEY")} autoFocus />
          <Option tone="territory" title="TERRITORY" text="Explore new ground" hint={territoryHint} onClick={() => onSelect("TERRITORY")} />
        </div>

        <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => onSelect("NORMAL")}>
          Just track a free move
        </button>
      </div>
    </div>
  );
}
