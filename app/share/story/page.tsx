"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadError } from "../../components/LoadError";
import { Loading } from "../../components/Loading";
import { ACTIVITY_META, formatCardDate, loadPhoto, makeFileName, toKind, type RunEntry } from "../../lib/activity";
import { showToast } from "../../lib/appToast";
import { loadHistory } from "../../lib/history";
import { elevationGain, routeForStory, storyStats, type StoryStat } from "../../lib/share/story";
import { drawStory } from "../../lib/share/storyRender";
import { loadTrack } from "../../lib/trackLoader";
import type { TrackPoint } from "../../lib/tracking/types";

/**
 * STORY CARD: the user's own photo, a stats panel and the route they really recorded, glowing on the ground (in the spirit of
 * Strava's photo cards, MOVE's own look). Or a transparent STICKER to put on top of an Instagram story.
 * Only real data: stats from the saved activity, the recorded track (start and end hidden by default), elevation only if the phone
 * reported it. Without a photo the background is plain dark, never a stock picture.
 */
const COLORS = [
  { id: "green", label: "MOVE green", hex: "#7BE86A" },
  { id: "orange", label: "Orange", hex: "#FF6B1A" },
  { id: "white", label: "White", hex: "#F4F4F4" },
] as const;
const SIZES = { story: { w: 1080, h: 1920, label: "Story 9:16" }, post: { w: 1080, h: 1350, label: "Post 4:5" }, sticker: { w: 1080, h: 1080, label: "Sticker" } } as const;
type Size = keyof typeof SIZES;

