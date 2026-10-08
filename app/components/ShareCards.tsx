"use client";
import type { CSSProperties, ReactNode } from "react";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatDuration, formatKm, formatPerformance, type ActivityKind } from "../lib/activity";
import { CARD_HEIGHT, CARD_WIDTH, type CardRatio, type CardTone } from "./ShareCard";
import { JourneyRoute } from "./JourneyRoute";
import { TerritoryEmblem, type EmblemColors } from "../territory/TerritoryEmblem";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";
import type { TerritoryCardFacts } from "../lib/share/context";
import { drawRoute } from "../lib/share/trackPath";
import type { TrackPoint } from "../lib/tracking/types";

/* Cards are exported to PNG, so every colour here is a literal and nothing relies on CSS variables or filters. */

const DISPLAY = "'Archivo Black', system-ui, sans-serif";
const TEXT = "'Space Grotesk', system-ui, sans-serif";
const LAYOUT = { story: { logoTop: 96, bottom: 120 }, post: { logoTop: 24, bottom: 30 } } as const;
const LIGHT_ACCENT: Record<ActivityKind, string> = { running: "#4F6EF7", walking: "#16A34A", cycling: "#D97706" };

interface Look {
  ink: string;
  soft: string;
  pageBg: string;
  accent: string;
  photo: boolean;
  light: boolean;
}

function look(tone: CardTone, photo: string | null | undefined, accentDark: string, accentLight: string): Look {
  const hasPhoto = Boolean(photo);
  const light = tone === "light" && !hasPhoto;
  return { ink: light ? "#0F0F0F" : "#FFFFFF", soft: hasPhoto ? "rgba(255,255,255,0.85)" : light ? "#5F6675" : "#8A8A94", pageBg: light ? "#F4F5F9" : "#0A0A0C", accent: light ? accentLight : accentDark, photo: hasPhoto, light };
}

interface ShellProps {
  ratio: CardRatio;
  photo?: string | null;
  look: Look;
  /** Drawn between the logo and the text block. */
  visual: (area: { width: number; height: number }) => ReactNode;
  /** Height of the text block, so the visual never runs under it. */
  blockHeight: number;
  children: ReactNode;
}

function Shell({ ratio, photo, look: L, visual, blockHeight, children }: ShellProps) {
  const H = CARD_HEIGHT[ratio];
  const { logoTop, bottom } = LAYOUT[ratio];
  const top = logoTop + 48;
  const height = Math.max(H - bottom - blockHeight - 8 - top, 120);
  return (
    <div style={{ position: "relative", width: CARD_WIDTH, height: H, overflow: "hidden", background: L.pageBg, color: L.ink, fontFamily: TEXT }}>
      {photo && (
        <>
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "50% 38%" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0) 170px), linear-gradient(to top, rgba(0,0,0,0.76) 0%, rgba(0,0,0,0.36) 24%, rgba(0,0,0,0) 50%)" }} />
        </>
      )}
      <div style={{ position: "absolute", left: 0, top, width: CARD_WIDTH, height, display: "flex", alignItems: "center", justifyContent: "center" }}>{visual({ width: CARD_WIDTH, height })}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={L.light ? "/move-mark-dark.png" : "/move-mark.png"} alt="Move" width={42} height={29} style={{ position: "absolute", left: 28, top: logoTop, width: 42, height: "auto" }} />
      <div style={{ position: "absolute", left: 28, right: 28, bottom }}>{children}</div>
    </div>
  );
}

const label = (L: Look, color?: string): CSSProperties => ({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: color ?? (L.photo ? "rgba(255,255,255,0.9)" : L.accent), textShadow: L.photo ? "0 1px 8px rgba(0,0,0,0.45)" : "none" });
const big = (size: number, L: Look): CSSProperties => ({ fontFamily: DISPLAY, fontSize: size, lineHeight: 1, marginTop: 6, textShadow: L.photo ? "0 1px 12px rgba(0,0,0,0.35)" : "none" });
const line: CSSProperties = { fontFamily: TEXT, fontSize: 18, fontWeight: 600, marginTop: 8 };
const sizeFor = (s: string, a: number, b: number, c: number) => (s.length <= 4 ? a : s.length <= 5 ? b : c);

/* ---------- 1. Normal activity: today's numbers and the route really travelled ---------- */

