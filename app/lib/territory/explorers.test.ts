import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, haversineM } from "./exploration/cells";
import { walk } from "./exploration/synthetic";
import { cellsOfMask, parseMask, scopeFromMask } from "./mask/scope";
import { applyActivity, coverageProgress, emptyCoverage, newChoice, type CoverageActivity } from "./coverage/coverage";
import { explorerOf, historyOf, parseConquered, parseExplorer, parseReignEvent, rankExplorers, sameExplorer, type Explorer } from "./explorers";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
const scope = scopeFromMask(mask);
const Z = mask.meta.cellZoom;
const T0 = 1_800_000_000_000;
const choice = newChoice(mask, T0 - 1000);
void cellsOfMask;

const runs = [...mask.runs].filter(([, len]) => len >= 14).sort((a, b) => b[1] - a[1]);
function street(i: number, t0: number) {
  const [start] = runs[i];
  const a = cellCenter(start, Z);
  const b = cellCenter(start + 11, Z);
  return walk({ from: a, eastM: 0, northM: haversineM(a, b) * -1, t0 });
}
const act = (id: string, i: number, startMs: number): CoverageActivity => ({ id, userId: "u1", kind: "walking", startMs, endMs: startMs + 600_000, points: street(i, startMs) });

const ex = (uid: string, score: number, scoreAt: number): Explorer => ({ uid, name: uid, photo: "", username: "", score, scoreAt, exploredCells: 1, requiredCells: 3104, moves: 1, lastGainAt: scoreAt });

test("ranking: higher score first", () => {
  assert.deepEqual(rankExplorers([ex("a", 10, 1), ex("b", 30, 2), ex("c", 20, 3)]).map((e) => e.uid), ["b", "c", "a"]);
});

test("TIE-BREAK: equal scores go to whoever reached them first; still tied, the smaller uid (stable, never random)", () => {
  assert.deepEqual(rankExplorers([ex("late", 50, 900), ex("early", 50, 100)]).map((e) => e.uid), ["early", "late"]);
  assert.deepEqual(rankExplorers([ex("zed", 50, 100), ex("abe", 50, 100)]).map((e) => e.uid), ["abe", "zed"]);
});

test("CONCURRENT UPDATES: the ranking does not depend on the order documents arrive in", () => {
  const people = [ex("a", 40, 5), ex("b", 40, 5), ex("c", 41, 9), ex("d", 7, 1), ex("e", 40, 2)];
  const want = rankExplorers(people).map((e) => e.uid);
  let seed = 7;
  for (let k = 0; k < 200; k++) {
    const shuffled = [...people].sort(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5);
    assert.deepEqual(rankExplorers(shuffled).map((e) => e.uid), want);
  }
  assert.deepEqual(want, ["c", "e", "a", "b", "d"]);
});

test("DYNAMIC OWNERSHIP OF THE LIST: a later valid contribution overtakes; the old leader keeps their own number", () => {
  const before = rankExplorers([ex("holder", 100, 1), ex("rival", 99, 2)]);
  assert.equal(before[0].uid, "holder");
  const after = rankExplorers([ex("holder", 100, 1), ex("rival", 101, 50)]);
  assert.equal(after[0].uid, "rival");
  assert.equal(after[1].score, 100);
});

test("the projection comes from validated coverage and is the same however often it is computed (duplicate sync, restart)", () => {
  let st = emptyCoverage(choice.areaId);
  const a1 = applyActivity(st, choice, scope, act("a1", 0, T0));
  st = a1.state;
  const once = explorerOf("u1", { name: "Rafi", photo: "" }, st, coverageProgress(st, mask, scope));
  assert.ok(once.exploredCells > 0);
  assert.equal(once.moves, 1);
  // the same activity synced again, on another device, after a restart: nothing changes
  const dup = applyActivity(st, choice, scope, act("a1", 0, T0));
  assert.equal(dup.status, "already-applied");
  const again = explorerOf("u1", { name: "Rafi", photo: "" }, dup.state, coverageProgress(dup.state, mask, scope));
  assert.deepEqual(again, once);
  assert.ok(sameExplorer(once, again)); // so nothing is even written
});

