# Review: post-worktree-spike-issues

**Plan**: post-worktree-spike-issues
**Cycle**: 2 (delta re-review, §9)
**Verdict**: approved

Cycle 1's single agent-tagged Minor is fixed, correctly and completely: all eight sites carry
the corrected two-trigger wording, the new text matches Go's own `os/exec` documentation
verbatim in substance, and the delta changes no behaviour, no test and no `cmd.WaitDelay`
value. The full regression net was re-run from scratch — 281/281 E2E, `make test` across 14
packages, lint 0 issues, both builds, and all 9 authored checks.

## Scope of this review

§9 applies: cycle 1's only open agent-tagged issue was one Minor. §1 (full `make e2e` sweep)
and §2 (builds, unit tests, lint, `gates.sh --checks-only`) were run in full. The §2a browser
pass and the §3–§7 re-read are skipped, and the skip is justified rather than assumed: the
delta touches `internal/` but **only** inside the Minor's stated scope — the seven per-site
comments it named plus `preflight.go`, which it also named — and nothing under `web/src`,
`cmd/`, or any test file. Verified mechanically:

```
$ git diff 10cf027..HEAD -- '*.go' | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*//'
(no output — every changed line in every .go file is a comment line)

$ git diff --name-only 10cf027..HEAD | grep -v '^plans/'
docs/conventions.md
internal/claudecode/credentials.go
internal/claudecode/version.go
internal/ghissue/ghissue.go
internal/gitutil/gitutil.go
internal/locate/spotlight.go
internal/tmux/preflight.go
internal/tmux/tmux.go
```

The "no behaviour, no test, no `WaitDelay` value changed" claim is therefore measured, not
taken from the fix log.

## Requirements

Unchanged from cycle 1 — the delta implements nothing new. REQ-10's caveat is now discharged.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 — `WaitDelay` on every pipe-owning `exec.CommandContext` | Yes (7 files) | D5 + existing suites | pass |
| REQ-2 — `InstalledVersion` bounded against a descendant holding stdout | Yes | `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup` | pass |
| REQ-3 — same for `tmux.Preflight`'s `runCommand` | Yes | `TestRunCommand_DescendantHoldingStdoutDoesNotHang` | pass |
| REQ-4 — failed `start()` leaves nothing behind | Yes | `make e2e-fixture-leak-check` (W1) | pass |
| REQ-5 — rejection keeps its diagnostic + captured output | Yes | asserted in the self-test | pass |
| REQ-6 — E7 gates ⌥⌘1 on rail DOM order | Yes | `views.spec.ts` E7, 5× + full sweeps | pass |
| REQ-7 — takeover test reads the repaint before writing | Yes | D11 5/5 + D4 discrimination proof | pass |
| REQ-8 — `cmd/musterd` bound derived, arithmetic written down | Yes | D10 5/5 | pass |
| REQ-9 — one stub `claude` per package run | Yes | verified by grep; D10 5/5 | pass |
| REQ-10 — `docs/conventions.md` states the rule | Yes | reviewer-read (see Delta) | **pass** — cycle 1's caveat cleared |
| REQ-11 — drift guard (Nice to Have) | No — deliberate | n/a | accepted (cycle 1 Note 3) |
| REQ-12 — `musterdBinOverride` option field | Yes | W6/W7 reviewer-verified | pass |

## Build & Tests

E2E tests: **pass** (281 passed, 1.3 m — my own independent full sweep; `gates.sh`'s E1 passed
a second time)
Daemon tests: **pass** (`make test`, 14 packages green, no failures)
Web tests: **pass** (Vitest, 1053 tests / 29 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`npm run build` — `tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run`, 0 issues; `gofmt -l internal/ cmd/` clean)

**Honest note on my first sweep.** My first `make e2e` reported 279 passed / 2 failed
(`rail-order.spec.ts:469` and `:511`). Both were self-inflicted, not regressions: I had run
`npm run build` in `web/` concurrently, and that rewrites `internal/webui/assets/` — the
prebuilt artifacts the harness serves — mid-run, so the pages under test lost their bundle.
Both failures were "element(s) not found" on rail elements, exactly that signature. I re-ran
`make e2e` with nothing else running: **281 passed, exit 0**. `gates.sh`'s own E1 then passed
independently a third time. I am recording this rather than quietly reporting the green run,
because a reader comparing sweeps would otherwise see an unexplained red.

