# Web Implementation: maintainability-cleanup — Unit X1 (plan-ID comment sweep, web/src, X1c)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: kb: 425 records, 23 features, 0 problem(s) (`make check-kb`); `go run ./tools/kb pack --plan maintainability-cleanup --role web-impl` surfaced no protocol delta for this comment-only unit — this run cites existing `kb:adr/*`, `kb:anchor/*` and `kb:spec/*` records only, per `plans/maintainability-cleanup/plan.md` § X1 and the method in `plans/maintainability-cleanup/daemon-implementation-X1a.md`.

## Scope

Comments only, no code changes, in `web/src/**/*.ts` excluding `*.test.ts`, plus the four `web/src/*/CLAUDE.md` files that carried plan-ID hits (`features/`, `reader/`, `render/`, `terminal/`). `web/src/sessions/CLAUDE.md` had zero hits and was left untouched. No test file, `web/e2e`, `style.css`, `index.html` or `doc.html` was touched.

## Method

Ran the given sweep as 7 parallel subagents, one per directory group (`api`+`protocol`; `features` split in two; `reader`; `render` split in two; `sessions`+`terminal`), each following X1a's method: for every true hit, cite a resolving `kb:` record (verified with `go run ./tools/kb for <file>` / `find` / `ls` / `show <bare-slug>`), state the current why in prose, or delete the comment if it only restated the code once the citation was stripped; never renumber, never invent a slug. After the subagents finished, I ran the given regex tree-wide, found 47 residual true positives the parallel split had missed reconciling against each other (mostly `Plan <name>:` labels in `protocol/prefs.ts`, `protocol/messages.ts`, `protocol/usage.ts`, `protocol/session.ts`, and a `pre-plan daemon` idiom naming no specific plan but still using the forbidden word), and fixed those myself directly. I then ran a **case-insensitive** supplementary sweep (`edge case`, `review seed`, `review cycle`, `req-?[0-9]`, `inv-[a-z0-9]`, `cycle [0-9]`) since the plan's given pattern is case-sensitive and `Edge Case`/`Seed [A-Z][0-9]+` don't match a lowercase `edge case 6` or `review seed B8` — this caught 19 more true survivors across 12 files (lowercase numbered edge cases, five `review seed B7–B10` citations, and two file-local `INV-POPOUT-CONNECTING`/`INV-REFETCH-NEVER-BLANKS` labels not defined in any kb record or SPEC), fixed the same way.

## Changes

101 files touched (all under `web/src/`): `web/src/api/` (7 of 8 assigned files — `api/launch.ts` had no true hit), `web/src/protocol/` (8), `web/src/features/` (22 `.ts` + `CLAUDE.md`), `web/src/reader/` (10 `.ts` + `CLAUDE.md`), `web/src/render/` (27 `.ts` + `CLAUDE.md`), `web/src/sessions/` (8), `web/src/terminal/` (7 `.ts` + `CLAUDE.md`), and the root modules `app.ts`, `doc.ts`, `dom.ts`, `main.ts`, `shortcuts.ts`, `theme.ts`, `ws.ts`, `wsapp.ts`. Every changed line is a comment rewrite, deletion, or a `kb:` citation swap — no non-comment token changed (see Verification). Representative examples:

