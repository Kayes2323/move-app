# Superseded: the distance model

`credit.ts`, `config.ts`, `progress.ts`, `store.ts` (and the distance tests in `conquest.test.ts`) are the activity-distance
Territory model from commit d86f091 (credit = km x multipliers against the 19.4 km perimeter). **It is not Territory.**
Territory progress is geographic coverage: explored eligible cells / total eligible cells (`../coverage/`). A test
(`contribution.test.ts`) fails if anything outside this folder imports these four files.

Still used from here: `geodesy.ts` (perimeter maths), `outline.ts` (boundary and GPS drawing), `registry.ts` (the Territory's
boundary and its perimeter, kept as information only).

The multipliers (morning, streak, activity) are not part of the game until the geographic model is signed off. Removal of
these files is a decision for later.
