/**
 * Cuts the OSM data for one area out of a PBF (a Geofabrik country extract, or a dated planet file) and writes it in the
 * Overpass JSON shape the mask builder already reads: highway ways with geometry, and building centres.
 *
 * It does what `osmium extract --strategy=simple` does, for one bounding box: nodes inside the box are kept, a way is kept if any
 * of its nodes is, and a way's geometry is the runs of consecutive nodes that are inside the box plus its margin. Eligibility is
 * decided later, by the unchanged builder; nothing about which ways count is decided here.
 */
import { eachRef, readPbf, refsOf, tagOf, tagsOf, type NodeVisitor, type PbfHeader, type ReadResult } from "./pbf";
import type { OverpassJson } from "./lib";

export type BBox = [number, number, number, number]; // west, south, east, north

const CHUNK_BITS = 23; // 8,388,608 ids per presence chunk, allocated only where the box has nodes

/** Remembers which node ids lie inside the box, cheaply enough to test billions of way references. */
class Presence {
  private chunks: (Uint8Array | undefined)[] = [];
  add(id: number): void {
    const c = Math.floor(id / 2 ** CHUNK_BITS);
    const local = id - c * 2 ** CHUNK_BITS;
    (this.chunks[c] ??= new Uint8Array(2 ** (CHUNK_BITS - 3)))[local >>> 3] |= 1 << (local & 7);
  }
  has(id: number): boolean {
    const chunk = this.chunks[Math.floor(id / 2 ** CHUNK_BITS)];
    if (!chunk) return false;
    const local = id % 2 ** CHUNK_BITS;
    return (chunk[local >>> 3] & (1 << (local & 7))) !== 0;
  }
}

export interface ExtractStats {
  nodesInBox: number;
  waysSeen: number;
  highwayWaysKept: number;
  /** Highway ways cut into several pieces because they leave the box margin and come back. */
  highwayWaysSplit: number;
  /** Highway ways whose geometry is cut off by the box margin (their ends lie outside it). */
  highwayWaysClipped: number;
  buildingsKept: number;
  buildingsSkippedPartial: number;
}

export interface Extract {
  roads: OverpassJson;
  buildings: OverpassJson;
  stats: ExtractStats;
  read: ReadResult;
  header: PbfHeader;
}

export async function extractBox(source: string, box: BBox, hooks: { progress?: (bytes: number) => void; onRetry?: (offset: number, attempt: number) => void } = {}): Promise<Extract> {
  const [w, s, e, n] = box;
  const presence = new Presence();
  const coords = new Map<number, [number, number]>();
  const roadElements: OverpassJson["elements"] = [];
  const buildingElements: OverpassJson["elements"] = [];
  const stats: ExtractStats = { nodesInBox: 0, waysSeen: 0, highwayWaysKept: 0, highwayWaysSplit: 0, highwayWaysClipped: 0, buildingsKept: 0, buildingsSkippedPartial: 0 };

  const visitor: NodeVisitor = {
    node(id, lat, lon) {
      if (lat >= s && lat <= n && lon >= w && lon <= e) {
        presence.add(id);
        coords.set(id, [lat, lon]);
        stats.nodesInBox++;
      }
    },
    way(id, refs, keys, vals, strings) {
      stats.waysSeen++;
      let touches = false;
      eachRef(refs, (r) => (touches = presence.has(r)));
      if (!touches) return;
      const highway = tagOf(keys, vals, strings, "highway");
      const building = highway === undefined ? tagOf(keys, vals, strings, "building") : undefined;
      if (highway === undefined && building === undefined) return;
      const nodes = refsOf(refs);
      if (highway !== undefined) {
        const tags = tagsOf(keys, vals, strings);
        // runs of consecutive nodes that are known; a gap is never bridged with a straight line
        const runs: number[][] = [];
        let run: number[] = [];
        for (const r of nodes) {
          if (coords.has(r)) run.push(r);
          else {
            if (run.length) runs.push(run);
            run = [];
          }
        }
        if (run.length) runs.push(run);
        const usable = runs.filter((x) => x.length >= 2);
        if (!usable.length) return;
        stats.highwayWaysKept++;
        if (usable.length > 1) stats.highwayWaysSplit++;
        if (usable.reduce((t, x) => t + x.length, 0) < nodes.length) stats.highwayWaysClipped++;
        for (const u of usable) roadElements.push({ type: "way", id, nodes: u, geometry: u.map((r) => ({ lat: (coords.get(r) as [number, number])[0], lon: (coords.get(r) as [number, number])[1] })), tags });
      } else {
        // a building is only a point for the completeness check: the centre of its bounding box, as Overpass `out center` gives
        const pts = nodes.map((r) => coords.get(r));
        if (pts.some((p) => !p)) {
          stats.buildingsSkippedPartial++;
          return;
        }
        const lats = (pts as [number, number][]).map((p) => p[0]);
        const lons = (pts as [number, number][]).map((p) => p[1]);
        stats.buildingsKept++;
        buildingElements.push({ type: "way", id, center: { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 }, tags: { building } as Record<string, string> });
      }
    },
  };

  const read = await readPbf(source, { visitor, progress: hooks.progress, onRetry: hooks.onRetry });
  // a fixed order, so the same data always gives the same file
  const order = (a: { id: number; nodes?: number[] }, b: { id: number; nodes?: number[] }) => a.id - b.id || (a.nodes?.[0] ?? 0) - (b.nodes?.[0] ?? 0);
  roadElements.sort(order);
  buildingElements.sort(order);
  return { roads: { elements: roadElements }, buildings: { elements: buildingElements }, stats, read, header: read.header };
}