test("REPEATED ROUTE: walking the same street again adds no cells and does not move the projection or the tie-break time", () => {
  const first = applyActivity(emptyCoverage(choice.areaId), choice, scope, act("a1", 0, T0)).state;
  const p1 = explorerOf("u1", { name: "R", photo: "" }, first, coverageProgress(first, mask, scope));
  const second = applyActivity(first, choice, scope, act("a2", 0, T0 + 3 * 86_400_000));
  assert.equal(second.added, 0);
  const p2 = explorerOf("u1", { name: "R", photo: "" }, second.state, coverageProgress(second.state, mask, scope));
  assert.equal(p2.exploredCells, p1.exploredCells);
  assert.equal(p2.lastGainAt, p1.lastGainAt); // repeating a route cannot "re-reach" a count later or earlier
  assert.equal(p2.moves, 1);
});

test("a NEW street raises the count and the time it was reached", () => {
  const s1 = applyActivity(emptyCoverage(choice.areaId), choice, scope, act("a1", 0, T0)).state;
  const s2 = applyActivity(s1, choice, scope, act("a2", 3, T0 + 86_400_000));
  assert.ok(s2.added > 0);
  const p = explorerOf("u1", { name: "R", photo: "" }, s2.state, coverageProgress(s2.state, mask, scope));
  assert.equal(p.moves, 2);
  assert.equal(p.lastGainAt, T0 + 86_400_000 + 600_000);
});

test("STALE / UNCOUNTED activity: cycling and activity before the Territory was chosen add nothing", () => {
  const start = emptyCoverage(choice.areaId);
  assert.equal(applyActivity(start, choice, scope, { ...act("c1", 0, T0), kind: "cycling" }).added, 0);
  assert.equal(applyActivity(start, choice, scope, act("old", 0, T0 - 10 * 86_400_000)).status, "before-selection");
});

test("INVALID GPS: a track with no usable fixes explores nothing, so there is nothing to credit", () => {
  const bad: CoverageActivity = { ...act("bad", 0, T0), points: [{ lat: 23.76, lng: 90.36, t: T0, acc: 500 }, { lat: 23.77, lng: 90.37, t: T0 + 1000, acc: 500 }] };
  const out = applyActivity(emptyCoverage(choice.areaId), choice, scope, bad);
  assert.equal(out.added, 0);
});

test("explorer documents are parsed defensively; malformed ones are dropped, not shown", () => {
  const ok = parseExplorer("u1", { uid: "u1", name: "Rafi", photo: "https://x.test/p.jpg", username: "rafi_a", exploredCells: 12, requiredCells: 3104, moves: 2, lastGainAt: 5 });
  assert.equal(ok?.exploredCells, 12);
  assert.equal(parseExplorer("u1", null), null);
  assert.equal(parseExplorer("u1", { name: "x", exploredCells: -1, requiredCells: 1 }), null);
  assert.equal(parseExplorer("u1", { name: "x", exploredCells: "9", requiredCells: 1 }), null);
  assert.equal(parseExplorer("u1", { name: "x", photo: "javascript:1", exploredCells: 1, requiredCells: 1 })?.photo, "");
});

test("ownership history: newest first, malformed events dropped, former owners and the first conqueror stay listed", () => {
  const ev = (reign: number, uid: string, kind: string) => parseReignEvent({ reign, ownerUid: uid, kind, ownerName: uid, ownerPhoto: "", previousOwnerUid: null, at: reign * 1000 });
  const h = historyOf([ev(1, "a", "conquest"), ev(3, "a", "takeover"), null, ev(2, "b", "takeover"), parseReignEvent({ reign: 0, ownerUid: "x" })]);
  assert.deepEqual(h.map((e) => [e.reign, e.ownerUid]), [[3, "a"], [2, "b"], [1, "a"]]);
});

