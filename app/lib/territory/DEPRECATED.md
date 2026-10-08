# Territory: what is deprecated

* `exploration/`, `mask/`, `tools/territory-mask/` (and `public/geo/bd/masks`): the cell-exploration experiment. Retired. See each folder's DEPRECATED.md.
* `contribution.ts` keeps only the Run/Walk/Cycling policy. Its old active-area scoping (`contributionTarget`) moved into `exploration/input.ts`.
* `app/territory/areas` (the Bangladesh area browser and its saved "active area") is no longer linked; Territory gameplay is the Mohammadpur Territory in `conquest/`.

Reused as is: the administrative boundaries (`public/geo/bd`, the full-resolution Mohammadpur polygon), the area index and hierarchy, `useTerritory`/selection for the browser, and the cell maths is untouched.
