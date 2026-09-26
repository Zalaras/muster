# Daemon Implementation: Maintainability Regressions

**Plan**: maintainability-regressions
**Mode**: initial
**Pack**: `kb: pack 22984 words (budget 20000)` — WARN over budget; sections rules 1295 · features 7394 · decisions 6992 · facts 5237 · lessons 2058 · runbooks 2 (features launch, ingest, connection)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/modelcheck.go` | modified | Added `BinaryIdentity` (path, size, mtime) and `ResolveBinaryIdentity(bin)` (REQ-2): `exec.LookPath` → `filepath.EvalSymlinks` → `os.Stat`. The check itself (`CheckModel`) is unchanged, per the plan. |
| `internal/server/launchermodels.go` | created | New `modelsFeature`: the **one** model-catalog cache owner (R2) and `GET /api/models` handler. Holds `cached map[string]modelVerdict` valid only against the current `claudecode.BinaryIdentity`; an identity change wipes `cached`+`inflight` (a `generation` counter discards any check still in flight under the superseded identity, INV-3). Collapses concurrent misses per model via an `inflight` map of channel-gated calls (REQ-5). Bounded to 64 entries, clearing the whole map when full (REQ-2). `verdicts()` fans out one goroutine per requested model so cold checks run concurrently (REQ-1, D2). Runs every check in `os.TempDir()` — the "daemon-chosen directory" the Protocol Contract requires, never the launch directory. |
| `internal/server/launcher.go` | modified | Added `defaultClaudeBin(bin string) string` (shared by `newSessionLauncher` and `server.go`'s `newModelsFeature` construction, so the two never resolve a different default). `newSessionLauncher` now takes `*modelsFeature` and wires `checkModel`'s production closure to read `models.verdict(ctx, model)` instead of calling `claudecode.CheckModel` directly (REQ-4) — the closure ignores its `dir` parameter (the field's signature is kept unchanged so every existing test literal that sets `checkModel` directly keeps compiling; see Decisions). |
| `internal/server/launcherrors.go` | modified | Factored `modelUnrecognizedMessage(model string) string` out of `modelUnrecognized()`, so `GET /api/models`' `unrecognized` verdict message and `POST /api/sessions`' `400 model_unrecognized` message can never drift apart (Protocol Contract: "exactly the model_unrecognized message"). |
| `internal/server/server.go` | modified | One-line construction+registration: `models := register(s, newModelsFeature(defaultClaudeBin(cfg.Launch.ClaudeBin), cfg.Logger))`, passed into `newSessionLauncher`. |
| `internal/claudecode/settings.go` | modified | `writeEnvelopeScript` now calls a new `writeScriptAtomically(path, content)`: compares on-disk content first (no-op if equal — REQ-12), else writes a temp file in the same directory (mode 0o700, fsync'd) and `os.Rename`s it over the target (REQ-11). `WriteWrapperScripts`' exported signature and generated script body are unchanged. |

## Decisions

- design: `modelsFeature` (single type owning both the cache and the HTTP handler) matches `usage.go`'s `usageFeature` shape (`docs/conventions.md` § Composition roots exemplar) rather than splitting a cache type from a handler type — `rg "type .*Feature struct" internal/server` shows every feature (`usageFeature`, `themeFeature`, `browseFeature`, `reposFeature`, …) is one struct owning both its state and its `mount`; no sibling splits cache-owner from HTTP-owner.
- design: the `inflight map[string]*modelCatalogCall` per-key channel-gate mirrors `internal/session/writeorder.go`'s `nextWriteTurnLocked` (`map[int64]chan struct{}`, coalescing concurrent access to one key under the owning struct's own lock) — `rg "chan struct{}" internal/server internal/session` found no closer existing coalescing helper to reuse (no `golang.org/x/sync/singleflight` in `go.mod`'s direct requires, and the Stack table doesn't list one, so a hand-rolled seam matching the session package's own pattern was used rather than adding a new dependency).
- deviation: `sessionLauncher.checkModel`'s field **signature** (`func(ctx, dir, model string) (claudecode.ModelVerdict, error)`) is unchanged, not narrowed to `func(ctx, model string) modelVerdict` as a literal reading of "asks the cache owner instead of calling CheckModel directly" might suggest. Reason: every existing test literal in `sessions_test.go` (`newModelCheckLauncher`, `TestLauncher_ModelUnrecognised_RefusesAndWritesNothing`, `TestLauncher_ModelRecognised_ProceedsToCreated`, D7–D9 from a prior plan) sets this field directly with the old signature and I may not edit test files. The plan's own sentence "The nil-means-skip seam for test literals stays" supports keeping the seam's shape; only `newSessionLauncher`'s **production closure** now routes through `models.verdict()` (confirmed: `go test -race -count=1 ./internal/server/...` passes unmodified, and `git status --porcelain` shows no `_test.go` file touched). → kb:adr/launch-check-model-seam-keeps-its-signature
- Every REQ/D-criterion in the plan's Daemon list (REQ-1 through REQ-5, REQ-11, REQ-12, D1–D9 shape) is implemented above; REQ-6 through REQ-10, REQ-13 and W1–W3 are the web side (web-impl/web-tests). D1–D9 themselves are daemon-tests' job per the plan header; this implementation only provides the seams (`f.check`, `f.identify` overridable fields) they need.
- Two pre-existing `size-warn.sh` (non-gating) warnings were newly tripped: `internal/server/launcher.go` crossed the 500-line `filelen` threshold (491→507) and `Launch` crossed `funlen`'s 60-line threshold, both from the `checkModel`/`newSessionLauncher` doc-comment expansion needed to explain the cache-routing change (REQ-4) and the new `defaultClaudeBin` helper. Not deliberately tripped, not split to silence per the hard rule — `make lint`/`golangci-lint run ./...` reports 0 issues either way, since these are size-warn-only, never-fail checks (kb:adr/process-size-linters-warn-never-fail).
- doc-delta: none beyond what the plan's own Doc Delta section already states — this implementation matches its described behaviour exactly (cache keyed on binary identity, dialog-open + Launch share it, atomic wrapper-script replace).

## Handoff

**Build status**: `go build ./...` exits 0.

Evidence:
- `go build ./...` → exit 0 (rerun after the full suite, to rule out the transient `internal/webui` embed race noted below).
- `gofmt -l .` → no output.
- `go vet ./...` → no output.
- `golangci-lint run ./...` → `0 issues.`
- `golangci-lint run --tests=false ./...` → `0 issues.` (no test file was touched, so this is confirmatory, not required by the sanctioned-break rule.)
- `go test -race -count=1 ./internal/server/... ./internal/claudecode/...` → both `ok` (144.7s, 5.5s).
- `go test -race -count=1 ./...` (full suite, run twice): the first run hit a transient `internal/webui/webui.go:21:12: pattern all:assets: cannot embed directory assets: contains no embeddable files` in `cmd/musterd`/`internal/server`/`internal/webui` — a filesystem race with the parallel web-impl agent's `make web-build` writing into the shared `internal/webui/assets/` directory mid-run (confirmed: `internal/webui/assets/` was fully populated, mtime 23:23, moments after the failing run; a same-second rebuild `go build ./...` then succeeded). The second full run, after that build settled, was clean: every package `ok`, including `internal/server` (155.5s) and `cmd/musterd` (67.7s).
- `make check-kb` → `kb: 439 records, 23 features, 0 problem(s)` / `kb: all checks pass`.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `795 references checked, 0 missing`.

No test file needed changes. Nothing to escalate.

## Fix Attempt 1 (review cycle 1)

**Pack**: `kb: pack 22984 words (budget 20000)` — WARN over budget; sections rules 1295 · features 7394 · decisions 6992 · facts 5237 · lessons 2058 · runbooks 2 (features launch, ingest, connection)

**Failures addressed**: code Critical 1, code Major 1, code Minor 1, code Minor 2, maintainability Major 1, maintainability Minor 1, maintainability Minor 2, maintainability Minor 3, maintainability Minor 4.

**Changes made**:

| File | What and why |
|------|--------------|
| `internal/server/launchermodels.go` | Removed every `REQ-*`/`INV-*`/`R1`/`R2` token from comments at the flagged lines (15, 25, 36, 44, 46, 48, 64, 73, 140, 170-172, 221), restating each reason in plain prose or an existing `kb:adr/` cite instead (code Critical 1). `verdict()`: (a) the finishing call now only deletes its own `inflight[model]` entry (`if f.inflight[model] == call { delete(...) }` instead of an unconditional `delete`) — closes code Minor 1 and maintainability Minor 1, the same root cause; (b) the shared run itself now runs on `context.WithoutCancel(ctx)` so a leader's own cancellation can't cut a run other waiters depend on, bounded regardless by `CheckModel`'s own 5 s timeout; (c) a waiter now selects on `<-call.done` and `<-ctx.Done()` so its own context cancellation stops it from hanging on someone else's run — closes code Minor 2 and maintainability Minor 2 together (one is "the leader's cancellation must not become a waiter's answer", the other is "a waiter must not ignore its own ctx"; the two fixes are independent halves of the same function and both are now in). |
| `internal/claudecode/modelcheck.go` | Reworded `:39-40`'s `modelCheckRun` doc: `dir` is prepended because *the caller* picks the check's directory, not because the check "must run in the launch directory" (the only production caller now runs it in `os.TempDir()`). Reworded `CheckModel`'s doc (`:101-105`): a run error is returned to the caller, and it is `modelsFeature` — named explicitly — that turns it into an uncached `unchecked` verdict and fails open; `Launch` itself no longer runs a check. Re-cited `ModelRecognised`'s doc (`:28`), `modelCheckTimeout`'s doc (`:64`) and `CheckModel`'s doc (`:105`) from the superseded `kb:adr/launch-refuses-model-outside-binary-catalog` to `kb:adr/launch-model-check-cached-per-binary-identity`, which supersedes it and is the record that actually states the fail-open-on-error/timeout/no-identity behaviour now (its Decision: "`unchecked` (error, timeout, no identity) is never cached and fails open"). Also dropped the `REQ-3` token from `ResolveBinaryIdentity`'s doc (code Critical 1's `modelcheck.go:145`). |
| `internal/server/launcher.go` | Dropped `REQ-4`/`R2` tokens from `Launch`'s `checkModel` comment and `newSessionLauncher`'s doc (code Critical 1's `:226`, `:114`). `writeSettings` no longer hand-rolls temp-file/fsync/chmod/rename: it now calls `claudecode.AtomicWriteFile(path, merged, 0o600)` (maintainability Major 1) — the function shrank from 491 to 484 total lines, so the `filelen` warning this file previously tripped is gone (`make size-warn` no longer lists `launcher.go`, confirmed below). |
| `internal/server/server.go` | Dropped the `R2` token from the `models` construction comment (code Critical 1's `:202`). |
| `internal/claudecode/settings.go` | Generalized the temp-file/fsync/chmod/rename sequence into one exported `AtomicWriteFile(path string, content []byte, perm os.FileMode) error` (maintainability Major 1) — the skip-if-unchanged/write/fsync/rename logic now exists exactly once. `writeScriptAtomically(path, content)` becomes a one-line wrapper (`AtomicWriteFile(path, content, 0o700)`), keeping its original 2-arg signature so `internal/claudecode/settings_test.go`'s existing `writeScriptAtomically(path, oldContent)`-style calls need no change — no test file was touched. Dropped `REQ-11`/`REQ-12` tokens from the doc comment (code Critical 1's `:357,361`). |

**Decisions** (new `design:`/`doc-delta:` lines this fix introduces):

- design: the shared atomic-replace helper (`AtomicWriteFile`) stays in `internal/claudecode`, exported, rather than moving to a new leaf package shaped like `internal/boundedwait`/`internal/evict`/`internal/keyedlock`/`internal/locate`. Those four exist *only* because their two consumers must not import each other (`internal/session` must never import `internal/server`, kb:diagram/daemon-components) — no such constraint holds here: `internal/server` already depends on `internal/claudecode` in one direction only, so there is no cycle to break by splitting. A standalone package was also ruled out on a harder constraint: `make check-kb` fails any Go file "owned by no feature" (`internal/kb/check.go:445`), a new package's path would need a `go:` glob entry added to a `docs/features/<name>/spec.md`, and daemon-impl may not write `docs/` — only `doc-reconcile` can add that entry, and not mid-fix-wave. Keeping the helper in the already-`ingest`-owned `settings.go` and exporting it needed no registry change, so `make check-kb` and `features-scope.sh maintainability-regressions` both stay clean now, not later. `internal/selfupdate`'s `installBinary` (`apply.go:220`, fixed temp name, no fsync) is left as a third variant, unfolded: its owning feature is `update`, not in this plan's `**Features**: launch, ingest, connection`, so touching it would itself fail `features-scope.sh`; a real merge is a follow-up once `update` is in scope for some other plan.
- design: `modelVerdict` (`internal/server/launchermodels.go:31`) stays a second, server-side tri-state beside `claudecode.ModelVerdict` rather than adding `unchecked` to that type. `rg -n "type .*Verdict" internal --glob '!internal/webui/**'` finds only these two types — no third tri-state to reuse. Reason kept inline at the type's own declaration: `claudecode.ModelVerdict` is the package-boundary neutral result the adapter's own doc names ("the caller branches on it and never sees modelCatalogSentence itself"); `unchecked` is `modelsFeature`'s own fail-open/cache bookkeeping for a run that never produced a definite Claude-Code-level answer at all (an error, a timeout, an unresolvable identity), not a third outcome of the check itself.
- design: `claudecode.BinaryIdentity`/`ResolveBinaryIdentity` (`modelcheck.go:130-159`) considered reusing `updatemanager.checkSwap`'s inline `info.Size() == prev.Size() && info.ModTime().Equal(prev.ModTime())` comparison (`internal/server/updatemanager.go:325`) instead of a new type. Rejected: that comparison is unexported to `updateManager`, re-stats one already-known executable path with no `$PATH` lookup or symlink resolution (the `-claude-bin` value can be a bare name), and compares two `os.FileInfo`-derived fields inline at one call site rather than being a comparable value usable as a cache key (`modelsFeature.identity != id`, a struct-equality check). `BinaryIdentity` stays in `internal/claudecode` per the plan's own Affected Files list ("the implementer puts that beside it in internal/claudecode"), and because it identifies the same `bin` value `CheckModel` itself takes — not merely "because the scripts are there".
- design: `defaultClaudeBin` (`launcher.go:104`) is a plain top-level func, not a method or a shared struct field, because its only two callers (`newSessionLauncher`, `server.go`'s `newModelsFeature` construction) are in different files with no shared receiver to hang it on; `rg -n "^func default" internal/server` finds no existing default-resolution helper of this shape to match, so this is the first of its kind in the package — its doc comment states why it exists (so the two `claude`-spawning features can never resolve a different default from each other) at its declaration.
- deviation (already logged, no change): `sessionLauncher.checkModel`'s signature stays `(ctx, dir, model)`, per `kb:adr/launch-check-model-seam-keeps-its-signature`, carried over unchanged this cycle.
- doc-delta: `docs/adr/launch-refuses-model-outside-binary-catalog.md` is superseded and its fail-open rationale has moved to `docs/adr/launch-model-check-cached-per-binary-identity.md`; every in-code citation of the old record for that rationale is now updated to the new one (this fix's `modelcheck.go` changes). No other doc claim changes.
- maintainability Minor 4 (Decisions correction, not a code change): the previous Decisions entry blamed `Launch`'s `funlen` warning on "the `checkModel`/`newSessionLauncher` doc-comment expansion" — wrong, since `funlen` does not count comments. Measured: `git show main:internal/server/launcher.go | sed -n '205,302p' | grep -vE '^\s*(//|$)' | wc -l` → 74, and `sed -n '219,318p' internal/server/launcher.go | grep -vE '^\s*(//|$)' | wc -l` (this branch, same function) → 74 — identical. `Launch`'s own body has zero non-comment-line diff against `main` (confirmed: `git diff main -- internal/server/launcher.go` touches only the `checkModel` comment block inside `Launch`, nothing else in the function). The `funlen` warning (83 lines, `make size-warn`) is pre-existing on `main` and unrelated to this plan's changes; not split, per the hard rule against splitting to silence a warn-only linter. Out of this plan's scope.

**Repro evidence** (removed before commit — no test file added or kept):
- A temporary `internal/server/zz_repro_scratch_test.go` drove the reviewer's exact A/B/C interleaving (code Minor 1 / maintainability Minor 1) and the leader-cancellation-becomes-waiter's-verdict case (code Minor 2 / maintainability Minor 2). Against the pre-fix code (verified by reverting just the two guarded lines): `unexpected extra check run #3 — a finishing call deleted another generation's entry` and `shared run's ctx was already cancelled: context canceled` — both fail exactly as the review described. Against the fixed code: both pass (`go test -race -count=1 -run 'TestScratchRepro' ./internal/server/...` → `PASS`, twice, ×2 tests). The scratch file was deleted afterward; the real regression test for D5/this interleaving is the wave-2 daemon-tests agent's, per the review note ("the unit test is the wave-2 daemon-tests agent's; you fix the code and keep the identify/check seams usable for it").

