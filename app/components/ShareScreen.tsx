"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CARD_HEIGHT, CARD_WIDTH, type CardRatio, type CardTone } from "./ShareCard";
import { JourneyProgressCard, NormalActivityCard, TerritoryCard } from "./ShareCards";
import {
  ACTIVITY_META,
  findRoute,
  journeyOffsetKm,
  formatCardDate,
  formatKm,
  loadPhoto,
  makeFileName,
  toKind,
} from "../lib/activity";
import { loadHistory, type UserDoc } from "../lib/history";
import { loadTrack } from "../lib/trackLoader";
import type { TrackPoint } from "../lib/tracking/types";
import { reconcileTerritory } from "../lib/territoryState";
import { getTerritory } from "../lib/territory/conquest/registry";
import type { TerritoryProgress } from "../lib/territory/conquest/progress";
import { availableContexts, decideShareContext, SHARE_CONTEXT_LABEL, territoryFactsAt, type ShareContext } from "../lib/share/context";

type UserData = UserDoc;

type Status = "loading" | "ready" | "empty" | "error";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** `activityId` shows that activity directly (used right after finishing, where navigating may be impossible offline). */
export function ShareScreen({ activityId, hint }: { activityId?: string; hint?: string } = {}) {
  const router = useRouter();
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [user, setUser] = useState<UserData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [territory, setTerritory] = useState<{ progress: TerritoryProgress; areaId: string } | null>(null);
  const [loadedTrack, setLoadedTrack] = useState<{ id: string; points: TrackPoint[] | null } | null>(null);
  const [chosenCtx, setChosenCtx] = useState<ShareContext | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [ratio, setRatio] = useState<CardRatio>("story");
  const [tone, setTone] = useState<CardTone>("dark");
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
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../firebase"), import("firebase/auth")]);
        unsubscribe = onAuthStateChanged(auth, async (fu) => {
          if (cancelled) return;
          if (!fu) {
            router.replace("/login");
            return;
          }
          try {
            const h = await loadHistory(fu.uid);
            if (cancelled) return;
            const all = h.runs;
            const serverRuns = h.user.runs ?? [];
            const rec = reconcileTerritory(fu.uid, h.user.territory, all);
            setUid(fu.uid);
            setPendingIds(h.pendingIds);
            setUser({ ...h.user, runs: all });
            setTerritory(rec.stored && rec.progress ? { progress: rec.progress, areaId: rec.stored.areaId } : null);
            if (!all.some((r) => r.km > 0)) {
              setStatus(h.serverOk ? "empty" : "error");
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

  /* The GPS track this activity really recorded. Missing for older activities: the card then says nothing about a route. */
  const runId = run?.id;
  useEffect(() => {
    if (!uid || !runId) return;
    let cancelled = false;
    loadTrack(uid, runId).then((t) => !cancelled && setLoadedTrack({ id: runId, points: t })).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid, runId]);

  const track = loadedTrack && loadedTrack.id === runId ? loadedTrack.points : null;

  const facts = useMemo(() => {
    if (!run || selected === null) return null;
    const kind = toKind(run.activity);
    const route = findRoute(run.routeName ?? user?.currentRoute);
    const routeStartKm = journeyOffsetKm(route, user?.startCheckpointIndex);
    const def = territory ? getTerritory(territory.areaId) : undefined;
    const territoryFacts = territory && def && run.id ? territoryFactsAt(territory.progress, run.id) : null;
    const url = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ctx");
    const shareFacts = { runId: run.id, hasJourney: Boolean(route), territory: def ? territory?.progress ?? null : null, hint: hint ?? url };
    const options = availableContexts(shareFacts);
    const auto = decideShareContext(shareFacts);
    const context = chosenCtx && options.includes(chosenCtx) ? chosenCtx : auto;
    return { run, kind, route, routeStartKm, def, territoryFacts, options, context };
  }, [run, selected, user, territory, hint, chosenCtx]);

  const common = { photo, ratio, tone } as const;
  const card = (() => {
    if (!facts) return null;
    const { run: r, kind, route, routeStartKm, def, territoryFacts, context } = facts;
    if ((context === "TERRITORY_PROGRESS" || context === "TERRITORY_CONQUERED") && def && territoryFacts) return <TerritoryCard def={def} facts={territoryFacts} {...common} />;
    if (context === "JOURNEY_PROGRESS" && route) {
      // journeyKm is absolute; older activities fall back to the current progress.
      return <JourneyProgressCard route={route} routeStartKm={routeStartKm} today={{ kind, km: r.km, duration: r.duration, pace: r.pace }} journeyKm={r.journeyKm ?? routeStartKm + (user?.completedKm ?? 0)} {...common} />;
    }
    return <NormalActivityCard kind={kind} km={r.km} duration={r.duration} pace={r.pace} calories={r.calories} dateLabel={formatCardDate(r.date)} track={track} {...common} />;
  })();
  const cardProps = facts ? { kind: facts.kind, km: facts.run.km } : null;

  const step = (dir: -1 | 1) => {
    if (selected === null) return;
    const pos = activityIndexes.indexOf(selected);
    const next = activityIndexes[pos + dir];
    if (next !== undefined) {
      setSelected(next);
      setChosenCtx(null);
    }
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
      const canvas = await html2canvas(exportRef.current, { scale: 3, useCORS: true, backgroundColor: tone === "light" && !photo ? "#F4F5F9" : "#0A0A0C", logging: false });
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      setExporting(false);
    }
  }, [tone, photo]);

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

  if (status === "loading") {
    return (
      <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center" }} aria-busy="true">
        <div className="skel" style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT.story * scale, borderRadius: 24 }} />
      </main>
    );
  }

  if (status === "empty" || status === "error") {
    const empty = status === "empty";
    return (
      <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/move-mark.png" alt="Move" width={56} height={38} style={{ width: 56, height: "auto" }} />
        <h1 className="h2">{empty ? "No activity to share yet" : "Couldn't load your activity"}</h1>
        <p className="body mute" style={{ maxWidth: 280 }}>{empty ? "Finish a run, walk or ride and your card will be ready here." : "Check your connection and try again."}</p>
        <button className="btn btn-solid" style={{ width: "auto" }} onClick={() => (empty ? router.push("/run") : (setStatus("loading"), setAttempt((n) => n + 1)))}>
          {empty ? "Start moving" : "Try again"}
        </button>
        <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => router.push("/")}>Back home</button>
      </main>
    );
  }

  if (!cardProps) return null;
  const meta = ACTIVITY_META[cardProps.kind];
  const pos = selected !== null ? activityIndexes.indexOf(selected) : 0;
  const H = CARD_HEIGHT[ratio];

  return (
    <main className="app nonav stack" style={{ alignItems: "center", paddingLeft: 16, paddingRight: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16 }}>
        <button className="icon-btn" aria-label="Back" onClick={() => router.back()}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button aria-label="Newer activity" disabled={pos >= activityIndexes.length - 1} onClick={() => step(1)} className="icon-btn" style={{ background: "none", opacity: pos >= activityIndexes.length - 1 ? 0.3 : 1 }}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "var(--mute)", minWidth: 118, textAlign: "center" }}>{meta.label} · {formatKm(cardProps.km)} km</span>
          <button aria-label="Older activity" disabled={pos <= 0} onClick={() => step(-1)} className="icon-btn" style={{ background: "none", opacity: pos <= 0 ? 0.3 : 1 }}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ width: CARD_WIDTH * scale, height: H * scale, borderRadius: 24 * scale, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: CARD_WIDTH, height: H }}>
          {card}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 440, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {facts && facts.options.length > 1 && (
          <div role="group" aria-label="Card type" style={{ display: "flex", gap: 8 }}>
            {facts.options.map((o) => (
              <button key={o} onClick={() => setChosenCtx(o)} aria-pressed={facts.context === o} className={facts.context === o ? "btn btn-solid" : "btn btn-line"} style={{ flex: 1, minHeight: 44, borderRadius: 22, fontSize: 13, textTransform: "none", letterSpacing: 0 }}>
                {SHARE_CONTEXT_LABEL[o]}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Card format" style={{ display: "flex", gap: 8 }}>
          {(["story", "post"] as const).map((r) => (
            <button key={r} onClick={() => setRatio(r)} aria-pressed={ratio === r} className={ratio === r ? "btn btn-solid" : "btn btn-line"} style={{ flex: 1, minHeight: 44, borderRadius: 22, fontSize: 13, textTransform: "none", letterSpacing: 0 }}>
              {r === "story" ? "Story 9:16" : "Post 4:5"}
            </button>
          ))}
        </div>

        {!photo && (
          <div role="group" aria-label="Card style" style={{ display: "flex", gap: 8 }}>
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => setTone(t)} aria-pressed={tone === t} className={tone === t ? "btn btn-solid" : "btn btn-line"} style={{ flex: 1, minHeight: 44, borderRadius: 22, fontSize: 13, textTransform: "none", letterSpacing: 0 }}>
                {t === "dark" ? "Dark card" : "Light card"}
              </button>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-line" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
            {photo ? "Change photo" : "Add photo"}
          </button>
          {photo && (
            <button className="btn btn-line" style={{ width: "auto", color: "var(--mute)" }} onClick={() => setPhoto(null)}>Remove</button>
          )}
        </div>

        <button className="btn btn-go" onClick={share} disabled={exporting} style={{ cursor: exporting ? "wait" : "pointer" }}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></svg>
          {exporting ? "Preparing…" : "Share"}
        </button>
        <button className="btn btn-soft" onClick={save} disabled={exporting}>Save image</button>
        <p role="status" className="mute" style={{ minHeight: 18, textAlign: "center", fontSize: 12 }}>
          {notice ?? (run?.id && pendingIds.has(run.id) ? "Saved on this phone. It will sync when you're online." : "")}
        </p>
        <button className="btn btn-ghost" onClick={() => router.push("/")}>Done</button>
      </div>

      {/* Full-size copy rendered only while exporting, so the preview can scale freely. */}
      {exporting && (
        <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: CARD_WIDTH, height: H }}>
          <div ref={exportRef} style={{ width: CARD_WIDTH, height: H }}>
            {card}
          </div>
        </div>
      )}
    </main>
  );
}