| File | What and why |
|------|--------------|
| `web/src/protocol/prefs.ts`, `messages.ts`, `usage.ts`, `session.ts` | Stripped `Plan <name>:` prefixes (`usage-model-bar`, `order-sidebar`, `new-ui-design-colors`, `auto-update`, `rail-card-improvements`, `markdown-viewing`, `terminal-fixes-cleanup`, `ui-text-and-focus`) — the adjacent `kb:anchor/prefs.put`/`kb:anchor/ws.*` citation already covers the fact; reworded the repeated `pre-plan daemon` idiom to `an older daemon` / `a daemon predating this field` / `every daemon` (no daemon version predates several of these fields, so the tolerance claim was corrected, not just reworded, at `prefs.ts:57`/`session.ts:86`) |
| `web/src/features/tiles.ts` and siblings named in the brief | `Review Major 4:`, `Seed B4`, `Minor 13` style labels removed; the design rationale restated in prose or cited to the resolving ADR |
| `web/src/features/connectionversion.ts`, `render/launch.ts`, `render/issue.ts`, `render/dead.ts`, `render/focusview.ts` | `review seed B7`–`B10` labels (not a kb record) replaced with `docs/conventions.md § Composition roots` — the existing non-plan-ID citation style already used by `features/connectionrestore.ts` for the same rule |
| `web/src/app.ts`, `web/src/reader/notice.ts`, `web/src/features/reader.ts` (×2) | `INV-POPOUT-CONNECTING`/`INV-REFETCH-NEVER-BLANKS` labels — grepped `docs/adr/*.md docs/facts/*.md SPEC.md docs/protocol.md docs/features/reader/*.md` for both strings, zero hits outside these four `.ts` sites, so restated each invariant in prose instead of keeping the label (same rule X1a applied to `INV-A`/`INV-F`/`INV-P`) |
| `web/src/theme.ts`, `shortcuts.ts`, `render/rename.ts`, `features/connectionrestore.ts`, `features/actions.ts`, `features/connection.ts`, `features/updateview.ts`, `features/views.ts`, `features/launch.ts`, `render/diagramdialog.ts`, `render/dragreorder.ts` | Lowercase `edge case N` / `edge cases N/M` numbering (12 sites, missed by the case-sensitive pattern) dropped; substance kept as prose (a test-file pointer was kept verbatim in `shortcuts.ts` since it already named `web/src/shortcuts.test.ts`) |
| `web/src/reader/CLAUDE.md` | `W15, E15, E16` test-ID labels replaced with the actual spec file, `web/e2e/reader.spec.ts`; `REQ-13` dropped |
| `web/src/terminal/CLAUDE.md` | `INV-1` label (grepped, not defined anywhere) replaced with `kb:adr/reader-docs-is-third-surface-segment`, which states the same fact |
| `web/src/render/CLAUDE.md`, `web/src/features/CLAUDE.md` | `Major 4`, `review Minor 4` dropped; prose kept |
| Every other file in the 101 | One or more `REQ-n`/`INV-n`/`Dn`/plan- or milestone-name citation rewritten to a `kb:` token, restated in prose, or deleted per the rules above |

## Decisions

- Every file the plan's X1 unit names for `web/src` (non-test `.ts`, plus the four CLAUDE.md files carrying plan-ID hits) is covered above; `web/src/sessions/CLAUDE.md` deliberately untouched (0 hits).
- deviation: the requested comments-only proof method (TypeScript compiler API `ts.createSourceFile` + printer with `removeComments`, or esbuild `--minify-whitespace`) could not run: `web/node_modules/typescript` is v7.0.2, the native-compiler package that ships only `version`/`versionMajorMinor` — `node -e "const ts=require('typescript'); console.log(Object.keys(ts))"` prints `[ 'version', 'versionMajorMinor' ]`, no `createSourceFile`/`createPrinter`. There is also no `esbuild` binary under `web/node_modules/.bin` (`ls web/node_modules/.bin/esbuild` → exit 1; Vite 8 here uses rolldown/oxc, not esbuild). Substituted a line-level diff heuristic instead (see Verification) — this is X1a's own fallback method (`git diff -U0 | grep '^[-+]' | grep -v '^[-+]\s*//'`), extended to also whitelist whole-line JSDoc content (`*`, `/*`) since many of these comments are `/** ... */` blocks. → ADR: pending.
- No `doc-delta:` — no behavior changed, only comment text; nothing in the plan's Doc Delta concerns comment wording.

## Verification