`test-specs.md` has no `## Repairs` table (E2E Scope is `harness-only`; no spec was authored).
No `test.skip` / `test.fixme` / `.only` and no weakened assertion appears in the delta — it
contains no test-file edit at all.

## Acceptance Checks

Re-run fresh by me via `.claude/skills/orchestrate/scripts/gates.sh post-worktree-spike-issues
--checks-only` (9 lines, 0 failed), not taken from the orchestrator's summary.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make check` | pass |
| D5 | `WaitDelay` present in all seven named files | pass |
| D6 | `git diff --quiet main -- internal/termbridge/termbridge.go` | pass |
| D10 | `go test -count=1 ./cmd/musterd` ×5 | pass |
| D11 | `go test -count=1 ./internal/server` ×5 | pass |
| W1 | `make e2e-fixture-leak-check` | pass |
| W5 | `git diff --quiet main -- web/src` | pass |
| E1 | `make e2e` | pass |
| E2 | `make web-build build` + `views.spec.ts` ×5 | pass |
| DOC | doc upkeep (orchestrator, pre-review) | pass — unchanged since cycle 1 verified it; the delta touches no `TODO.md`, `SPEC.md`, `docs/design/` or `docs/protocol.md` file. `docs/conventions.md` is touched, and its edit is the Minor's own fix, verified below. |

## Reviewer-Verified Criteria

