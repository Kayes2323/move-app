"use client";
import { memo, useMemo } from "react";
import type { Route } from "../data/routes";
import { projectRoute, type RoutePoint } from "../lib/activity";

export type LabelMode = "all" | "major" | "mini" | "auto";

interface Props {
  route: Route;
  progressKm: number;
  /** Route km where the user's journey began (defaults to Dhaka). */
  startKm?: number;
  width: number;
  height: number;
  padL: number;
  padR: number;
  padY: number;
  labels: LabelMode;
  accent: string;
  /** Base stroke width of the route line. */
  line?: number;
  fontSize?: number;
  dotted?: boolean;
  pulse?: boolean;
  /** Colours default to the share card's dark look; the live screen passes theme variables. */
  ink?: string;
  trail?: string;
  halo?: string;
  /** Fill of the "you are here" dot centre. */
  here?: string;
}

interface Placed {
  x: number;
  y: number;
  anchor: "start" | "end";
}

function chooseLabels(points: RoutePoint[], mode: LabelMode): number[] {
  const last = points.length - 1;
  const all = points.map((_, i) => i);
  const resolved = mode === "auto" ? (points.length <= 9 ? "all" : "major") : mode;
  if (resolved === "all") return all;
  if (resolved === "major") return all.filter((i) => i === 0 || i === last || points[i].type === "city");
  const interior = all.filter((i) => i > 0 && i < last);
  const strong = interior.filter((i) => points[i].type === "city" || points[i].type === "bridge");
  const pool = strong.length ? strong : interior;
  const pick = pool.length <= 2 ? pool : [pool[Math.round((pool.length - 1) * 0.25)], pool[Math.round((pool.length - 1) * 0.75)]];
  return [0, ...pick, last];
}

function hitsLine(points: RoutePoint[], x1: number, y1: number, x2: number, y2: number): number {
  let hits = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      if (x >= x1 - 2 && x <= x2 + 2 && y >= y1 - 2 && y <= y2 + 2) hits++;
    }
  }
  return hits;
}

/** Places each wanted label on the side (left/right of its dot) where it crosses the line and other labels least. */
function placeLabels(points: RoutePoint[], wanted: number[], fontSize: number, width: number): Map<number, Placed> {
  const out = new Map<number, Placed>();
  const rects: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const last = points.length - 1;

  for (const i of wanted) {
    const p = points[i];
    const w = p.name.length * fontSize * 0.58;
    const y1 = p.y - fontSize * 0.7;
    const y2 = p.y + fontSize * 0.5;
    const options = [
      { anchor: "end" as const, x: p.x - 9, x1: p.x - 9 - w, x2: p.x - 9 },
      { anchor: "start" as const, x: p.x + 9, x1: p.x + 9, x2: p.x + 9 + w },
    ];
    let best: { score: number; opt: (typeof options)[number] } | null = null;
    for (const opt of options) {
      let score = hitsLine(points, opt.x1, y1, opt.x2, y2);
      if (opt.x1 < 0 || opt.x2 > width) score += 1000;
      if (rects.some((r) => opt.x1 < r.x2 && opt.x2 > r.x1 && y1 < r.y2 && y2 > r.y1)) score += 1000;
      if (!best || score < best.score) best = { score, opt };
    }
    if (!best) continue;
    if (best.score >= 1000 && i !== 0 && i !== last) continue;
    rects.push({ x1: best.opt.x1, y1, x2: best.opt.x2, y2 });
    out.set(i, { x: best.opt.x, y: p.y + fontSize * 0.35, anchor: best.opt.anchor });
  }
  return out;
}

function JourneyRouteBase({ route, progressKm, startKm = 0, width, height, padL, padR, padY, labels, accent, line = 2.5, fontSize = 11, dotted = true, pulse = false, ink = "#FFFFFF", trail, halo = "rgba(0,0,0,0.6)", here = "#FFFFFF" }: Props) {
  const box = useMemo(() => ({ x: padL, y: padY, w: Math.max(width - padL - padR, 1), h: Math.max(height - padY * 2, 1) }), [width, height, padL, padR, padY]);
  const geo = useMemo(() => projectRoute(route, box, progressKm, startKm), [route, box, progressKm, startKm]);
  const placed = useMemo(() => placeLabels(geo.points, chooseLabels(geo.points, labels), fontSize, width), [geo.points, labels, fontSize, width]);

  const toPoints = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const s = line / 2.5;
  const last = geo.points.length - 1;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%", maxWidth: width, height: "auto" }} role="img" aria-label={`Route from Dhaka to ${route.destination}`}>
      <polyline
        points={toPoints(geo.points)}
        fill="none"
        style={{ stroke: trail ?? (dotted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)") }}
        strokeWidth={dotted ? line * 1.1 : line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dotted ? `1 ${Math.round(7 * s)}` : undefined}
      />
      {geo.progress.length > 1 && (
        <polyline points={toPoints(geo.progress)} fill="none" style={{ stroke: accent }} strokeWidth={line * 1.7} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {geo.points.map((p, i) => {
        if (i === last) return <circle key={i} cx={p.x} cy={p.y} r={5.5 * s} style={{ fill: accent, stroke: ink }} strokeWidth={2 * s} />;
        const big = i === 0;
        const mid = p.type === "city" || p.type === "bridge" || p.type === "junction";
        return <circle key={i} cx={p.x} cy={p.y} r={(big ? 4.5 : mid ? 3.6 : 2.6) * s} style={{ fill: ink }} />;
      })}
      {pulse && <circle cx={geo.here.x} cy={geo.here.y} r={13 * s} style={{ fill: accent }} className="mv-blip" />}
      <circle cx={geo.here.x} cy={geo.here.y} r={5.5 * s} style={{ fill: here, stroke: accent }} strokeWidth={3 * s} />
      {Array.from(placed.entries()).map(([i, l]) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor={l.anchor}
          fontSize={fontSize}
          fontWeight={600}
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          style={{ fill: ink, stroke: halo }}
          strokeWidth={2.6}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {geo.points[i].name}
        </text>
      ))}
    </svg>
  );
}

export const JourneyRoute = memo(JourneyRouteBase);
