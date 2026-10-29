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
  activity: { kind: ActivityKind; km: number; duration: string; pace?: number; calories?: number; steps?: number; dateLabel: string };
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
  /** A photo fills the card: the card is always dark and everything sits on glass or a fade. */
  onPhoto: boolean;
}

/** Room kept clear around a route inside its panel: the casing, the line and the end dots never touch the edge. */
const ROUTE_PAD = 18;

const rectStyle = (r: Rect): CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, overflow: "hidden" });

/** Photo cards are always dark (a calm panel under the photo); the light tone only applies to cards without one. */
function look(tone: CardTone, hasPhoto: boolean, accentDark: string, accentLight: string): Look {
  const light = tone === "light" && !hasPhoto;
  return { ink: light ? "#0F0F0F" : "#FFFFFF", soft: light ? "#5F6675" : "#8A8A94", bg: light ? "#F4F5F9" : "#0A0A0C", accent: light ? accentLight : accentDark, light, onPhoto: hasPhoto };
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

/** The recorded GPS track, thinned only, with round caps and joins. Fully inside `r`: the padding covers the casing and the end dots. */
function TrackDrawing({ track, r, L }: { track: readonly TrackPoint[] | null; r: Rect; L: Look }) {
  const route = drawRoute(track, r.w, r.h, ROUTE_PAD);
  if (!route) return null;
  const hasPhoto = L.onPhoto;
  return (
    <svg width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} role="img" aria-label="Route" shapeRendering="geometricPrecision" style={{ display: "block" }}>
      <path d={route.d} fill="none" stroke={hasPhoto ? "rgba(0,0,0,0.55)" : L.light ? "rgba(15,15,15,0.16)" : "rgba(255,255,255,0.14)"} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <path d={route.d} fill="none" stroke={L.accent} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={route.start.x} cy={route.start.y} r={5} fill={L.bg} stroke={L.accent} strokeWidth={2.5} />
      <circle cx={route.end.x} cy={route.end.y} r={6} fill={L.accent} stroke={hasPhoto ? "#FFFFFF" : L.bg} strokeWidth={2.5} />
    </svg>
  );
}

/** A calm, contained panel the map sits in: a dark glass card on a photo, a soft card otherwise. */
const panelStyle = (L: Look, r: Rect): CSSProperties => ({
  ...rectStyle(r),
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 18,
  background: L.onPhoto ? "rgba(10,10,12,0.56)" : L.light ? "#FFFFFF" : "#121218",
  border: `1px solid ${L.onPhoto ? "rgba(255,255,255,0.14)" : L.light ? "rgba(15,15,15,0.08)" : "rgba(255,255,255,0.08)"}`,
});

/**
 * The map, drawn inside its own rectangle and clipped to it:
 *  - Routes: the real GPS track in a contained panel (the active journey's route if the move left no track);
 *  - Territory: with a photo a compact mini-card on the right, without one the whole boundary as a progress meter;
 *  - Normal: nothing. The numbers are the card.
 */
