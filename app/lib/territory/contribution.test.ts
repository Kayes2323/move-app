import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contributionPolicy, contributionTarget } from "./contribution";

test("running and walking share one rule set and count; cycling is deferred, not guessed", () => {
  assert.deepEqual(contributionPolicy("running"), { status: "counts", ruleSet: "run-walk" });
  assert.deepEqual(contributionPolicy("walking"), contributionPolicy("running"));
  const cycling = contributionPolicy("cycling");
  assert.equal(cycling.status, "deferred");
  assert.equal(cycling.ruleSet, "cycling");
});

test("movement only targets the active area, and only while inside it", () => {
  const inMohammadpur = ["bd", "bd-div-dhaka", "bd-dis-dhaka", "bd-upa-dhaka-mohammadpur"];
  assert.equal(contributionTarget({ activeId: "bd-upa-dhaka-mohammadpur" }, inMohammadpur), "bd-upa-dhaka-mohammadpur");
  // inside Dhaka but outside the active area: nothing is activated, and no other area is picked
  assert.equal(contributionTarget({ activeId: "bd-upa-dhaka-mohammadpur" }, ["bd", "bd-div-dhaka", "bd-dis-dhaka", "bd-upa-dhaka-dhanmondi"]), null);
  assert.equal(contributionTarget({ activeId: null }, inMohammadpur), null);
  assert.equal(contributionTarget({ activeId: "bd-upa-dhaka-mohammadpur" }, []), null);
});

test("selecting a larger area keeps working through its children's containment", () => {
  assert.equal(contributionTarget({ activeId: "bd-dis-dhaka" }, ["bd", "bd-div-dhaka", "bd-dis-dhaka", "bd-upa-dhaka-mirpur"]), "bd-dis-dhaka");
});

const sources = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts") ? [{ file: p, text: readFileSync(p, "utf8") }] : [];
  });

test("Territory and tracking stay decoupled in both directions", () => {
  const app = join(process.cwd(), "app");
  const imports = (text: string) => [...text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);

  for (const { file, text } of [...sources(join(app, "lib", "territory")), ...sources(join(app, "territory"))]) {
    for (const spec of imports(text)) {
      assert.ok(!/tracking|\/activity$|\/run\//.test(spec), `${file} must not import tracking or activity code (${spec})`);
    }
  }
  for (const { file, text } of [...sources(join(app, "lib", "tracking")), ...sources(join(app, "run"))]) {
    for (const spec of imports(text)) assert.ok(!/territory/.test(spec), `${file} must not import Territory (${spec})`);
  }
  for (const f of [join(app, "lib", "activity.ts"), join(app, "components", "ShareScreen.tsx")]) {
    assert.ok(!/territory/.test(readFileSync(f, "utf8")), `${f} must not reference Territory`);
  }
});
