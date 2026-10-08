"use client";
import type { CSSProperties, ReactNode } from "react";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatDuration, formatKm, formatPerformance, type ActivityKind } from "../lib/activity";
import { cardLayout, defaultAdjust, photoPlacement, type CardLayout, type CardRatio, type CardTone, type PhotoAdjust, type Rect, type ShareMode } from "../lib/share/cardLayout";
import type { TerritoryCardFacts } from "../lib/share/context";
import { drawRoute } from "../lib/share/trackPath";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";
import type { TrackPoint } from "../lib/tracking/types";
import { TerritoryEmblem, type EmblemColors } from "../territory/TerritoryEmblem";
import { JourneyRoute } from "./JourneyRoute";

/* Cards are exported to PNG, so every colour here is a literal and nothing relies on CSS variables or filters. */

const DISPLAY = "'Archivo Black', system-ui, sans-serif";
const TEXT = "'Space Grotesk', system-ui, sans-serif";
const LIGHT_ACCENT: Record<ActivityKind, string> = { running: "#4F6EF7", walking: "#16A34A", cycling: "#D97706" };

export interface CardPhoto {
  src: string;
  width: number;
  height: number;
}

export interface ShareCardProps {
  mode: ShareMode;
  ratio: CardRatio;
  tone?: CardTone;
  photo?: CardPhoto | null;
  /** How the user moved and zoomed the photo. A sensible default for the photo's shape when omitted. */
  adjust?: PhotoAdjust;
  activity: { kind: ActivityKind; km: number; duration: string; pace?: number; calories?: number; dateLabel: string };
  /** The recorded GPS track, or null when none exists. Never invented. */
  track: readonly TrackPoint[] | null;
  /** The Journey this activity counted towards: the Routes card draws this whole route and how far along it is. */
  journey?: { route: Route; startKm: number; progressKm: number } | null;
  territory?: { def: TerritoryDefinition; facts: TerritoryCardFacts; actualKm?: number } | null;
}

interface Look {
  ink: string;
  soft: string;
  bg: string;
  accent: string;
  light: boolean;
}

const rectStyle = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, overflow: "hidden" });

/** Photo cards are always dark (a calm panel under the photo); the light tone only applies to cards without one. */
function look(tone: CardTone, hasPhoto: boolean, accentDark: string, accentLight: string): Look {
  const light = tone === "light" && !hasPhoto;
  return { ink: light ? "#0F0F0F" : "#FFFFFF", soft: light ? "#5F6675" : "#8A8A94", bg: light ? "#F4F5F9" : "#0A0A0C", accent: light ? accentLight : accentDark, light };
}

/** The fades as one gradient: dark behind a visual at the top (if it is there), clear in the middle, dark behind the numbers. */
function scrimGradient(layout: CardLayout): string {
  const stops: string[] = [];
  const top = layout.scrims.find((r) => r.y === 0);
  const bottom = layout.scrims.find((r) => r.y > 0);
  if (top) stops.push("rgba(0,0,0,0.3) 0px", `rgba(0,0,0,0.16) ${Math.round(top.h * 0.6)}px`, `rgba(0,0,0,0) ${top.h}px`);
  if (bottom) stops.push(`rgba(0,0,0,0) ${bottom.y}px`, `rgba(0,0,0,0.42) ${bottom.y + 44}px`, `rgba(0,0,0,0.74) ${layout.height}px`);
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

const label = (L: Look, size: number): CSSProperties => ({ fontSize: size, fontWeight: 700, letterSpacing: size >= 13 ? 2 : 1.4, color: L.accent, whiteSpace: "nowrap" });
const big = (size: number, marginTop: number): CSSProperties => ({ fontFamily: DISPLAY, fontSize: size, lineHeight: 1, marginTop, whiteSpace: "nowrap" });
const bigSize = (text: string, a: number, b: number, c: number) => (text.length <= 4 ? a : text.length <= 5 ? b : c);

/** A recorded GPS track, thinned only. On a photo it gets a dark casing so it reads against any picture. */
function TrackDrawing({ track, r, L, onPhoto }: { track: readonly TrackPoint[] | null; r: Rect; L: Look; onPhoto: boolean }) {
  const route = drawRoute(track, r.w, r.h, 16);
  if (!route) {
    // No GPS route was recorded (older activities): a quiet watermark, never a made-up line.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={L.light ? "/move-mark-dark.png" : "/move-mark.png"} alt="" aria-hidden="true" style={{ width: Math.min(150, r.w * 0.5), height: "auto", opacity: onPhoto ? 0.18 : 0.08 }} />;
  }
  return (
    <svg width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} role="img" aria-label="Route" style={{ display: "block" }}>
      <path d={route.d} fill="none" stroke={onPhoto ? "rgba(0,0,0,0.5)" : L.light ? "rgba(15,15,15,0.16)" : "rgba(255,255,255,0.14)"} strokeWidth={onPhoto ? 8.5 : 9} strokeLinecap="round" strokeLinejoin="round" />
      <path d={route.d} fill="none" stroke={L.accent} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={route.start.x} cy={route.start.y} r={5} fill={L.bg} stroke={L.accent} strokeWidth={2.5} />
      <circle cx={route.end.x} cy={route.end.y} r={6} fill={L.accent} stroke={onPhoto ? "#FFFFFF" : L.bg} strokeWidth={2.5} />
    </svg>
  );
}