export interface NormalCardProps {
  kind: ActivityKind;
  km: number;
  duration: string;
  pace?: number;
  calories?: number;
  dateLabel: string;
  /** The recorded GPS track, or null when none was recorded (older activities). Never invented. */
  track: readonly TrackPoint[] | null;
  photo?: string | null;
  ratio: CardRatio;
  tone?: CardTone;
}

export function NormalActivityCard({ kind, km, duration, pace, calories, dateLabel, track, photo, ratio, tone = "dark" }: NormalCardProps) {
  const meta = ACTIVITY_META[kind];
  const L = look(tone, photo, meta.accent, LIGHT_ACCENT[kind]);
  const distance = formatKm(km);
  const kcal = calories && calories > 0 ? Math.round(calories) : null;
  return (
    <Shell
      ratio={ratio}
      photo={photo}
      look={L}
      blockHeight={kcal ? 150 : 130}
      visual={({ width, height }) => {
        const r = !photo ? drawRoute(track, width, height, 40) : null;
        if (r) {
          return (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Route">
              <path d={r.d} fill="none" stroke={L.light ? "rgba(15,15,15,0.16)" : "rgba(255,255,255,0.14)"} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
              <path d={r.d} fill="none" stroke={L.accent} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={r.start.x} cy={r.start.y} r={5} fill={L.pageBg} stroke={L.accent} strokeWidth={2.5} />
              <circle cx={r.end.x} cy={r.end.y} r={6} fill={L.accent} stroke={L.pageBg} strokeWidth={2.5} />
            </svg>
          );
        }
        if (photo) {
          const pr = drawRoute(track, 190, Math.min(height, 176), 16);
          return pr ? (
            <svg width={190} height={Math.min(height, 176)} viewBox={`0 0 190 ${Math.min(height, 176)}`} style={{ marginLeft: 150 }} aria-label="Route">
              <path d={pr.d} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={pr.end.x} cy={pr.end.y} r={5} fill={L.accent} stroke="#FFFFFF" strokeWidth={2} />
            </svg>
          ) : null;
        }
        // No GPS route was recorded for this activity: a quiet watermark, never a made-up line.
        // eslint-disable-next-line @next/next/no-img-element
        return <img src="/move-mark.png" alt="" aria-hidden="true" style={{ width: 190, height: "auto", opacity: L.light ? 0.1 : 0.07 }} />;
      }}
    >
      <div style={label(L)}>{meta.label}{dateLabel ? ` · ${dateLabel}` : ""}</div>
      <div style={big(sizeFor(distance, 82, 70, 58), L)}>{distance}<span style={{ fontSize: 20, marginLeft: 7, color: L.soft }}>km</span></div>
      <div style={line}>{formatDuration(duration)}<span style={{ opacity: 0.5, margin: "0 10px" }}>·</span>{formatPerformance(kind, pace)}</div>
      {kcal && <div style={{ ...line, marginTop: 4, color: L.soft, fontSize: 16 }}>{kcal} kcal</div>}
    </Shell>
  );
}

/* ---------- 2. Journey progress: the whole route, what is done and what is left ---------- */

export interface JourneyCardProps {
  route: Route;
  /** Absolute km along the route (from Dhaka) reached after this activity. */
  journeyKm: number;
  routeStartKm: number;
  /** This activity, shown small under the Journey progress. */
  today: { kind: ActivityKind; km: number; duration: string; pace?: number };
  photo?: string | null;
  ratio: CardRatio;
  tone?: CardTone;
}

