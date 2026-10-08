# Territory eligible-cell mask tooling

Build-time only. Runtime Territory code (`app/lib/territory`) never imports this folder; this folder imports the cell maths from
the runtime so a mask and the exploration algorithm can never disagree about what a cell is.

A mask lists the hidden z20 cells of ONE area that may ever count as explored. `explore()` sees it only as a `CellScope`
(`scopeFromMask`), so a mask can be replaced without touching the algorithm.

## Pilot: Mohammadpur (`bd-upa-dhaka-mohammadpur`)
```
npm run territory:mask:fetch -- boundary bd-upa-dhaka-mohammadpur                    # done; inputs are committed
npm run territory:mask:fetch -- pbf bd-upa-dhaka-mohammadpur <file-or-url>           # OSM data from a PBF extract (preferred)
npm run territory:mask:build -- bd-upa-dhaka-mohammadpur                             # writes the mask, a build sidecar and the report
```
`fetch ... osm` (Overpass) still exists for when an Overpass server is usable; it produces the same two input files.

### OSM from a PBF (no Overpass needed)
The PBF is read by `pbf.ts` (a small dependency-free reader) and cut to the area by `extract.ts`, the same thing
`osmium extract --strategy=simple -b` does for one box: nodes inside the area's bounding box plus a 0.01 degree margin are kept, a way is kept
if any of its nodes is, and its geometry is the runs of consecutive known nodes (a way that leaves the margin and returns is cut in two,
never joined with a straight line). Nothing about which ways are walkable is decided there; that stays in `lib.ts`.

* Geofabrik country extract (about 340 MB, updated daily). Download it yourself, keep it out of Git:
  `curl -L -o tools/territory-mask/cache/bangladesh-latest.osm.pbf https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf`
  `npm run territory:mask:fetch -- pbf bd-upa-dhaka-mohammadpur tools/territory-mask/cache/bangladesh-latest.osm.pbf --md5 https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf.md5`
  (`tools/territory-mask/cache/` is git-ignored.) Takes about a minute.
* A dated, immutable planet file from the OSM data set on AWS Open Data can be streamed with no download to disk (about 95 GB read, 20 to 40 minutes):
  `npm run territory:mask:fetch -- pbf bd-upa-dhaka-mohammadpur https://osm-pds.s3.amazonaws.com/2026/planet-260928.osm.pbf --size 95121754261`
  The `.md5` next to the file is fetched and checked automatically; a dropped connection resumes from the last byte.

The manifest records the source URL or file name, size, MD5 (and whether it was verified), SHA-256, the PBF's replication timestamp (the moment
the data reflects), the writing program, the box and margin, and counts of what was kept or clipped. The extracted `osm-roads.json` and
`osm-buildings.json` are committed with their hashes, so building the mask never needs the PBF again.
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
