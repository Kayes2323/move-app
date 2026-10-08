import { AREA_TYPES, type AreaType, type GeoArea } from "./types";

/** Which type each type may sit under. The rules live in data so a new type is a one-line change. */
export const ALLOWED_PARENTS: Record<AreaType, readonly AreaType[]> = {
  COUNTRY: [],
  DIVISION: ["COUNTRY"],
  DISTRICT: ["DIVISION"],
  UPAZILA: ["DISTRICT"],
  // A named place is not necessarily an administrative unit: it may sit under a district, an upazila or another local area.
  LOCAL_AREA: ["DISTRICT", "UPAZILA", "LOCAL_AREA"],
};

/** Types a user may make the active Territory area. All of them for now; later phases can narrow this. */
export const SELECTABLE_TYPES: readonly AreaType[] = AREA_TYPES;

export const AREA_TYPE_LABEL: Record<AreaType, string> = {
  COUNTRY: "Country",
  DIVISION: "Division",
  DISTRICT: "District",
  UPAZILA: "Upazila",
  LOCAL_AREA: "Local area",
};

export const AREA_TYPE_LABEL_PLURAL: Record<AreaType, string> = {
  COUNTRY: "countries",
  DIVISION: "divisions",
  DISTRICT: "districts",
  UPAZILA: "upazilas",
  LOCAL_AREA: "local areas",
};

export interface AreaIndex {
  readonly root: GeoArea;
  readonly all: readonly GeoArea[];
  get(id: string): GeoArea | undefined;
  childrenOf(id: string): GeoArea[];
  /** From the country down to and including `id`. Empty when `id` is unknown. */
  pathTo(id: string): GeoArea[];
  /** Direct children grouped by type, in AREA_TYPES order (a district holds upazilas and local areas side by side). */
  childTypes(id: string): AreaType[];
}

export class TerritoryDataError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
    this.name = "TerritoryDataError";
  }
}

export function validateAreas(areas: readonly GeoArea[]): string[] {
  const problems: string[] = [];
  const byId = new Map<string, GeoArea>();
  for (const a of areas) {
    if (byId.has(a.id)) problems.push(`duplicate id ${a.id}`);
    byId.set(a.id, a);
  }
  const roots = areas.filter((a) => a.parentId === null);
  if (roots.length !== 1) problems.push(`expected exactly one root, found ${roots.length}`);

  for (const a of areas) {
    if (!a.id || !a.name) problems.push(`area without id or name (${a.id || "?"})`);
    if (!AREA_TYPES.includes(a.type)) problems.push(`${a.id}: unknown type ${String(a.type)}`);
    if (!Number.isFinite(a.center?.lat) || !Number.isFinite(a.center?.lng) || Math.abs(a.center.lat) > 90 || Math.abs(a.center.lng) > 180) {
      problems.push(`${a.id}: invalid centre`);
    }
    if (a.parentId === null) {
      if (a.type !== "COUNTRY") problems.push(`${a.id}: only a country may have no parent`);
      continue;
    }
    const parent = byId.get(a.parentId);
    if (!parent) {
      problems.push(`${a.id}: parent ${a.parentId} does not exist`);
      continue;
    }
    if (AREA_TYPES.includes(a.type) && !ALLOWED_PARENTS[a.type].includes(parent.type)) problems.push(`${a.id}: a ${a.type} cannot sit under a ${parent.type}`);
    if (a.status === "active" && !a.boundary) problems.push(`${a.id}: active area without a boundary`);
  }

  // A cycle never reaches the root.
  for (const a of areas) {
    const seen = new Set<string>();
    let cur: GeoArea | undefined = a;
    while (cur && cur.parentId !== null) {
      if (seen.has(cur.id)) {
        problems.push(`${a.id}: parent cycle`);
        break;
      }
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
  }
  return problems;
}

/** Throws TerritoryDataError listing every problem, so bad data fails loudly in one place instead of as a blank map. */
export function buildIndex(areas: readonly GeoArea[]): AreaIndex {
  const problems = validateAreas(areas);
  if (problems.length) throw new TerritoryDataError(`Territory data is invalid (${problems.length} problems)`, problems);

  const byId = new Map(areas.map((a) => [a.id, a]));
  const kids = new Map<string, GeoArea[]>();
  for (const a of areas) {
    if (a.parentId === null) continue;
    const list = kids.get(a.parentId);
    if (list) list.push(a);
    else kids.set(a.parentId, [a]);
  }
  for (const list of kids.values()) list.sort((x, y) => x.name.localeCompare(y.name));
  const root = areas.find((a) => a.parentId === null) as GeoArea;

  return {
    root,
    all: areas,
    get: (id) => byId.get(id),
    childrenOf: (id) => kids.get(id) ?? [],
    pathTo(id) {
      const path: GeoArea[] = [];
      let cur = byId.get(id);
      while (cur) {
        path.unshift(cur);
        cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
      }
      return path;
    },
    childTypes(id) {
      const present = new Set((kids.get(id) ?? []).map((k) => k.type));
      return AREA_TYPES.filter((t) => present.has(t));
    },
  };
}

/** "Dhaka District · Dhaka Division" style context line for an area (its parents, nearest first, country omitted). */
export function contextLine(index: AreaIndex, id: string): string {
  const path = index.pathTo(id);
  return path
    .slice(1, -1)
    .reverse()
    .map((a) => a.name)
    .join(" · ");
}