export function JourneyProgressCard({ route, journeyKm, routeStartKm, today, photo, ratio, tone = "dark" }: JourneyCardProps) {
  const L = look(tone, photo, "#6F8AFF", "#4F6EF7");
  const completed = Math.max(journeyKm - routeStartKm, 0);
  const done = formatKm(completed);
  return (
    <Shell
      ratio={ratio}
      photo={photo}
      look={L}
      blockHeight={182}
      visual={({ width, height }) => (
        <JourneyRoute
          route={route}
          progressKm={journeyKm}
          startKm={routeStartKm}
          width={width}
          height={height}
          padL={photo ? 70 : 104}
          padR={photo ? 40 : 104}
          padY={10}
          labels="auto"
          accent={L.accent}
          line={3}
          fontSize={11}
          ink={L.ink}
          trail={photo ? "rgba(255,255,255,0.8)" : L.light ? "rgba(15,15,15,0.28)" : undefined}
          halo={L.light ? "#F4F5F9" : undefined}
          here={L.pageBg}
        />
      )}
    >
      <div style={label(L)}>DHAKA → {route.name.toUpperCase()}</div>
      <div style={big(sizeFor(done, 82, 70, 58), L)}>{done}<span style={{ fontSize: 20, marginLeft: 7, color: L.soft }}>km</span></div>
      <div style={line}>completed</div>
      <div style={{ ...line, marginTop: 4, fontSize: 14, color: L.soft }}>
        +{formatKm(today.km)} km today<span style={{ opacity: 0.5, margin: "0 8px" }}>·</span>{formatDuration(today.duration)}<span style={{ opacity: 0.5, margin: "0 8px" }}>·</span>{formatPerformance(today.kind, today.pace)}
      </div>
    </Shell>
  );
}

/* ---------- 3 & 4. Territory progress and Territory conquered: the real boundary is the hero ---------- */

export interface TerritoryCardProps {
  def: TerritoryDefinition;
  facts: TerritoryCardFacts;
  /** Real distance of the moves that explored the Territory, for the conquered card. Distance is a separate metric from coverage. */
  actualKm?: number;
  photo?: string | null;
  ratio: CardRatio;
  tone?: CardTone;
}

export function TerritoryCard({ def, facts, actualKm, photo, ratio, tone = "dark" }: TerritoryCardProps) {
  const L = look(tone, photo, "#6F8AFF", "#4F6EF7");
  const colors: EmblemColors = photo
    ? { fill: "rgba(255,255,255,0.1)", base: "rgba(255,255,255,0.5)", progressFrom: "#8EA2FF", progressTo: "#FFFFFF", head: "#FFFFFF" }
    : L.light
      ? { fill: "#E4E7F1", base: "#C5CAD8", progressFrom: "#4F6EF7", progressTo: "#7C8DF9", head: "#0F0F0F" }
      : { fill: "#15151B", base: "#2C2C36", progressFrom: "#6F8AFF", progressTo: "#B6C2FF", head: "#FFFFFF" };
  const stats: string[] = [];
  if (facts.conquered) {
    if (facts.moves) stats.push(`${facts.moves} ${facts.moves === 1 ? "move" : "moves"}`);
    if (actualKm) stats.push(`${actualKm.toFixed(1)} km real`);
  }
  return (
    <Shell
      ratio={ratio}
      photo={photo}
      look={L}
      blockHeight={facts.conquered ? 150 : 150}
      visual={({ width, height }) => <TerritoryEmblem def={def} fraction={facts.percent / 100} conquered={facts.conquered} width={width - 40} height={height} pad={14} colors={colors} stroke={4.5} glow={false} label={`${def.name} boundary`} />}
    >
      {facts.conquered ? (
        <>
          <div style={label(L)}>TERRITORY CONQUERED</div>
          <div style={big(Math.min(46, Math.floor(300 / (def.name.length * 0.82))), L)}>{def.name.toUpperCase()}</div>
          <div style={{ ...line, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 26, color: L.photo ? "#FFFFFF" : L.accent }}>100%</span>
            <span>explored</span>
          </div>
          {stats.length > 0 && <div style={{ ...line, marginTop: 6, fontSize: 14, color: L.soft }}>{stats.join(" · ")}</div>}
        </>
      ) : (
        <>
          <div style={label(L)}>{def.name.toUpperCase()}</div>
          <div style={big(58, L)}>{facts.percent.toFixed(1)}%<span style={{ fontSize: 18, marginLeft: 8, letterSpacing: 2, color: L.soft, fontFamily: TEXT, fontWeight: 700 }}>CONQUERED</span></div>
          <div style={line}>+{facts.addedPercent.toFixed(1)}%<span style={{ fontSize: 14, marginLeft: 6, color: L.soft }}>NEW GROUND TODAY</span></div>
          <div style={{ ...line, marginTop: 4, fontSize: 15, color: L.soft, letterSpacing: 1 }}>{facts.remainingPercent.toFixed(1)}% REMAINING</div>
        </>
      )}
    </Shell>
  );
}
