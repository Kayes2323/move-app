"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CARD_HEIGHT, CARD_WIDTH, ShareCard, type CardRatio } from "./ShareCard";
import {
  ACTIVITY_META,
  detectAchievement,
  findRoute,
  journeyOffsetKm,
  formatCardDate,
  formatKm,
  loadPhoto,
  makeFileName,
  toKind,
  type RunEntry,
} from "../lib/activity";
import { getRuntime } from "../lib/tracking/runtime";
import { legacyRun } from "../lib/tracking/sync";

interface UserData {
  name?: string;
  completedKm?: number;
  currentRoute?: string;
  startCheckpointIndex?: number;
  runs?: RunEntry[];
}

type Status = "loading" | "ready" | "empty" | "error";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** `activityId` shows that activity directly (used right after finishing, where navigating may be impossible offline). */
export function ShareScreen({ activityId }: { activityId?: string } = {}) {
  const router = useRouter();
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [user, setUser] = useState<UserData | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [ratio, setRatio] = useState<CardRatio>("story");
  const [photo, setPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  /* Load the signed-in user's activities. */
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth, db }, { onAuthStateChanged }, { doc, getDoc }] = await Promise.all([import("../firebase"), import("firebase/auth"), import("firebase/firestore")]);
        unsubscribe = onAuthStateChanged(auth, async (fu) => {
          if (cancelled) return;
          if (!fu) {
            router.replace("/login");
            return;
          }
          // The server copy may be unreachable (offline): the phone still has every unsynced activity.
          let data: UserData = {};
          let serverOk = true;
          try {
            const snap = await getDoc(doc(db, "users", fu.uid));
            data = (snap.exists() ? snap.data() : {}) as UserData;
          } catch (err) {
            console.warn("Server copy unavailable, showing what is on this phone.", err);
            serverOk = false;
          }
          try {
            if (cancelled) return;
            const local = await getRuntime().store.listActivities().catch(() => []);
            const waiting = local.filter((l) => l.userId === fu.uid && l.status === "finished" && l.summary && l.sync === "pending");
            const serverRuns = data.runs ?? [];
            const known = new Set(serverRuns.map((r) => r.id).filter(Boolean));
            const extra = waiting.filter((l) => !known.has(l.id)).map(legacyRun);
            const all = [...serverRuns, ...extra].sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
            setPendingIds(new Set(extra.map((r) => r.id as string)));
            setUser({ ...data, runs: all });
            if (!all.some((r) => r.km > 0)) {
              setStatus(serverOk ? "empty" : "error");
              return;
            }
            const params = new URLSearchParams(window.location.search);
            const wantedId = activityId ?? params.get("a");
            const byId = all.findIndex((r) => r.id && r.id === wantedId);
            const legacy = serverRuns[Number(params.get("i"))];
            const byIndex = legacy ? all.indexOf(legacy) : -1;
            const last = all.length - 1 - [...all].reverse().findIndex((r) => r.km > 0);
            setSelected(byId >= 0 ? byId : byIndex >= 0 ? byIndex : last);
            setStatus("ready");
          } catch (err) {
            console.error(err);
            if (!cancelled) setStatus("error");
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router, attempt, activityId]);

  /* Fit the preview to narrow phones. */
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / CARD_WIDTH));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const runs = useMemo(() => user?.runs ?? [], [user]);
  const activityIndexes = useMemo(() => runs.map((r, i) => (r.km > 0 ? i : -1)).filter((i) => i >= 0), [runs]);
  const run = selected !== null ? runs[selected] : undefined;

  const cardProps = useMemo(() => {
    if (!run || selected === null) return null;
    const kind = toKind(run.activity);
    const route = findRoute(run.routeName ?? user?.currentRoute);
    const routeStartKm = journeyOffsetKm(route, user?.startCheckpointIndex);
    return {
      kind,
      km: run.km,
      duration: run.duration,
      pace: run.pace,
      dateLabel: formatCardDate(run.date),
      route,
      routeStartKm,
      // journeyKm is absolute; older activities fall back to the current progress.
      journeyKm: run.journeyKm ?? routeStartKm + (user?.completedKm ?? 0),
      achievement: detectAchievement(runs, selected),
      photo,
      ratio,
    };
  }, [run, selected, runs, user, photo, ratio]);

  const step = (dir: -1 | 1) => {
    if (selected === null) return;
    const pos = activityIndexes.indexOf(selected);
    const next = activityIndexes[pos + dir];
    if (next !== undefined) setSelected(next);
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await loadPhoto(file));
      setNotice(null);
    } catch (err) {
      console.error(err);
      setNotice("Couldn't read that photo. Try another one.");
    }
  };

  const render = useCallback(async (): Promise<Blob | null> => {
    setExporting(true);
    try {
      await nextFrame();
      if (document.fonts?.ready) await document.fonts.ready;
      if (!exportRef.current) return null;
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(exportRef.current, { scale: 3, useCORS: true, backgroundColor: "#0A0A0C", logging: false });
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      setExporting(false);
    }
  }, []);

  const save = async () => {
    if (!cardProps) return;
    const blob = await render();
    if (!blob) return setNotice("Couldn't create the image. Please try again.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFileName(cardProps.kind);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setNotice("Saved.");
  };

  const share = async () => {
    if (!cardProps) return;
    const blob = await render();
    if (!blob) return setNotice("Couldn't create the image. Please try again.");
    const file = new File([blob], makeFileName(cardProps.kind), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Move" });
      } catch (err) {
        if ((err as DOMException).name !== "AbortError") setNotice("Sharing failed. You can save the image instead.");
      }
      return;
    }
    await save();
  };

  /* ---------- states ---------- */

  const shell: React.CSSProperties = { minHeight: "100vh", background: "#0A0A0A", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Space Grotesk', system-ui, sans-serif", color: "#FFFFFF" };

  if (status === "loading") {
    return (
      <main style={{ ...shell, justifyContent: "center" }} aria-busy="true">
        <div style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT.story * scale, borderRadius: 24, background: "linear-gradient(110deg,#141418 30%,#1E1E24 50%,#141418 70%)", backgroundSize: "200% 100%", animation: "mv-shimmer 1.4s linear infinite" }} />
      </main>
    );
  }

  if (status === "empty" || status === "error") {
    const empty = status === "empty";
    return (
      <main style={{ ...shell, justifyContent: "center", padding: 32, textAlign: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/move-mark.png" alt="Move" width={56} height={38} style={{ width: 56, height: "auto", opacity: 0.9 }} />
        <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22 }}>{empty ? "No activity to share yet" : "Couldn't load your activity"}</h1>
        <p style={{ color: "#8A8A94", fontSize: 14, maxWidth: 280 }}>{empty ? "Finish a run, walk or ride and your card will be ready here." : "Check your connection and try again."}</p>
        <button onClick={() => (empty ? router.push("/run") : (setStatus("loading"), setAttempt((n) => n + 1)))} style={{ minHeight: 48, padding: "0 28px", borderRadius: 24, border: 0, background: "#FFFFFF", color: "#09090B", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          {empty ? "Start moving" : "Try again"}
        </button>
        <button onClick={() => router.push("/")} style={{ minHeight: 44, border: 0, background: "none", color: "#8A8A94", fontSize: 13, cursor: "pointer" }}>Back home</button>
      </main>
    );
  }

  if (!cardProps) return null;
  const meta = ACTIVITY_META[cardProps.kind];
  const pos = selected !== null ? activityIndexes.indexOf(selected) : 0;
  const H = CARD_HEIGHT[ratio];

  return (
    <main style={{ ...shell, padding: "0 16px 40px" }}>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "40px 0 16px" }}>
        <button aria-label="Back" onClick={() => router.back()} style={{ width: 44, height: 44, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button aria-label="Newer activity" disabled={pos >= activityIndexes.length - 1} onClick={() => step(1)} style={navBtn(pos >= activityIndexes.length - 1)}>‹</button>
          <span style={{ fontSize: 12, letterSpacing: 1.5, color: "#B4B4BE", minWidth: 118, textAlign: "center" }}>{meta.label} · {formatKm(cardProps.km)} km</span>
          <button aria-label="Older activity" disabled={pos <= 0} onClick={() => step(-1)} style={navBtn(pos <= 0)}>›</button>
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ width: CARD_WIDTH * scale, height: H * scale, borderRadius: 24 * scale, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: CARD_WIDTH, height: H }}>
          <ShareCard {...cardProps} />
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 440, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div role="group" aria-label="Card format" style={{ display: "flex", gap: 8 }}>
          {(["story", "post"] as const).map((r) => (
            <button key={r} onClick={() => setRatio(r)} aria-pressed={ratio === r} style={{ flex: 1, minHeight: 44, borderRadius: 22, border: `1px solid ${ratio === r ? "#FFFFFF" : "#2C2C34"}`, background: ratio === r ? "#FFFFFF" : "transparent", color: ratio === r ? "#09090B" : "#B4B4BE", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              {r === "story" ? "Story 9:16" : "Post 4:5"}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => fileRef.current?.click()} style={{ flex: 1, minHeight: 48, borderRadius: 24, border: "1px solid #2C2C34", background: "transparent", color: "#FFFFFF", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {photo ? "Change photo" : "Add photo"}
          </button>
          {photo && (
            <button onClick={() => setPhoto(null)} style={{ minHeight: 48, padding: "0 20px", borderRadius: 24, border: "1px solid #2C2C34", background: "transparent", color: "#B4B4BE", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Remove</button>
          )}
        </div>

        <button onClick={share} disabled={exporting} style={{ minHeight: 56, borderRadius: 28, border: 0, background: meta.accent, color: "#09090B", fontWeight: 700, fontSize: 15, letterSpacing: 1, cursor: exporting ? "wait" : "pointer", opacity: exporting ? 0.6 : 1 }}>
          {exporting ? "Preparing…" : "SHARE"}
        </button>
        <button onClick={save} disabled={exporting} style={{ minHeight: 48, borderRadius: 24, border: 0, background: "#17171D", color: "#FFFFFF", fontWeight: 600, fontSize: 14, cursor: exporting ? "wait" : "pointer" }}>Save image</button>
        <p role="status" style={{ minHeight: 18, textAlign: "center", fontSize: 12, color: "#8A8A94" }}>
          {notice ?? (run?.id && pendingIds.has(run.id) ? "Saved on this phone. It will sync when you're online." : "")}
        </p>
        <button onClick={() => router.push("/")} style={{ minHeight: 44, border: 0, background: "none", color: "#8A8A94", fontSize: 13, cursor: "pointer" }}>Done</button>
      </div>

      {/* Full-size copy rendered only while exporting, so the preview can scale freely. */}
      {exporting && (
        <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: CARD_WIDTH, height: H }}>
          <div ref={exportRef} style={{ width: CARD_WIDTH, height: H }}>
            <ShareCard {...cardProps} />
          </div>
        </div>
      )}
    </main>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return { width: 44, height: 44, border: 0, background: "none", color: disabled ? "#3A3A44" : "#FFFFFF", fontSize: 24, cursor: disabled ? "default" : "pointer" };
}
