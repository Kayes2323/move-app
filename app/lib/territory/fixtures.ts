import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GeoArea, TerritoryIndexFile } from "./types";

export const GEO_DIR = join(process.cwd(), "public", "geo", "bd");
export const realFile = (): TerritoryIndexFile => JSON.parse(readFileSync(join(GEO_DIR, "index.json"), "utf8"));
export const readChunk = (chunk: string) => JSON.parse(readFileSync(join(GEO_DIR, `${chunk}.json`), "utf8"));

export const area = (over: Partial<GeoArea> & { id: string }): GeoArea => ({
  name: over.id,
  type: "DISTRICT",
  parentId: "bd",
  country: "BD",
  adminLevel: 2,
  center: { lat: 23.8, lng: 90.4 },
  bbox: null,
  boundary: { chunk: "x" },
  status: "active",
  metadata: {},
  ...over,
});

/** A tiny valid tree. */
export const tiny = (): GeoArea[] => [
  area({ id: "bd", type: "COUNTRY", parentId: null, adminLevel: 0 }),
  area({ id: "div", type: "DIVISION", parentId: "bd", adminLevel: 1 }),
  area({ id: "dis", type: "DISTRICT", parentId: "div" }),
  area({ id: "upa", type: "UPAZILA", parentId: "dis", adminLevel: 3 }),
  area({ id: "loc", type: "LOCAL_AREA", parentId: "dis", adminLevel: null, boundary: null, status: "boundary-pending" }),
];
