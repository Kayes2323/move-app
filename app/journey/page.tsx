"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { RouteImage } from "../components/RouteImage";
import { RoutesOverviewMap } from "../components/RoutesOverviewMap";
import { ROUTE_MAP, type Route } from "../data/routes";
import { journeyOffsetKm, journeyOriginName } from "../lib/activity";
import { journeyOf } from "../lib/journey";
import { progressOn } from "../lib/journeySwitch";

// Lengths, photos and taglines come from the route data, so the list can't drift from the journey itself.
const ORDER = ["chandpur", "coxsbazar", "sylhet", "rajshahi", "rangpur", "khulna", "chittagong", "barisal"];
const ROUTE_LIST = ORDER.map((id) => ROUTE_MAP[id]).filter(Boolean);

type UserDoc = Record<string, unknown>;
type Status = "loading" | "ready" | "signed-out" | "error";

function remainingKm(route: Route, startIdx: number, doneKm: number) {
  const total = route.checkpoints[route.checkpoints.length - 1].distanceFromStart - journeyOffsetKm(route, startIdx);
  return { total, left: Math.max(total - doneKm, 0), percent: total > 0 ? Math.min((doneKm / total) * 100, 100) : 0 };
}

/**
 * Routes. The journeys come first and need nothing from the network to appear; the signed-in user's progress fills in when it
 * arrives (reserved space, nothing jumps), and the map sits below, loading on its own.
 */
export default function JourneyList() {
  const [user, setUser] = useState<UserDoc | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, async (u) => {
          if (cancelled) return;
          if (!u) return setStatus("signed-out");
          try {
            const snap = await getDoc(doc(db, "users", u.uid));
            if (cancelled) return;
            setUser(snap.exists() ? (snap.data() as UserDoc) : {});
            setStatus("ready");
          } catch {
            // offline or denied: the list is still fully usable, just without progress
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
  }, []);

  const active = user ? journeyOf(user as never) : null;
  const activeRoute = active ? ROUTE_LIST.find((r) => r.name === active.routeName || r.destination === active.routeName) : undefined;
  const activeProgress = active && activeRoute ? remainingKm(activeRoute, active.startIdx, active.completedKm) : null;
  const nextCp = active && activeRoute ? activeRoute.checkpoints.find((c) => c.distanceFromStart - journeyOffsetKm(activeRoute, active.startIdx) > active.completedKm) : undefined;

  return (
    <main className="app">
      <header>
        <h1 className="title-blk">Routes</h1>
        <p className="body mute" style={{ marginTop: 6 }}>Pick a destination and every kilometre you move takes you closer.</p>
      </header>

      {/* the user's journey: space is reserved while it loads so the list below never jumps */}
      <section aria-label="Your journey" style={{ marginTop: 18, minHeight: active ? undefined : 0 }}>
        {status === "loading" && <div aria-hidden="true" className="card" style={{ height: 112, background: "var(--surf)", opacity: 0.6 }} />}
        {active && activeRoute && activeProgress && (
          <Link href="/run?mode=journey" className="card" data-testid="active-journey" style={{ display: "block", border: "1.5px solid var(--accent)" }}>
            <p className="lab" style={{ color: "var(--acc-text)" }}>Your journey</p>
            <p className="h2" style={{ marginTop: 4 }}>{journeyOriginName(activeRoute, active.startIdx)} → {activeRoute.name}</p>
            <div className="bar-track" style={{ height: 8, marginTop: 12 }}>
              <div className="bar-fill" style={{ width: `${Math.max(activeProgress.percent, active.completedKm > 0 ? 1.5 : 0)}%`, background: "var(--grad)" }} />
            </div>
            <p className="mute" style={{ fontSize: 12, marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{active.completedKm.toFixed(1)} of {activeProgress.total} km · {activeProgress.left.toFixed(1)} km to go</span>
              <span style={{ color: "var(--acc-text)", fontWeight: 800 }}>Continue →</span>
            </p>
            {nextCp && <p className="mute" style={{ fontSize: 12, marginTop: 4 }}>Next: {nextCp.name}</p>}
          </Link>
        )}
        {status === "error" && <p className="mute" style={{ fontSize: 12 }}>Couldn&apos;t load your progress right now. The routes below still work.</p>}
      </section>

      {ROUTE_LIST.length === 0 ? (
        <p role="status" className="body mute" style={{ marginTop: 24 }}>No routes are available yet.</p>
      ) : (
        <ul aria-label="Journeys" style={{ listStyle: "none", marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {ROUTE_LIST.map((route, i) => {
            const mine = user ? progressOn(user, route.name) : null;
            const isActive = !!active && !!activeRoute && activeRoute.id === route.id;
            const p = mine ? remainingKm(route, mine.startIdx, mine.completedKm) : null;
            return (
              <li key={route.id}>
                <Link href={`/journey/${route.id}`} className="card" data-active={isActive ? "yes" : "no"} style={{ display: "block", padding: 0, overflow: "hidden", border: isActive ? "1.5px solid var(--accent)" : "1.5px solid transparent" }}>
                  <div style={{ position: "relative", aspectRatio: "16 / 7", background: "var(--surf2)" }}>
                    <RouteImage routeId={route.id} fallbackSrc={route.image} sizes="(max-width: 520px) 100vw, 480px" priority={i === 0} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 60%)" }} />
                    <span className="blk" style={{ position: "absolute", left: 16, bottom: 12, color: "#fff", fontSize: 22 }}>
                      {route.totalKm}<span style={{ fontSize: 13, marginLeft: 4, opacity: 0.85 }}>km</span>
                    </span>
                    {isActive && <span className="chip" style={{ position: "absolute", right: 12, top: 12 }}>Active</span>}
                  </div>
                  <div style={{ padding: 16 }}>
                    <h2 className="h2">Dhaka → {route.name}</h2>
                    <p className="body mute" style={{ marginTop: 4 }}>{route.tagline}</p>
                    {p && mine && mine.completedKm > 0 ? (
                      <p className="mute" style={{ fontSize: 13, marginTop: 10 }}>
                        <b style={{ color: "var(--ink)" }}>{p.percent.toFixed(p.percent >= 10 ? 0 : 1)}%</b> done · {p.left.toFixed(1)} km to go{isActive ? "" : " · saved"}
                      </p>
                    ) : null}
                    <p style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 14, fontWeight: 800, color: "var(--acc-text)" }}>
                      {isActive ? "Open journey" : mine && mine.completedKm > 0 ? "Resume journey" : "Start journey"}
                      <svg className="ic" viewBox="0 0 24 24" style={{ width: 18, height: 18 }} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-label="Map" style={{ marginTop: 28 }}>
        <p className="lab">All routes on the map</p>
        <div style={{ marginTop: 10 }}>
          <RoutesOverviewMap activeRouteId={activeRoute?.id} />
        </div>
      </section>

      <BottomNav active="routes" />
    </main>
  );
}
