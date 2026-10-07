"use client";
import Link from "next/link";
import { ACCENTS, savePrefs, useThemePrefs, type ThemeMode } from "../../lib/theme";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "Match phone" },
];

function Thumb({ mode }: { mode: ThemeMode }) {
  const dark = { bg: "#0A0A0C", track: "#1C1C22" };
  const light = { bg: "#FFFFFF", track: "#E6E8EE" };
  const ring = (c: { bg: string; track: string }) => (
    <>
      <circle cx="52" cy="58" r="26" fill="none" stroke={c.track} strokeWidth="7" />
      <circle cx="52" cy="58" r="26" fill="none" stroke="#4F6EF7" strokeWidth="7" strokeLinecap="round" strokeDasharray="100 164" transform="rotate(-90 52 58)" />
      <rect x="12" y="104" width="80" height="16" rx="8" fill="#4F6EF7" />
      <rect x="12" y="128" width="50" height="6" rx="3" fill={c.track} />
    </>
  );
  if (mode === "system") {
    return (
      <span className="thumb" style={{ display: "flex" }}>
        <span style={{ width: "50%", background: dark.bg }} />
        <span style={{ width: "50%", background: light.bg }} />
        <svg viewBox="0 0 104 150" width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <circle cx="52" cy="58" r="26" fill="none" stroke="#8A8A96" strokeWidth="7" opacity=".5" />
          <rect x="12" y="104" width="80" height="16" rx="8" fill="#4F6EF7" />
        </svg>
        <Tick />
      </span>
    );
  }
  const c = mode === "dark" ? dark : light;
  return (
    <span className="thumb" style={{ background: c.bg }}>
      <svg viewBox="0 0 104 150" width="100%" height="100%" aria-hidden="true">{ring(c)}</svg>
      <Tick />
    </span>
  );
}

function Tick() {
  return (
    <span className="tick">
      <svg className="ic" viewBox="0 0 24 24" style={{ width: 13, height: 13, strokeWidth: 3 }} aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
    </span>
  );
}

export default function Appearance() {
  const prefs = useThemePrefs();
  return (
    <main className="app nonav">
      <div className="bar" style={{ justifyContent: "flex-start" }}>
        <Link href="/profile" className="icon-btn" aria-label="Back">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <h1 className="title-blk">Appearance</h1>
      </div>

      <p className="lab" style={{ marginTop: 28 }}>Theme</p>
      <div className="tiles" role="group" aria-label="Theme">
        {MODES.map((m) => (
          <button key={m.id} className="tile" aria-pressed={prefs.mode === m.id} onClick={() => savePrefs({ ...prefs, mode: m.id })}>
            <Thumb mode={m.id} />
            {m.label}
          </button>
        ))}
      </div>

      <p className="lab" style={{ marginTop: 28 }}>Accent colour</p>
      <div className="swatches" role="group" aria-label="Accent colour">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            className="swatch"
            aria-label={a.label}
            aria-pressed={prefs.accent === a.id}
            onClick={() => savePrefs({ ...prefs, accent: a.id })}
            style={{ background: a.color, color: a.color }}
          >
            {prefs.accent === a.id && (
              <svg className="ic" viewBox="0 0 24 24" style={{ stroke: a.ink, strokeWidth: 3, width: 20, height: 20 }} aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
            )}
          </button>
        ))}
      </div>
      <p className="body mute" style={{ marginTop: 10, fontSize: 13, lineHeight: "18px" }}>
        Used for the main button, progress and highlights. Run, walk and ride keep their own colours so a map always reads the same.
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <button className="btn btn-go" style={{ pointerEvents: "none" }} tabIndex={-1} aria-hidden="true">Preview</button>
      </div>

      <p className="body mute" style={{ marginTop: 16, fontSize: 13, lineHeight: "18px" }}>
        Share cards keep their own look so they read the same wherever you post them. This choice is saved on this phone.
      </p>
    </main>
  );
}
