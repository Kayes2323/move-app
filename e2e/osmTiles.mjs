// A stand-in for the street-map tile server, for tests that run where the real one cannot be reached.
//
// It draws map tiles from REAL OpenStreetMap street geometry (the same planet extract the Territory masks are built from,
// tools/territory-mask/cache/bd-osm/*.roads.ndjson), at the real Web-Mercator tile addresses, so a tile asked for at a place
// shows that place's actual streets. It is NOT CARTO and says nothing about how CARTO tiles look or whether CARTO is reachable
// from a phone: it only proves that the app asks for the right tiles for the real position and draws them in the right place.
import { readFileSync, existsSync } from "node:fs";

const DIR = new URL("../tools/territory-mask/cache/bd-osm/", import.meta.url);

/** All walkable ways of a district that touch the box [south, west, north, east]. */
export function waysIn(districtId, [s, w, n, e]) {
  const file = new URL(`${districtId}.roads.ndjson`, DIR);
  if (!existsSync(file)) throw new Error(`missing ${file.pathname}: the OSM extract is git-ignored; build it with tools/territory-mask/extract-bd.ts`);
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const way = JSON.parse(line);
    if (way.g.some(([la, lo]) => la >= s && la <= n && lo >= w && lo <= e)) out.push(way);
  }
  return out;
}

export const tileOf = (lat, lng, z) => {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), fx: x, fy: y };
};

/** Draws one tile in a scratch page (canvas -> PNG) and returns the PNG bytes. */
async function drawTile(helper, ways, z, x, y, dark) {
  const b64 = await helper.evaluate(
    ([ways, z, x, y, dark]) => {
      const S = 256;
      const n = 2 ** z;
      const px = (lat, lng) => {
        const fx = ((lng + 180) / 360) * n;
        const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
        return [(fx - x) * S, (fy - y) * S];
      };
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = dark ? "#1b1d22" : "#f1ede6";
      g.fillRect(0, 0, S, S);
      const grade = (h) => (/^(motorway|trunk)/.test(h) ? 3 : /^(primary|secondary)/.test(h) ? 2.4 : /^(tertiary|unclassified)/.test(h) ? 1.8 : /^(residential|living_street)/.test(h) ? 1.3 : 0.7);
      const scale = Math.max(0.6, (z - 12) * 0.9);
      const draw = (width, color) => {
        g.lineCap = g.lineJoin = "round";
        for (const way of ways) {
          g.beginPath();
          way.g.forEach(([la, lo], i) => {
            const [X, Y] = px(la, lo);
            if (i) g.lineTo(X, Y);
            else g.moveTo(X, Y);
          });
          g.lineWidth = width(way.t.highway || "") ;
          g.strokeStyle = typeof color === "function" ? color(way.t.highway || "") : color;
          g.stroke();
        }
      };
      draw((h) => grade(h) * scale + 1.6, dark ? "#2d3038" : "#cfc8bb");
      draw((h) => grade(h) * scale, (h) => (grade(h) < 1 ? (dark ? "#5b606b" : "#ffffff") : dark ? "#767c88" : "#ffffff"));
      return c.toDataURL("image/png").split(",")[1];
    },
    [ways, z, x, y, dark],
  );
  return Buffer.from(b64, "base64");
}

/**
 * Serves map tiles for every OpenStreetMap tile URL the page asks for. `mode.fail` makes the "server" answer 500 so the error and retry paths
 * can be tested. Returns counters: how many tiles were asked for, with the address of each.
 */
export async function installTiles(ctx, helper, ways) {
  const state = { fail: false, requests: [] };
  await ctx.route(/tile\.openstreetmap\.org\//, async (route) => {
    const m = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!m) return route.fulfill({ status: 404 });
    const [, z, x, y] = m;
    const style = "light";
    state.requests.push({ z: Number(z), x: Number(x), y: Number(y), dark: false });
    if (state.fail) return route.fulfill({ status: 500, body: "tile server down" });
    try {
      const png = await drawTile(helper, ways, Number(z), Number(x), Number(y), false);
      return await route.fulfill({ status: 200, contentType: "image/png", body: png });
    } catch {
      // the test finished (page closed) while a tile was still being drawn
    }
  });
  return state;
}

/**
 * A walk along real streets: the longest chain of connected ways around `near` that has real turns, sampled every ~3 m with
 * small deterministic GPS noise. Returns [{lat, lng}], never invented: every point is within a few metres of a mapped way.
 */
export function walkAlong(ways, near, { lengthM = 420, noiseM = 1.2 } = {}) {
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const byEnd = new Map();
  for (const w of ways) for (const end of [w.g[0], w.g[w.g.length - 1]]) (byEnd.get(key(end)) ?? byEnd.set(key(end), []).get(key(end))).push(w);
  const dist = (a, b) => Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180));
  const ok = (w) => !/^(motorway|trunk|footway|steps|path|track)/.test(w.t.highway || "");
  const starts = ways.filter(ok).sort((x, y) => dist(x.g[0], near) - dist(y.g[0], near)).slice(0, 60);
  const grow = (first) => {
    const chain = [...first.g];
    const used = new Set([first.id]);
    let tail = chain[chain.length - 1];
    const len = () => chain.reduce((acc, p, i) => (i ? acc + dist(chain[i - 1], p) : 0), 0);
    while (len() < lengthM) {
      const cands = (byEnd.get(key(tail)) ?? []).filter((w) => !used.has(w.id) && ok(w));
      if (!cands.length) break;
      // keep going along the longest continuation, which is what a person following a street does
      cands.sort((x, y) => y.g.length - x.g.length);
      const next = cands[0];
      used.add(next.id);
      const g = key(next.g[0]) === key(tail) ? next.g : [...next.g].reverse();
      chain.push(...g.slice(1));
      tail = chain[chain.length - 1];
    }
    return { chain, length: len() };
  };
  const chain = starts.map(grow).sort((x, y) => y.length - x.length)[0].chain;
  const out = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1];
    const b = chain[i];
    const steps = Math.max(1, Math.floor(dist(a, b) / 3));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push({ lat: a[0] + (b[0] - a[0]) * t + (rnd() * noiseM) / 111320, lng: a[1] + (b[1] - a[1]) * t + (rnd() * noiseM) / (111320 * Math.cos((a[0] * Math.PI) / 180)) });
    }
  }
  return out;
}