function Visual({ layout, mode, props, L }: { layout: CardLayout; mode: ShareMode; props: ShareCardProps; L: Look }): ReactNode {
  const r = layout.visual;
  if (!r || mode === "NORMAL") return null;
  const onPhoto = Boolean(props.photo);
  if (mode === "ROUTES") {
    const j = props.journey;
    const hasTrack = drawRoute(props.track, r.w, r.h, ROUTE_PAD) !== null;
    if (!hasTrack && j) {
      return (
        <div style={panelStyle(L, r)} data-zone="visual">
          <JourneyRoute route={j.route} startKm={j.startKm} progressKm={j.progressKm} width={r.w} height={r.h} padL={r.w > 200 ? 92 : 62} padR={r.w > 200 ? 92 : 22} padY={14} labels={r.w > 200 ? "auto" : "mini"} accent={L.accent} line={r.h >= 200 ? 3.4 : 2.8} fontSize={r.h >= 200 ? 12 : 10.5} ink={L.ink} trail={L.light ? "rgba(15,15,15,0.28)" : onPhoto ? "rgba(255,255,255,0.7)" : undefined} halo={L.light ? "#F4F5F9" : "rgba(10,10,12,0.85)"} here={L.bg} dotted={!onPhoto} />
        </div>
      );
    }
    return (
      <div style={panelStyle(L, r)} data-zone="visual">
        <TrackDrawing track={props.track} r={r} L={L} />
      </div>
    );
  }
  const t = props.territory;
  if (!t) return null;
  const colors: EmblemColors = L.light
    ? { fill: "#E4E7F1", base: "#C5CAD8", progressFrom: "#4F6EF7", progressTo: "#7C8DF9", head: "#0F0F0F" }
    : onPhoto
      ? { fill: "rgba(255,255,255,0.06)", base: "rgba(255,255,255,0.4)", progressFrom: "#8EA2FF", progressTo: "#FFFFFF", head: "#FFFFFF" }
      : { fill: "#15151B", base: "#2C2C36", progressFrom: "#6F8AFF", progressTo: "#B6C2FF", head: "#FFFFFF" };
  if (!onPhoto) {
    return (
      <div style={{ ...rectStyle(r), display: "flex", alignItems: "center", justifyContent: "center" }} data-zone="visual">
        <TerritoryEmblem def={t.def} fraction={t.facts.percent / 100} conquered={t.facts.conquered} width={r.w} height={r.h} pad={10} colors={colors} stroke={4} glow={false} label={`${t.def.name} boundary`} />
      </div>
    );
  }
  // The compact card: no box behind it, just the real boundary with its progress and the figure under it. A soft dark casing
  // under the line and a shadow under the text keep it readable on any photo.
  const pct = t.facts.conquered ? "100" : t.facts.percent.toFixed(1);
  const eh = r.h - 8 - 7 - 16 - 10 - 2;
  const ew = r.w - 12;
  const casing: EmblemColors = { fill: "rgba(0,0,0,0)", base: "rgba(0,0,0,0.38)", progressFrom: "rgba(0,0,0,0.38)", progressTo: "rgba(0,0,0,0.38)", head: "rgba(0,0,0,0)" };
  const glass: EmblemColors = { fill: "rgba(0,0,0,0)", base: "rgba(255,255,255,0.85)", progressFrom: "#8EA2FF", progressTo: "#FFFFFF", head: "#FFFFFF" };
  const shadow = "0 1px 3px rgba(0,0,0,0.65), 0 0 10px rgba(0,0,0,0.35)";
  return (
    <div style={{ ...rectStyle(r), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "8px 6px 7px" }} data-zone="visual" data-territory-mini="">
      <div style={{ position: "relative", width: ew, height: eh }}>
        <div style={{ position: "absolute", inset: 0 }}><TerritoryEmblem def={t.def} fraction={t.facts.percent / 100} conquered={t.facts.conquered} width={ew} height={eh} pad={6} colors={casing} stroke={6.4} glow={false} label="" /></div>
        <div style={{ position: "absolute", inset: 0 }}><TerritoryEmblem def={t.def} fraction={t.facts.percent / 100} conquered={t.facts.conquered} width={ew} height={eh} pad={6} colors={glass} stroke={3.2} glow={false} label={`${t.def.name} boundary`} /></div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 14, lineHeight: 1, color: "#FFFFFF", whiteSpace: "nowrap", textShadow: shadow }}>{pct}%</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.1, color: "#FFFFFF", whiteSpace: "nowrap", textShadow: shadow }}>{t.facts.conquered ? "EXPLORED" : "CONQUERED"}</div>
    </div>
  );
}

const fmtSteps = (steps?: number): string | null => (steps && steps > 0 ? Math.round(steps).toLocaleString("en-US") : null);
const fmtKcal = (calories?: number): string | null => (calories && calories > 0 ? String(Math.round(calories)) : null);

/** One number with its label: the building block of the Normal card. A missing value is a quiet dash, never a made-up number. */
function Stat({ value, unit, name, L, size }: { value: string | null; unit?: string; name: string; L: Look; size: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1, whiteSpace: "nowrap", color: value ? L.ink : L.soft }}>
        {value ?? "—"}
        {value && unit && <span style={{ fontFamily: TEXT, fontWeight: 700, fontSize: Math.round(size * 0.5), marginLeft: 3, color: L.soft }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6, marginTop: 5, color: L.soft, whiteSpace: "nowrap" }}>{name}</div>
    </div>
  );
}

