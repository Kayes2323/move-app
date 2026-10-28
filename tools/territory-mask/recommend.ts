/**
 * Re-applies the status policy (batch.ts POLICY) to the committed analyses WITHOUT rebuilding any mask, so a changed number in the
 * policy can be reviewed quickly:   node --import tsx tools/territory-mask/recommend.ts
 * Only the `recommendation` of each analysis changes; every measured figure is left exactly as it was.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend } from "./batch";

const dir = join(dirname(fileURLToPath(import.meta.url)), "analysis");
const tally: Record<string, number> = {};
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  const a = JSON.parse(readFileSync(join(dir, f), "utf8"));
  if (!a.quality) continue; // no boundary / no data: nothing to re-judge
  a.recommendation = recommend({ eligibleCells: a.counts.eligibleCells, confidentShare: a.quality.reachConfidentShare, largestShare: a.quality.reachLargestShare, builtUpCells: a.quality.builtUpCells, gapShare: a.quality.gapShare, validationOk: a.validation.ok });
  writeFileSync(join(dir, f), JSON.stringify(a, null, 1) + "\n");
  tally[a.recommendation.status] = (tally[a.recommendation.status] ?? 0) + 1;
}
console.log(JSON.stringify(tally));
