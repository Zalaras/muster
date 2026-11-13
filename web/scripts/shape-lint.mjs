#!/usr/bin/env node
// shape-lint.mjs — fails a test that builds a whole shared wire shape by hand instead of
// through its factory. Run from web/ by `npm run lint` (so `make web-lint`, `make check` and
// the pipeline gates all meet it). Exit 0 iff clean; every hit is printed as file:line.
//
// Why: one required field added to `Session` once meant an edit in thirteen test files across
// six features, because each spelled the shape out to get a valid instance
// (kb:lesson/wire-shape-change-owns-its-fixtures). A test now gets one from a factory
// (`src/sessions/testfixtures.ts`, `src/protocol/testfixtures.ts`, `src/api/testfixtures.ts`)
// or spreads the product default (`PREF_DEFAULTS`, `UNKNOWN_USAGE`), and names only the
// fields it is about.
//
// Two checks, over unit tests, E2E and render code alike:
//   1. Phantom field. `scripts/shape-lint/phantom.ts` merges a required field no object has
//      into each guarded interface, and tsc runs under `scripts/shape-lint/tsconfig.json`.
//      Whatever it then rejects for that field spells the shape out. Expected in the modules
//      that own the shapes and in the factory files; a hit in test code fails. Every other
//      compile error is ignored here — `tsc --noEmit` in the build owns those.
//   2. Cast. An object literal cast to a guarded shape (`{ … } as Session`) is the same thing
//      hidden from the type checker, so test code may not do it.
//
// Not covered, on purpose: an untyped literal. The decoder tests' raw payloads
// (`src/protocol/wirefixtures.ts`, the bodies in `src/api/*.test.ts`) are exactly that.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHANTOM = "requiredByShapeLint";
const FACTORIES = new Set([
  "src/sessions/testfixtures.ts",
  "src/protocol/testfixtures.ts",
  "src/api/testfixtures.ts",
]);
const ADVICE =
  "build it through its factory (sessions/, protocol/ or api/ testfixtures.ts) or spread the product default, and pass only the fields the test is about";

/** Test code: a unit test, anything under e2e/ or render/, or a test helper module. */
function isTestCode(file) {
  if (FACTORIES.has(file)) return false;
  return (
    /\.(test|spec)\.ts$/.test(file) ||
    /^(e2e|render)\//.test(file) ||
    /(^|\/)(test\w*|\w*fakes|\w*fixtures)\.ts$/.test(file)
  );
}

/** The interface names phantom.ts guards — the one list both checks read. */
function guardedShapes() {
  const source = readFileSync(join(web, "scripts/shape-lint/phantom.ts"), "utf8");
  return [...source.matchAll(/^\s*interface (\w+) \{/gm)].map((m) => m[1]);
}

/** tsc's plain output as one entry per error: `{file, line, text}`, continuation lines kept. */
function tscErrors() {
  const run = spawnSync(
    "npx",
    [
      "--no-install",
      "tsc",
      "-p",
      "scripts/shape-lint/tsconfig.json",
      "--noEmit",
      "--pretty",
      "false",
    ],
    { cwd: web, encoding: "utf8" },
  );
  if (run.error) throw run.error;
  const errors = [];
  for (const row of run.stdout.split("\n")) {
    const head = /^(.+?)\((\d+),\d+\): error TS\d+: (.*)$/.exec(row);
    if (head) errors.push({ file: head[1], line: Number(head[2]), text: head[3] });
    else if (row.startsWith(" ") && errors.length > 0) errors[errors.length - 1].text += `\n${row}`;
  }
  return errors;
}

function phantomHits() {
  const hits = [];
  let seen = 0;
  for (const error of tscErrors()) {
    if (!error.text.includes(PHANTOM)) continue;
    seen += 1;
    if (!isTestCode(error.file)) continue;
    const shape =
      [...error.text.matchAll(/required in type '(\w+)'/g)].at(-1)?.[1] ?? "a guarded shape";
    hits.push({ file: error.file, line: error.line, what: `spells out a whole ${shape}` });
  }
  // The factories themselves must trip the check, or the phantom field is not being applied
  // and a clean result would mean nothing.
  if (seen === 0) {
    console.error("shape-lint: the phantom field reached no file — the check is not running");
    process.exit(2);
  }
  return hits;
}

function testFiles(dir) {
  const out = [];
  for (const entry of readdirSync(join(web, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(path));
    else if (entry.name.endsWith(".ts") && isTestCode(path)) out.push(path);
  }
  return out;
}

function castHits(shapes) {
  const cast = new RegExp(`\\}\\)?\\s*as\\s+(?:unknown\\s+as\\s+)?(${shapes.join("|")})\\b`);
  const hits = [];
  for (const file of ["src", "e2e", "render"].flatMap(testFiles)) {
    const lines = readFileSync(join(web, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = cast.exec(line);
      if (match && !/^\s*(\/\/|\*)/.test(line))
        hits.push({ file, line: index + 1, what: `casts an object literal to ${match[1]}` });
    });
  }
  return hits;
}

const hits = [...phantomHits(), ...castHits(guardedShapes())].sort(
  (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
);
if (hits.length > 0) {
  console.error(`FAIL  a test builds a shared wire shape by hand — ${ADVICE}`);
  for (const hit of hits) console.error(`      ${hit.file}:${hit.line}: ${hit.what}`);
  console.error(`shape-lint: ${hits.length} hit(s)`);
  process.exit(1);
}
