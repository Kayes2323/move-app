import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contributionPolicy } from "./contribution";
import { contributionTarget } from "./exploration/input";

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

test("Territory and tracking stay decoupled: Territory is a read-only consumer", () => {
  const app = join(process.cwd(), "app");
  const imports = (text: string) => [...text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);

  // The Territory domain never imports the tracking engine, its types, activity code, history or track loading.
  for (const { file, text } of sources(join(app, "lib", "territory"))) {
    for (const spec of imports(text)) {
      assert.ok(!/tracking|\/activity$|\/run\/|\/history$|trackLoader|territoryState/.test(spec), `${file} must not import tracking or activity code (${spec})`);
    }
  }
  // Territory screens reach tracking data only through the one read-only adapter (lib/territoryState).
  for (const { file, text } of sources(join(app, "territory"))) {
    for (const spec of imports(text)) {
      assert.ok(!/tracking|\/activity$|\/run\/|\/history$|trackLoader/.test(spec), `${file} must not import tracking or activity code (${spec})`);
    }
  }
  // The tracking engine, and the activity record it writes, know nothing about Territory.
  for (const { file, text } of sources(join(app, "lib", "tracking"))) {
    for (const spec of imports(text)) assert.ok(!/territory/.test(spec), `${file} must not import Territory (${spec})`);
  }
  assert.ok(!/territory/i.test(readFileSync(join(app, "lib", "activity.ts"), "utf8")), "activity.ts must not reference Territory");
});

test("the superseded distance model is not part of gameplay", () => {
  const app = join(process.cwd(), "app");
  const imports = (text: string) => [...text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
  const distance = /conquest\/(credit|config|progress|store)$/;
  for (const { file, text } of sources(app)) {
    if (file.includes(join("lib", "territory", "conquest"))) continue;
    for (const spec of imports(text)) assert.ok(!distance.test(spec), `${file} must not use the superseded distance model (${spec})`);
  }
});

test("Territory progress never reads activity distance or the perimeter", () => {
  const dir = join(process.cwd(), "app", "lib", "territory");
  for (const f of ["coverage/coverage.ts", "exploration/explore.ts"]) {
    const text = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/perimeter|targetKm|\.km\b/.test(text), `${f} must not use perimeter or distance`);
  }
});
