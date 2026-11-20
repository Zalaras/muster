---
name: deps
description: "Dependency update pass: reports every Go, web, toolchain and CI dependency with an update, then upgrades within each major in a worktree, re-verifies pins, tries to drop overrides, updates every doc naming a version, and runs the full gates."
argument-hint: "[report | all]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
disable-model-invocation: true
---

> Maintainer note: developer-invoked only (`disable-model-invocation`), because the pass ends in a
> release. `deps.py` beside this file does the mechanical gathering; the steps below are judgement.

Invoked with: **$ARGUMENTS**. `report` stops after step 2. `all` upgrades every row without
stopping. Empty: report, then wait for the developer's go-ahead (in prose, not a menu).

## Rules

1. **Within the current major only.** Every major goes into a "Deferred" list with its breaking
   changes summarised and a `TODO.md` line, never into this pass.
2. **Go's `go` directive always gets the newest patch** of its minor. It is a floor that cannot
   float, so a stale patch keeps known security holes allowed. A new Go *minor* is asked about.
3. **Pins move to the newest verified version.** Exact npm versions, the svu pin in
   `release.yml`. A pin that backs a *measured* claim (svu: `docs/conventions.md` § Commits,
   `.githooks/commit-msg`, the `release.yml` comments) moves only after re-measuring:
   `python3 .claude/skills/deps/deps.py svu-compare <old> <new>` must print `RESULT: identical`.
   Otherwise keep the pin and report the difference.
4. **Every override is tried for removal.** Delete it, `npm install`, then `npm ls <pkg>` and
   `npm audit`. Removed if the parents' ranges now resolve a version with no advisory. Otherwise
   it stays, raised to the newest version inside every parent's range. Never force a version
   outside a parent's range.
5. **Graph-only Go modules are left alone.** The report lists them separately: they are not in
   `go.mod` and not compiled in. Adding them changes nothing.
6. Never edit generated files (`make gen-kb` owns them). Never touch `~/.claude/settings*.json`.

## Steps

1. **Preflight.** In the primary checkout: `git branch --show-current` is `main` and
   `git status --short` is clean. `source ~/.nvm/nvm.sh && nvm use`. If the report later shows
   `node_modules` behind the lockfile, run `npm ci` in `web/` and re-run the report.
2. **Report.** `python3 .claude/skills/deps/deps.py report`. Show its tables, plus a one-line
   recommendation per row: what to watch, and which ones need extra tests. A dompurify, marked
   or mermaid bump re-runs the sanitizer and origin E2E criteria
   (kb:adr/reader-diagrams-mermaid-12-bundled-lazily). Stop here for `report`, or for the
   go-ahead when no argument was given.
3. **Worktree.** `make worktree NAME=deps` (if it exists, `NAME=deps-<yyyymmdd>`). All edits
   happen there, by absolute path.
4. **Upgrade.**
   - Go: `go get go@<newest patch>`, then `go get -u -t ./... tool`, then `go mod tidy`.
   - Web: set exact pins to the newest version in their major, and raise caret floors to it.
     Then `npm install`. Apply Rule 4 to each override. If Playwright moved, run
     `npx playwright install chromium`.
   - Node: `.nvmrc` gets the newest release in the same major. Then `nvm install` and `nvm use`.
   - Workflow `go install …@vX` pins: apply Rule 3. Floating action tags (`@v7`) need nothing.
   - Re-run the report in the worktree: it should show only deferred rows.
5. **Docs.** Every old version string must go:
   `git grep -nIE '<old1>|<old2>|…' -- ':!docs/history' ':!plans' ':!**/package-lock.json' ':!go.sum'`
   must print nothing that names a dependency. The usual places are `README.md` (toolchain
   line), `CLAUDE.md` (Node pin), `docs/conventions.md`, `.githooks/commit-msg` and
   `release.yml` comments. Re-measured claims get a "re-measured <date> on <version>" note.
   A `TODO.md` entry about an override or pin that is now resolved gets ticked and moved to
   `docs/history/todo-done.md` under the same heading. Then `make gen-kb && make check-kb`.
6. **Gates**, all in the worktree, each showing its exit code: `make check`, `make build`,
   `make web-test`, `make render-test`, then the full `make e2e` (backgrounded; never poll it,
   wait for the notification). A red gate is reported with its output. Never paper over it.
7. **Commit** on `plan/<name>`, by file. The dependency commit is `fix(deps): …` when a shipped
   dependency moved: the `go` directive, a compiled-in module, or a web runtime dependency.
   Otherwise it is `build(deps): …`. The subject is at most 72 characters and is published
   verbatim as the release note. Doc-only fixes go in a separate `docs(deps): …` commit.
8. **Final table.** One row per item: Before, After, Notes. Include every row left unchanged,
   with the reason (graph-only, already latest, major deferred, pin kept because svu-compare
   differed, override kept because…). Then the deferred majors and the gate results. Ask
   whether to land.
9. **Land, on the developer's say-so.** `/land` refuses this branch (no review or state file),
   so do it by hand from the primary checkout on a clean `main`:
   `git merge --squash plan/<name>`, then `git commit -m "<fix(deps) subject>"`, then
   `git push` (it prompts). Verify with
   `test "$(git merge-tree --write-tree main plan/<name> | head -1)" = "$(git rev-parse main^{tree})"`,
   then `git worktree remove ../muster-<name>` and `git branch -D plan/<name>`. Finish by running
   `npm ci` in the primary checkout's `web/`, so its `node_modules` matches the new lockfile.