/** Normal: distance first and biggest, then duration, pace, calories and steps as one even row (two rows without a photo). */
function NormalStats({ props, layout, L, heading }: { props: ShareCardProps; layout: CardLayout; L: Look; heading?: string }) {
  const { kind, km, duration, pace, calories, steps, dateLabel } = props.activity;
  const distance = formatKm(km);
  const roomy = layout.stats.h >= 200;
  const size = roomy ? bigSize(distance, 108, 92, 76) : layout.stats.h >= 140 ? bigSize(distance, 62, 54, 46) : bigSize(distance, 54, 48, 40);
  // "12:48 /km" or "18.2 km/h": the figure is the figure, the unit is quiet
  const perf = formatPerformance(kind, pace);
  const cut = perf.indexOf(" ");
  const cells = [
    { name: "TIME", value: formatDuration(duration) },
    { name: kind === "cycling" ? "SPEED" : "PACE", value: cut > 0 ? perf.slice(0, cut) : perf, unit: cut > 0 ? perf.slice(cut + 1) : undefined },
    { name: "CALORIES", value: fmtKcal(calories), unit: "kcal" },
    { name: "STEPS", value: fmtSteps(steps) },
  ];
  const statSize = roomy ? 26 : 17;
  return (
    <>
      <div style={label(L, 13)}>{heading ?? `${ACTIVITY_META[kind].label}${dateLabel ? ` · ${dateLabel}` : ""}`}</div>
      <div style={big(size, roomy ? 14 : 6)}>{distance}<span style={{ fontSize: Math.round(size * 0.24), marginLeft: 6, color: L.soft }}>km</span></div>
      <div style={{ display: "grid", gridTemplateColumns: roomy ? "1fr 1fr" : "repeat(4, auto)", justifyContent: "space-between", rowGap: roomy ? 26 : 0, columnGap: 8, marginTop: roomy ? 40 : 14 }}>
        {cells.map((c) => <Stat key={c.name} value={c.value} unit={c.unit} name={c.name} L={L} size={statSize} />)}
      </div>
    </>
  );
}

function RoutesStats({ props, L }: { props: ShareCardProps; L: Look }) {
  const { kind, km, duration, pace, calories, dateLabel } = props.activity;
  const distance = formatKm(km);
  const size = bigSize(distance, 46, 40, 34);
  const j = props.journey;
  const kcal = fmtKcal(calories);
  const done = j ? Math.max(j.progressKm - j.startKm, 0) : 0;
  const left = j ? Math.max(j.route.totalKm - j.progressKm, 0) : 0;
  return (
    <>
      <div style={label(L, 13)}>{j ? `DHAKA → ${j.route.destination.toUpperCase()}` : `ROUTE · ${ACTIVITY_META[kind].label}${dateLabel ? ` · ${dateLabel}` : ""}`}</div>
      <div style={big(size, 6)}>{distance}<span style={{ fontSize: Math.round(size * 0.34), marginLeft: 5, color: L.soft }}>km today</span></div>
      {j && (
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>
          {formatKm(done)} km completed
          <span style={{ color: L.soft, fontWeight: 600 }}>{` · ${formatKm(left)} km to go`}</span>
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: L.soft }}>
        {formatDuration(duration)}<span style={{ opacity: 0.6, margin: "0 6px" }}>·</span>{formatPerformance(kind, pace)}
        {kcal && <><span style={{ opacity: 0.6, margin: "0 6px" }}>·</span>{kcal} kcal</>}
      </div>
    </>
  );
}

function TerritoryStats({ props, layout, L }: { props: ShareCardProps; layout: CardLayout; L: Look }) {
  const t = props.territory;
  if (!t) return null;
  const { def, facts } = t;
  const c = false;
  // With a photo the card reads like the others; the mini-card on the right carries the Territory progress.
  if (L.onPhoto) return <NormalStats props={props} layout={layout} L={L} heading={facts.conquered ? `${facts.winKind === "takeover" ? "TAKEN" : "CONQUERED"} · ${def.name.toUpperCase()}` : `TERRITORY · ${def.name.toUpperCase()}`} />;
  if (facts.conquered) {
    const stats = [facts.moves ? `${facts.moves} ${facts.moves === 1 ? "move" : "moves"}` : "", t.actualKm ? `${t.actualKm.toFixed(1)} km real` : ""].filter(Boolean).join(" · ");
    const nameSize = Math.min(c ? 22 : 34, Math.floor((c ? 146 : 308) / (def.name.length * 0.82)));
    return (
      <>
        <div style={label(L, c ? 11 : 13)}>{facts.winKind === "takeover" ? "TERRITORY TAKEN · NEW OWNER" : "TERRITORY CONQUERED"}</div>
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
        {mode === "TERRITORY" && <TerritoryStats props={props} layout={layout} L={L} />}
      </div>
    </div>
  );
}
