# Territory: geographic exploration and Kings (pilot: Mohammadpur)

Territory is **exploration of real ground**, not an activity-distance challenge. Kilometres never count towards it.

```
conquest progress = explored eligible cells / required cells        (required = ceil(80% x eligible))
takeover progress = exploration credits since the reign began / (2 x required)
```

## Core rules (`territory-rules/1`, `app/lib/territory/coverage/rules.ts`)
* **Eligible cells**: the real OSM-derived mask (`public/geo/bd/masks/bd-upa-dhaka-mohammadpur.json`, version `territory-mask/1:bd-upa-dhaka-mohammadpur:2d8866a921f6`): 5,783 cells owned by Mohammadpur, **3,880 eligible** (z20 cells, about 35 m, hidden, where a road or route exists). Source: OpenStreetMap, ODbL 1.0, planet-260928. Built and verified by `tools/territory-mask/`.
* **Explored**: a Walk or Run that started after the user chose the Territory, whose valid GPS track crosses an eligible cell (at least 15 m of trusted path, two bounding fixes, 10 m of net displacement). Phase 2a rules (`exploration/`): accuracy filter, smoothing, spike and teleport rejection, gap handling, standing-still handling. Exploration thresholds are unchanged and versioned (`algorithmVersion`).
* **Not counted**: ground outside the active Territory; cells that are not eligible; ground already explored (a cell counts once for conquest); activity from before the Territory was chosen (`selectedAt`, no back-fill); cycling (excluded); the same activity id a second time (idempotent).
* **Never used**: activity distance, multipliers, and the 19.411 km perimeter (kept only as information). The superseded distance model (`conquest/credit|config|progress|store`) is not imported anywhere (a test enforces it).
* **Display**: one decimal, rounded down; 100 only when the requirement is met (99.9 at most before). Remaining is rounded up. The raw share of *all* eligible cells is kept and shown alongside ("x% of all its streets explored").

### Conquest threshold: 80%, and why
Analysis of the mask: 325 cells (8.4%) are eligible only via service roads/tracks/paths (often gated compounds and private lanes in Dhaka), 86 (2.2%) only along trunk roads, 184 (4.7%) lie outside the main connected road network. Together 559 cells (14.4%) are doubtful; the confidently public, connected part is 85.6%. 80% leaves a further ~5 point margin for GPS misses in dense lanes: hard, but achievable without entering every gated compound. Unreachable cells are **not** removed from the denominator; the threshold absorbs them. Required for Mohammadpur: **3,104 cells**.

### Takeover and reclaim: 2x, in new geographic exploration
* Taking a held Territory needs **2R = 6,208 credits**, counted from the later of the King's `reignStartedAt` and the challenger's `selectedAt`.
* A cell explored on one day earns 1 credit; explored again on a **different day** (Asia/Dhaka) it earns a 2nd. Never more than 2 per cell. So repeating the same road can't get there, and kilometres never count.
* No instant takeover: when credits reach 2R, the claim runs as a transaction (below). A new reign restarts every challenger's campaign.
* A former King reclaims under exactly the same rule. There is no automatic reclaim.

## Ownership (`territories/{areaId}`)
```
{ areaId, name, ownerUid, ownerName (first name), ownerPhoto (https or ""), reign, kind: conquest|takeover,
  reignStartedAt (server time), updatedAt, requiredCells, requiredCredits, rulesVersion, maskVersion }
territories/{areaId}/events/{reign}: { areaId, reign, kind, ownerUid, ownerName, ownerPhoto, previousOwnerUid, at }
```
* **Public data only**: first name and https photo from `publicProfiles`. No GPS, routes, cells, home or activity data are ever written to shared documents.
* **Claim** (`claim()` in `app/lib/territoryState.ts`): one Firestore transaction that re-reads the ownership doc, re-checks `claimDecision()` (`coverage/ownership.ts`), then writes the user's claim proof + win to `users/{uid}.territory`, the new ownership (reign + 1) and the event. Two simultaneous claims: only one commits; the other retries, sees the new King and becomes a challenger. Re-running is idempotent (`already-king`).
* **Firestore rules** (`firestore.rules`): only you can make yourself King; a create must be reign 1 + conquest with a claim proof of `explored >= requiredCells`; an update must be someone else, reign + 1, takeover, credits >= 2 x required and a campaign that started at or after the current reign; `reignStartedAt == request.time`; no deletes; events are create-only by the new King. Required cells are hard-coded per area in the rules.
* **Limitation (anti-cheat foundation, not full server authority)**: the claim proof is computed on the phone. The rules check it is consistent and race-safe, but a determined user with a modified client could forge the numbers. Full authority needs a server (Cloud Function re-computing coverage from stored tracks); there is no admin infrastructure yet.
* **Deploying the rules**: `firestore.rules` is not deployed automatically. Publish it in the Firebase console (Firestore → Rules) or `firebase deploy --only firestore:rules`. Until then reads of `territories` are denied and the app shows "Kings can't be shown right now" while still counting exploration.