/**
 * The visual, drawn inside its own rectangle and clipped to it:
 *  - Normal: the route walked today (the real GPS track);
 *  - Routes: the active journey, e.g. Dhaka to Chandpur, with how far along it you are (the real GPS track if there is no journey);
 *  - Territory: the boundary as a progress meter.
 */
function Visual({ layout, mode, props, L }: { layout: CardLayout; mode: ShareMode; props: ShareCardProps; L: Look }): ReactNode {
  const r = layout.visual;
  const onPhoto = Boolean(props.photo);
  const box: CSSProperties = { ...rectStyle(r), display: "flex", alignItems: "center", justifyContent: "center" };
  if (mode === "ROUTES" && props.journey) {
    const j = props.journey;
    const roomy = r.h >= 200;
    return (
      <div style={box} data-zone="visual">
        <JourneyRoute route={j.route} startKm={j.startKm} progressKm={j.progressKm} width={r.w} height={r.h} padL={r.w > 200 ? 92 : 62} padR={r.w > 200 ? 92 : 22} padY={14} labels={r.w > 200 ? "auto" : "mini"} accent={L.accent} line={roomy ? 3.4 : 2.8} fontSize={roomy ? 12 : 10.5} ink={L.ink} trail={L.light ? "rgba(15,15,15,0.28)" : onPhoto ? "rgba(255,255,255,0.7)" : undefined} halo={L.light ? "#F4F5F9" : "rgba(10,10,12,0.85)"} here={L.bg} dotted={!onPhoto} />
      </div>
    );
  }
  if (mode === "TERRITORY") {
    const t = props.territory;
    if (!t) return null;
    const colors: EmblemColors = L.light
      ? { fill: "#E4E7F1", base: "#C5CAD8", progressFrom: "#4F6EF7", progressTo: "#7C8DF9", head: "#0F0F0F" }
      : onPhoto
        ? { fill: "rgba(10,10,12,0.45)", base: "rgba(255,255,255,0.55)", progressFrom: "#8EA2FF", progressTo: "#FFFFFF", head: "#FFFFFF" }
        : { fill: "#15151B", base: "#2C2C36", progressFrom: "#6F8AFF", progressTo: "#B6C2FF", head: "#FFFFFF" };
    return (
      <div style={box} data-zone="visual">
        <TerritoryEmblem def={t.def} fraction={t.facts.percent / 100} conquered={t.facts.conquered} width={r.w} height={r.h} pad={10} colors={colors} stroke={4} glow={false} label={`${t.def.name} boundary`} />
      </div>
    );
  }
  return (
    <div style={box} data-zone="visual">
      <TrackDrawing track={props.track} r={r} L={L} onPhoto={onPhoto} />
    </div>
  );
}

