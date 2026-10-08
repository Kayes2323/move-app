import mohammadpur from "../../../data/territories/bd-upa-dhaka-mohammadpur.json";

export interface TerritoryTarget {
  version: string;
  /** What the game uses and shows. */
  targetKm: number;
  perimeterM: number;
  perimeterKm: number;
  method: string;
  holesIgnored: number;
  vertices: number;
  meanSegmentM: number;
  longestSegmentM: number;
  boundary: { dataset: string; repository: string; commit: string; shapeId: string; licence: string; sha256: string };
}

export interface TerritoryDefinition {
  id: string;
  name: string;
  target: TerritoryTarget;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  boundary: { type: "Polygon"; coordinates: [number, number][][] };
}

/** The Territories that can be played. One for now: the whole system is built and proven on Mohammadpur before it grows. */
export const TERRITORIES: readonly TerritoryDefinition[] = [mohammadpur as unknown as TerritoryDefinition];
export const MOHAMMADPUR_ID = "bd-upa-dhaka-mohammadpur";

export const getTerritory = (id: string | undefined | null): TerritoryDefinition | undefined => TERRITORIES.find((t) => t.id === id);
