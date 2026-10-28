/**
 * Turns the committed per-area analyses into everything the app and the rules need, so an area opens by data, never by editing code:
 *
 *   node --import tsx tools/territory-mask/catalog.ts [--publish]
 *
 *   app/data/territory-catalog.json       OPEN areas only: threshold, eligible/required cells, mask version (bundled, tiny, synchronous)
 *   public/geo/bd/territories.json        every other area: COMING_SOON or NOT_OPEN with its reason (fetched only when a screen needs it)
 *   firestore.rules                       the per-area conquest requirement, between the `generated:begin/end` markers
 *   docs/territory-areas/areas.md         the full table (every area, its numbers and its status)
 *
 * With --publish it also copies the mask of every OPEN area from tools/territory-mask/cache/bd-masks to public/geo/bd/masks.
 * Mohammadpur (the pilot) is never rebuilt or replaced: its committed mask and numbers are authoritative.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TM = join(ROOT, "tools", "territory-mask");
const publish = process.argv.includes("--publish");
const PILOT = "bd-upa-dhaka-mohammadpur";

interface Area { id: string; name: string; type: string; parentId: string; boundary: { chunk: string } | null }
const index = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "index.json"), "utf8")) as { areas: Area[] };
const byId = new Map(index.areas.map((a) => [a.id, a]));
const playable = index.areas.filter((a) => a.type === "UPAZILA" || a.type === "LOCAL_AREA");
const districtOf = (a: Area) => byId.get(a.parentId)?.name ?? a.parentId;
const divisionOf = (a: Area) => byId.get(byId.get(a.parentId)?.parentId ?? "")?.name ?? "";

interface Analysis {
  areaId: string;
  maskVersion?: string;
  validation?: { ok: boolean };
  counts?: { ownedCells: number; eligibleCells: number; areaKm2: number; uniqueStreetKm: number };
  quality?: { confidentShare: number; largestShare: number; gapShare: number; builtUpCells: number };
  maskBytes?: number;
  recommendation: { status: "OPEN_CANDIDATE" | "COMING_SOON" | "NOT_OPEN"; reason: string; percent: number | null; requiredCells: number | null };
}
const analyses = new Map<string, Analysis>();
const dir = join(TM, "analysis");
if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".json")) analyses.set(f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, f), "utf8")));

/* the pilot: its committed mask is the truth */
const pilotMask = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "masks", `${PILOT}.json`), "utf8")) as { maskVersion: string; meta: { counts: { eligibleCells: number } } };

type Open = { name: string; percent: number; eligibleCells: number; requiredCells: number; streetKm: number | null; areaKm2: number | null; maskVersion: string; chunk: string };
const open: Record<string, Open> = {};
const closed: Record<string, { s: "C" | "N"; r: string }> = {};
const rows: { a: Area; status: string; reason: string; eligible: number | null; percent: number | null; required: number | null; km: number | null; km2: number | null }[] = [];

for (const a of playable.sort((x, y) => x.id.localeCompare(y.id))) {
  const an = analyses.get(a.id);
  if (a.id === PILOT) {
    const e = pilotMask.meta.counts.eligibleCells;
    open[a.id] = { name: a.name, percent: 80, eligibleCells: e, requiredCells: Math.ceil((e * 80) / 100), streetKm: an?.counts?.uniqueStreetKm ?? null, areaKm2: an?.counts?.areaKm2 ?? null, maskVersion: pilotMask.maskVersion, chunk: a.boundary!.chunk };
    rows.push({ a, status: "OPEN", reason: "pilot", eligible: e, percent: 80, required: open[a.id].requiredCells, km: an?.counts?.uniqueStreetKm ?? null, km2: an?.counts?.areaKm2 ?? null });
    continue;
  }
  if (!an) {
    closed[a.id] = { s: "N", r: "its streets haven't been checked for Territory yet" };
    rows.push({ a, status: "NOT_OPEN", reason: "not analysed", eligible: null, percent: null, required: null, km: null, km2: null });
    continue;
  }
  const rec = an.recommendation;
  const maskFile = join(TM, "cache", "bd-masks", `${a.id}.json`);
  const published = existsSync(join(ROOT, "public", "geo", "bd", "masks", `${a.id}.json`));
  if (rec.status === "OPEN_CANDIDATE" && an.validation?.ok && an.counts && rec.percent && (publish ? existsSync(maskFile) : published || existsSync(maskFile))) {
    open[a.id] = { name: a.name, percent: rec.percent, eligibleCells: an.counts.eligibleCells, requiredCells: Math.ceil((an.counts.eligibleCells * rec.percent) / 100), streetKm: an.counts.uniqueStreetKm, areaKm2: an.counts.areaKm2, maskVersion: an.maskVersion!, chunk: a.boundary!.chunk };
    rows.push({ a, status: "OPEN", reason: rec.reason, eligible: an.counts.eligibleCells, percent: rec.percent, required: open[a.id].requiredCells, km: an.counts.uniqueStreetKm, km2: an.counts.areaKm2 });
    continue;
  }
  const s = rec.status === "COMING_SOON" ? "C" : "N";
  closed[a.id] = { s, r: rec.status === "OPEN_CANDIDATE" ? "its mask is not available" : rec.reason };
  rows.push({ a, status: s === "C" ? "COMING_SOON" : "NOT_OPEN", reason: closed[a.id].r, eligible: an.counts?.eligibleCells ?? null, percent: null, required: null, km: an.counts?.uniqueStreetKm ?? null, km2: an.counts?.areaKm2 ?? null });
}

