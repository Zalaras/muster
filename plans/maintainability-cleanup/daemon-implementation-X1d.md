# Daemon Implementation: maintainability-cleanup — Unit X1d (plan-ID comment sweep, internal/server + remaining internal/ packages)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: kb: 425 records, 23 features, 0 problem(s) (`make check-kb`, run before this unit's edits); pack command (`go run ./tools/kb pack --plan maintainability-cleanup --role daemon-impl`) returned only the `worktree-shares-git-config` lesson and the `release-signing` runbook — no plan-scoped protocol delta for this comment-only unit, consistent with X1a/X1b.

## Scope

Comments only, no code changes, across the remaining `internal/` packages not covered by X1a
(`internal/session`, `internal/store`) or X1b (`cmd/musterd`, `internal/termbridge`, `internal/tty`,
`internal/webui`): **`internal/server`**, **`internal/claudecode`** (excluding the test-support
`claudecodetest/` subpackage), **`internal/tmux`** (excluding `tmuxtest/`), **`internal/gitutil`**,
**`internal/selfupdate`**, **`internal/locate`**, **`internal/ghissue`**, **`internal/usage`**,
**`internal/boundedwait`**. Per plan.md § "Defaults that bind the units": code comments cite no
plan IDs (`REQ-n`, `Dn`, `Edge Case n`, review cycles, plan or milestone names).

