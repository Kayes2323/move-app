"use client";
import { useId, useMemo } from "react";
import { conquestRing, fitProjector, pathD, ringProgress, toLngLat } from "../lib/territory/conquest/outline";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";

export interface EmblemColors {
  fill: string;
  base: string;
  progressFrom: string;
  progressTo: string;
  head: string;
}

export const THEME_COLORS: EmblemColors = { fill: "var(--surf)", base: "var(--trk)", progressFrom: "var(--accent)", progressTo: "var(--acc-text)", head: "var(--ink)" };

/**
 * The Territory's real boundary, drawn as its own progress meter. It is a picture of conquest, not a route to follow:
 * the lit part of the outline grows with the share of the target conquered, starting from the north and running clockwise.
 */
export function TerritoryEmblem({ def, fraction, conquered, width, height, pad = 18, colors = THEME_COLORS, stroke = 5, label, glow = true }: { def: TerritoryDefinition; fraction: number; conquered: boolean; width: number; height: number; pad?: number; colors?: EmblemColors; stroke?: number; label?: string; glow?: boolean }) {
  const id = useId().replace(/:/g, "");
  const { ring, project } = useMemo(() => {
    const r = conquestRing(toLngLat(def.boundary.coordinates[0]));
    return { ring: r, project: fitProjector(r, width, height, pad) };
  }, [def, width, height, pad]);
  const f = conquered ? 1 : Math.min(Math.max(fraction, 0), 0.999);
  const lit = useMemo(() => ringProgress(ring, f), [ring, f]);
  const head = lit.length ? project(lit[lit.length - 1]) : null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", maxWidth: width, height: "auto" }} role="img" aria-label={label ?? `${def.name} boundary, ${Math.round(f * 100)} percent conquered`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.progressFrom} />
          <stop offset="1" stopColor={colors.progressTo} />
        </linearGradient>
        <filter id={`b${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <path d={pathD(ring, project, true)} fill={colors.fill} fillOpacity={conquered ? 0.9 : 0.6} stroke={colors.base} strokeWidth={stroke} strokeLinejoin="round" />
      {lit.length > 1 && (
        <>
          {glow && <path d={pathD(lit, project)} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke + 8} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} filter={`url(#b${id})`} />}
          <path d={pathD(lit, project, conquered)} fill={conquered ? `url(#g${id})` : "none"} fillOpacity={conquered ? 0.22 : 0} stroke={`url(#g${id})`} strokeWidth={stroke + 1.5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {head && !conquered && (
        <>
          <circle cx={head.x} cy={head.y} r={stroke * 2.6} fill={colors.progressFrom} opacity={0.25} className={glow ? "mv-blip" : undefined} />
          <circle cx={head.x} cy={head.y} r={stroke * 1.35} fill={colors.head} stroke={colors.progressFrom} strokeWidth={stroke * 0.55} />
        </>
      )}
    </svg>
  );
}
