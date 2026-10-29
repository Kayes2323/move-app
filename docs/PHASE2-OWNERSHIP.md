# Phase 2: Territory Owner, Top Explorers, Territory Conquered

Approved decisions: **hybrid, capped distance score** decides the Owner; **per-area requirement** (not literal 100% of cells) decides Territory Conquered.

## The three concepts (kept separate)
| Concept | Decided by | Can change? |
| --- | --- | --- |
| **Owner** | highest published Territory score (ties: reached first) | yes, any time |
| **Top Explorers** | the same score, ranked | yes |
| **Territory Conquered** | first person whose own validated exploration meets the area's requirement | **never** (create-only record) |

## Score (`app/lib/territory/coverage/score.ts`, `territory-score/1`)
Per qualifying eligible cell (from `explore()`: accuracy, speed, gap, spike, drift rules already applied; new `metres` output, cells unchanged):
* a cell credits **at most 40 m per Dhaka day**, on **at most 2 days** (the two earliest days);
* within a day the **best single pass** counts (max, not sum) => crediting is idempotent and order-independent without remembering activity ids;
* no multipliers; outside the area, cycling, unusable GPS: nothing. Max score of an area = 80 m x eligible cells.

| Case | Effect |
| --- | --- |
| Duplicate submit / retry / restart / second device | identical ledger (tested) |
| Repeat the same route the same day, several activities in a day | no growth |
| Same street on a 2nd day | counts once more; 3rd day onwards nothing |
| GPS loop in a few cells | bounded by 40 m per cell |
| Stationary drift, bad accuracy, impossible speed, long gap, spike | not credited (existing validation) |
| Offline sync in any order | same result |
| Switching area | each area has its own ledger; only the active area is updated |

## Data
* `users/{uid}/territoryScores/{areaId}` (private): compact ledger string, recent activity ids (efficiency only), score, scoreAt. Rebuilt from tracks if mask/algorithm/score-rule version changes.
* `territories/{a}/explorers/{uid}` (public): + `score`, `scoreAt`. Hidden athletes still compete, shown as "Move athlete" (no photo/username).
* `territories/{a}`: owner doc, `kind: "lead"`; events keep every reign; legacy conquest/takeover docs still read.
* `territoryAchievements/{a}`: unchanged, now backed by the claimant's own proof (or a legacy reign-1 event).

## Ownership transaction (`settleOwnership`)
Re-reads owner + both published scores inside a Firestore transaction; `leadDecision()` (pure, tested) decides; rules re-check: next reign only, challenger's published score must outrank the Owner's (`score >`, or equal with earlier `scoreAt`), server time for reign start. An Owner who was offline simply reclaims when they sync.

## Rules audit (real Firestore emulator, 53 checks)
Unauthorized/impersonated writes, other people's explorer docs, score above 80 m x explored cells, non-lead kinds, skipped reigns, ties, concurrent overtakes, permanent achievement immutability, private ledger access.

## Migration / compatibility
Non-destructive. Existing Owner docs (kind conquest/takeover) keep working; an Owner without a published score can be overtaken by anyone with a score. The 2x-takeover campaign is no longer used (state is cleared on next load); the pure takeover functions remain only as legacy code/tests.

## Honest limits
* Scores are computed on the phone. Rules bound them (<= 80 m per explored cell, explored cells bounded by the area) but cannot verify them: a modified client could still cheat. Real authority needs a Cloud Function re-computing from stored tracks.
* "First to conquer" = first recorded conquest, not earliest GPS time.
* Not verified on real devices or with production data.
* Production requires publishing the new `firestore.rules` first.
