import { projectOnGround, type StoryStat, type XY } from "./story";

/** Drawing of the MOVE story card on a canvas. Browser only; the numbers and the route come from story.ts. */
export interface StoryDraw {
  width: number;
  height: number;
  /** The user's own photo, or null (a plain dark background is drawn; no stock photo is ever used). */
  photo: CanvasImageSource & { width: number; height: number } | null;
  /** Photo framing: zoom >= 1, x/y in -1..1 (which part of the overflow is shown). */
  frame: { zoom: number; x: number; y: number };
  /** Unit-square route stretches (see routeForStory). Empty: no route is drawn. */
  route: XY[][];
  routeStyle: "ground" | "flat";
  stats: StoryStat[];
  panel: boolean;
  color: string;
  /** MOVE mark (white-ified when drawn). */
  mark: CanvasImageSource | null;
  /** Under the panel: "RUN · 6 Nov 2026". */
  caption: string;
  /** Transparent background, for a sticker on top of an Instagram story. */
  sticker: boolean;
}

const FONT = '"Archivo", system-ui, sans-serif';
const FONT_BLK = '"Archivo Black", "Archivo", system-ui, sans-serif';

function cover(ctx: CanvasRenderingContext2D, img: NonNullable<StoryDraw["photo"]>, w: number, h: number, f: StoryDraw["frame"]) {
  const s = Math.max(w / img.width, h / img.height) * Math.max(1, f.zoom);
  const dw = img.width * s;
  const dh = img.height * s;
  const ox = ((dw - w) / 2) * (1 + Math.max(-1, Math.min(1, f.x)));
  const oy = ((dh - h) / 2) * (1 + Math.max(-1, Math.min(1, f.y)));
  ctx.drawImage(img, -ox, -oy, dw, dh);
}

function background(ctx: CanvasRenderingContext2D, d: StoryDraw) {
  const { width: w, height: h } = d;
  if (d.sticker) return;
  if (d.photo) {
    cover(ctx, d.photo, w, h, d.frame);
    // a soft darkening where the route and the panel sit, so they read on any photo
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0B0D0B");
  g.addColorStop(1, "#151A15");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = ctx.createRadialGradient(w / 2, h * 0.82, 10, w / 2, h * 0.82, w * 0.9);
  r.addColorStop(0, hexA(d.color, 0.22));
  r.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}

const hexA = (hex: string, a: number) => {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const lighten = (hex: string) => {
  const m = hex.replace("#", "");
  const n = parseInt(m, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.65);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
};

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (c: number) => Math.round(c * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/**
 * Strokes projected stretches with a width that follows depth. Consecutive segments of similar depth are drawn as ONE path, so the
 * glow does not pile up into beads at every joint.
 */
function strokeByDepth(ctx: CanvasRenderingContext2D, stretches: { x: number; y: number; scale: number }[][], width: number, dy: number) {
  const BANDS = 10;
  for (const s of stretches) {
    let band = -1;
    let open = false;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      const bnd = Math.round(((a.scale + b.scale) / 2) * BANDS);
      if (bnd !== band) {
        if (open) ctx.stroke();
        band = bnd;
        ctx.lineWidth = (width * bnd) / BANDS;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + dy * a.scale);
        open = true;
      }
      ctx.lineTo(b.x, b.y + dy * b.scale);
    }
    if (open) ctx.stroke();
  }
}

/** The route laid on the ground like a raised neon strip: a dark side wall, a wide glow and a bright core, thicker near the viewer. */
function groundRoute(ctx: CanvasRenderingContext2D, d: StoryDraw, nearY: number, farY: number) {
  const g = { cx: d.width / 2, nearY, farY, nearW: d.width * 1.4, depth: 3.4 };
  const stretches = d.route.map((s) => s.map((p) => projectOnGround(p, g)));
  const w = d.width / 1080;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // a soft shadow where the strip touches the ground
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 30 * w;
  strokeByDepth(ctx, stretches, 46 * w, 22 * w);
  // the side wall of the raised strip
  ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(d.color, 0.42);
  strokeByDepth(ctx, stretches, 38 * w, 14 * w);
  // glow
  ctx.strokeStyle = hexA(d.color, 0.95);
  ctx.shadowColor = d.color;
  ctx.shadowBlur = 55 * w;
  strokeByDepth(ctx, stretches, 36 * w, 0);
  // top face and bright core
  ctx.shadowBlur = 12 * w;
  ctx.strokeStyle = d.color;
  strokeByDepth(ctx, stretches, 30 * w, 0);
  ctx.shadowBlur = 8 * w;
  ctx.strokeStyle = lighten(d.color);
  strokeByDepth(ctx, stretches, 11 * w, 0);
  ctx.restore();
}

/** Top-down, for a sticker or a "flat" card: the shape as recorded, framed in a box. */
function flatRoute(ctx: CanvasRenderingContext2D, d: StoryDraw, box: { x: number; y: number; size: number }) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = () => {
    ctx.beginPath();
    for (const s of d.route) s.forEach((p, i) => (i ? ctx.lineTo(box.x + p.x * box.size, box.y + p.y * box.size) : ctx.moveTo(box.x + p.x * box.size, box.y + p.y * box.size)));
  };
  ctx.shadowColor = d.color;
  ctx.shadowBlur = 36;
  ctx.strokeStyle = hexA(d.color, 0.95);
  ctx.lineWidth = Math.max(10, box.size * 0.022);
  path();
  ctx.stroke();
  ctx.shadowBlur = 10;
  ctx.strokeStyle = lighten(d.color);
  ctx.lineWidth = Math.max(4, box.size * 0.009);
  path();
  ctx.stroke();
  ctx.restore();
}