function NormalStats({ props, layout, L }: { props: ShareCardProps; layout: CardLayout; L: Look }) {
  const { kind, km, duration, pace, calories, dateLabel } = props.activity;
  const distance = formatKm(km);
  const roomy = layout.stats.h >= 140;
  const size = false ? bigSize(distance, 36, 32, 27) : roomy ? bigSize(distance, 92, 78, 64) : bigSize(distance, 46, 40, 34);
  const kcal = calories && calories > 0 ? Math.round(calories) : null;
  const sub = false ? 12 : roomy ? 20 : 15;
  return (
    <>
      <div style={label(L, false ? 11 : 13)}>{ACTIVITY_META[kind].label}{dateLabel ? ` · ${dateLabel}` : ""}</div>
      <div style={big(size, 6)}>{distance}<span style={{ fontSize: Math.round(size * 0.24), marginLeft: 6, color: L.soft }}>km</span></div>
      <div style={{ fontSize: sub, fontWeight: 600, marginTop: 8 }}>{formatDuration(duration)}<span style={{ opacity: 0.5, margin: "0 8px" }}>·</span>{formatPerformance(kind, pace)}</div>
      {kcal && <div style={{ fontSize: sub - 2, fontWeight: 600, marginTop: 4, color: L.soft }}>{kcal} kcal</div>}
    </>
  );
}

function RoutesStats({ props, L }: { props: ShareCardProps; L: Look }) {
  const { kind, km, duration, pace, calories, dateLabel } = props.activity;
  const distance = formatKm(km);
  const c = false;
  const size = c ? bigSize(distance, 36, 32, 27) : bigSize(distance, 46, 40, 34);
  const j = props.journey;
  const kcal = calories && calories > 0 ? Math.round(calories) : null;
  const done = j ? Math.max(j.progressKm - j.startKm, 0) : 0;
  const left = j ? Math.max(j.route.totalKm - j.progressKm, 0) : 0;
  const sub = c ? 12 : 15;
  return (
    <>
      <div style={label(L, c ? 10 : 13)}>{j ? `DHAKA → ${j.route.destination.toUpperCase()}` : `ROUTE · ${ACTIVITY_META[kind].label}${dateLabel ? ` · ${dateLabel}` : ""}`}</div>
      <div style={big(size, 6)}>{distance}<span style={{ fontSize: Math.round(size * 0.34), marginLeft: 5, color: L.soft }}>km today</span></div>
      {j && (
        <div style={{ fontSize: sub, fontWeight: 700, marginTop: 6 }}>
          {formatKm(done)} km completed
          {!c && <span style={{ color: L.soft, fontWeight: 600 }}>{` · ${formatKm(left)} km to go`}</span>}
        </div>
      )}
      <div style={{ fontSize: sub - 1, fontWeight: 600, marginTop: 4, color: L.soft }}>
        {formatDuration(duration)}<span style={{ opacity: 0.6, margin: "0 6px" }}>·</span>{formatPerformance(kind, pace)}
        {kcal && !c && <><span style={{ opacity: 0.6, margin: "0 6px" }}>·</span>{kcal} kcal</>}
      </div>
      {kcal && c && <div style={{ fontSize: sub - 1, fontWeight: 600, marginTop: 2, color: L.soft }}>{kcal} kcal</div>}
    </>
  );
}