**Verification**:
- `go build ./...` → exit 0.
- `gofmt -l .` → no output.
- `go vet ./...` → no output.
- `golangci-lint run ./...` → `0 issues.`
- `golangci-lint run --tests=false ./...` → `0 issues.` (no test file touched this cycle; run anyway since the constraint asked for it whenever a test break is named — none is, this confirms it).
- `go test -race -count=1 ./internal/server/... ./internal/claudecode/...` → both `ok` (145.7s, 5.4s).
- `python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates` → still reports hits, all in `web/src/features/launch.ts` and `web/src/style.css` (web-impl's files, not daemon-impl's); `grep -E "^(cmd|internal)/"` over that output → empty. Daemon-side Critical 1 is clean.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` over every non-test file this fix touched → `dead-refs: 50 references checked, 0 missing`.
- `make check-kb` → `kb: 441 records, 23 features, 0 problem(s)` / `kb: all checks pass`.
- `bash .claude/skills/orchestrate/scripts/features-scope.sh maintainability-regressions` → `features-scope: every changed source file's feature is in **Features** (launch  ingest  connection)`.
- `make size-warn` → `internal/server/launcher.go` no longer appears among the `filelen` warnings (it did before this fix, at 507 lines; now 484). The pre-existing `funlen` warning on `Launch` (83 lines) remains, addressed as a Decisions correction above, not a code change.