function markAt(ctx: CanvasRenderingContext2D, d: StoryDraw, x: number, y: number, h: number) {
  if (!d.mark) return;
  const img = d.mark as HTMLImageElement;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.filter = "brightness(0) invert(1)";
  ctx.drawImage(d.mark, x, y, w, h);
  ctx.restore();
}

/** The stats panel: brand on top, then each stat as a small label over a big value, like a race bib. */
function panel(ctx: CanvasRenderingContext2D, d: StoryDraw, x: number, y: number, w: number) {
  const pad = w * 0.1;
  const rowH = w * 0.36;
  const head = w * 0.3;
  const h = head + d.stats.length * rowH + pad * 0.6;
  ctx.save();
  ctx.fillStyle = "rgba(6,8,6,0.86)";
  ctx.strokeStyle = d.color;
  ctx.lineWidth = Math.max(3, w * 0.012);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, w * 0.03);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const markH = head * 0.36;
  ctx.font = `800 ${Math.round(head * 0.26)}px ${FONT}`;
  const word = "MOVE";
  const ww = ctx.measureText(word).width;
  const mw = d.mark ? (((d.mark as HTMLImageElement).width / (d.mark as HTMLImageElement).height) * markH) : 0;
  const gap = d.mark ? markH * 0.25 : 0;
  const start = x + w / 2 - (mw + gap + ww) / 2;
  markAt(ctx, d, start, y + head * 0.32, markH);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(word, start + mw + gap, y + head * 0.32 + markH * 0.86);
  ctx.textAlign = "center";
  d.stats.forEach((s, i) => {
    const ty = y + head + i * rowH;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = `600 ${Math.round(rowH * 0.2)}px ${FONT}`;
    ctx.fillText(s.label, x + w / 2, ty + rowH * 0.32);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${Math.round(rowH * 0.36)}px ${FONT}`;
    fitText(ctx, s.value, x + w / 2, ty + rowH * 0.74, w - pad);
  });
  ctx.restore();
  return h;
}

function fitText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, max: number) {
  const m = ctx.measureText(t).width;
  if (m <= max) return ctx.fillText(t, x, y);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(max / m, 1);
  ctx.fillText(t, 0, 0);
  ctx.restore();
}

export function drawStory(ctx: CanvasRenderingContext2D, d: StoryDraw) {
  const { width: w, height: h } = d;
  ctx.clearRect(0, 0, w, h);
  background(ctx, d);

  if (d.sticker) {
    // the shape of the route, then one line of stats and the brand: placed by the user on their own story
    const size = w * 0.72;
    if (d.route.length) flatRoute(ctx, d, { x: (w - size) / 2, y: h * 0.05, size });
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 14;
    const line = d.stats.slice(0, 3).map((s) => s.value).join("   ·   ");
    ctx.font = `800 ${Math.round(w * 0.06)}px ${FONT}`;
    fitText(ctx, line, w / 2, h * 0.86, w * 0.92);
    ctx.font = `900 ${Math.round(w * 0.045)}px ${FONT_BLK}`;
    ctx.fillStyle = d.color;
    ctx.fillText("MOVE", w / 2, h * 0.95);
    ctx.restore();
    return;
  }

  const story = h / w > 1.5;
  if (d.route.length) {
    if (d.routeStyle === "ground") groundRoute(ctx, d, h * (story ? 0.95 : 0.95), h * (story ? 0.57 : 0.47));
    else flatRoute(ctx, d, { x: w * 0.08, y: h * (story ? 0.52 : 0.4), size: Math.min(w * 0.6, h * 0.42) });
  }
  if (d.panel && d.stats.length) {
    const pw = w * 0.36;
    const px = w - pw - w * 0.06;
    const py = h * (story ? 0.15 : 0.08);
    const ph = panel(ctx, d, px, py, pw);
    if (d.caption) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 10;
      ctx.font = `700 ${Math.round(pw * 0.075)}px ${FONT}`;
      ctx.fillText(d.caption, px + pw / 2, py + ph + pw * 0.12);
      ctx.restore();
    }
  } else {
    // no panel: the brand alone, small, top left
    markAt(ctx, d, w * 0.06, h * 0.05, w * 0.06);
  }
}