- Before: `rg -c 'REQ-[0-9]|INV-[0-9]|\bD[0-9]{1,2}\b|Edge Case|review cycle|\b(Major|Minor|Critical) [0-9]|m[0-9]-[a-z]|Implementation Notes|plan [a-z-]+|\b(W|E)[0-9]+\b|\b[a-e]-[CMm][0-9]+\b|Seed [A-Z][0-9]+' web/src -g '!*.test.ts' -g '!*.css'` summed to **837** across 98 `.ts` files (+ 4 CLAUDE.md).
- After (same command): **21** hits, all in `web/src/{reader,render,features,api,protocol}/*` and two CLAUDE.md files — every one is the reader feature's `session.plan` (Claude's `ExitPlanMode` plan file the dashboard's docs surface shows), e.g. `session.plan is null or !exists`, `"no plan yet"`, `a session's plan and the .md files under its directory` — not a project plan-ID citation. Pasted and reviewed line-by-line; no survivor needed further action.
- Supplementary case-insensitive check (`rg -ni 'edge case|review seed|review cycle|\breq-?[0-9]|\binv-[a-z0-9]|cycle [0-9]'`) after all fixes: **1** hit, `render/diagrams.ts:107`'s `"than a real edge case"` — ordinary English, not a numbered citation.
- kb: citation resolution: extracted every `kb:<type>/<slug>` token added across the diff (`git diff -- web/src | grep '^+' | grep -oE 'kb:[a-z]+/[a-z0-9.-]+' | sort -u`) → **98 unique tokens**. Verified each: non-anchor tokens via `go run ./tools/kb show <bare-slug>` (all resolved, 0 `no record` errors); `kb:anchor/*` tokens against `docs/protocol.md`'s `<!-- kb:anchor <id> -->` definition markers (all 41 anchor tokens found defined, including 5 that a naive `grep 'kb:anchor/<slug>'` on the file missed because the definition marker uses a space, not a slash — `<!-- kb:anchor update.restart-impact -->` vs. the prose citation `` `kb:anchor/update.restart-impact` ``).
- Comments-only proof: `git diff -U0 -- web/src` run through a script classifying every changed (`+`/`-`) line as safe (blank, or starts with `//`, `/*`, or `*`) vs. suspicious. **28 suspicious lines** (out of ~1,340 changed lines), all manually confirmed as either (a) a trailing `// ...` comment on a code line with a byte-identical code prefix (e.g. `docChanged: (docChanged: DocChanged) => void; //`, `if (checkState.inFlight) return; //`, `const ONSET_DELAY_MS = 600;`, `return false; //`, `| { kind: "absent" } //`) or (b) prose-only edits inside a `CLAUDE.md` (not TypeScript code). Full list reviewed; zero code-token changes. `git diff --name-only -- '*.test.ts' web/e2e` → empty (no test file touched).
- Word budgets: all four edited CLAUDE.md files shrank — `features/CLAUDE.md` 589→586, `reader/CLAUDE.md` 342→338, `render/CLAUDE.md` 667→663, `terminal/CLAUDE.md` 368→367 (`wc -w` before via `git show HEAD:<path>`, after on disk).
- `npx tsc --noEmit` (from `web/`) → exit 0, no output.
- `make web-lint` → Biome: `Checked 245 files in 187ms. No fixes applied.`
- `make web-test` → Vitest: `Test Files 71 passed (71)` / `Tests 1741 passed (1741)`.
- `make web-build` → `tsc --noEmit && vite build` exit 0 (`✓ built in 1.65s`; the pre-existing chunk-size warning is unrelated to this comment-only sweep). `git status --short internal/webui` → empty (no embedded-asset diff).
- `make check-kb` → `kb: 425 records, 23 features, 0 problem(s)` / `kb: all checks pass`.
- `make refs` → `dead-refs: 3055 references checked, 0 missing`.
- No E2E run: `plans/maintainability-cleanup/test-specs.md` does not exist for this plan (X1 is a cross-cutting comment sweep, not a UI-affecting unit) — nothing to smoke-test against Playwright.

## Handoff

**Build status**: `npx tsc --noEmit` and `make web-build` exit 0.
No test files needed changes — none were touched, none needed re-pointing.
