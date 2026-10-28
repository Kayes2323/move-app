# Territory expansion: from one pilot area to all of Bangladesh

Status: **implemented locally, not deployed.** Awaiting review. The numbers for every area are in `docs/territory-areas/areas.md` (generated) and `tools/territory-mask/analysis/<areaId>.json` (one analysis per area).

## 1. Audit (what existed, and what assumed "Mohammadpur only")

Reusable as it was (nothing rebuilt):

| Piece | Where | Verdict |
| --- | --- | --- |
| Hierarchy Division > District > Upazila / city thana | `public/geo/bd/index.json` (618 areas), per-district boundary chunks | Correct and complete. 503 `UPAZILA`, 42 `LOCAL_AREA` (Dhaka city thanas, typed so they are never called upazilas), 64 districts, 8 divisions. One city thana (Shyamoli) has no boundary (`boundary-pending`). |
| Cell model, exploration rules, coverage, ownership, takeover/reclaim, race-safe claim | `app/lib/territory/{exploration,coverage}`, `territoryState.ts` | Area-independent already: keyed by `areaId` and the mask's own cell set. Unchanged. |
| Active Territory, parking, gaps (no back-fill), switch transaction | `territory/active.ts`, `setActiveTerritory` | Area-independent. Unchanged. |
| Mask builder | `tools/territory-mask` (`road-length/1`) | Reused unchanged. Mohammadpur's mask is byte-identical (a test proves it). |
| Chooser, map sheet, Territory hub | `app/territory/*` | Reused; their "open" test was a Mohammadpur-only list. |

Mohammadpur-only assumptions found, and what replaced them:

