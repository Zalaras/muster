# Daemon Implementation: New Session Improvement

**Plan**: new-session-improvement
**Mode**: initial
**Pack**: kb pack 11268 words (budget 8000, WARN exceeds); sections — rules 1234 · features 1943 · diagrams 0 · decisions 4066 · proposed 0 · facts 2088 · lessons 1929 · runbooks 2

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/modelcheck.go` | created | REQ-1/REQ-2: `CheckModel(ctx, run, bin, dir, model)` builds the seven-element `--bare --no-session-persistence --model <m> -p ""` argv, runs it through the injectable `ModelCheckRun` seam, and returns a neutral `ModelVerdict` (`ModelRecognised`/`ModelUnrecognised`). `RunModelCheck` is the production seam (empty stdin, `WaitDelay`, exit code never treated as a signal). `stderrSaysUnrecognised` is the pure sentence check. Every Claude Code string (the catalog sentence, `--bare`, `--no-session-persistence`) lives only here. |
| `internal/claudecode/launch.go` | modified | REQ-4: `BuildArgv` now emits `--permission-mode <mode>` for `"default"` too (all four accepted modes), so "manual" launches/resumes with the mode forced explicit. Doc comment rewritten against `kb:fact/permission-mode-no-flag-follows-configured-default` — the old "default needs no flag, it's the safer spelling" rationale is gone. |
| `internal/server/sessions.go` | modified | `sessionLauncher` gains a `checkModel func(ctx, dir, model) (claudecode.ModelVerdict, error)` field (nil-safe — existing literal-constructed test launchers keep compiling/passing unchanged, D9). `Launch` calls it between `validateLaunchRequest` and `UpsertRepo`: an error logs at warn (directory + model, never the stderr body) and the launch proceeds (REQ-2); `ModelUnrecognised` returns the new `modelUnrecognized(model)` 400 `*launchError` before anything is written (INV-1). Message text matches the plan's REQ-1 wording byte-for-byte (verified against the plan's own JSON example, see Decisions). |
| `internal/server/server.go` | modified | Composition-root wiring only: `checkModel` bound to a closure applying a 5 s `context.WithTimeout` (REQ-1's bound) around `claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model)`. New `modelCheckTimeout` const. |

`internal/claudecode/CLAUDE.md` — left unchanged (see Decisions: no file/subprocess list needed updating).

## Decisions

- design: `ModelVerdict`/`ModelCheckRun` mirror the injectable-exec-seam pattern `internal/claudecode/credentials.go` already uses for `TokenReader`/`execFunc` (`rg -n "execFunc\|TokenReader" internal/claudecode/credentials.go` → the `execFunc` type + `KeychainTokenReader`/`FileTokenReader` seam, exercised entirely through fakes in `credentials_test.go`, never the real `security` binary). `ModelCheckRun` is exported (unlike `execFunc`) because it appears in `CheckModel`'s exported signature and `server.go` passes `claudecode.RunModelCheck` across the package boundary — closer to `TokenReader`'s shape than `execFunc`'s. No existing type already does this (`rg -n "type.*func.*context.Context.*\[\]byte, error" internal/claudecode` found only `execFunc`, whose stdout-only shape doesn't fit — this check needs stderr).
- design: `RunModelCheck` follows `internal/claudecode/version.go`'s `InstalledVersion` for the `WaitDelay`-bounded `exec.CommandContext` shape (both run the same `claude` binary), but adds the injectable seam `InstalledVersion` deliberately skips (it tests by pointing `bin` at a fake script instead) — `CheckModel` needs stderr specifically, which `InstalledVersion`'s `cmd.Output()` pattern doesn't capture, so a seam was the only way to test D4's sentence table without invoking a real subprocess.
- The 5 s timeout is applied at the `server.go` wiring closure, not inside `CheckModel` — matches the plan's own Affected Files line ("`checkModel` bound to `claudecode.CheckModel` … under a 5 s timeout") and keeps `CheckModel` itself timeout-agnostic: D6's "blocks past the context deadline" is then whatever deadline the caller supplies, tested directly against `CheckModel` without needing the production 5 s value.
- `RunModelCheck` treats a plain `*exec.ExitError` as success (verdict decided from stderr, never the code), per REQ-2 ("the exit code is not a signal: it is 1 for known and unknown models alike") — only a run that couldn't start at all, or was killed by `WaitDelay`/ctx, is reported as an error. Evidence the real binary always exits 1 either way: `kb:fact/model-catalog-precheck-zero-token`.
- `internal/claudecode/CLAUDE.md` not edited: its "Owns"/"Features" lines name no per-file list and its "Subprocesses run through the injectable `execFunc`" line is already not literally true of every subprocess in the package (`version.go`'s `InstalledVersion` calls `exec.CommandContext` directly, no seam) — `CheckModel` is, if anything, more aligned with that sentence than the existing precedent, so nothing here needed correcting.
- Every REQ this plan's Affected Files assigns to `daemon-impl` (REQ-1, REQ-2, REQ-4, and REQ-3's daemon-side half — the exact refusal message/code) is in Changes above. REQ-3's dialog-side display (`#launch-error`, staying open, untouched fields) is `web-impl`'s file per Affected Files, not mine. REQ-5–REQ-9 are web/E2E/canary(daemon-tests) territory per Affected Files and not touched here.
- Evidence — message byte-match: `fmt.Sprintf("Claude Code doesn't recognise the model %q — update Claude Code, or pick another model", "zephyr")` produces `Claude Code doesn't recognise the model "zephyr" — update Claude Code, or pick another model` verbatim (checked including the em dash, `python3` byte comparison against the plan's own JSON example — both `'—'`), matching REQ-1's JSON example exactly.
- Evidence — D5's seven-element argv: `[]string{bin, "--bare", "--no-session-persistence", "--model", model, "-p", ""}` — 7 elements, binary first, empty string last, exactly REQ-1's list.
- Evidence — D11 (`rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'`): no matches (`exit=1`), confirmed after this change.
- Evidence — pre-existing size warnings this change enlarges (not newly tripped): compared via a scratch `git worktree add --detach HEAD` at the pre-plan commit against `.claude/skills/orchestrate/scripts/size-warn.sh`. Before: `sessions.go` Launch funlen 74>60, file 785 lines. After this change: Launch funlen 83>60, file 814 lines (both from `make size-warn`'s own output). Both warnings existed before this plan; REQ-1's added check block and the new `modelUnrecognized` helper grew them further. No decision to make past what's already true of `docs/conventions.md` § "warn, never fail" — noted here for the maintainability reviewer rather than silently left implicit.
- No deviations from the plan; `BuildArgv`, `CheckModel`'s argv/verdict shape, the wiring location and the error code/message all match the plan and Protocol Contract as written.
- doc-delta: none beyond what the plan's own Doc Delta section already states — nothing shipped here contradicts or extends it.

## Handoff

**Build status**: `go build ./...` exits 0.

**Sanctioned test breakage** (per plan's Affected Files → Daemon tests: "`internal/claudecode/launch_test.go` — `TestBuildArgv` rows: `default` now emits the flag" — REQ-4's Protocol/plan-mandated behaviour change, not a defect):
- `internal/claudecode/launch_test.go`: `TestBuildArgv/default_mode_with_no_title_omits_both_--permission-mode_and_--name`, `TestBuildArgv/a_title_adds_--name_after_--model`, `TestBuildArgv/empty_title_never_adds_--name`, `TestBuildArgv/ResumeSessionID_emits_--resume_and_omits_--name_even_when_Title_is_also_set`, and `TestBuildArgv_UsesTheGivenBinaryName` all assert the old "default omits the flag" shape and now fail (`go test -race -count=1 ./internal/claudecode/...` — 5 failing, pasted diffs show only an added `"--permission-mode", "default"` pair, nothing else changed). These are compile-clean (only assertion values differ), so `make lint` / `go vet` still cover the whole tree with full signal — confirmed both `make lint` (0 issues) and, redundantly, `golangci-lint run --tests=false ./...` (transient unrelated `internal/webui` embed race from the concurrent web-impl build on the first attempt; retry showed only the expected test-only-usage false positives for `buildIssueSnapshot`/`loadPrefs`, neither touched by this change).
- No other test files need changes for this daemon-impl step. `internal/server/sessions_test.go` and the rest of `./internal/server/...` pass unchanged (nil `checkModel` keeps every existing literal-constructed `sessionLauncher{...}` test launcher behaving exactly as before, D9).

**Gates run**: `gofmt -l .` clean, `go vet ./...` clean, `go build ./...` exits 0, `make lint` 0 issues, `go test -race -count=1 ./internal/claudecode/... ./internal/server/...` (server package fully green; claudecode package green except the 5 sanctioned `TestBuildArgv*` failures above), `make size-warn` run (pre-existing warnings only, see Decisions).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `TestRunModelCheck_ContextDeadlineBoundsAHungProcess`
(`internal/claudecode/modelcheck_test.go`) — daemon-tests' implementation-bug verdict: a
ctx-timeout kill of a hung model-check subprocess was silently returned as `(stderr, nil)`
instead of an error, so `Launch`'s `if err != nil { warn log }` branch never fires for a
wedged binary (still fails open, functionally harmless, but REQ-2's required warn line
never appears).

**Root cause**: `exec.CommandContext`'s ctx-triggered kill (`SIGKILL` via the default
`Cancel`) and a process that merely exited non-zero on its own both come back from
`cmd.Run()` as the identical `*exec.ExitError` shape ("signal: killed" is not a distinct
Go error type) — confirmed by daemon-tests' standalone probe in `daemon-tests.md` (`err:
signal: killed`, `errors.As ExitError: true`, `errors.Is DeadlineExceeded: false`).
`RunModelCheck`'s `errors.As(err, &exitErr)` branch treated both alike and swallowed the
kill.

**Changes made** (`internal/claudecode/modelcheck.go`, `RunModelCheck`, exactly the
daemon-tests-suggested remedy): inside the existing `if err := cmd.Run(); err != nil`
block, check `ctx.Err()` first — if non-nil, return `(stderr.Bytes(), ctx.Err())`
immediately, ahead of the `errors.As(err, &exitErr)` swallow. `cmd.WaitDelay` (the other
kill path named in Edge Case 1, "the 5s context fires, and WaitDelay bounds a descendant
holding the pipe") only ever activates *after* ctx is already done or `Cancel` is called
(Go's own `exec.Cmd.WaitDelay` doc: it bounds the wait "after ... the associated Context's
Done channel is closed") — we never call `cmd.Cancel` explicitly, only rely on ctx — so a
single `ctx.Err()` check ahead of the ExitError branch closes both doors named in Edge
Case 1 (the ctx-deadline kill and the WaitDelay-forced one), not just the one the
reviewer's repro exercised. Left a comment on the change recording this so it isn't
mistaken for a narrower fix.

**Blast radius measured**: `rg -n "RunModelCheck|CheckModel\(" --glob '!*_test.go'
internal/ cmd/ test/` → one production caller, `internal/server/server.go:201`
(`claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model)`), already
wired to treat any `CheckModel` error as fail-open + warn log (D6/REQ-2) — exactly the
behaviour this fix now correctly triggers for a hung process; no other caller to check.

**Re-ran the tester's exact repro**: `go test -race -count=1 -run TestRunModelCheck
./internal/claudecode/... -v` — all 6 `TestRunModelCheck_*` pass, including
`TestRunModelCheck_ContextDeadlineBoundsAHungProcess` (was: `Error: An error is expected
but got nil`; now: `--- PASS (0.10s)`). Full tree: `go test -race -count=1 ./...` — all
packages `ok`, zero failures (was: one `FAIL` in `internal/claudecode`). `go vet ./...`
and `go vet -tags canary ./test/canary/...` clean. `gofmt -l internal/claudecode/modelcheck.go`
clean. `make lint` → `0 issues.`. `make size-warn` → 82 hits, unchanged set (no new hit in
`modelcheck.go` — the fix added a comment and 3 lines inside the existing function, no new
size warning tripped). `MUSTER_CANARY_OFFLINE=1 make canary` → green, including
`TestInstalledBinaryCarriesInterfaceStrings`. `python3
.claude/skills/orchestrate/scripts/dead-refs.py --all` → `2927 references checked, 0
missing`.

**Decisions**: no new `deviation:` or `doc-delta:` — this is the daemon-tests-suggested
remedy applied verbatim (ctx.Err() check ahead of the ExitError branch), no protocol or
plan-contract change, no new file or type.

**Files touched**: `internal/claudecode/modelcheck.go` only (comment + 3-line change
inside `RunModelCheck`). No test file touched.

## Fix Attempt — review cycle 1

**Issues addressed**: correctness Minor 4, correctness Minor 5, maintainability Major 1, maintainability Minor 3 (all `[daemon-impl]`).

**Correctness Minor 4** (`internal/server/sessions.go:151-153`, `:145-147`) — `Launch`'s
doc comment now names every step in order, including the one this plan added:
"Launch validates req, checks the model catalog, upserts the repo row, inserts the
session row, writes settings.local.json, spawns the tmux window, and
records/broadcasts the finished session — in that order …". The `checkModel` field
comment's nil-tolerance reason no longer cites "D9" (that's the validation-order
criterion, not the reason nil-tolerance exists): "nil means no check, so existing
literal-constructed test launchers keep compiling and behave exactly as before this
plan."

**Correctness Minor 5** (`internal/claudecode/CLAUDE.md:10`) — the hand-written
invariant line now reads "Subprocesses run through an injectable run seam (`execFunc`,
`ModelCheckRun`); no test executes the real `security` or `claude` binary" — true of both
of the package's exec seams, not just `execFunc`. Only this line changed; the generated
trailer below `<!-- kb:trailer -->` is untouched.

**Maintainability Major 1** (`internal/server/server.go`, `internal/claudecode/modelcheck.go`)
— moved the model-check timeout policy out of the composition root and into
`internal/claudecode`, mirroring `credentials.go`'s `keychainExecTimeout`/
`KeychainTokenReader` shape exactly as the finding asked:
- `internal/claudecode/modelcheck.go`: added `const modelCheckTimeout = 5 * time.Second`
  next to `modelCheckWaitDelay`, and `CheckModel` now opens with
  `ctx, cancel := context.WithTimeout(ctx, modelCheckTimeout); defer cancel()` before
  building argv — the timeout is applied inside the check itself, the way
  `KeychainTokenReader` applies `keychainExecTimeout` inside itself rather than leaving it
  to `usage.go`'s wiring.
- `internal/server/server.go`: removed the `modelCheckTimeout` const and its comment
  (former lines 22-25), and simplified the `checkModel` closure to
  `func(ctx, dir, model) (claudecode.ModelVerdict, error) { return
  claudecode.CheckModel(ctx, claudecode.RunModelCheck, claudeBin, dir, model) }` — one
  statement, no constant, no policy of its own. The closure itself is still required
  (unlike `KeychainTokenReader(cfg.KeychainUser, claudecode.RunCommand)`'s bare
  one-expression wiring in `usage.go:77`) because `CheckModel`'s exported signature takes
  `run`/`bin` params the `checkModel` field type doesn't carry — `claudeBin` has to be
  bound from `New`'s local scope, and there is no way to make that a zero-wrapper
  expression without changing `CheckModel`'s signature (out of scope for this fix: the
  Protocol Contract/plan do not ask for that, and D5's tests call `CheckModel` with an
  explicit `bin` argument).
  `time` import removed from `server.go` — confirmed unused after the const's removal
  (`grep -n "time\." internal/server/server.go` → no hits before adding the edit; `go
  build ./...` and `go vet ./...` both clean after).
- Verified the "test controls timing via a short-deadline ctx" claim the finding rests
  on, rather than trusting it: `TestCheckModel_ContextDeadlineExceeded_FailsOpen`
  (`internal/claudecode/modelcheck_test.go:142-154`) passes `CheckModel` a ctx already
  past a 1-nanosecond deadline; wrapping it with `context.WithTimeout(ctx,
  modelCheckTimeout)` inside `CheckModel` preserves the earlier (already-fired) deadline
  per Go's `context` semantics (a child's deadline is `min(parent, own)`), so the derived
  ctx is still immediately done and `run`'s `runCtx.Err()` is still
  `context.DeadlineExceeded` — ran `go test -race -count=1 -run TestCheckModel
  ./internal/claudecode/... -v`: all `TestCheckModel_*` pass, including that one, with no
  test-file edit.
- Blast radius measured: `rg -n "modelCheckTimeout\b" --glob '*.go' .` → only the two
  sites edited (the new `const` in `modelcheck.go` and its former, now-removed, site in
  `server.go`) — no other reader of the constant.
- `test/canary/harness_test.go`'s run F (`modelCheckRunTimeout = 5 * time.Second`,
  `:93-95`) wraps its own `context.WithTimeout(ctx, modelCheckRunTimeout)` around its two
  direct `claudecode.CheckModel(...)` calls (`:756`, `:764`). After this change that
  outer wrap is redundant (nested with an inner 5 s timeout of the same value, `min` of
  two equal durations is a no-op) but not broken — `go vet -tags canary
  ./test/canary/...` is clean and the file still compiles unchanged. Flagging per this
  fix wave's instructions: `test/canary/harness_test.go` is a test file for daemon-tests
  to simplify (drop the now-redundant outer `context.WithTimeout`/`modelCheckRunTimeout`)
  if it chooses to; not touched here.

**Maintainability Minor 3** (`server.go:127` `New`, `sessions.go:206` `Launch`) — reasons
for both size warnings, measured rather than asserted:
- `New` funlen 48>40 (`internal/server/server.go:121`): measured against `main` before
  this plan touched the file at all, via a detached worktree
  (`git worktree add --detach /tmp/muster-main-scratch main`, then
  `bash .claude/skills/orchestrate/scripts/size-warn.sh` inside it) →
  `WARN internal/server/server.go:120:6: Function 'New' has too many statements (48 > 40)
  (funlen)` — identical count, pre-existing before this plan. The `checkModel` field this
  plan adds is one more field inside the single already-existing
  `launcher := &sessionLauncher{...}` composite-literal statement (`git diff main
  b2ccbe6 -- internal/server/server.go` shows the addition landing entirely inside that
  one statement), so it adds no new top-level statement to `New` and the count is
  unchanged by this plan's work (48 both before and after, confirmed by re-running
  `size-warn.sh` on the current tree). `New` is musterd's one composition root
  (kb:adr/process-composition-roots-registration-only): every feature's construction and
  `register(s, …)` call has to live in this one function by design, so splitting it would
  either scatter feature wiring across multiple functions (the thing the ADR forbids) or
  extract a helper with exactly one call site and no reuse — not a size reduction, a
  relabeling. Kept as is; worktree cleaned up (`git worktree remove
  /tmp/muster-main-scratch --force`).
- `Launch` funlen 83>60 and the 814-line file (`internal/server/sessions.go:206`): the
  model-check step is a 3-statement branch (`if l.checkModel != nil { verdict, err :=
  …; if err != nil { warn-log } else if verdict == ModelUnrecognised { return } }`) that,
  unlike `validateLaunchRequest`/`writeSettings`/`spawnAndRecordLaunch`, has no internal
  logic of its own left to name — the actual work (running the check, building the
  argv/verdict, and building the rejection) already lives in `l.checkModel` and
  `modelUnrecognized`, both named and tested independently. Extracting the branch itself
  into a helper would only wrap `if …{ return nil, lerr }` in a call that still has to
  hand its result back to `Launch` for the actual early return — `Launch` is the only
  place allowed to decide "stop here," the same reason `validateLaunchRequest`'s early
  return is inlined at Launch's very first line rather than itself being wrapped one
  layer deeper. Not a request to split anything, per the finding — kept inline.

## Verification

- `gofmt -l .` — clean.
- `go vet ./...` — clean.
- `go build ./...` — exits 0.
- `make lint` — `0 issues.`
- `go test -race -count=1 ./internal/claudecode/... ./internal/server/...` — both `ok`
  (claudecode 7.6s, server 102.6s), no failures, no test file touched.
- `go vet -tags canary ./test/canary/...` — clean (confirms `harness_test.go` still
  compiles against the new `CheckModel`/timeout shape).
- `make size-warn` — same four pre-existing hits as before this wave
  (`server.go` `New` 48>40, `sessions.go` `Launch` 83>60, `sessions.go` `Resume` 41>40,
  `sessions.go` file 814 lines); no new hit introduced.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py --all` — `2940 references
  checked, 0 missing`.

**Decisions**: no new `deviation:` or `doc-delta:` — all four fixes are comment/wiring
corrections inside the already-approved contract; nothing here changes the wire, the
argv, the verdict shape, or any REQ's behaviour.

## Handoff

**Build status**: `go build ./...` exits 0.

**Test files**: none edited. `test/canary/harness_test.go`'s `modelCheckRunTimeout` wrap
around its two `CheckModel` calls (`:93-95`, `:756`, `:764`) is now redundant (not
broken) — named above for daemon-tests to simplify if it chooses to.

**Gate follow-up (review cycle 1, wave-1 red)**: D11's boundary grep
(`rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/
--glob '!internal/claudecode/**'`) matched my own new `Launch` doc comment's "checks the
model catalog" wording (`internal/server/sessions.go:151`) — reworded to "runs the model
check" (neutral, no catalog knowledge outside `internal/claudecode`); re-ran the exact D11
command in an interactive shell (not `bash -c`) → zero matches (`exit=1`); `go build ./...`
exits 0; `make lint` → `0 issues.`
