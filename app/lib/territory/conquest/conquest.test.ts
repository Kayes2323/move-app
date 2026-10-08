import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CONQUEST_CONFIG, CONQUEST_RULES_VERSION } from "./config";
import { activityMultiplier, creditForRun, localDay, morningShare, qualifyingDays, streakDayNumber, streakMultiplier, type HistoryRun } from "./credit";
import { geodesicM, pathLengthM } from "./geodesy";
import { conquestRing, ringProgress, simplifyTrack, toLngLat } from "./outline";
import { ceilKm, floorKm, liveProgress, territoryProgress, type TerritoryChoice } from "./progress";
import { getTerritory, MOHAMMADPUR_ID } from "./registry";

/** Dhaka is UTC+6: 05:00 local is 23:00 UTC the day before. */
const dhaka = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+06:00`);
let n = 0;
const run = (kind: HistoryRun["kind"], km: number, day: string, start: string, minutes = 40): HistoryRun => {
  const startMs = dhaka(day, start);
  return { id: `r${++n}`, kind, km, startMs, endMs: startMs + minutes * 60_000 };
};
const choice = (over: Partial<TerritoryChoice> = {}): TerritoryChoice => ({ areaId: MOHAMMADPUR_ID, selectedAt: dhaka("2026-01-01", "00:00"), targetKm: 19.4, ...over });

test("geodesic distance is exact on the ellipsoid (Geoscience Australia's Vincenty test line)", () => {
  const flinders = { lat: -(37 + 57 / 60 + 3.7203 / 3600), lng: 144 + 25 / 60 + 29.5244 / 3600 };
  const buninyong = { lat: -(37 + 39 / 60 + 10.1561 / 3600), lng: 143 + 55 / 60 + 35.3839 / 3600 };
  assert.ok(Math.abs(geodesicM(flinders, buninyong) - 54972.271) < 0.01, String(geodesicM(flinders, buninyong)));
  assert.equal(geodesicM(flinders, flinders), 0);
  assert.ok(Math.abs(geodesicM(flinders, buninyong) - geodesicM(buninyong, flinders)) < 1e-6);
  assert.ok(Math.abs(geodesicM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111319.49) < 0.1); // a degree of longitude at the equator
});

test("Mohammadpur's target is its real perimeter, recomputed here from the stored boundary", () => {
  const t = getTerritory(MOHAMMADPUR_ID)!;
  assert.ok(t);
  const ring = toLngLat(t.boundary.coordinates[0]);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const perimeter = pathLengthM(ring);
  assert.ok(Math.abs(perimeter - t.target.perimeterM) < 0.2, `${perimeter} vs ${t.target.perimeterM}`);
  assert.equal(t.target.targetKm, Math.round((perimeter / 1000) * 10) / 10);
  assert.equal(t.target.targetKm, 19.4);
  assert.equal(t.target.perimeterKm, 19.411);
  // not the area, not a cell count
  assert.notEqual(t.target.targetKm, 7.1);
  assert.equal(t.target.version, "territory-target/1");
  assert.match(t.target.boundary.commit, /^[0-9a-f]{40}$/);
  assert.match(t.target.boundary.sha256, /^[0-9a-f]{64}$/);
  assert.equal(t.target.holesIgnored, 0);
  assert.match(t.target.method, /Vincenty/);
});

test("morning window: inside, outside, crossing either edge, and across midnight", () => {
  const share = (day: string, a: string, mins: number) => morningShare(dhaka(day, a), dhaka(day, a) + mins * 60_000);
  assert.equal(share("2026-03-01", "06:00", 45), 1);
  assert.equal(share("2026-03-01", "05:00", 60), 1);
  assert.equal(share("2026-03-01", "17:00", 60), 0);
  assert.equal(share("2026-03-01", "04:30", 60), 0.5); // 04:30-05:30
  assert.equal(share("2026-03-01", "08:30", 60), 0.5); // 08:30-09:30
  assert.equal(share("2026-03-01", "09:00", 30), 0);
  assert.equal(share("2026-03-01", "04:00", 360), 4 / 6); // 04:00-10:00 holds the whole window
  const overnight = morningShare(dhaka("2026-03-01", "23:00"), dhaka("2026-03-02", "05:30"));
  assert.ok(Math.abs(overnight - 0.5 / 6.5) < 1e-9);
  // an instantaneous activity uses its start time
  assert.equal(morningShare(dhaka("2026-03-01", "07:00"), dhaka("2026-03-01", "07:00")), 1);
  // the morning is local time, not UTC: 23:00 UTC is 05:00 in Dhaka
  assert.equal(morningShare(Date.parse("2026-03-01T23:30:00Z"), Date.parse("2026-03-02T00:00:00Z")), 1);
  assert.equal(morningShare(Date.parse("2026-03-01T05:30:00Z"), Date.parse("2026-03-01T06:00:00Z")), 0); // 11:30 local
});

test("activity multipliers: walk 1.0, run 1.25, morning run 1.5, morning walk unchanged, blended at the edge", () => {
  assert.equal(activityMultiplier("walking", 0), 1);
  assert.equal(activityMultiplier("running", 0), 1.25);
  assert.equal(activityMultiplier("running", 1), 1.5);
  assert.equal(activityMultiplier("walking", 1), 1);
  assert.equal(activityMultiplier("running", 0.5), 1.375);
});

test("streak multiplier table, and Day 7 onward stays at the top", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 30].map((d) => streakMultiplier(d)), [1, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5, 1.5]);
  assert.equal(streakMultiplier(0), 1);
});

test("streak days count consecutive local days with enough Walk or Run distance", () => {
  const h = [run("walking", 2, "2026-05-01", "18:00"), run("running", 1, "2026-05-02", "18:00"), run("walking", 3, "2026-05-03", "18:00"), run("walking", 4, "2026-05-05", "18:00")];
  const days = qualifyingDays(h);
  assert.equal(streakDayNumber(localDay(dhaka("2026-05-03", "18:00")), days), 3);
  assert.equal(streakDayNumber(localDay(dhaka("2026-05-05", "18:00")), days), 1); // the 4th was missed
  assert.equal(streakDayNumber(localDay(dhaka("2026-05-04", "18:00")), days), 4); // a run today continues the streak
  // a day under the minimum does not count, cycling does not count, two short ones on one day add up
  const weak = qualifyingDays([run("walking", 0.3, "2026-05-01", "10:00"), run("cycling", 20, "2026-05-02", "10:00"), run("walking", 0.3, "2026-05-03", "10:00"), run("running", 0.3, "2026-05-03", "18:00")]);
  assert.deepEqual([...weak], [localDay(dhaka("2026-05-03", "10:00"))]);
});

test("credit: exact activity distance is kept, bonuses multiply, then the cap applies", () => {
  const r = run("running", 7.32, "2026-05-07", "06:00");
  const day1 = creditForRun(r, 1);
  assert.equal(day1.actualKm, 7.32);
  assert.equal(day1.multiplier, 1.5); // morning run, Day 1
  assert.equal(day1.creditKm, 10.98);
  assert.equal(r.km, 7.32); // the input is untouched
  const day4 = creditForRun(r, 4);
  assert.ok(Math.abs(day4.multiplier - 1.8) < 1e-9);
  const day7 = creditForRun(r, 7); // 1.5 x 1.5 = 2.25, capped
  assert.equal(day7.multiplier, 2);
  assert.equal(day7.capped, true);
  assert.equal(day7.creditKm, 14.64);
  assert.equal(creditForRun(run("walking", 4.2, "2026-05-07", "18:00"), 1).creditKm, 4.2);
  assert.equal(creditForRun(run("running", 4, "2026-05-07", "18:00"), 1).creditKm, 5);
  assert.equal(creditForRun(run("cycling", 10, "2026-05-07", "18:00"), 1).creditKm, 0); // deferred
  assert.equal(creditForRun(run("walking", 0, "2026-05-07", "18:00"), 1).creditKm, 0);
  assert.equal(day1.rulesVersion, CONQUEST_RULES_VERSION);
});

test("progress: the worked example from the product brief", () => {
  const a = run("walking", 4.2, "2026-05-10", "17:00");
  const day1 = territoryProgress([a], choice());
  assert.equal(day1.progressKm, 4.2);
  assert.equal(floorKm(day1.progressKm), "4.2");
  assert.equal(day1.percent, 21);
  const b = run("walking", 5.0, "2026-05-11", "17:00"); // the same road again the next day
  const day2 = territoryProgress([a, b], choice());
  assert.equal(day2.progressKm, 9.2);
  assert.equal(day2.moves, 2);
  assert.equal(ceilKm(day2.remainingKm), "10.2");
  // the activity distances are exactly what was walked
  assert.equal(day2.actualKm, 9.2);
});

test("repeated routes count again, on the same day and on later days; Run and Walk both contribute", () => {
  const repeats = [1, 2, 3].map((i) => run("walking", 3, `2026-06-0${i}`, "17:00"));
  assert.equal(territoryProgress(repeats, choice()).moves, 3);
  const twice = [run("running", 2, "2026-06-05", "17:00"), run("running", 2, "2026-06-05", "19:00")];
  assert.equal(territoryProgress(twice, choice()).progressKm, 5);
  const both = territoryProgress([run("walking", 1, "2026-06-07", "17:00"), run("running", 1, "2026-06-07", "19:00")], choice());
  assert.equal(both.progressKm, 2.25);
});

test("location does not matter: progress is a function of distance and time only", () => {
  const r = run("walking", 4.2, "2026-05-10", "17:00");
  // what the progress function is given has no location at all, so where the activity happened cannot matter
  assert.equal(Object.keys(r).sort().join(), "endMs,id,kind,km,startMs");
  const hajiganj = territoryProgress([{ ...r, where: "Hajiganj" } as HistoryRun], choice());
  const mohammadpur = territoryProgress([{ ...r, where: "Mohammadpur" } as HistoryRun], choice());
  assert.deepEqual(hajiganj, mohammadpur);
  assert.equal(hajiganj.progressKm, 4.2);
});

test("only activities that start after the Territory was chosen count", () => {
  const before = run("walking", 5, "2026-04-01", "17:00");
  const after = run("walking", 3, "2026-04-03", "17:00");
  const c = choice({ selectedAt: dhaka("2026-04-02", "12:00") });
  assert.equal(territoryProgress([before, after], c).progressKm, 3);
  const exact = run("walking", 1, "2026-04-04", "12:00");
  assert.equal(territoryProgress([exact], choice({ selectedAt: exact.startMs })).progressKm, 1);
  assert.equal(territoryProgress([], c).percent, 0);
});

test("conquest: progress stops exactly on the target and never shows above 100%", () => {
  const c = choice({ targetKm: 19.4 });
  const history = [run("walking", 10, "2026-07-01", "17:00"), run("walking", 8, "2026-07-02", "17:00")];
  const almost = territoryProgress(history, c);
  assert.equal(almost.progressKm, 18);
  assert.equal(almost.conquered, false);
  assert.equal(almost.percent, 92);
  // 17.99 km short of nothing: 99.x % must not display as 100
  const nearly = territoryProgress([run("walking", 19.39, "2026-07-03", "17:00")], c);
  assert.equal(nearly.percent, 99);
  assert.equal(floorKm(nearly.progressKm), "19.3");
  assert.equal(ceilKm(nearly.remainingKm), "0.1");
  assert.equal(nearly.conquered, false);
  // the move that crosses the line is trimmed to land exactly on it
  const last = run("walking", 6, "2026-07-03", "17:00");
  const done = territoryProgress([...history, last], c);
  assert.equal(done.conquered, true);
  assert.equal(done.progressKm, 19.4);
  assert.equal(done.percent, 100);
  assert.equal(done.remainingKm, 0);
  assert.equal(done.completion?.runId, last.id);
  assert.equal(done.completion?.moves, 3);
  assert.equal(done.completion?.actualKm, 24);
  assert.equal(done.contributions[2].appliedKm, 1.4);
  // anything after it does not change a finished Territory
  const more = territoryProgress([...history, last, run("walking", 9, "2026-07-04", "17:00")], c);
  assert.deepEqual(more.completion, done.completion);
  assert.equal(more.progressKm, 19.4);
  assert.equal(more.moves, 3);
  assert.equal(floorKm(19.4), "19.4");
});

test("multipliers change Territory progress only, never the real distance", () => {
  const r = run("running", 7.32, "2026-08-01", "06:00");
  const p = territoryProgress([r], choice());
  assert.equal(p.progressKm, 10.98);
  assert.equal(p.actualKm, 7.32);
  assert.equal(r.km, 7.32);
  const bonus = p.contributions[0];
  assert.equal(bonus.actualKm, 7.32);
  assert.ok(bonus.creditKm > bonus.actualKm);
});

test("live progress counts the activity in progress as if it ended now", () => {
  const done = run("walking", 3, "2026-09-01", "17:00");
  const current: HistoryRun = { id: "live", kind: "walking", km: 1.5, startMs: dhaka("2026-09-02", "17:00"), endMs: dhaka("2026-09-02", "17:30") };
  assert.equal(liveProgress([done], current, choice()).progressKm, 4.5);
  // a stale copy of the same activity in the history is replaced, not added twice
  assert.equal(liveProgress([done, { ...current, km: 1 }], current, choice()).progressKm, 4.5);
});

test("the boundary is a progress visual, not a route: clockwise from the north, proportional to the real length", () => {
  const t = getTerritory(MOHAMMADPUR_ID)!;
  const ring = conquestRing(toLngLat(t.boundary.coordinates[0]));
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const northmost = Math.max(...ring.map((p) => p.lat));
  assert.equal(ring[0].lat, northmost);
  const total = pathLengthM(ring);
  assert.deepEqual(ringProgress(ring, 0), []);
  assert.equal(ringProgress(ring, 1).length, ring.length);
  for (const f of [0.1, 0.25, 0.5, 0.72, 0.99]) {
    const part = ringProgress(ring, f);
    assert.ok(Math.abs(pathLengthM(part) - total * f) < 0.5, `${f}`);
  }
  // clockwise: leaving the northern start, the ring heads east before it heads west
  const mid = ringProgress(ring, 0.1);
  assert.ok(mid[mid.length - 1].lng > ring[0].lng - 0.002);
});

test("track simplification keeps the real shape: a line collapses, a corner and a loop survive", () => {
  const line = Array.from({ length: 50 }, (_, i) => ({ lng: 90.36 + i * 0.00001, lat: 23.76 }));
  assert.equal(simplifyTrack(line, 2).length, 2);
  const corner = [...line, ...Array.from({ length: 50 }, (_, i) => ({ lng: 90.36 + 49 * 0.00001, lat: 23.76 + (i + 1) * 0.00001 }))];
  const s = simplifyTrack(corner, 2);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], { lng: 90.36 + 49 * 0.00001, lat: 23.76 });
  const loop = Array.from({ length: 73 }, (_, i) => ({ lng: 90.36 + 0.0005 * Math.cos((i * Math.PI) / 36), lat: 23.76 + 0.0005 * Math.sin((i * Math.PI) / 36) }));
  assert.ok(simplifyTrack(loop, 2).length > 12);
  assert.deepEqual(simplifyTrack([], 2), []);
});

test("the configuration is one frozen source and states its own version", () => {
  assert.equal(CONQUEST_CONFIG.rulesVersion, CONQUEST_RULES_VERSION);
  assert.throws(() => {
    "use strict";
    (CONQUEST_CONFIG as { maxCombinedMultiplier: number }).maxCombinedMultiplier = 99;
  }, TypeError);
  assert.equal(CONQUEST_CONFIG.timezone.offsetMinutes, 360);
});

test("the distance-based Territory code never touches the retired cell model or tracking", () => {
  for (const f of readdirSync(__dirname).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const text = readFileSync(join(__dirname, f), "utf8");
    const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) assert.ok(!/exploration|\/mask|selection|tracking|territory-mask/.test(spec), `${f} imports ${spec}`);
    assert.ok(!/z20|cellId|eligible|cellOf/i.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), `${f} mentions cells`);
  }
});