function TerritoryStats({ props, L }: { props: ShareCardProps; L: Look }) {
  const t = props.territory;
  if (!t) return null;
  const { def, facts } = t;
  const c = false;
  if (facts.conquered) {
    const stats = [facts.moves ? `${facts.moves} ${facts.moves === 1 ? "move" : "moves"}` : "", t.actualKm ? `${t.actualKm.toFixed(1)} km real` : ""].filter(Boolean).join(" · ");
    const nameSize = Math.min(c ? 22 : 34, Math.floor((c ? 146 : 308) / (def.name.length * 0.82)));
    return (
      <>
        <div style={label(L, c ? 11 : 13)}>{facts.winKind === "takeover" ? "TERRITORY TAKEN · NEW KING" : "TERRITORY CONQUERED · KING"}</div>
        <div style={big(nameSize, 6)}>{def.name.toUpperCase()}</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8, fontWeight: 600, fontSize: c ? 13 : 16 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: c ? 24 : 30, color: L.accent }}>100%</span>explored
        </div>
        {stats && <div style={{ fontSize: c ? 11 : 13, marginTop: 4, color: L.soft }}>{stats}</div>}
      </>
    );
  }
  const pct = facts.percent.toFixed(1);
  return (
    <>
      <div style={label(L, c ? 11 : 13)}>{def.name.toUpperCase()}</div>
      <div style={big(c ? bigSize(pct, 38, 34, 30) : 46, 6)}>{pct}%{!c && <span style={{ fontSize: 15, marginLeft: 8, letterSpacing: 2, color: L.soft, fontFamily: TEXT, fontWeight: 700 }}>CONQUERED</span>}</div>
      {c && <div style={{ fontSize: 11, letterSpacing: 1.6, fontWeight: 700, color: L.soft, marginTop: 2 }}>CONQUERED</div>}
      <div style={{ fontSize: c ? 12 : 15, fontWeight: 600, marginTop: 6 }}>
        {facts.addedPercent > 0 ? <>+{facts.addedPercent.toFixed(1)}%<span style={{ marginLeft: 5, fontSize: c ? 10 : 12, color: L.soft }}>NEW GROUND</span></> : <span style={{ color: L.soft }}>No new ground this move</span>}
      </div>
      <div style={{ fontSize: c ? 11 : 13, marginTop: 3, color: L.soft, letterSpacing: 1 }}>{facts.remainingPercent.toFixed(1)}% REMAINING</div>
    </>
  );
}

/**
 * One card, three modes (Territory, Routes, Normal), one layout system. With a photo, the photo zone holds only the photo:
 * the logo, route/boundary and numbers all live in their own rectangles below or beside it (see lib/share/cardLayout.ts).
 */
export function ShareCardView(props: ShareCardProps) {
  const { mode, ratio, photo, tone = "dark" } = props;
  const layout = cardLayout(mode, ratio, Boolean(photo));
  const accent = mode === "TERRITORY" ? ["#6F8AFF", "#4F6EF7"] : [ACTIVITY_META[props.activity.kind].accent, LIGHT_ACCENT[props.activity.kind]];
  const L = look(tone, Boolean(photo), accent[0], accent[1]);
  const placed = photo ? photoPlacement(photo.width, photo.height, layout.width, layout.height, props.adjust ?? defaultAdjust(photo.width, photo.height)) : null;

  return (
    <div data-card-mode={mode} style={{ position: "relative", width: layout.width, height: layout.height, overflow: "hidden", background: L.bg, color: L.ink, fontFamily: TEXT }}>
      {photo && layout.photo && placed && (
        <div data-zone="photo" style={{ ...rectStyle(layout.photo), backgroundColor: "#0A0A0C", backgroundImage: `url(${photo.src})`, backgroundRepeat: "no-repeat", backgroundSize: `${placed.w}px ${placed.h}px`, backgroundPosition: `${placed.left}px ${placed.top}px` }} />
      )}
      {/* Soft fades for legibility, only where there is something to read; the rest of the photo is untouched.
          One full-size layer: separate gradient elements leave hairline seams in the exported PNG. */}
      {photo && layout.scrims.length > 0 && <div data-zone="scrim" style={{ position: "absolute", inset: 0, background: scrimGradient(layout) }} />}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-zone="logo" src={L.light ? "/move-mark-dark.png" : "/move-mark.png"} alt="Move" width={layout.logo.w} height={layout.logo.h} style={{ position: "absolute", left: layout.logo.x, top: layout.logo.y, width: layout.logo.w, height: "auto" }} />

      <Visual layout={layout} mode={mode} props={props} L={L} />

      <div data-zone="stats" style={rectStyle(layout.stats)}>
        {mode === "NORMAL" && <NormalStats props={props} layout={layout} L={L} />}
        {mode === "ROUTES" && <RoutesStats props={props} L={L} />}
        {mode === "TERRITORY" && <TerritoryStats props={props} L={L} />}
      </div>
    </div>
  );
}