1. `conquest/registry.ts` statically imported one boundary JSON and `getTerritory` could only return it. **Now**: the pilot stays bundled; every other open area's boundary is fetched on demand from its district chunk (`loadTerritoryDef`). No new bundle weight per area.
2. `open.ts`, `TerritoryChooser`, `TerritoryMapSheet` each derived "open" from that registry. **Now**: one bundled catalog (`app/data/territory-catalog.json`, open areas only, generated).
3. `COMPLETION_THRESHOLD = 0.8` was global. **Now**: a per-area whole-percent threshold from the catalog (`requiredCells(eligible, areaId)`); 80 stays the default and Mohammadpur's value, so its required cells are still 3,104.
4. `firestore.rules` hard-coded `{ 'bd-upa-dhaka-mohammadpur': 3104 }`. **Now**: generated from the catalog, sharded so one request evaluates a small map.
5. The "not open" screens said only "streets aren't mapped". **Now**: OPEN / COMING_SOON / NOT_OPEN with the real reason (`public/geo/bd/territories.json`, fetched only when a Territory screen needs it).
6. `def.target` (the superseded distance model's perimeter) was required. **Now** optional: only the pilot has it, and the exploration rules never read it.

Not touched: Journey, tracking, activity modes, Territory ownership/threshold logic other than the per-area percent.

## 2. What counts as a playable Territory

The 503 upazilas and 42 Dhaka city thanas (545 areas; ADM3 in the BBS hierarchy). Divisions and districts are for browsing, search and the map only: a district-sized conquest (hundreds of kilometres of unique street) is not a Territory.

## 3. Data, and what I could and could not reach

* **Boundaries**: geoBoundaries gbOpen BGD ADM3 at the pinned commit (BBS / OCHA ROAP, CC BY 3.0 IGO), full resolution (not the simplified display copy). Vintage 2015/2020: upazilas created since are not in it.
* **Streets**: OpenStreetMap, planet-260928 (2026-09-28), ODbL 1.0, from the AWS Open Data copy, MD5 verified. This is the only OSM source this environment can reach (Geofabrik, Overpass and mirrors are blocked here), so the national extract is one streaming pass over the dated planet file: `tools/territory-mask/extract-bd.ts`.
* **Rule**: `road-length/1`, unchanged (a cell is eligible when at least 20 m of walkable OSM way lies inside it).
* **Not done and cannot be done from here**: real GPS walks, ground truth of which streets exist. The analysis measures the mask against OSM only.

## 4. How an area is judged (all of it computed, none of it guessed)

Per area (`tools/territory-mask/batch.ts`, reproducing the pilot's published analysis exactly: 325 minor-only, 86 trunk-only, 184 outside the main network, 559 doubtful, 85.6% confident):

* ownership and eligible cells, area km2, unique street km;
* doubtful cells: eligible only via service roads/tracks/paths, only via trunk roads, or outside the largest connected street network;
* connectivity (regions, largest share), built-up ground without a mapped street nearby (an OSM completeness signal), single-cell holes;
* validation: no duplicate or invalid cells, nothing outside the area, nothing in a neighbouring area, hash matches.

**Status policy (a proposal, in `batch.ts` `POLICY`; change the numbers and rerun):**

| Rule | Result |
| --- | --- |
| mask fails validation | NOT_OPEN |
| fewer than 300 eligible cells | NOT_OPEN (too few mapped streets) |
| 50%+ of built-up ground has no mapped street (50+ built-up cells) | COMING_SOON (OSM needs mapping first) |
| under 60% of mapped streets in one connected network (islands, rivers) | COMING_SOON |
| otherwise threshold = min(80, confident share - 5, the share that keeps the requirement at or under 8,000 cells), rounded down to 5 | OPEN if 40% or more, else NOT_OPEN (too large for one conquest, or too doubtful) |

The cap is 8,000 cells (about 280 km of different street at Dhaka's cell size; the pilot needs 3,104 cells, 109 km). Hajiganj, the priority upazila, has 15,736 eligible cells (552 km of street in 194 km2), so at 50% it needs 7,868 cells; at the first cap I tried (6,000) it would have stayed closed by 295 cells. The cap is my product decision, not a fact; every analysis lists the 80/70/60/50/40% figures so it can be changed and rerun.

The **takeover** requirement stays exactly 2 x the area's own requirement, in new cell credits, capped at 2 per cell per reign: it is always achievable (2R is at most 2 x eligible).

## 5. Rollout: verified batches

1. Pilot: Mohammadpur reproduced byte for byte from the same code path (test), national pipeline cross-checked against the committed inputs.
2. One national OSM pass (`extract-bd.ts`), then masks built district by district (`build-batch.ts`), starting with Dhaka division and the Chandpur analysis, then the rest by division.
3. `catalog.ts --publish` opens only areas that passed every check, and only their masks are copied to `public/` (the rest stay in the git-ignored cache; their analysis is committed).
4. Nothing is deployed until it is reviewed. Opening in production also needs `firestore.rules` published (generated; claims in an unpublished area are refused, exploration still counts locally).

## 6. Risks and limits (honest)

* **OSM completeness is unknown.** A rural lane that is not on OSM is not in the mask, and the area is slightly easier than it looks; a missing road never makes an area harder, because the threshold is a share of what is mapped.
* **Client-computed claims are still forgeable** (needs a Cloud Function; unchanged). The rules only keep the numbers consistent.
* **Firestore rules limits**: a long map literal could hit per-request expression limits. The map is sharded (at most ~40 entries evaluated); validate with the Firebase emulator before publishing.
* **Multi-part areas** (islands) draw their largest part on the emblem; the maps use the full shape.
* **Capacitor/static builds** bundle everything in `public/`: each open area adds its mask file. The total is reported below and in the delivery message.
* **Boundary vintage**: ADM3 2015/2020; areas split since then are part of their parent here.
* Mask version changes are safe: progress is stored as cell ids, recomputed against the current mask. Cells that stop being eligible stop counting; nothing is rewritten.

## 7. Results (real data, planet-260928; full table in `docs/territory-areas/areas.md`)

All 545 playable areas were built from the national extract (1,085,248 walkable highway ways and 13.4 M building centres in Bangladesh; MD5 verified). 544 have a boundary; Shyamoli (Dhaka city thana) has none in the boundary data and stays NOT_OPEN. **No mask failed validation and none leaks into a neighbour.** The pipeline was checked against the pilot twice: the same code path reproduces the committed Mohammadpur mask byte for byte, and the national extract gives 3,883 eligible cells for it against the committed 3,880 (the national file cuts ways at district boxes slightly differently; the committed pilot mask is kept as the truth).

| Division | OPEN | COMING_SOON | NOT_OPEN | Areas |
| --- | ---: | ---: | ---: | ---: |
| Barisal | 26 | 10 | 4 | 40 |
| Chittagong | 52 | 44 | 15 | 111 |
| Dhaka | 105 | 16 | 9 | 130 |
| Khulna | 39 | 19 | 6 | 64 |
| Mymensingh | 19 | 10 | 5 | 34 |
| Rajshani | 51 | 18 | 1 | 70 |
| Rangpur | 21 | 15 | 22 | 58 |
| Sylhet | 16 | 8 | 14 | 38 |
| **Total** | **329** | **140** | **76** | **545** |

* **Hajiganj (priority)**: OPEN at **50%**. 15,736 eligible cells (552 km of unique street, 194 km2), mask valid, 0 leakage; 97% of its streets are in one network once a 105 m unmapped link is allowed; only 306 cells depend on service roads/tracks. Conquest needs 7,868 cells (about 276 km of different street), takeover 15,736 credits. It is a large rural upazila: this is a long project, by design.
* **Chandpur Sadar**: stays **COMING_SOON** on real data: 12,620 eligible cells, but 47% of its 219 built-up cells have no mapped street nearby (the pilot has 0%). OpenStreetMap is missing too much of the town for a fair conquest.
* **Mohammadpur**: unchanged, 80%, 3,104 cells.
* Thresholds of the 329 open areas: 80%: 139, 75%: 32, 70%: 30, 65%: 26, 60%: 24, 55%: 30, 50%: 16, 45%: 11, 40%: 21; no conquest asks for more than 7,997 cells (the cap is 8,000).
* Closed: 76 NOT_OPEN, almost all "too large for one conquest" (even 40% would need more than 8,000 different cells: big towns and big rural upazilas), and 140 COMING_SOON: OSM mapping gaps around built-up ground (the main reason) or streets split into fragments even when short unmapped links are allowed (hill and char areas).
* Open areas add 27 MB of mask JSON to `public/` (about 5.8 MB gzipped on the web; the Capacitor package stores them compressed). They are fetched one at a time, only for the user's active area.

## 8. Known limits of these results

* OSM completeness is unknown beyond the built-up signal; rural villages have few dense building cells, so 224 of the open areas have too few built-up cells for the mapping-gap check to say anything (they pass it by default, not by evidence).
* Gated, military and airport ground (Cantonment, Biman Bandar) is only excluded where OSM tags it (`access=private/no`, `foot=no`).
* Nothing here was walked: real GPS validation of any area but the pilot is still to do.
* The policy numbers (8,000-cell cap, 40% floor, 30% mapping-gap gate, 105 m link, 5-point margin) are my proposals; `tools/territory-mask/recommend.ts` re-judges every area in seconds if any is changed.
