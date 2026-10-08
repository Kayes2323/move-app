import { buildIndex, TerritoryDataError, type AreaIndex } from "./hierarchy";
import type { BoundaryCollection, BoundaryFeature, DataSources, GeoArea, TerritoryIndexFile } from "./types";

export const GEO_BASE = "/geo/bd";

export interface TerritoryData {
  index: AreaIndex;
  sources: DataSources;
}

type Fetcher = (url: string) => Promise<Response>;

/** Reads and checks the index file. Pure apart from `fetcher`, so tests can feed it good and bad data. */
export function parseIndexFile(raw: unknown): TerritoryData {
  const file = raw as Partial<TerritoryIndexFile> | null;
  if (!file || typeof file !== "object" || !Array.isArray(file.areas)) throw new TerritoryDataError("Territory index is missing its areas");
  if (file.schema !== 1) throw new TerritoryDataError(`Unsupported territory data version ${String(file.schema)}`);
  if (!file.sources) throw new TerritoryDataError("Territory index has no source information");
  return { index: buildIndex(file.areas as GeoArea[]), sources: file.sources };
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (err) {
    throw new TerritoryDataError(`Couldn't reach ${url}`, [String(err)]);
  }
  if (!res.ok) throw new TerritoryDataError(`Couldn't load ${url} (${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new TerritoryDataError(`${url} is not valid JSON`);
  }
}

let indexPromise: Promise<TerritoryData> | null = null;

/** Loaded once per page; a failure is not cached, so "Try again" really retries. */
export function loadTerritoryData(fetcher: Fetcher = (u) => fetch(u)): Promise<TerritoryData> {
  if (!indexPromise) {
    indexPromise = getJson(fetcher, `${GEO_BASE}/index.json`).then(parseIndexFile);
    indexPromise.catch(() => {
      indexPromise = null;
    });
  }
  return indexPromise;
}

const chunkCache = new Map<string, Promise<BoundaryCollection>>();

export function parseBoundaryCollection(raw: unknown, chunk: string): BoundaryCollection {
  const fc = raw as Partial<BoundaryCollection> | null;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new TerritoryDataError(`Boundary chunk "${chunk}" is malformed`);
  return fc as BoundaryCollection;
}

/** Boundary geometry for one chunk, fetched on demand and cached. */
export function loadBoundaryChunk(chunk: string, fetcher: Fetcher = (u) => fetch(u)): Promise<BoundaryCollection> {
  let p = chunkCache.get(chunk);
  if (!p) {
    p = getJson(fetcher, `${GEO_BASE}/${chunk}.json`).then((raw) => parseBoundaryCollection(raw, chunk));
    p.catch(() => chunkCache.delete(chunk));
    chunkCache.set(chunk, p);
  }
  return p;
}

/**
 * Polygons for a set of areas, in the order given. An area whose boundary is missing or absent from its chunk is
 * skipped and reported in `missing` rather than breaking the map.
 */
export async function loadBoundaries(areas: readonly GeoArea[], fetcher?: Fetcher): Promise<{ features: BoundaryFeature[]; missing: string[] }> {
  const chunks = [...new Set(areas.flatMap((a) => (a.boundary ? [a.boundary.chunk] : [])))];
  const loaded = new Map(await Promise.all(chunks.map(async (c) => [c, await loadBoundaryChunk(c, fetcher)] as const)));
  const features: BoundaryFeature[] = [];
  const missing: string[] = [];
  for (const area of areas) {
    const feature = area.boundary ? loaded.get(area.boundary.chunk)?.features.find((f) => f.id === area.id) : undefined;
    if (feature) features.push(feature);
    else missing.push(area.id);
  }
  return { features, missing };
}

/** Test hook. */
export function resetTerritoryCaches(): void {
  indexPromise = null;
  chunkCache.clear();
}
