# Territory: geographic exploration (pilot: Mohammadpur)

Territory is **exploration of real ground**, not an activity-distance challenge.

```
progress = explored eligible cells / total eligible cells
```

* **Eligible cells**: the real OSM-derived mask (`public/geo/bd/masks/bd-upa-dhaka-mohammadpur.json`, version `territory-mask/1:bd-upa-dhaka-mohammadpur:2d8866a921f6`): 5,783 cells owned by Mohammadpur, **3,880 eligible** (z20 cells, about 35 m, hidden, where a road or route exists). Source: OpenStreetMap, ODbL 1.0, planet-260928. Built and verified by `tools/territory-mask/`.
* **Explored**: a Walk or Run that started after the user chose the Territory, whose valid GPS track crosses an eligible cell (at least 15 m of trusted path, two bounding fixes, 10 m of net displacement) is exploring it. Phase 2a rules (`exploration/`): accuracy filter, smoothing, spike and teleport rejection, gap handling, standing-still handling.
* **Not counted**: ground outside Mohammadpur; cells that are not eligible; ground already explored (a cell counts once, forever); activity from before the Territory was chosen (no back-fill); cycling (deferred); the same activity id a second time (idempotent).
* **Never used**: activity distance, and the 19.411 km WGS84 perimeter (kept only as information: "the boundary is 19.4 km around").
* **Display**: one decimal, rounded down, never 100 until every eligible cell is explored (`99.9` at most). Remaining is rounded up.
* **Conquered**: 100%, recorded once, with the activity that explored the last cell.

## Layers
| Path | Role |
| --- | --- |
| `app/lib/territory/exploration/` | Phase 2a: cells, validation, `explore()`, union-only state semantics |
| `app/lib/territory/mask/` | Phase 2b runtime: `parseMask`, `scopeFromMask`, `loadMask` |
| `app/lib/territory/coverage/` | `applyActivity` (idempotent, no back-fill, single area), `coverageProgress`, `progressAfter`, storage format |
| `app/lib/territoryState.ts` | the one read-only adapter: finished activities + recorded tracks (tracking) in, coverage out |
| `app/territory/`, `app/components/ShareCards.tsx` | screens and cards |
| `app/lib/territory/conquest/` | geodesy, outline drawing, registry (boundary + perimeter). `credit/config/progress/store` are **superseded**, see SUPERSEDED.md |

Tracking is the source of truth for GPS and activities. The Territory domain imports nothing from tracking, history, activity or the run screen (tests enforce it); only `territoryState.ts` reads tracking data, and nothing writes back.

## Saved state (`users/{uid}.territory`)
`areaId, selectedAt, maskVersion, algorithmVersion, coverageVersion, cellRuns` (explored cell ids as runs), `applied` (`[activityId, newCells, atMs]` per processed activity), `completion`. Choosing again starts empty with a new `selectedAt`: earlier activity is never back-filled. Activities whose track isn't available yet are retried later.

## Screens
* `/territory`: choose Mohammadpur, percentage, remaining, new ground from recent moves, START MOVING
* `/run?territory=1`: live percentage (counting what this move has found), boundary progress visual, map with "You are here", a note when outside the area
* conquered: "TERRITORY CONQUERED", 100%, share
* Share Cards: activity (real GPS route, calories), Journey, Territory progress (percent, +new ground, remaining), Territory conquered (100%, moves, real km); chosen automatically (`app/lib/share/context.ts`)

## Not in this phase
King, 2x takeover, reclaim, battles, rankings, cycling rules. Morning/streak/activity multipliers are not part of the game: they would distort physical coverage and are deferred.

## Tests
`npm test` (`coverage/coverage.test.ts` uses the real mask), `npm run e2e conquest|liveTerritory|share`.
