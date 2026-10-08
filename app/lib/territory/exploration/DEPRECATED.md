# Deprecated: cell-based exploration

This folder is the retired z20-cell exploration experiment (hidden cells, eligibility masks, "new ground discovered").
It is **not** how Territory works. Territory progress is distance-based and lives in `../conquest/`.
Nothing in the Territory UI or progress logic may import from here (a test enforces it). It stays, with its tests,
only until its removal is approved; see `docs/TERRITORY.md`.