test("Territory Conquered: a record names the first conqueror and is read back unchanged", () => {
  const rec = parseConquered("bd-upa-dhaka-mohammadpur", { areaId: "bd-upa-dhaka-mohammadpur", uid: "u1", name: "Rafi", photo: "", username: "rafi_a", kind: "conquered", at: 123 });
  assert.equal(rec?.uid, "u1");
  assert.equal(rec?.atMs, 123);
  assert.equal(parseConquered("another-area", { areaId: "bd-upa-dhaka-mohammadpur", uid: "u1" }), null); // a record for another area is not this area's
  assert.equal(parseConquered("a", null), null);
});

/* ---------- who leads: the ownership decision ---------- */
import { leadDecision, standing, type Ownership } from "./coverage/ownership";
import { outranks } from "./explorers";

const owner = (uid: string, reign: number, kind: Ownership["kind"] = "lead"): Ownership => ({ areaId: "a", ownerUid: uid, ownerName: uid, ownerPhoto: "", reign, reignStartedAt: 1, kind });
const me = (score: number, scoreAt: number, uid = "me") => ({ uid, score, scoreAt });

test("OWNER: nobody owns it, so the first person with a score becomes Owner (reign 1); no score, no ownership", () => {
  assert.deepEqual(leadDecision(me(10, 1), null, null), { ok: true, reign: 1 });
  assert.equal(leadDecision(me(0, 1), null, null).ok, false);
});

test("OWNER: a strictly higher score takes the lead, the next reign; a lower or equal one does not", () => {
  assert.deepEqual(leadDecision(me(101, 9), owner("o", 3), me(100, 1, "o")), { ok: true, reign: 4 });
  assert.equal(leadDecision(me(99, 1), owner("o", 3), me(100, 9, "o")).reason, "owner-leads");
});

test("TIE: equal scores go to whoever reached it first; exactly equal never changes hands", () => {
  assert.equal(leadDecision(me(100, 5), owner("o", 1), me(100, 9, "o")).ok, true);
  assert.equal(leadDecision(me(100, 9), owner("o", 1), me(100, 5, "o")).ok, false);
  assert.equal(leadDecision(me(100, 5), owner("o", 1), me(100, 5, "o")).ok, false);
  assert.equal(outranks(me(100, 5, "a"), me(100, 5, "b")), false); // the uid only orders a list, it never takes ownership
});

test("the Owner is never 'taken' from themselves, and an Owner with no published score can be overtaken", () => {
  assert.equal(leadDecision(me(500, 1), owner("me", 2), null).reason, "already-owner");
  assert.deepEqual(leadDecision(me(5, 1), owner("old", 1, "conquest"), null), { ok: true, reign: 2 });
});

test("CONCURRENT: two challengers decided one after the other; the second must outrank the first, not the original Owner", () => {
  const first = leadDecision(me(300, 2, "c1"), owner("o", 1), me(100, 1, "o"));
  assert.equal(first.ok, true);
  const second = leadDecision(me(200, 3, "c2"), owner("c1", first.reign), me(300, 2, "c1"));
  assert.equal(second.ok, false);
});

test("HISTORY: an Owner who was overtaken is a former Owner; a conqueror who never owned it is just a challenger", () => {
  const st = (wins: { reign: number; kind: "conquest" | "takeover" }[], o: Ownership) => standing("me", o, { areaId: "a", cells: [], applied: [], wins: wins.map((w) => ({ ...w, activityId: null, atMs: 1 })) });
  assert.equal(st([{ reign: 1, kind: "takeover" }], owner("x", 2)), "former-king");
  assert.equal(st([{ reign: 1, kind: "conquest" }], owner("x", 2)), "challenger"); // conquering is an achievement, not ownership
  assert.equal(st([], owner("me", 2)), "king");
  assert.equal(st([{ reign: 1, kind: "conquest" }], owner("x", 2, "takeover")), "former-king"); // legacy reigns keep their meaning
});