**Handoff**: no test file was edited or needs editing for these issues. `internal/claudecode/settings_test.go` and `internal/server/launchermodels_test.go` were read but not touched; both still compile and pass unmodified (confirmed by the `go test -race` run above). Nothing to escalate.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: code Minor 1, code Minor 2.

**Changes made**:

- **code Minor 1** (stale "rewritten at every daemon start" claim). Enumerated every path with `rg -n 'rewrit|every daemon start|each daemon start' internal cmd -g '!*_test.go' -g '!internal/webui/**'` (the `internal/webui/**` exclusion drops a generated JS asset bundle whose minified text spuriously matches `rewrit`). Full result:
  - `cmd/musterd/CLAUDE.md:16` — "`tokens.json` is rewritten and re-chmodded 0600 on every startup" — **not this claim**: `tokens.go`'s `writeTokensFile` writes unconditionally every startup (confirmed by `rg -n 'tokens.json' internal cmd -g '!*_test.go'` → `cmd/musterd/tokens.go:60`'s own doc says "writes … on every startup", and it calls neither `AtomicWriteFile` nor `writeScriptAtomically`); `tokens.json` is untouched by this plan, so the sentence stays true and unedited.
  - `internal/triage/sanitize.go:32`, `internal/triage/doc.go:29`, `internal/server/themepoll.go:86` — describe unrelated rewriting (a triage entity-text pass; Claude Code's own config file writes), not the wrapper-script write path. Left as-is.
  - `internal/server/launcher.go:372` — a comment about `session.resume`'s own resumption bookkeeping ("rewrites" a session record), unrelated to wrapper scripts. Left as-is.
  - `internal/claudecode/settings.go:221` (`MergeSettings` doc) and `internal/server/launcher.go:82-83` (`sessionLauncher.hookScript`/`statusLineScript` doc) — the two flagged instances. Both edited to say the scripts are replaced at daemon start whenever their content (URL or token) changed, matching `AtomicWriteFile`'s skip-if-unchanged behaviour and the plan's Doc Delta.
  - `internal/claudecode/settings.go:371` — already said "rewriting unchanged content" as the case being *avoided* ("Content already on disk that equals content is left untouched … the common daemon-restart case, where rewriting unchanged content would otherwise still tax every reader") — this is the correct claim already, not the stale one; left unedited.
  No other production comment makes the "rewritten every daemon start" claim.

- **code Minor 2** (stale feature count in `New`'s doc). Counted register calls myself: `awk '/^func New\(/,/^}/' internal/server/server.go | grep -n 'register('` → 15 calls, one per feature construction (`models, reader, sessions, terminal, shell, locate, browse, repos, issue, prefs, ingest, usage, theme, shellActivity, update`), matching the review's own enumeration. A plain `grep -n 'register(' internal/server/server.go` over the whole file returns 17 lines: the same 15 calls plus two comment lines (`:88`, `:117`) that mention the pattern `register(s, …)` in prose without calling it — that's the source of the "17" the maintainability reviewer counted. `New`'s doc comment corrected from "13 features" to "15 features" (`internal/server/server.go:138`).

**Decisions**: none new. Both are comment-only corrections; no `design:`/`deviation:`/`doc-delta:` lines apply.

**Verification** (Fix Attempt 2, review cycle 2):

```
$ go build ./...
(exit 0, no output)

$ make lint
golangci-lint run
0 issues.

$ python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates
comment-checks: clean

$ gofmt -l . | grep -v webui
(no output)

$ go vet ./...
(no output)

$ git status --porcelain
 M internal/claudecode/settings.go
 M internal/server/launcher.go
 M internal/server/server.go
 M plans/maintainability-regressions/daemon-tests.md          # not mine, left alone
 M plans/maintainability-regressions/orchestration-state.json # not mine, left alone
?? docs/adr/launch-model-verdict-parser-in-api-launch.md      # not mine, left alone
```

Only comments changed in all three files (`git diff` pasted above in the tool transcript); no non-comment line moved. No test file needed changes.

**Handoff**: no test file was edited or needs editing for these two issues. Nothing to escalate.