export default function StoryCard() {
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<RunEntry | null>(null);
  const [track, setTrack] = useState<TrackPoint[] | null>(null);
  const [trackState, setTrackState] = useState<"loading" | "ok" | "none">("loading");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState({ zoom: 1, x: 0, y: 0 });
  const [size, setSize] = useState<Size>("story");
  const [color, setColor] = useState<string>(COLORS[0].hex);
  const [routeStyle, setRouteStyle] = useState<"ground" | "flat" | "off">("ground");
  const [hideEnds, setHideEnds] = useState(true);
  const [panelOn, setPanelOn] = useState(true);
  const [hidden, setHidden] = useState<Set<StoryStat["key"]>>(new Set(["calories", "steps", "maxElev"]));
  const [mark, setMark] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; frame: typeof frame } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setMark(img);
    img.src = "/move-mark.png";
  }, []);

  /* the activity: the one asked for (?a=id), else the latest with distance */
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../../firebase"), import("firebase/auth")]);
        unsubscribe = onAuthStateChanged(auth, async (fu) => {
          if (cancelled) return;
          if (!fu) {
            window.location.href = "/login";
            return;
          }
          try {
            const h = await loadHistory(fu.uid);
            if (cancelled) return;
            const want = new URLSearchParams(window.location.search).get("a");
            const real = h.runs.filter((r) => r.km > 0);
            const r = real.find((x) => x.id && x.id === want) ?? real[real.length - 1] ?? null;
            if (!r) return setStatus(h.serverOk ? "empty" : "error");
            setRun(r);
            setStatus("ready");
            const t = r.id ? await loadTrack(fu.uid, r.id).catch(() => null) : null;
            if (cancelled) return;
            setTrack(t);
            setTrackState(t && t.length > 1 ? "ok" : "none");
          } catch (err) {
            console.error(err);
            if (!cancelled) setStatus("error");
          }
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [attempt]);

  const kind = toKind(run?.activity);
  const elev = useMemo(() => elevationGain(track), [track]);
  const allStats = useMemo(() => (run ? storyStats({ kind, km: run.km, duration: run.duration, pace: run.pace, calories: run.calories, steps: run.steps }, elev) : []), [run, kind, elev]);
  const stats = useMemo(() => allStats.filter((s) => !hidden.has(s.key)), [allStats, hidden]);
  const route = useMemo(() => (routeStyle === "off" ? [] : routeForStory(track, { hideEndsM: hideEnds ? 200 : 0, align: routeStyle === "ground" && size !== "sticker" })), [track, hideEnds, routeStyle, size]);
  const tooShort = routeStyle !== "off" && trackState === "ok" && route.length === 0;
  const caption = run ? `${ACTIVITY_META[kind].label} · ${formatCardDate(run.date)}` : "";
  const dims = SIZES[size];

  /* draw on every change, once per frame */
  useEffect(() => {
    const c = canvas.current;
    if (!c || !run) return;
    const id = requestAnimationFrame(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      drawStory(ctx, { width: dims.w, height: dims.h, photo: size === "sticker" ? null : photo, frame, route, routeStyle: routeStyle === "flat" || size === "sticker" ? "flat" : "ground", stats, panel: panelOn, color, mark, caption, sticker: size === "sticker" });
    });
    return () => cancelAnimationFrame(id);
  }, [run, photo, frame, route, routeStyle, stats, panelOn, color, mark, caption, size, dims]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setNotice("");
    try {
      const src = await loadPhoto(file, 2160);
      const img = new Image();
      img.onload = () => {
        setPhoto(img);
        setFrame({ zoom: 1, x: 0, y: 0 });
      };
      img.src = src;
    } catch {
      setNotice("Couldn't read that photo. Try another one.");
    }
  };

  const blob = useCallback(async (): Promise<Blob | null> => {
    const c = canvas.current;
    if (!c) return null;
    return new Promise((res) => c.toBlob(res, "image/png"));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const b = await blob();
      if (!b) return setNotice("Couldn't create the image. Please try again.");
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = makeFileName(kind).replace(".png", size === "sticker" ? "-sticker.png" : "-story.png");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast("Image saved");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      const b = await blob();
      if (!b) return setNotice("Couldn't create the image. Please try again.");
      const file = new File([b], makeFileName(kind), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "MOVE" });
        } catch (err) {
          if ((err as DOMException).name !== "AbortError") setNotice("Sharing failed. You can save the image instead.");
        }
      } else {
        setBusy(false);
        await save();
      }
    } finally {
      setBusy(false);
    }
  };

  if (status === "error") return <LoadError message="Couldn't load your activity." onRetry={() => { setStatus("loading"); setAttempt((n) => n + 1); }} />;
  if (status === "loading") return <Loading label="Loading your move..." />;
  if (status === "empty" || !run) {
    return (
      <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
        <p className="h2">No moves to share yet</p>
        <p className="body mute">Finish a walk or run and its story card will be ready here.</p>
        <Link href="/" className="btn btn-solid" style={{ width: "auto" }}>Home</Link>
      </main>
    );
  }

  const chip = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: "0 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? "var(--accent)" : "var(--cardbd)"}`, background: on ? "var(--surf2)" : "transparent", color: "var(--ink)", cursor: "pointer" });
  const previewW = 300;

  return (
    <main className="app nonav" style={{ paddingBottom: 32 }}>
      <header className="bar">
        <Link href={run.id ? `/share?a=${encodeURIComponent(run.id)}` : "/share"} className="icon-btn" aria-label="Back to share">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <p className="lab">Story card · {caption}</p>
        <span style={{ width: 44 }} />
      </header>

      <div
        data-testid="story-preview"
        style={{ margin: "14px auto 0", width: previewW, height: (previewW * dims.h) / dims.w, borderRadius: 18, overflow: "hidden", touchAction: photo ? "none" : undefined, cursor: photo ? "grab" : undefined, background: size === "sticker" ? "repeating-conic-gradient(#2a2a2a 0% 25%, #1c1c1c 0% 50%) 50% / 24px 24px" : "#000" }}
        onPointerDown={(e) => {
          if (!photo || size === "sticker") return;
          drag.current = { x: e.clientX, y: e.clientY, frame };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const k = 2 / previewW;
          setFrame({ ...d.frame, x: Math.max(-1, Math.min(1, d.frame.x - (e.clientX - d.x) * k)), y: Math.max(-1, Math.min(1, d.frame.y - (e.clientY - d.y) * k)) });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <canvas ref={canvas} width={dims.w} height={dims.h} style={{ width: "100%", height: "100%", display: "block" }} aria-label="Story card preview" role="img" />
      </div>
      {photo && size !== "sticker" && <p className="mute" style={{ fontSize: 12, textAlign: "center", marginTop: 6 }}>Drag the picture to frame it.</p>}

      <section style={{ marginTop: 18, display: "grid", gap: 14 }}>
        <div role="group" aria-label="Card size" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(SIZES) as Size[]).map((k) => <button key={k} aria-pressed={size === k} style={chip(size === k)} onClick={() => setSize(k)}>{SIZES[k].label}</button>)}
        </div>

        {size !== "sticker" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn btn-line" style={{ width: "auto", minHeight: 40, padding: "0 16px", cursor: "pointer" }}>
              {photo ? "Change photo" : "Add your photo"}
              <input data-testid="story-photo" type="file" accept="image/*" onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            </label>
            {photo && <button style={chip(false)} onClick={() => setPhoto(null)}>Remove photo</button>}
            {photo && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                Zoom
                <input type="range" min={1} max={2.5} step={0.05} value={frame.zoom} onChange={(e) => setFrame({ ...frame, zoom: Number(e.target.value) })} />
              </label>
            )}
          </div>
        )}

        <div>
          <p className="lab">Route</p>
          <div role="group" aria-label="Route" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {size !== "sticker" && <button aria-pressed={routeStyle === "ground"} style={chip(routeStyle === "ground")} disabled={trackState !== "ok"} onClick={() => setRouteStyle("ground")}>On the ground</button>}
            <button aria-pressed={routeStyle === "flat"} style={chip(routeStyle === "flat")} disabled={trackState !== "ok"} onClick={() => setRouteStyle("flat")}>Map shape</button>
            <button aria-pressed={routeStyle === "off"} style={chip(routeStyle === "off")} onClick={() => setRouteStyle("off")}>No route</button>
          </div>
          <p className="mute" data-testid="story-route-note" style={{ fontSize: 12, marginTop: 6 }}>
            {trackState === "loading" ? "Loading the recorded route…" : trackState === "none" ? "This move has no recorded route, so none is drawn." : tooShort ? "The route is too short to show with its start and end hidden." : "Your real recorded route."}
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" checked={hideEnds} onChange={(e) => setHideEnds(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
            Hide where I started and finished (200 m)
          </label>
        </div>

        <div>
          <p className="lab">Colour</p>
          <div role="group" aria-label="Colour" style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {COLORS.map((c) => (
              <button key={c.id} aria-label={c.label} aria-pressed={color === c.hex} onClick={() => setColor(c.hex)} style={{ width: 40, height: 40, borderRadius: 20, background: c.hex, border: color === c.hex ? "3px solid var(--ink)" : "3px solid transparent", boxShadow: "0 0 0 1px var(--cardbd)", cursor: "pointer" }} />
            ))}
          </div>
        </div>

        {size !== "sticker" && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" checked={panelOn} onChange={(e) => setPanelOn(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
            Stats panel
          </label>
        )}
        <div>
          <p className="lab">Stats</p>
          <div role="group" aria-label="Stats" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {allStats.map((s) => {
              const on = !hidden.has(s.key);
              return (
                <button key={s.key} aria-pressed={on} style={chip(on)} onClick={() => setHidden((h) => { const n = new Set(h); if (on) n.add(s.key); else n.delete(s.key); return n; })}>
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mute" style={{ fontSize: 12, marginTop: 6 }}>From your saved move.{elev ? " Elevation is from your phone's GPS." : " No elevation: your phone didn't report altitude on this move."}</p>
        </div>

        {notice && <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{notice}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-go" style={{ flex: 1 }} onClick={share} disabled={busy}>Share</button>
          <button className="btn btn-soft" style={{ flex: 1 }} onClick={save} disabled={busy}>Save image</button>
        </div>
        <p className="mute" style={{ fontSize: 12, lineHeight: 1.45 }}>Only what you see is shared: no email, no map labels, and your start and finish stay hidden unless you turn that off.</p>
      </section>
    </main>
  );
}
