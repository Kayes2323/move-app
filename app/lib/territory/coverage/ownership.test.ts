import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellsOfMask, parseMask, scopeFromMask } from "../mask/scope";
import { newCampaign, newChoice, type CoverageState } from "./coverage";
import { alignCampaign, campaignTarget, claimDecision, parseOwnership, publicName, standing, type Ownership } from "./ownership";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
const scope = scopeFromMask(mask);
const AREA = mask.meta.areaId;
const eligible = [...cellsOfMask(mask)];
const T0 = 1_800_000_000_000;
const choice = newChoice(mask, T0);
const king = (uid: string, reign: number, startedAt = T0 + 1000): Ownership => ({ areaId: AREA, ownerUid: uid, ownerName: "Kayes", ownerPhoto: "", reign, reignStartedAt: startedAt, kind: reign === 1 ? "conquest" : "takeover" });
const explored = (n: number): CoverageState => ({ areaId: AREA, cells: eligible.slice(0, n), applied: [] });
/** A campaign against a reign, with `twice` cells credited twice and `once` once. */
const withCampaign = (st: CoverageState, reign: number, startedAt: number, twice: number, once = 0): CoverageState => ({
  ...st,
  campaign: { ...newCampaign(reign, startedAt), twice: eligible.slice(0, twice), once: new Map(eligible.slice(twice, twice + once).map((c) => [c, 1])) },
});

test("standing: unclaimed, king, challenger, former king", () => {
  assert.equal(standing("me", null, explored(0)), "unclaimed");
  assert.equal(standing("me", king("me", 1), explored(0)), "king");
  assert.equal(standing("me", king("other", 1), explored(0)), "challenger");
  assert.equal(standing("me", king("other", 2), { ...explored(0), wins: [{ reign: 1, kind: "conquest", activityId: "a", atMs: 1 }] }), "former-king");
});

test("unconquered -> conquered: only when the user's own coverage reaches the threshold", () => {
  assert.deepEqual(claimDecision("me", null, explored(3103), mask, scope), { ok: false, kind: "conquest", reign: 1, have: 3103, need: 3104, reason: "not-enough" });
  const d = claimDecision("me", null, explored(3104), mask, scope);
  assert.equal(d.ok, true);
  assert.equal(d.kind, "conquest");
  assert.equal(d.reign, 1);
});

test("a King cannot claim again (no duplicate conquest from retries)", () => {
  const d = claimDecision("me", king("me", 1), explored(3880), mask, scope);
  assert.equal(d.ok, false);
  assert.equal(d.reason, "already-king");
});

test("takeover needs physical exploration: 2x the requirement in credits earned since the reign began", () => {
  const owner = king("other", 1);
  const target = campaignTarget("me", owner, choice)!;
  assert.deepEqual(target, { reign: 1, startedAt: owner.reignStartedAt });
  // full coverage from before the reign, but no campaign credits: no takeover
  const old = alignCampaign(explored(3880), target).state;
  assert.equal(claimDecision("me", owner, old, mask, scope).ok, false);
  // 3,103 cells twice = 6,206 credits: just short
  const short = withCampaign(explored(3880), 1, owner.reignStartedAt, 3103, 1);
  const s = claimDecision("me", owner, short, mask, scope);
  assert.equal(s.ok, false);
  assert.equal(s.have, 6207);
  assert.equal(s.need, 6208);
  const enough = withCampaign(explored(3880), 1, owner.reignStartedAt, 3104);
  const e = claimDecision("me", owner, enough, mask, scope);
  assert.equal(e.ok, true);
  assert.equal(e.kind, "takeover");
  assert.equal(e.reign, 2);
});

test("same-cell repetition cannot satisfy a takeover: every cell explored once (3,880 credits) is not enough", () => {
  const onceEach = withCampaign(explored(3880), 1, T0 + 1000, 0, 3880);
  const d = claimDecision("me", king("other", 1), onceEach, mask, scope);
  assert.equal(d.have, 3880);
  assert.equal(d.ok, false);
});

test("race: two challengers qualify against reign 3; once one wins, the other's campaign is stale and cannot win", () => {
  const reign3 = king("x", 3);
  const a = withCampaign(explored(3880), 3, reign3.reignStartedAt, 3104);
  const b = withCampaign(explored(3880), 3, reign3.reignStartedAt, 3104);
  assert.equal(claimDecision("a", reign3, a, mask, scope).ok, true);
  assert.equal(claimDecision("b", reign3, b, mask, scope).ok, true);
  // A's transaction commits first; B's transaction re-reads and sees reign 4 owned by A
  const reign4 = king("a", 4, T0 + 9000);
  const late = claimDecision("b", reign4, b, mask, scope);
  assert.equal(late.ok, false);
  assert.equal(late.reason, "stale-campaign");
});

test("former King reclaims under the same rule, never automatically", () => {
  const owner = king("thief", 2, T0 + 5000);
  const me: CoverageState = { ...explored(3880), wins: [{ reign: 1, kind: "conquest", activityId: "a", atMs: 1 }] };
  const aligned = alignCampaign(me, campaignTarget("me", owner, choice)).state;
  assert.equal(standing("me", owner, aligned), "former-king");
  assert.equal(claimDecision("me", owner, aligned, mask, scope).ok, false, "having held it before gives nothing");
  const earned = withCampaign(aligned, 2, owner.reignStartedAt, 3104);
  assert.equal(claimDecision("me", owner, earned, mask, scope).ok, true);
});

test("a campaign started before the reign is not accepted", () => {
  const owner = king("other", 2, T0 + 5000);
  const early = withCampaign(explored(3880), 2, T0, 3880);
  assert.equal(claimDecision("me", owner, early, mask, scope).reason, "stale-campaign");
});

test("ownership documents expose only a first name and an https photo; anything malformed is ignored", () => {
  const o = parseOwnership({ areaId: AREA, ownerUid: "u", ownerName: "Kayes Ahmed", ownerPhoto: "javascript:alert(1)", reign: 2, reignStartedAt: 123, kind: "takeover", email: "x@y.z" }, AREA)!;
  assert.equal(o.ownerPhoto, "");
  assert.equal("email" in o, false);
  assert.equal(parseOwnership({ areaId: AREA, ownerUid: "u", reign: 0, reignStartedAt: 1 }, AREA), null);
  assert.equal(parseOwnership({ areaId: "elsewhere", ownerUid: "u", reign: 1, reignStartedAt: 1 }, AREA), null);
  assert.equal(parseOwnership({ areaId: AREA, ownerUid: "u", reign: 1, reignStartedAt: { toMillis: () => 77 } }, AREA)!.reignStartedAt, 77);
  assert.equal(publicName("Kayes Ahmed Chowdhury"), "Kayes");
  assert.equal(publicName("   "), "Runner");
  assert.equal(publicName(null), "Runner");
});
