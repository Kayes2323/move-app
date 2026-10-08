# Territory eligible-cell mask tooling

Build-time only. Runtime Territory code (`app/lib/territory`) never imports this folder; this folder imports the cell maths from
the runtime so a mask and the exploration algorithm can never disagree about what a cell is.

A mask lists the hidden z20 cells of ONE area that may ever count as explored. `explore()` sees it only as a `CellScope`
(`scopeFromMask`), so a mask can be replaced without touching the algorithm.

## Pilot: Mohammadpur (`bd-upa-dhaka-mohammadpur`)
```
node --import tsx tools/territory-mask/fetch.ts boundary bd-upa-dhaka-mohammadpur   # done; inputs are committed
node --import tsx tools/territory-mask/fetch.ts osm bd-upa-dhaka-mohammadpur        # needs network access to an Overpass server
node --import tsx tools/territory-mask/build.ts bd-upa-dhaka-mohammadpur            # writes the mask, a build sidecar and the report
```
Outputs: `public/geo/bd/masks/<areaId>.json` (deterministic), `<areaId>.build.json` (wall-clock build time, node version, input hashes; kept
out of the mask so identical inputs give an identical file) and `tools/territory-mask/reports/<areaId>.md`.

## Method
1. **Ownership.** A cell belongs to the area when its centre lies inside the area's full-resolution boundary
   (geoBoundaries gbOpen BGD ADM3 at the pinned commit; `boundary.geojson`). A cell has exactly one owner.
2. **Roads.** OpenStreetMap ways with a walkable `highway` value (motorways excluded; `foot=no`, private access, `area=yes`,
   parking aisles and driveways excluded), measured as metres of way geometry inside each cell, summed over ways.
3. **Rule `road-length/1`.** Eligible = owned AND at least 20 m of included way inside the cell. (Exploration asks for 15 m, so ordinary GPS
   noise cannot lose a real road's cell.)
4. **Mask.** Eligible ids ascending, stored as `[firstId, length]` runs, with the rule, sources, licences, scope and builder version, and
   a SHA-256 over `{meta, runs}`. `maskVersion = territory-mask/1:<areaId>:<first 12 hex of the hash>`.

Inputs (`inputs/<areaId>/`) are committed with their hashes, so a build needs no network and always reproduces. `build.ts` refuses to run if an input
does not match its recorded hash, validates the result (unique valid ids, nothing outside the area, nothing inside a neighbouring area, counts, hash), and
builds twice to prove determinism.

## Licences
* OSM: ODbL 1.0, © OpenStreetMap contributors. A mask is a derived database; publishing it carries ODbL attribution and share-alike obligations. Confirm before shipping.
* Boundaries: CC BY 3.0 IGO (BBS, OCHA ROAP via geoBoundaries).

## Known limits (reported, not compensated)
OSM may be missing lanes and alleys. Cells they would make eligible are not eligible, and the report lists built-up cells with no mapped road nearby.
Parallel ways drawn for one street (a footway beside a road) both add length, which can make an edge cell eligible slightly more easily.