if (publish) {
  mkdirSync(join(ROOT, "public", "geo", "bd", "masks"), { recursive: true });
  for (const id of Object.keys(open)) {
    if (id === PILOT) continue;
    copyFileSync(join(TM, "cache", "bd-masks", `${id}.json`), join(ROOT, "public", "geo", "bd", "masks", `${id}.json`));
  }
}

/* bundled catalog (open areas) and lazily loaded closed list */
const sortedOpen = Object.fromEntries(Object.entries(open).sort(([x], [y]) => x.localeCompare(y)));
writeFileSync(join(ROOT, "app", "data", "territory-catalog.json"), JSON.stringify({ schema: 1, areas: sortedOpen }, null, 1) + "\n");
writeFileSync(join(ROOT, "public", "geo", "bd", "territories.json"), JSON.stringify({ schema: 1, note: "Areas that are not open, with why. Open areas are in the app's bundled catalog.", areas: Object.fromEntries(Object.entries(closed).sort(([x], [y]) => x.localeCompare(y))) }) + "\n");

/* firestore.rules: sharded so one request only evaluates a small map (the rules language limits expressions per request) */
const entries = Object.entries(sortedOpen).map(([id, a]) => [id, a.requiredCells] as const);
const SHARD = Math.max(40, Math.ceil(entries.length / 10));
const shards: (readonly [string, number])[][] = [];
for (let i = 0; i < entries.length; i += SHARD) shards.push(entries.slice(i, i + SHARD) as (readonly [string, number])[]);
const lit = (s: (readonly [string, number])[]) => `({ ${s.map(([id, n]) => `'${id}': ${n}`).join(", ")} }).get(areaId, 1000000000)`;
const body = shards.length <= 1 ? lit(shards[0] ?? []) : shards.map((s, i) => (i === shards.length - 1 ? lit(s) : `areaId < '${shards[i + 1][0][0]}' ? ${lit(s)} : `)).join("");
const rulesPath = join(ROOT, "firestore.rules");
let rules = readFileSync(rulesPath, "utf8");
const begin = "// generated:begin requiredCells (tools/territory-mask/catalog.ts)";
const end = "// generated:end requiredCells";
const block = `${begin}\n      return ${body};\n      ${end}`;
if (rules.includes(begin)) rules = rules.replace(new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end}`), block);
else rules = rules.replace(/return \(\{ 'bd-upa-dhaka-mohammadpur': 3104 \}\)\.get\(areaId, 1000000000\);/, block);
rules = rules.replace("ceil(80% of its eligible cells). Must match app/lib/territory/coverage/rules.ts.", "ceil(its own threshold x its eligible cells), generated from the validated area catalog (app/data/territory-catalog.json).");
writeFileSync(rulesPath, rules);

/* the full table */
const md: string[] = ["# Territory areas: status of every playable area", "", "Generated by `tools/territory-mask/catalog.ts` from `tools/territory-mask/analysis/`. Do not edit.", ""];
const count = (s: string) => rows.filter((r) => r.status === s).length;
md.push(`**${rows.length} areas**: ${count("OPEN")} OPEN, ${count("COMING_SOON")} COMING_SOON, ${count("NOT_OPEN")} NOT_OPEN.`, "", "| Division | District | Area | Status | Eligible cells | Threshold | Required cells | Unique street km | km2 | Why |", "|---|---|---|---|---:|---:|---:|---:|---:|---|");
for (const r of rows.sort((x, y) => divisionOf(x.a).localeCompare(divisionOf(y.a)) || districtOf(x.a).localeCompare(districtOf(y.a)) || x.a.name.localeCompare(y.a.name)))
  md.push(`| ${divisionOf(r.a)} | ${districtOf(r.a)} | ${r.a.name}${r.a.type === "LOCAL_AREA" ? " (city thana)" : ""} | ${r.status} | ${r.eligible ?? ""} | ${r.percent ? r.percent + "%" : ""} | ${r.required ?? ""} | ${r.km ?? ""} | ${r.km2 ?? ""} | ${r.reason} |`);
mkdirSync(join(ROOT, "docs", "territory-areas"), { recursive: true });
writeFileSync(join(ROOT, "docs", "territory-areas", "areas.md"), md.join("\n") + "\n");
console.log(`open ${Object.keys(open).length}, coming soon ${count("COMING_SOON")}, not open ${count("NOT_OPEN")} of ${rows.length}; rules shards ${shards.length}`);