## Saved state (`users/{uid}.territory`, `territory-coverage/2`)
Firestore-safe (no arrays inside arrays) and bounded:
`areaId, selectedAt, maskVersion, algorithmVersion, coverageVersion, cells` (flat runs `[start, len, ...]`), `applied` (last 120 `{i, n, t}` + `appliedLowWater`), `completion`, `campaign {reign, startedAt, once: [{d, c}], twice, applied}`, `wins` (last 20), `claim` (the proof). Version 1 records (nested arrays) are still read and rewritten as v2 on the next save: backward compatible, no data loss. Choosing again starts empty with a new `selectedAt`.

## Layers
| Path | Role |
| --- | --- |
| `app/lib/territory/exploration/` | Phase 2a: cells, validation, `explore()` |
| `app/lib/territory/mask/` | Phase 2b runtime: `parseMask`, `scopeFromMask`, `loadMask` |
| `app/lib/territory/coverage/` | `rules`, `coverage` (apply, progress, campaign, storage), `ownership` (standing, claim decision) |
| `app/lib/territoryState.ts` | the adapter: tracks in, coverage + ownership out, claim transaction |
| `app/territory/` | hub, King card, celebration, live screen and map, emblem |

## Active Territory (which area counts) — `app/lib/territory/active.ts`
* **Chosen, never assumed.** The active Territory is the area the user picked, saved with their account in `users/{uid}.territoryActive = { areaId, at }`. There is no default area: a user who never chose sees "Choose Territory". Not GPS, not the Journey route (the "Chandpur" shown on Home is the Journey's virtual route, `currentRoute`), never Mohammadpur by default. Accounts from before this field existed keep the area of their saved coverage (they chose it then). A regression test fails if any screen references the Mohammadpur id.
* **Which areas.** Upazilas and Dhaka city thanas (ADM3) from the real hierarchy (`public/geo/bd/index.json`). An area is **open** when its streets are mapped (an eligibility mask + registry entry): Mohammadpur only, for now. Any other area can be chosen; its screen says it isn't open yet and nothing counts there until it opens (then it starts empty from that moment).
* **Switching** (`setActiveTerritory`, one Firestore transaction on the user's own document, `update()` so maps are replaced, not merged):
  * the area that was active is parked whole in `territoryParked.{areaId}` (cells, applied activities, campaign, wins, claim) with `parkedAt`;
  * an area played before resumes exactly as it was, and the time away is added to its `gaps` ([from, to, ...], flat, at most 40 periods): activities that started in a gap never count for it (no back-fill), while takeover credits earned before are kept;
  * a new open area starts empty with `selectedAt = now`;
  * blocked while a move is recording or unfinished on the phone ("Finish your move first"), so a move always counts where it started;
  * **ownership is never touched**: `territories/*` is not read or written by a switch. A King who switches away stays King; nothing is reset, no event is created.
* Only the active area is ever brought up to date (`loadTerritory` returns nothing for a parked area). Share cards for older moves read the parked area read-only.
* Offline: the hub needs the account copy to know the active area and says so instead of guessing.

## Screens
* `/territory` hub: hero map (real boundary, outside dimmed, own explored ground as light, "you" dot only if location permission was already granted), area name with District · Division, **Change** button, one progress ring (conquered / to take over / to reclaim / King), one primary action, the King card, two stats, and a short "How Territory works". States: first time (Choose Territory), not open yet, unconquered, King, challenger (Take over), former King (Reclaim territory). Compact chips for pending sync, Kings unavailable, and current location vs active Territory ("You're in X · outside your Territory").
* Territory picker (opens from the hub; `/territory/areas` and `/territory?choose=1` open it): search, "Use my current location" (asks only when tapped, resolves the area from real boundaries, stores nothing), your Territories with % and crown, open areas, and Division → District → Upazila browsing. Every choice is confirmed: progress elsewhere stays safe, moves from now count toward the new area, and whether it is open.

* `/run?territory=1`: live %, separate "Distance" and "New Territory" chips, explored ground on the map, notes for outside / weak GPS / cycling.
* Celebration once per reign (conquest or takeover), then the Territory share card ("TERRITORY CONQUERED · KING" / "TERRITORY TAKEN · NEW KING").

## Needs real-device validation
GPS quality in dense lanes, background GPS when the screen locks (browsers pause it; native build helps), the 80% threshold against real walks, and multi-user takeovers on production Firestore after the rules are published.

## Tests
`npm test` (`coverage/coverage.test.ts`, `coverage/ownership.test.ts` use the real mask), `npm run e2e` (conquest, liveTerritory, share, switching, and the King/takeover/reclaim/race scenarios).
