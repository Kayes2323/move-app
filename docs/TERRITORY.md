# Territory: Phase 1 (foundation)

Phase 1 is geography only: a data model, a map to browse it, and one "active area" selection. There is no GPS
coverage, ownership, King, conquest, scoring or anti-cheat. Nothing in the tracking code imports Territory, and
Territory does not import tracking.

## Layout
| Path | Role |
| --- | --- |
| `app/lib/territory/types.ts` | `GeoArea`, `AreaType`, boundary and source types |
| `app/lib/territory/hierarchy.ts` | parent rules (`ALLOWED_PARENTS`), validation, `buildIndex` (children, path to root) |
| `app/lib/territory/selection.ts` | pure selection state: `focusId` (where the map looks) and `activeId` (the Territory area) |
| `app/lib/territory/data.ts` | loads and validates `/geo/bd/index.json`, loads boundary chunks on demand, caches |
| `app/lib/territory/zoom.ts` | zoom levels at which each area type reads well (labels today, loading later) |
| `app/lib/territory/useTerritory.ts` | React hook: load, selection, save/restore |
| `app/territory/` | `/territory` screen and the Leaflet map |
| `public/geo/bd/` | generated data (index, divisions, districts, one chunk of upazilas/local areas per district) |
| `scripts/build-territory-geo.mjs` | reproducible data build |

## Model
`GeoArea` has `id, name, type, parentId, country, adminLevel, center, bbox, boundary, status, metadata`.
Types: `COUNTRY, DIVISION, DISTRICT, UPAZILA, LOCAL_AREA`. A type is not assumed to be an administrative level:
`LOCAL_AREA` may sit under a district, an upazila or another local area, and `adminLevel` is `null` for places that are
not administrative units. Adding a type means adding it to `AREA_TYPES` and `ALLOWED_PARENTS`.

The index (about 250 KB) holds every area without geometry. Polygons live in chunks and are fetched when an area
and its children are shown: `divisions`, `districts`, `upazilas/<district>`.

## Selection
`focusId` changes as the user browses. `activeId` changes only when they press "Select this area". Only the active
area may take part in later Territory calculations. `activeId` is saved on this device (`localStorage`,
`move.territory.selection`). An unreadable value, or an id that no longer exists, falls back to "nothing selected".

## Data source
* geoBoundaries gbOpen, Bangladesh, ADM1 / ADM2 / ADM3 (William & Mary geoLab), pinned to commit
  `5c25134028196d43ce97b5071934fd0cfc92f09f` of `wmgeolab/geoBoundaries`. Format: GeoJSON, simplified release.
* ADM1 divisions: CC0 1.0 (Wikimedia Commons, 2015). ADM2 districts and ADM3 upazilas/thanas: CC BY 3.0 IGO
  (Bangladesh Bureau of Statistics and OCHA ROAP, 2015 boundaries, build date Dec 12 2023).
  Attribution is shown on the Territory screen.
* To update: bump `SOURCE_COMMIT` in the script, run `node scripts/build-territory-geo.mjs`, review the printed counts
  and the diff of `public/geo/bd`, run `npm test`.
* Geometry is simplified for display (about 40 m for upazilas, 220 to 440 m for districts and divisions) and
  simplified shapes are not topologically aligned, so neighbouring borders can show hairline gaps. It must never be used to decide
  whether a GPS point is inside an area; Phase 2 needs a separate full-resolution source for that.

## Decisions baked into the data
* The source files carry no parent links. Parents are derived by geometry (interior point inside the parent polygon). All 608 resolved
  cleanly; the build fails on anything ambiguous.
* Dhaka District has exactly five upazilas (Dhamrai, Dohar, Keraniganj, Nawabganj, Savar). Every other ADM3 unit inside it
  is a Dhaka city thana and is typed `LOCAL_AREA` (41 of them, including Mohammadpur, Dhanmondi, Mirpur). Same-named upazilas in other districts
  (Mirpur in Kushtia, Mohammadpur in Magura) stay `UPAZILA`.
* Shyamoli has no boundary in the open admin data. It is a curated `LOCAL_AREA` with an approximate centre,
  `status: "boundary-pending"`, drawn as a point. The build checks that the point lies inside Dhaka District
  (it falls in the Mohammadpur thana polygon, close to its edge). It gets a real boundary only when one is sourced.
* Other metropolitan thanas (Chattogram, Khulna, Rajshahi and others) are not flagged in the source and are currently `UPAZILA`.

## Product direction (Phase 1.1): the rules later phases must follow
* **Where it lives.** Territory is a main-navigation tab (Home, Journeys, Territory, Profile), in the slot Ranks used to
  occupy; there is no fifth tab. Profile has a Territory card and a Leaderboard row; the leaderboard (`/leaderboard`) is
  unchanged and now opens from Profile with a back button.
* **Real movement is the source.** Running and Walking use one rule set and both count. Cycling will count too, under its
  own distance and speed limits that are not decided yet, so it contributes nothing today (`contributionPolicy`).
* **Roads and ordinary routes count.** Exploration comes from legitimate movement along roads and everyday routes inside
  the active area. There is no rule that movement must be off-road or near a boundary.
* **Distance and exploration are different things.** Activity distance is total Run/Walk distance and stays in tracking.
  Territory exploration is how much new ground a route discovers. Walking the same road again adds distance, not new
  exploration, and distance is never converted into a percentage.
* **Only the active area is live.** Movement inside the active area may contribute to it. Movement outside it activates nothing, and
  never a different area (`contributionTarget`).
* **Loose coupling.** Tracking stays the source of truth for GPS points, distance, timestamps, type and route. Territory reads
  a verified, finished activity through `TerritoryActivityInput` (`contribution.ts`), never writes to tracking, and a unit
  test fails if either side imports the other.

Not decided yet, deliberately: how "new ground" is measured (the unit of coverage), the full-resolution boundaries used
to test containment, how much of an area counts as explored, and anti-cheat.

## Not in Phase 1
GPS coverage, explored percentage, ownership, King, conquest, 2x takeover, reclaim, battles, run/walk/cycling rules,
anti-cheat, scoring, history, higher-level conquest, notifications, celebrations. Selection is not yet synced to Firestore:
that needs a rules change (see the Phase 2 questions in the implementation report).
