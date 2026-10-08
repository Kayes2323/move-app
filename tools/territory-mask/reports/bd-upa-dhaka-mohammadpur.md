# Eligible-cell mask report: Mohammadpur

- Mask version: `territory-mask/1:bd-upa-dhaka-mohammadpur:2d8866a921f6`
- Content hash: `2d8866a921f688dd4729d99344e5f2fe41e5e4a2fd7b413d1f20800863e98569`
- Cell zoom: 20 (about 35 m)
- Rule: `road-length/1`, at least 20 m of walkable OSM way inside a cell
- OSM snapshot: 2026-09-28T00:00:04Z

## Counts
- Cells owned by the area (centre inside its boundary): **5783** (about 7.1 km2)
- **Eligible cells: 3880** (67.1% of owned)
- Extent (west, south, east, north): 90.32959, 23.74544, 90.3828, 23.77498

## What was read from OSM
- Ways in the snapshot: 4224; included as walkable: 4183
- Excluded: access=private (1), area=yes (2), highway=bus_stop (1), highway=construction (2), highway=corridor (2), highway=motorway_link (2), service=driveway (31)
- Walkable way length: 710.7 km; by class: cycleway 2.9 km, footway 27.8 km, living_street 59.6 km, path 7.6 km, pedestrian 1.0 km, primary 14.3 km, primary_link 0.9 km, residential 361.6 km, secondary 36.3 km, secondary_link 1.3 km, service 98.1 km, steps 0.6 km, tertiary 36.8 km, tertiary_link 0.2 km, track 0.3 km, trunk 37.3 km, trunk_link 1.4 km, unclassified 22.7 km
- Mapped road density inside the area: 25.1 km per km2
- Connected road networks: 63; the largest holds 92% of the length

## How much of the mapped road surface the mask represents
- Road length inside owned cells: 177.98 km; inside eligible cells: 170.36 km (**95.7%**)
- The rest is stubs shorter than the rule in cells where less than the minimum road touches.
- This measures the mask against OSM only. It cannot say how much real, walkable road OSM itself is missing.

## Samples: cells along major roads (trunk, primary, secondary, tertiary), longest first, spread across the list
- cell 825772927376 at 23.76005, 90.37302, 118 m of major road, eligible
- cell 825767684496 at 23.76005, 90.37130, 70 m of major road, eligible
- cell 825755101585 at 23.75974, 90.36718, 43 m of major road, eligible
- cell 825723644321 at 23.75471, 90.35688, 36 m of major road, eligible
- cell 825683798420 at 23.75880, 90.34384, 35 m of major road, eligible
- cell 825788656022 at 23.75817, 90.37817, 35 m of major road, eligible
- cell 825671215508 at 23.75880, 90.33972, 24 m of major road, eligible
- cell 825710012818 at 23.75942, 90.35242, 0 m of major road, eligible

## Samples: owned cells with no mapped road within about 100 m (not eligible)
- 0 such cells in total

## Boundary-adjacent cells (owned, with a neighbour that belongs to another area)
- 693 cells, 444 eligible (64%)
- cell 825642903978 at 23.75188, 90.33045, eligible
- cell 825684847013 at 23.75345, 90.34418, eligible
- cell 825713158590 at 23.74560, 90.35345, eligible
- cell 825729935803 at 23.74654, 90.35894, eligible
- cell 825763490173 at 23.76602, 90.36993, eligible
- cell 825802287517 at 23.75597, 90.38263, eligible

## Gaps and disconnected regions
- Eligible cells form 20 connected region(s) (8-neighbour). Largest: 3696 cells.
- Other regions: 19 (1 of 25+ cells, 17 of fewer than 5 cells)
- cell 825780267420 at 23.75628, 90.37542, region of 152 cells
- Single-cell holes (not eligible, 7 or 8 eligible neighbours): 304
- cell 825643952556 at 23.75125, 90.33079, 0 m of road
- cell 825697429900 at 23.76131, 90.34830, 0 m of road
- cell 825736227201 at 23.76477, 90.36100, 16 m of road
- cell 825748810094 at 23.77074, 90.36512, 0 m of road
- cell 825800190368 at 23.75502, 90.38195, 0 m of road

## Completeness signals (reported, nothing compensated)
- Buildings in the snapshot inside the area: 17016
- Built-up cells (8 or more buildings): 400; with no eligible cell within one cell of them: **0**
- Built-up cells with no mapped road nearby suggest unmapped lanes or alleys. They are NOT eligible and nothing was added for them.