Cycle 1 verified all fifteen; the delta re-opens exactly one of them, REQ-10, whose wording the
Minor was about. Re-verified here; the rest stand on cycle 1's evidence and are unaffected by a
comment-only diff.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| REQ-10 | `docs/conventions.md` states the pipe/`WaitDelay` rule | **pass** (cycle 1's caveat cleared) | See Delta below — the rule's rationale now matches `go doc os/exec.Cmd.WaitDelay` and no longer contradicts REQ-2's own test. |
| D2, D3, D4, D7, D8, D9, W2, W3, W4, W6, W7, E3, REQ-11 | (cycle 1) | pass, carried forward | Each rests on a file the delta does not touch. D7 in particular still holds: the delta added no identifier at all, only comment prose. |

## Hard-Rule Checklist

Re-checked against the delta rather than carried on trust. A comment-only diff cannot introduce
most of these, but rules 1 and 5 are prose-reachable — a comment can leak Claude-Code format
knowledge or quote a payload — so I read all eight new comment blocks for that specifically.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — the new prose names only `ctx`, `Wait`, pipes, `git`/`tmux`/`mdfind`. The `internal/claudecode/version.go` comment says "the `--version` stdout pipe", which is inside the adapter package where that knowledge belongs. No Claude-Code field name appears outside `internal/claudecode/`. |
| 2 | No terminal-output state parsing | pass — nothing touched |
| 3 | No blocking hook handler | pass — nothing touched |
| 4 | tmux dedicated socket; no `resize-pane` for sizing | pass — no tmux invocation changed; `internal/tmux/tmux.go`'s edits are both comment-only and `socketFlag()` is untouched |
| 5 | No payload logging | pass — no logging statement added; no comment quotes a payload |
| 6 | No empty-gauge dishonesty | n/a — no UI change (W5 green) |
| 7 | Session identity on the tmux target | pass — untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — no test or fixture changed |

## Manual Verification

Waived under §9, and the waiver is doubly grounded: the delta contains no executable change at
all (comments and one doc bullet), and the plan ships no user-facing UI change in the first
place — that is its own W5 criterion, green again in this cycle's run. Cycle 1 recorded the
browser evidence for the one browser-observable change (E7's readiness gate); this cycle's own
281/281 Chromium sweep plus E2's five consecutive `views.spec.ts` runs exercise it again.

There is nothing new to look at by hand, and I am stating that rather than skipping silently.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 1 Minor 1 `[daemon-impl]` — "The `WaitDelay` rule's explanation says the hang only happens once the context is done … The same narrowing recurs verbatim in the seven per-site comments" | `2cbbf88` | Full diff read; correctness checked against `go doc os/exec.Cmd.WaitDelay`; completeness checked by grep over all eight sites; scope checked by a comment-line-only filter over the whole `10cf027..HEAD` range. Details below. |

**Correctness.** The replacement wording is *"the timer starts when the context is done or when
`Wait` sees the child exit, whichever comes first"*. Go's own documentation, read from the local
toolchain rather than from memory:

> The WaitDelay timer starts when either the associated Context is done or a call to Wait
> observes that the child process has exited, whichever occurs first. When the delay has
> elapsed, the command shuts down the child process and/or its I/O pipes.

That is a faithful restatement, and the added sentence *"The grandchild case does not need the
context to fire at all"* follows directly from the second trigger. This was the risk the
orchestrator flagged — a wrong correction being worse than the original narrowing — and the
correction is right.

**Completeness — all eight sites, not just the doc bullet.** The Minor named the doc bullet,
seven per-site comments, and `preflight.go` as needing the least. All eight are done:

| Site | Corrected |
|------|-----------|
| `docs/conventions.md:31-38` | yes — verbatim the Minor's suggested wording |
| `internal/claudecode/version.go:33-38` | yes |
| `internal/claudecode/credentials.go:36-40` | yes |
| `internal/tmux/tmux.go:301-305` (`run`) | yes |
| `internal/tmux/tmux.go:325-328` (`runCapture`) | yes |
| `internal/gitutil/gitutil.go:52-56` | yes |
| `internal/locate/spotlight.go:36-40` | yes |
| `internal/ghissue/ghissue.go:62-66` | yes |
| `internal/tmux/preflight.go:34-40` | yes — reframed from "past ctx's deadline plus the delay" to the two-trigger form plus an explicit "even if ctx never fires" |

Negative grep over the whole tree, not just the named files, confirming no survivor of the
narrowed phrasing anywhere:

```
$ grep -rn "once ctx has killed\|even though the context is already done\|after the context's kill" docs/ internal/
(no output)
```

**Nothing beyond the fix's scope.** The two other files in the range are
`plans/…/daemon-implementation.md` (the fix log) and `plans/…/orchestration-state.json` plus the
`review.md` → `review.cycle2.md` rename, all orchestrator bookkeeping.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

Cycle 1's eight notes are unchanged and unactioned by design — none requested work. Restated
here in one line each so the completion summary has them in one place; the full text is in
`plans/post-worktree-spike-issues/review.cycle2.md` (cycle 1's archived review).

1. **[note]** W1's leak check verifies two of the criterion's three leaks; the deny-stub
   listener is reviewer-read, not gated, because the self-test `process.exit()`s (correctly).
   `process.getActiveResourcesInfo()` before the exit would close the gap cheaply if revisited.
2. **[note]** `tokensFileWriteBound = 20 * time.Second` has a derived floor (2 s + 5 s = 7 s,
   both constants confirmed) and a declared-headroom step to 20 s. Honest and documented; a
   future reader may re-ask where 20 came from.
3. **[note]** REQ-11's drift guard was rightly not added — the mechanical version false-positives
   on the three legitimately pipe-less `exec.CommandContext` sites and needs an allowlist that
   itself drifts. D5 + REQ-10 cover today.
4. **[note]** `musterdBinOverride` is silently ignored when `serveEmbedded` is set. Deliberate
   and reasoned in `web-implementation.md`; a future footgun if the field grows a second user.
5. **[note]** The leak-check's `os.tmpdir()` scan for `muster e2e-*` would false-fail if run
   concurrently with the Playwright suite. `gates.sh` is sequential, so it cannot bite today.
6. **[note]** The web-tests skip was the right call — no `web/src` change under a checked gate
   (W5), and neither the harness code nor the Node self-test is Vitest territory.
7. **[note]** The REQ-10 plan/dispatch ownership mismatch resolved correctly: daemon-impl wrote
   the rule, flagged the discrepancy, and the orchestrator did not duplicate it.
8. **[note]** `newRecordingStub` (`cmd/musterd/open_test.go:34`) still pays the per-call macOS
   first-exec tax that REQ-9 removed for the `claude` stub. Out of REQ-9's scope; D10 is 5/5.

New this cycle:

9. **[note]** `make e2e` serves the **prebuilt** `internal/webui/assets/`, so any concurrent
   `npm run build` (or `make web-build`) swaps the bundle underneath a running sweep and
   produces "element(s) not found" failures that look exactly like real UI regressions — I hit
   this myself, above. Given this plan's subject is E2E flakiness, it is worth knowing that this
   particular red is an operator hazard rather than a suite defect. `gates.sh` runs its checks
   sequentially, so the pipeline itself is safe; the hazard is only for a human or agent running
   a sweep alongside a build. No change requested.