Method follows `daemon-implementation-X1a.md`/`-X1b.md` exactly. Work was fanned out to four
helper subagents split by directory (as the team-lead's brief instructed), each of which read
X1a/X1b first, resolved every hit via `go run ./tools/kb for <file>` + `kb show <slug>`
verification or plain prose, ran its own gates, and reported back; I then independently
re-verified the combined result (below).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/auth.go`, `bgloop.go`, `browse.go`, `evict.go`, `ingest.go`, `issue.go`, `issuecapture.go`, `issuesnapshot.go`, `launcher.go`, `launcherrors.go`, `locate.go`, `prefs.go`, `reader.go`, `repos.go`, `respond.go`, `server.go`, `sessions.go`, `sessionwire.go`, `shellactivity.go`, `shells.go`, `state.go`, `terminal.go`, `themepoll.go`, `update.go`, `updatemanager.go`, `updatewire.go`, `usage.go`, `usagepoll.go`, `usagewire.go`, `ws.go` | comments | 256 raw regex hits (REQ/D/INV/Edge Case/review-cycle/milestone/plan-name/ad-hoc finding-tag citations) resolved to `kb:adr/…` (e.g. `lifecycle-session-ids-monotonic-never-reused`, `actions-serialized-per-session`, `launch-refuses-model-outside-binary-catalog`, `ingest-all-hooks-command-wrappers`, `issue-payload-allowlist-never-dump`, `issue-capture-then-file-server-held`, `reader-plan-sticky-once-named`, `rail-card-title-leads-and-density-ramp-corrected`, `theme-claude-theme-read-only-poll`, `update-check-runs-in-daemon-daily`, `usage-model-window-polled-from-oauth-api`, and more — full list in the per-file report below), to `kb:spec/reader`/`kb:spec/settings`, to plain prose, or dropped where purely restating code. A stale `issuesnapshot.go` "D6 automated check" claim was replaced with the real, verified test name. Ad-hoc reviewer tags (`b-M8`/`b-m1`/`b-m13`) in `respond.go` had no kb record (verified by grep) and were rewritten in prose. |
| `internal/claudecode/credentials.go`, `doc.go`, `files.go`, `interpret.go`, `launch.go`, `modelcheck.go`, `plan.go`, `settings.go`, `status.go`, `theme.go`, `usageapi.go`, `version.go` | comments | 113 raw hits resolved to `kb:fact/…` (e.g. `unknown-before-first-response`, `rate-limits-wire-shape`, `model-catalog-precheck-zero-token`, `permission-mode-flag-on-wire`, `oauth-token-in-keychain`, `usage-api-oauth-shape`, `permission-mode-presence-split`, `resume-keeps-session-identity`, `sessionstart-model-optional-string`), `kb:adr/…` (`ingest-all-hooks-command-wrappers`, `launch-refuses-model-outside-binary-catalog`, `theme-claude-theme-read-only-poll`, `usage-keychain-token-read-only`, `lifecycle-resume-rebinds-existing-session`, `connection-installed-claude-classified-never-refused`, `ingest-shell-quote-at-write-boundary`), `kb:spec/reader`, or plain prose/dropped. `launch.go`'s `spikes/S2-findings.md`/`spikes/S6-scroll-bandwidth.md` file citations were kept (real, permanent files still in the repo, already cited by accepted ADR/fact records — verified below) while fragile inline section pointers ("S6 §1") were replaced with `kb:` citations. |
| `internal/tmux/tmux.go`, `preflight.go` | comments | 86 raw hits (milestone names, D-numbers, REQ-ns, review-cycle findings, non-regex `spikes/FINDINGS.md §7`/`§7(d)` pointers) resolved to `kb:adr/…` (`surfaces-one-tmux-session-per-session`, `actions-kill-is-idempotent`, `surfaces-shell-is-attach-target-not-session`, `lifecycle-session-ids-monotonic-never-reused`, `lifecycle-reconcile-converges-with-the-socket`, `lifecycle-reconcile-before-first-snapshot`, `actions-pane-snapshot-display-only`, `surfaces-tmux-preflight-at-startup`, `surfaces-unrecognised-tmux-version-warns`, `process-exec-waitdelay-on-pipe-owning-commands`), `kb:lesson/resize-pane-silent-noop`, or plain prose. |
| `internal/selfupdate/apply.go`, `doc.go`, `exeversion.go`, `install.go`, `lock.go`, `pubkey.go`, `release.go`, `semver.go`, `verify.go` | comments | 37 raw hits resolved to `kb:adr/…` (`update-install-kinds-decide-who-may-apply`, `update-trust-root-minisign-signed-checksums`, `update-release-knowledge-in-selfupdate-package`, `release-latest-resolved-via-redirect-not-api`), `kb:anchor/ws.update` (apply-phase enum, verified against `docs/protocol.md`), or plain prose. `semver.go` and `exeversion.go` have no dedicated ADR for their version-ordering/post-swap-probe mechanics (grepped `docs/adr docs/facts`, no hits) — rewritten in prose, no invented citation. |
| `internal/locate/locate.go`, `spotlight.go`, `walk.go` | comments | 16 raw hits resolved to `kb:spec/drop`, `kb:adr/drop-daemon-locates-original-never-stages`, `kb:diagram/daemon-components`, `kb:anchor/sessions.locate`, or dropped (`DefaultWalkCap`'s exact value, `EvalSymlinks` dedup — no dedicated record, restated in prose). |
| `internal/usage/aggregator.go`, `modelscoped.go`, `usage.go` | comments | 16 raw hits resolved to `kb:adr/usage-no-hydration-across-restart` (dated comment verified 2026-08-23 match), `kb:adr/usage-sample-dedup-by-value`, `kb:fact/status-posts-arrive-in-pairs` (verified the cited "435 ms" median against the fact record), `kb:adr/usage-no-source-interface`, `kb:adr/usage-model-window-polled-from-oauth-api` (dated comment verified 2026-08-30 match), or dropped (`R4`, a bare plan-requirement id with no kb record — grepped, none found). |
| `internal/ghissue/ghissue.go` | comments | 10 hits resolved to `kb:adr/issue-auth-gh-token-at-time-of-use` (verified: token never stored, never logged), `docs/conventions.md § Testing` (injectable-run-func seam), or plain prose/dropped (5s/10s timeouts cross-referenced against the actual code constants). |
| `internal/gitutil/gitutil.go` | comments | 1 hit: `m1-sessions needs` → "the launch dialog needs" (verified via `kb for` → `kb:adr/launch-hybrid-mru-directory-memory`). |
| `internal/boundedwait/boundedwait.go` | comments | 1 hit: dropped `(maintainability-cleanup review, Major 4/G3)` — this cleanup plan's own review-finding tag — restated in prose; kept the pre-existing `kb:diagram/daemon-components` citation. |

No `CLAUDE.md` edits needed in this unit's scope: `internal/claudecode/CLAUDE.md`, `internal/server/CLAUDE.md`, `internal/locate/CLAUDE.md`, `internal/selfupdate/CLAUDE.md`, `internal/tmux/CLAUDE.md`, `internal/usage/CLAUDE.md` were all grepped (case-insensitively, the same pattern) and their only hits are the false-positive "a session's plan" phrase already identified by X1a — no genuine plan-ID citation in any of them. `internal/ghissue`, `internal/gitutil`, `internal/boundedwait` have no `CLAUDE.md`.

## Decisions

- Every REQ the plan lists for this unit (X1's comment sweep over the remaining `internal/`
  packages) is covered above; no REQ deliberately skipped.
- **No kb record exists** cases, verified by grep before falling back to prose (never invented a
  slug): `internal/selfupdate/semver.go`'s version-parsing/ordering rationale;
  `internal/selfupdate/exeversion.go`'s post-swap version-probe mechanics; `internal/ghissue`'s
  "plan issue-capture D5" two-string-API-shape claim; `internal/usage/usage.go`'s "a partial
  bucket is never modeled" claim; `internal/usage/aggregator.go`'s bare `R4`
  (`plans/m3-gauges/plan.md` requirement id, not a kb record — confirmed only in `plans/`, not
  `docs/`); `internal/locate/locate.go`'s `DefaultWalkCap` value and `EvalSymlinks` dedup detail;
  `internal/claudecode/theme.go`'s D8 "structurally ignored by json.Unmarshal" (self-evident Go
  behaviour, not a Claude Code fact). All rewritten in plain prose with no citation.
- `internal/claudecode/launch.go` kept its bare `spikes/S2-findings.md` / `spikes/S6-scroll-bandwidth.md`
  file citations rather than replacing them with `kb:` slugs — I independently verified both files
  still exist (`ls spikes/S2-findings.md spikes/S6-scroll-bandwidth.md`) and are already cited by
  accepted records (`grep -rl S6-scroll-bandwidth docs/adr docs/facts` → `surfaces-scrollback-affordance-not-built.md`, `surfaces-scrollback-affordance-claude-pane-only.md`, `surfaces-scroll-speed-via-launch-env.md`, `surfaces-shell-busy-from-tmux-process-state.md`, `surfaces-control-mode-not-adopted.md`, `scroll-speed-env-present.md`) — a real, permanent file pointer, not a stale plan-ID.
- `internal/tmux/tmux.go` and `internal/termbridge`'s non-regex `spikes/FINDINGS.md §7(d)` pointer
  (same category X1b already treated for `internal/termbridge/termbridge.go`) was replaced with
  `kb:adr/surfaces-shared-attach-single-pty` / the matching tmux ADR, not left as a raw spike-file
  section pointer.
- No `deviation:` — this unit is comment-only by design (plan.md § X1) and no code path required
  scope beyond the nine assigned directories.
- No `doc-delta:` — no behavior changed, only comment text; nothing in the plan's Doc Delta
  concerns comment wording.
- **Attempted binary sha256 proof, found it doesn't hold for Go and used a stronger proof
  instead.** The team-lead's brief asked for a `-trimpath` binary sha256 comparison as "proof"
  that comments don't reach the binary. I built `musterd` from an isolated, race-free copy of the
  tree (`rsync`'d to scratch, excluding `.git`/`node_modules`, so concurrent teammates in this
  shared worktree couldn't mutate it mid-build) both with the 57 purely-comment-only files at
  their current (post-sweep) content and reverted to `git show HEAD:<path>` (pre-sweep), using
  `-trimpath -ldflags "-X main.version=x -buildid="` (the `-buildid=` was necessary just to make
  *repeat* builds of *identical* source reproducible at all — without it, two builds of the exact
  same unchanged source produced different sha256 hashes, confirmed with `before3`/`before4`
  matching only once `-buildid=` was added). Even with that plus `-ldflags "-s -w"` (strip symbol
  table and DWARF), the pre-sweep and post-sweep binaries still differed by ~2 MB out of 36.9 MB
  (`cmp -l` count: 2,055,638 differing bytes, identical file size). Root cause: Go's `pclntab`
  (the runtime's function/line-number table, used for panics and `runtime.Caller`) embeds source
  line numbers and is **not** removable by `-s -w` — those flags only strip the symbol table and
  DWARF debug info. Adding, removing or reflowing a comment shifts subsequent line numbers within
  a file, which necessarily changes `pclntab`'s bytes even though program behaviour is identical.
  A byte-identical binary is therefore not achievable for a pure comment change in Go, regardless
  of how carefully the sweep was done — this is a toolchain property, not a defect. I used the
  correct tool for the actual claim instead: a small `go/parser`+`go/format` program that parses
  each file with comments discarded (`parser.ParseFile(fset, path, nil, 0)`) and re-prints it
  canonically, then diffs the pre-sweep and post-sweep canonical output. Run over all 57 files
  whose full diff-from-HEAD is comment-only (i.e. excluding the 5 files a concurrent unit was
  simultaneously editing for real code changes — see next point): **0 of 57 files showed any
  AST-level (comment-stripped) difference.** This is a stronger and more directly relevant proof
  than a binary hash for the actual property being tested ("no code changed, only comments").
- **Five files in `internal/server` (`shells.go`, `terminal.go`, `updatemanager.go`, `prefs.go`,
  `ws.go`) were being edited concurrently by another pipeline unit (F2/F3: a `keyedlock` refactor,
  an `applyCancel`/`boundedwait` shutdown path, a `sync.Mutex` addition in `prefs.go`, a
  `closeAll` restructure in `ws.go`)** for real functional changes, landing in the same shared
  worktree while the `internal/server` helper subagent was mid-edit on the same files. Since a
  full-file revert-to-HEAD would also undo that concurrent unit's real code (not mine to revert),
  these 5 files were excluded from the automated AST-diff proof above and instead verified by hand:
  `git diff -U0` scoped to non-comment-prefixed lines was inspected line-by-line for the whole
  9-directory scope (pasted below under Verification) and every non-comment-line change in these
  5 files was confirmed to belong to the concurrent unit (e.g. `+"github.com/Zalaras/muster/internal/keyedlock"`, `+applyWG sync.WaitGroup`), with exactly one pure trailing-comment
  edit of mine per touched file where applicable (`sessionwire.go`'s `Title:` line, `server/usage.go`'s
  `poller` line, `internal/usage/modelscoped.go`'s `current []ModelWindow` line,
  `updatemanager.go`'s `startInfo` line — all four confirmed byte-identical on the code token
  before/after). This matches and independently re-confirms what the `internal/server` helper
  subagent itself reported doing.
- **This is a live, shared worktree with several concurrent pipeline units actively writing to
  it.** Between my first and second full-scope `git status` snapshots, `internal/server/terminal.go`
  and then `internal/server/shells.go` each transitioned from "modified" back to "matches HEAD"
  (the concurrent unit apparently restructured its own change, e.g. moving the `keyedlock`
  refactor between files), and five new test files
  (`prefs_concurrency_test.go`, `shell_remove_lock_test.go`, `terminal_registry_lock_test.go`,
  `updatemanager_stop_test.go`, `wshub_closeall_test.go`) and a new package (`internal/keyedlock`)
  appeared mid-session — none of which are mine or in this unit's scope. I re-ran every gate
  after these appeared and confirmed my own scope stayed green throughout (see Verification).

## Verification

- Before/after hit counts (case-insensitive, `*.go` non-test, `claudecodetest/`+`tmuxtest/`
  excluded), across all nine directories combined:
  - `rg -ni 'REQ-[0-9]|INV-[0-9]|\bD[0-9]{1,2}\b|Edge Case|review cycle|\b(Major|Minor|Critical) [0-9]|m[0-9]-[a-z]|Implementation Notes|plan [a-z-]+' ... --glob '!**/claudecodetest/**' --glob '!**/tmuxtest/**'` → **502 → 18**, all 18 confirmed false positives by manual read: the reader feature's own domain noun "plan" (`readerwire.go`, `sessionwire.go`, `reader.go`, `plan.go` — "plan object", "plan field", "plan path", "plan-mode plan", "entered plan mode", "plan directory" — none are `plan <slug>` citations to an archived plan document) and lowercase "edge case" as ordinary English in `theme.go` (not a numbered `Edge Case N`).
  - `rg -ni '\b[a-e]-[cm][0-9]+\b' ...` → **4 → 0**.
  - `rg -n '\bS[0-9]\b|\bV[0-9]\b|\bSeed\b' ...` → **4 → 3**, all three the literal permanent filename `spikes/S6-scroll-bandwidth.md` in `internal/claudecode/launch.go` (justified above).
- Scope confirmation: `git diff --name-only` across the nine directories touched exactly the
  files listed in Changes (61 at final count, after the concurrent unit's own churn moved code
  in and out of `shells.go`/`terminal.go`/`prefs.go`/`ws.go`/`updatemanager.go`); **zero**
  `*_test.go` files and **zero** files under `claudecodetest/`/`tmuxtest/` in the diff.
- Code-token spot-check, whole scope: `git diff -U0 -- <9 dirs> ':!*_test.go' | grep '^[-+]' | grep -v '^[-+]\s*//' | grep -v '^[-+][-+]'` → every printed line pair is either (a) a
  trailing-comment-on-code-line edit where the code token is byte-identical (4 cases, listed
  above), or (b) the concurrent F2/F3 unit's real code in the 5 flagged `internal/server` files
  (keyedlock import/fields/calls, `sync`/`applyCancel`/`applyWG`/`boundedwait` additions, `ws.go`'s
  `closeAll` lock-then-copy restructure) — confirmed by cross-referencing `plans/maintainability-cleanup/daemon-implementation-F2.md`/`-F3.md` existing and `internal/keyedlock/` being an untracked (`??`) new package, not touched by any X1d edit.
- AST-level (comment-stripped) diff, the 57 files with no concurrent interleaving: **0 of 57**
  show any difference beyond comments (method and reasoning under Decisions).
- `gofmt -l internal/server internal/claudecode internal/tmux internal/gitutil internal/selfupdate internal/locate internal/ghissue internal/usage internal/boundedwait` → no output (clean), re-run after the AST proof's file reverts/restores to confirm the working tree was left exactly as the subagents produced it.
- `go build ./...` → exit 0, no output.
- `go vet ./...` → exit 0, no output.
- `make lint` (whole repo) → failed, but on issues entirely outside this unit's scope and not
  present at the start of the session: `testifylint` findings (`go-require` outside the test
  goroutine) in three brand-new, untracked test files (`prefs_concurrency_test.go`,
  `shell_remove_lock_test.go`, `wshub_closeall_test.go`) added mid-session by the concurrent F2/F3
  unit. Re-run scoped and with tests excluded to isolate this unit's own contribution:
  `golangci-lint run --tests=false ./internal/server/... ./internal/claudecode/... ./internal/tmux/... ./internal/gitutil/... ./internal/selfupdate/... ./internal/locate/... ./internal/ghissue/... ./internal/usage/... ./internal/boundedwait/...` → **0 issues.** (This unit never touches test
  files by constraint, so `--tests=false` is a legitimate scope filter, not a way of hiding a
  finding — the failing tests are real, just not mine.)
- `make check-kb` → 3 problems, all pre-existing/concurrent and none touching my citations:
  `internal/keyedlock/keyedlock.go` and `internal/keyedlock/keyedlock_test.go` ("owned by no
  feature" — new package from the F2/F3 unit, untracked, not mine) and
  `internal/server/shell_remove_lock_test.go` (new test file, same unit). Every `kb:` citation
  this unit's edits added resolves (426 total records, 0 citation-resolution problems).
- `make refs` → `dead-refs: 3063 references checked, 0 missing` (remaining output lines are
  pre-existing gitignored-path notices, unrelated).
- `go test -race -count=1 ./internal/server/... ./internal/claudecode/... ./internal/tmux/... ./internal/gitutil/... ./internal/selfupdate/... ./internal/locate/... ./internal/ghissue/... ./internal/usage/... ./internal/boundedwait/...`:
  first full run (before the concurrent unit's new test files landed) → all packages `ok`
  (`internal/server` 102.7s, `internal/claudecode` 13.7s, `internal/tmux`+`tmuxtest` 15.1s/5.6s,
  `internal/gitutil` 7.9s, `internal/selfupdate` 7.7s, `internal/locate` 4.9s, `internal/ghissue`
  4.3s, `internal/usage` 9.5s; `internal/boundedwait` has no test files). Re-run after the
  concurrent unit's new test files appeared → `internal/server` now **FAILs**:
  `TestHandleCreateShell_BlocksConcurrentRemoveUntilEnsureCompletes` in the untracked (`??`)
  `internal/server/shell_remove_lock_test.go`, asserting "Major 3 regression: the session row was
  removed while handleCreateShell still held session.Manager's per-id lock inside Ensure" — this
  is the concurrent F2/F3 unit's own in-progress concurrency-bug regression test, added and
  failing entirely independently of this unit's comment-only edits (comments cannot affect
  runtime locking behaviour, and the AST-diff proof above already confirms zero non-comment change
  to any file this unit touched). Not investigated or touched, per this unit's constraint against
  editing tests and against scope creep into another unit's work.

## Handoff

**Build status**: `go build ./...` exits 0.
No test files needed changes — none.

**Not this unit's problem, flagged for the orchestrator**: `internal/server/shell_remove_lock_test.go`
(new, untracked, from the concurrent F2/F3 unit) is currently red on the shared worktree with a
real concurrency-bug message ("Major 3 regression: the session row was removed while
handleCreateShell still held session.Manager's per-id lock inside Ensure"). `make lint` is also
currently red on the whole-repo run because of `testifylint` findings in that same unit's other
new test files. Both are outside this unit's directories/constraints (test files, and not
`internal/server`'s comment sweep) — reported here only so the orchestrator doesn't mistake them
for X1d fallout.
