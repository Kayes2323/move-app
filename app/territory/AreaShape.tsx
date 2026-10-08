"use client";
import { useMemo } from "react";
import type { Geometry } from "../lib/territory/types";

/** A real boundary drawn as a flat shape (no map tiles): for previews and the first-time screen. */
export function AreaShape({ geometries, width, height, pad = 8, fill = "var(--surf2)", stroke = "var(--acc-text)", strokeWidth = 1.5, glow = false, label }: { geometries: Geometry[]; width: number; height: number; pad?: number; fill?: string; stroke?: string; strokeWidth?: number; glow?: boolean; label?: string }) {
  const d = useMemo(() => {
    const polys = geometries.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
    const pts = polys.flatMap((p) => p[0] ?? []);
    if (!pts.length) return "";
    const lat0 = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * k);
    const ys = pts.map((p) => -p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((width - 2 * pad) / (x1 - x0 || 1), (height - 2 * pad) / (y1 - y0 || 1));
    const ox = (width - (x1 - x0) * s) / 2;
    const oy = (height - (y1 - y0) * s) / 2;
    const ring = (r: [number, number][]) => r.map(([x, y], i) => `${i ? "L" : "M"}${(ox + (x * k - x0) * s).toFixed(1)},${(oy + (-y - y0) * s).toFixed(1)}`).join("") + "Z";
    return polys.map((p) => p.map(ring).join("")).join("");
  }, [geometries, width, height, pad]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: "block", maxWidth: "100%", height: "auto", overflow: "visible" }}>
      {glow && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={10} opacity={0.18} strokeLinejoin="round" style={{ filter: "blur(6px)" }} />}
      <path d={d} fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
