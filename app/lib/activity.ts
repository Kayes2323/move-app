import { ROUTES, type Checkpoint, type Route } from "../data/routes";

export type ActivityKind = "running" | "walking" | "cycling";

export interface RunEntry {
  id?: string;
  km: number;
  duration: string;
  date: string;
  calories?: number;
  pace?: number;
  steps?: number;
  activity?: string;
  /** Journey the activity counted towards, and total journey km after it (set on save). */
  routeName?: string;
  journeyKm?: number;
}

export interface Achievement {
  title: string;
  subtitle: string;
}

export const ACTIVITY_META: Record<ActivityKind, { label: string; noun: string; accent: string }> = {
  running: { label: "RUN", noun: "run", accent: "#FF5B3A" },
  walking: { label: "WALK", noun: "walk", accent: "#2DD4BF" },
  cycling: { label: "RIDE", noun: "ride", accent: "#C6F432" },
};

export function toKind(activity?: string): ActivityKind {
  return activity === "walking" || activity === "cycling" ? activity : "running";
}

/* ---------- formatting ---------- */

export function parseDurationSeconds(duration: string): number {
  const parts = duration.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

export function formatDuration(duration: string): string {
  const total = parseDurationSeconds(duration);
  if (total <= 0) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Pace is stored as decimal minutes per km. */
export function formatPace(pace?: number): string {
  if (!pace || pace <= 0 || !Number.isFinite(pace)) return "—";
  let m = Math.floor(pace);
  let s = Math.round((pace - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPerformance(kind: ActivityKind, pace?: number): string {
  if (!pace || pace <= 0) return "—";
  if (kind === "cycling") return `${(60 / pace).toFixed(1)} km/h`;
  return `${formatPace(pace)} /km`;
}

export function formatKm(km: number): string {
  if (km >= 100) return km.toFixed(1);
  return km.toFixed(2).replace(/(\.\d)0$/, "$1");
}

export function formatCardDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

/** Wrapped so components can read the clock from event handlers without tripping render-purity lint. */
export const nowMs = (): number => Date.now();

export function makeFileName(kind: ActivityKind): string {
  return `move-${ACTIVITY_META[kind].noun}-${nowMs()}.png`;
}

/* ---------- achievements ---------- */

export function detectAchievement(runs: RunEntry[], index: number): Achievement | null {
  const run = runs[index];
  if (!run || run.km < 1) return null;
  const kind = toKind(run.activity);
  const previous = runs.slice(0, index).filter((r) => r.km > 0 && toKind(r.activity) === kind);
  if (previous.length === 0) return null;

  const noun = ACTIVITY_META[kind].noun;
  if (run.km > Math.max(...previous.map((r) => r.km))) {
    return { title: "NEW PERSONAL BEST", subtitle: `Longest ${noun}` };
  }
  const comparable = previous.filter((r) => r.km >= 1 && r.pace && r.pace > 0);
  if (run.pace && run.pace > 0 && comparable.length > 0 && run.pace < Math.min(...comparable.map((r) => r.pace as number))) {
    return { title: "NEW PERSONAL BEST", subtitle: "Fastest pace" };
  }
  return null;
}

/* ---------- journey route geometry ---------- */

const DHAKA = { lat: 23.8103, lng: 90.4125 };

function normalise(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return n === "chittagong" ? "chattogram" : n;
}

export function findRoute(name?: string): Route | undefined {
  if (!name) return undefined;
  const key = normalise(name);
  return ROUTES.find((r) => normalise(r.name) === key || normalise(r.destination) === key || r.id === key);
}

export interface RoutePoint {
  name: string;
  type: Checkpoint["type"] | "start";
  km: number;
  x: number;
  y: number;
}

export interface PlotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteGeometry {
  points: RoutePoint[];
  progress: { x: number; y: number }[];
  here: { x: number; y: number };
  next: { name: string; km: number } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Projects the journey's real checkpoint coordinates into `box` (aspect preserved, centred). */
export function projectRoute(route: Route, box: PlotBox, progressKm: number, startKm = 0): RouteGeometry {
  const raw = [
    { name: "Dhaka", type: "start" as const, km: 0, lat: DHAKA.lat, lng: DHAKA.lng },
    ...route.checkpoints.map((c) => ({ name: c.name, type: c.type, km: c.distanceFromStart, lat: c.coords[0], lng: c.coords[1] })),
  ];
  const meanLat = raw.reduce((s, p) => s + p.lat, 0) / raw.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xs = raw.map((p) => p.lng * k);
  const ys = raw.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-6);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-6);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * scale) / 2;
  const oy = box.y + (box.h - spanY * scale) / 2;

  const points: RoutePoint[] = raw.map((p, i) => ({
    name: p.name,
    type: p.type,
    km: p.km,
    x: round1(ox + (xs[i] - minX) * scale),
    y: round1(oy + (ys[i] - minY) * scale),
  }));

  /** Position on the route polyline at an absolute route distance. */
  const pointAt = (km: number): { x: number; y: number } => {
    const d = Math.max(0, Math.min(km, route.totalKm));
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (d <= b.km) {
        const span = b.km - a.km;
        const t = span > 0 ? (d - a.km) / span : 0;
        return { x: round1(a.x + (b.x - a.x) * t), y: round1(a.y + (b.y - a.y) * t) };
      }
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y };
  };

  const from = Math.max(0, Math.min(startKm, route.totalKm));
  const done = Math.max(from, Math.min(progressKm, route.totalKm));
  const progress = [pointAt(from)];
  for (const p of points) if (p.km > from && p.km < done) progress.push({ x: p.x, y: p.y });
  if (done > from) progress.push(pointAt(done));

  const nextPoint = points.find((p) => p.km > done);
  return { points, progress, here: pointAt(done), next: nextPoint ? { name: nextPoint.name, km: nextPoint.km - done } : null };
}

/**
 * Route km at which the user's journey began. Index 0 means "from Dhaka" (0 km, even though the first listed
 * checkpoint is Jatrabari at 8 km); any other index starts at that checkpoint.
 */
export function journeyOffsetKm(route: Route | undefined, startCheckpointIndex?: number): number {
  if (!route || !startCheckpointIndex) return 0;
  return route.checkpoints[startCheckpointIndex]?.distanceFromStart ?? 0;
}

/* ---------- user stats ---------- */

/** A stored streak is only still alive if the last activity was today or yesterday. */
export function effectiveStreak(streak: number | undefined, lastRun: string | undefined, now: number): number {
  if (!streak || !lastRun) return 0;
  const last = new Date(lastRun);
  if (Number.isNaN(last.getTime())) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(last);
  lastDay.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - lastDay.getTime()) / 86400000);
  return days <= 1 ? streak : 0;
}

/** Overall pace in min/km, weighted by distance (a plain mean of per-run paces over-weights short runs). */
export function weightedPace(runs: RunEntry[]): number {
  let km = 0;
  let seconds = 0;
  for (const r of runs) {
    const secs = parseDurationSeconds(r.duration);
    if (r.km > 0 && secs > 0) {
      km += r.km;
      seconds += secs;
    }
  }
  return km > 0 ? seconds / 60 / km : 0;
}

/** 0/1 flags for the last `days` days (oldest first), based on the real activity dates. */
export function activityDays(runs: RunEntry[], days: number, now: number): number[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const grid = Array<number>(days).fill(0);
  for (const r of runs) {
    if (!(r.km > 0)) continue;
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const ago = Math.round((startOfToday.getTime() - d.getTime()) / 86400000);
    if (ago >= 0 && ago < days) grid[days - 1 - ago] = 1;
  }
  return grid;
}

/* ---------- photo ---------- */

/** Reads a user photo, applies EXIF orientation and downsizes so export stays fast on low-end phones. */
export async function loadPhoto(file: File, maxSide = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}
