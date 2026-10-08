/**
 * Territory domain: the geography only. Nothing here knows about activities, runs or scoring, and the tracking code
 * does not import this module, so later phases can attach ownership and coverage without restructuring either side.
 */

/** Extensible: add a member (and its rules in hierarchy.ts) to support a new kind of place. */
export const AREA_TYPES = ["COUNTRY", "DIVISION", "DISTRICT", "UPAZILA", "LOCAL_AREA"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

/**
 * `active`           boundary available, can be shown and selected
 * `boundary-pending` the place is real and selectable but has no boundary yet (a point stands in on the map)
 */
export type AreaStatus = "active" | "boundary-pending";

export interface LatLng {
  lat: number;
  lng: number;
}

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

/** Where an area's polygon lives. Geometry is kept out of the index so the map only downloads what it shows. */
export interface BoundaryRef {
  /** Chunk name; resolves to /geo/<country>/<chunk>.json (a GeoJSON FeatureCollection whose feature ids are area ids). */
  chunk: string;
}

export interface GeoArea {
  /** Stable, readable and unique, e.g. `bd-dis-dhaka`. */
  id: string;
  name: string;
  nameBn?: string;
  type: AreaType;
  /** null only for the country. */
  parentId: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Administrative level in the source data (0 country, 1 division, 2 district, 3 upazila/thana); null when not administrative. */
  adminLevel: number | null;
  center: LatLng;
  bbox: BBox | null;
  boundary: BoundaryRef | null;
  status: AreaStatus;
  /** Provenance and notes. Free-form on purpose: it never drives behaviour. */
  metadata: Record<string, string | number | boolean | null>;
}

export interface SourceLevel {
  level: string;
  license: string;
  source: string;
  sourceUrl: string;
  boundaryYear: string;
  units: number;
  canonical: string;
  buildDate: string;
}

export interface DataSources {
  name: string;
  url: string;
  repository: string;
  commit: string;
  levels: SourceLevel[];
  attribution: string;
}

export interface TerritoryIndexFile {
  schema: number;
  country: string;
  sources: DataSources;
  areas: GeoArea[];
}

/** GeoJSON subset we read. */
export type Ring = [number, number][];
export type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
export interface BoundaryFeature {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
}
export interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}
