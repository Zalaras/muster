# Daemon Implementation: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Mode**: initial
**Pack**: `kb: pack 36969 words (budget 20000)` — WARN exceeds budget (sections: rules 1295 · features 13192 · decisions 12682 · facts 7359 · lessons 2433 · runbooks 2)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/launch.go` | modified | `PermissionBypass = "bypassPermissions"` joins `PermissionModes`; `BuildArgv` omits `--model` when `Model == ""` (D1, D2) |
| `internal/claudecode/launchtranscripts.go` | created | The only owner of the projects-dir layout: `ProjectsDir()`, folder-name encoding (exact + >200-char prefix match), `PastSessions(root, dir) ([]PastSession, error)` with the 64 KB tail-then-head read, the cwd filter, title/prompt/mode/model extraction (D3–D8) |
| `internal/session/session.go` | modified | `PermissionBypass` joins the `PermissionMode` constant set, derived from `claudecode.PermissionBypass` |
| `internal/session/manager.go` | modified | `AliveByClaudeSessionID` (shared one-alive-row lookup); `CreateSession` now stores a nil `Model` column when `p.Model == ""` instead of a pointer-to-empty-string, so a resumed-from-list session with no recorded model renders "unknown" like any other null-model session |
| `internal/store/repo.go` | modified | `TouchRepo`/`TouchRepoParams` — REQ-15's MRU/launch-count bump that never writes `last_model`/`last_permission_mode` |
| `internal/server/launcher.go` | modified | `createSessionRequest.ResumeSessionID *string`; `LaunchConfig.ProjectsDir`; `sessionLauncher.projectsDir`; `Launch` routes a non-nil `ResumeSessionID` to `launchResume`; extracted `repoContext`/`createAndSpawn` helpers shared by `Launch` and `launchResume`; `Resume` refuses (`409 not_resumable`) when another alive session already holds the same Claude session id (REQ-12/D12) |
| `internal/server/launcherpast.go` | created | `validateResumeRequest`, `findPastSession`, `launchResume` — the `resumeSessionId` branch of `POST /api/sessions`: directory → combination → existence (404) → already_open (409) → `TouchRepo` → settings → argv → `createAndSpawn` |
| `internal/server/launcherpastlist.go` | created | `pastSessionsFeature` — `GET /api/past-sessions`: directory validation, `claudecode.PastSessions` (fail-open + log on error), newest-first sort, 200-cap + `truncated`, `openSessionId` marking, `lastPrompt` first-line/200-char wire truncation |
| `internal/server/launcherrors.go` | modified | `launchError.id`; `writeLaunchError`; `unknownClaudeSession()`, `alreadyOpen(id)` |
| `internal/server/respond.go` | modified | `errorResponse.Error.ID *int64`; `writeJSONErrorID` |
| `internal/server/sessions.go` | modified | `handleCreateSession`/`handleResumeSession` route their `*launchError` through `writeLaunchError` instead of `writeJSONError` directly, so `already_open`'s `id` field reaches the wire |
| `internal/server/server.go` | modified | `register(s, newPastSessionsFeature(cfg.Launch.ProjectsDir, s.manager, cfg.Logger))` |
| `cmd/musterd/main.go` | modified | `-claude-projects-dir` flag, default from `claudecode.ProjectsDir()` (degrades to `""` like `-claude-config-file`), wired into `LaunchConfig.ProjectsDir` |

## Decisions

- Every REQ this plan assigns to the daemon (REQ-1, REQ-2's wire half, REQ-3's wire half, REQ-4's data half, REQ-5's data half, REQ-6, REQ-9's data half, REQ-10, REQ-11's data half, REQ-12, REQ-13's daemon half, REQ-15) is implemented in the table above.
- **File-location note (not a deviation):** the plan's Affected Files lists `createSessionRequest` gaining `ResumeSessionID` under `internal/server/sessions.go`, but that type is actually declared in `internal/server/launcher.go` (confirmed by reading the file before editing) — the edit landed there, where the type already lives.
- design: `repoContext`/`createAndSpawn` (`launcher.go`) — `rg "gitutil.IsRepo"` before adding showed only `browse.go` and `launcher.go`'s own (now-replaced) inline block calling it, no existing shared helper; factored out because `launchResume` needed the identical isGit/branch/isWorktree-then-floor-probe-then-create-loop sequence `Launch` already had, and duplicating that block verbatim across two files was the alternative. Both are plain functions/methods on `sessionLauncher`, matching the file's existing style (no new type).
- design: `writeLaunchError`/`writeJSONErrorID` (`launcherrors.go`, `respond.go`) — modeled directly on the existing `Paths`/`writeJSONErrorPaths` pair (`kb:anchor/sessions.locate`'s `ambiguous` route), the only precedent in the package for an error envelope needing one extra field. `already_open`'s `id` is the second such field; `writeLaunchError` centralizes the `lerr.id != nil` branch so neither `handleCreateSession` nor `handleResumeSession` needs to know which launch errors carry one.
- design: `pastSessionsFeature`/`aliveClaudeSessionLookup` (`launcherpastlist.go`) — shaped like `reposFeature` (`repos.go`): a struct holding its one dependency plus a logger, one `mount`, one handler that decodes the query param, delegates to a store/adapter call, and encodes. `aliveClaudeSessionLookup` is a narrow one-method interface over `*session.Manager` (the package's existing narrowing pattern — cf. `writeLogForgetter`, `sessionGetter` in `sessions.go`/`respond.go`), so the feature's test double doesn't need a whole `*session.Manager`.
- design: `transcriptScan` (`launchtranscripts.go`) — a small accumulator struct scanned across a tail-then-head chunk pair, one method per concern (`apply` one line, `scanChunk` one chunk, `title()` the D5 precedence, `toPastSession` the neutral-value conversion). No existing scanner in this package reads JSONL; `status.go`/`ingest.go` decode one JSON object per call, not a multi-line file, so nothing to reuse there.
- `AliveByClaudeSessionID` (`internal/session/manager.go`) is the single lookup shared by three call sites (`GET /api/past-sessions`' `openSessionId`, the resume-from-list `already_open` check, and the existing Resume action's new `not_resumable` check) — `kb:adr/launch-resume-one-alive-row-per-claude-session`'s one-alive-row guard needed one answer, not three independent ones that could drift.
- The Protocol Contract's "`model.displayName` may be null" wording (WS section) is not a new wire capability: `sessionWireModel.DisplayName` is a plain (non-pointer, non-omitempty) `string` (confirmed by reading `sessionwire.go`), so it can never literally serialize as JSON `null`. Implemented as the existing `modelFromRow` fallback behaviour every launch already has (display name defaults to the model id until a status-line post confirms it) — the only *new* behaviour is that a resumed-from-list session with **no** recorded model gets a wholly-nil `Model` (via the `CreateSession` fix above), matching the adjacent "renders as any null model does today" states-table line. No code treats `displayName` as ever independently nullable; that would contradict `modelToRow`'s own documented invariant ("Model's own fields are never independently optional").
- `PastSessions`' root-unreadable/absent case returns `(nil, nil)` (never an error) so D8's unit contract ("yields an empty list, not an error") holds literally. The server handler (`launcherpastlist.go`) still checks the error return and logs at Warn on the (currently unreachable) chance it's ever non-nil — matching the launcher's existing model-check fail-open pattern rather than adding a special case for a codepath that can't fire today.
- size: `internal/server/launcher.go` crossed the 500-line `filelen` warning (485 → 553, refreshed from an earlier 525 as of this line's last edit — `wc -l` re-run in cycle 2's fix wave) and `cmd/musterd/main.go` crossed it too (500 → 513) — both warn-only (`kb:adr/process-size-linters-warn-never-fail`), not split. `launcher.go` is `sessionLauncher`'s one file by its own existing doc comment ("the launch service's home file"), and `createAndSpawn`/`repoContext` are shared by both forms it now serves; `main.go` gained one flag registration line plus a default-resolution stanza placed directly beside its sibling (`defaultClaudeConfigFile`), the file's existing per-flag pattern.

## Handoff

**Build status**: `go build ./...` exits 0.

**Sanctioned test-file breakage (not fixed by me, per Constraints):**
- `internal/server/sessions_test.go`'s `TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour` (D4-era regression pin) POSTs `permissionMode: "bypassPermissions"` specifically *as* the unrecognized-value fixture and asserts `400 invalid_request` with the four-mode message. REQ-1/REQ-2's approved Protocol Contract makes `bypassPermissions` a valid mode, so that exact request now attempts a real launch (and fails at `500 launch_failed`, since the test server has no real `claude`/tmux to spawn against) instead of being rejected at validation. This is exactly the plan's own D17 test-file carve-out plus `kb:lesson/stale-fixture-reshaped-the-wire`: the fixture picked the one value this plan turns valid. The test agent should repoint it at a genuinely-unrecognized value (e.g. `"bogus"`) and update the expected message to include `bypassPermissions` per the plan's Protocol Contract (`"permissionMode must be one of default, plan, acceptEdits, auto, bypassPermissions"`). No other test file needed changes — full-suite `go test -race -count=1 ./internal/... ./cmd/...` shows exactly this one failure, confirmed identically with and without `-race`.
- `golangci-lint run` (with test files included) is clean (`0 issues`) — this break is a runtime assertion failure, not a typecheck failure, so it does not blind lint; no `--tests=false` re-run was needed to get signal on the rest of the tree.

**Verification performed beyond the gates:**
- A scratch program (built and run inside the module tree, then deleted — never committed) exercised `claudecode.PastSessions` against hand-built fixture transcripts matching `web/e2e/helpers/daemon.ts`'s `writeTranscript` shape exactly: confirmed title/lastPrompt/permissionMode/model extraction, a stub-with-only-`cwd` listing with all-nil fields, and — the case most likely to hide a bug — two directories (`…/base.b`, `…/base-b`) that collide into the identical encoded folder name, each correctly listing only its own session by `cwd` (D3). Output pasted above in this session's transcript; not reproduced here since the fixture files no longer exist on disk.

**Not implemented (out of the daemon's scope, per plan):** the web side (REQ-2/3/4/5/7/8/9/11/13/14 UI halves) — the `web-impl` agent's own files, left untouched.

## Fix Attempt 1

**Failures addressed**: wave-1 gate red on the plan's own D17 check
(`! rg -n '"custom-title"|"ai-title"|"last-prompt"|\.claude/projects' cmd/ internal/ --glob
'!internal/claudecode/**' --glob '!**/*_test.go'`) — `cmd/musterd/main.go`'s
`-claude-projects-dir` flag help text spelled the literal path `~/.claude/projects`, a
Claude-Code-format string, outside `internal/claudecode`.

**Changes made**: `cmd/musterd/main.go`'s flag help text now reads "default: Claude Code's
own projects directory" instead of naming the literal path — the flag's actual default
value is still `claudecode.ProjectsDir()`, unchanged; only the human-readable description
changed. Re-ran the exact D17 command (clean, `rg` found no matches) plus `make build`
and `make lint` in the foreground: both green.

**Decisions**: none — a wording-only fix, no new deviation or doc-delta.

Also addressed: the wave-1 comments gate (`python3 .claude/skills/orchestrate/scripts/comment-checks.py --gates`) flagged 20 bare plan-ID references (`REQ-N`, `D-N`, `INV-N`, "edge case N") in comments across `internal/claudecode/launch.go`, `launchtranscripts.go`, `internal/server/launcher.go`, `launcherpast.go`, `launcherrors.go`, `respond.go`, `internal/session/manager.go` and `internal/store/repo.go`. Removed every plan ID, keeping each comment's existing `kb:` citation (or its plain-prose why) as the sole justification — none needed a new kb: record, since each already carried one or was already self-explanatory once the plan ID was cut. Re-verified with `python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-impl` (clean apart from two hits in `internal/claudecode/claudecodetest/claudecodetest.go`, which is daemon-tests' file, left untouched) plus `make build` and `make lint` in the foreground: both green.

## Fix Attempt 3 (review cycle 1)

**Pack**: `kb: pack 36985 words (budget 20000)` — WARN exceeds budget (sections: rules 1295 · features 13208 · decisions 12682 · facts 7359 · lessons 2433 · runbooks 2)

**Failures addressed** (all `[daemon-impl]`, plus the two user decisions the orchestrator settled before this wave):

- Correctness Major 1 — `AliveByClaudeSessionID` answered from the stale `byClaude` routing index.
- Browser Critical 1 — a resume-bound row never counted as "open in Muster".
- Browser Critical 2 — two resumes of one session before either binds both got through.
- Maintainability Major 1 — directory validation hand-copied three times.
- Maintainability Major 2 — `handleListPastSessions` did far more than decode/delegate/encode.
- Maintainability Major 3 — the one-alive-row guard was an unguarded check-then-act.
- Maintainability Minor 1 — missing `design:` lines for four items.
- Maintainability Minor 2 — `pastSessionsFeature`'s file location vs. the launcher family.
- User decision `resume-passes-any-recorded-mode` (Option A) — drop the `default` fallback for a recorded-but-unoffered mode.
- User decision `pending-resume-holds-id` (Option A) — an alive, unbound resumed row holds its claude id until it binds or dies.

**Root cause, read together**: Critical 1/2, Major 1's fix and Major 3 all trace to the same
gap — `AliveByClaudeSessionID` trusted `byClaude`, a map that (a) is never written for
`KindResumeBind` (Critical 1), (b) never records a still-unbound resumed row at all
(Critical 2/Major 3), (c) never deletes a stale entry on `/clear` (Major 1's first repro),
and (d) is filled in `LoadAll`'s unordered rows (Major 1's second repro). One fix — answer
from `m.sessions` itself, plus a new in-memory pending-claim field and a claim lock —
closes all four at once rather than patching each symptom separately.

**Changes made**

| File | What and why |
|------|--------------|
| `internal/claudecode/launch.go` | `BuildArgv` now emits `--permission-mode` for any non-empty `PermissionMode`, trusting the caller instead of re-checking `ValidPermissionMode` — the settled `resume-passes-any-recorded-mode` decision (Option A): a resume must send a recorded mode Muster's own form doesn't offer (e.g. `dontAsk`) verbatim, which the old membership gate silently dropped. |
| `internal/session/session.go` | New in-memory-only `pendingResumeClaudeSessionID` field, doc'd beside `currentPromptID`/`closedPromptIDs` (same "restart drops it" contract). |
| `internal/session/machine.go` | `applyBind` clears `pendingResumeClaudeSessionID` unconditionally the moment any bind lands — the claim graduates into `ClaudeSessionID` itself, so it can never later shadow a `/clear` onto a different id. |
| `internal/session/manager.go` | `AliveByClaudeSessionID` rewritten to scan `m.sessions` for `Alive && (ClaudeSessionID == id \|\| pendingResumeClaudeSessionID == id)` instead of trusting `byClaude` (Correctness Major 1, Browser Critical 1/2). New `claudeLocks keyedlock.Locks[string]` field and `LockClaudeSession` method — the one guard both resume paths now hold across their whole check-then-spawn body (Maintainability Major 3). `CreateParams.ResumeClaudeSessionID` + `CreateSession` sets the new field, so a resume-spawned row holds its claim from the moment it's created (InsertSession already persists `alive=true` immediately), not from its first hook. |
| `internal/session/writeorder.go` | `pendingResumeClaudeSessionID` added to `restoredSessionFields` with its own `restoreIfUnchanged` call — a failed `Apply` must roll it back together with the `ClaudeSessionID` bind it accompanies, or a rejected resume-bind could leave a row holding neither its pending claim nor its new id. Kept `CheckSessionFieldCoverage` (the field-partition completeness check) green. |
| `internal/server/launcher.go` | New `errLaunchDirNotAbsolute`/`errLaunchDirNotFound` + `validateLaunchDirectory` — the one owner of "what counts as a valid launch directory" (Maintainability Major 1), matching `browse.go`'s sentinel-error shape. `validateLaunchRequest` now calls it instead of its own copy. `Resume` wraps its `AliveByClaudeSessionID` check (and everything after it, through `RecordResume`/`RepairOwnedSession`) in `LockClaudeSession(sess.ClaudeSessionID)` (Maintainability Major 3). |
| `internal/server/launcherpast.go` | `validateResumeRequest` calls `validateLaunchDirectory` instead of its own copy. `launchResume` wraps its check-then-spawn body (through `createAndSpawn`, including any id-collision retry) in `LockClaudeSession(claudeSessionID)`, and passes `ResumeClaudeSessionID` into `CreateParams`. The permission-mode fallback no longer gates on `ValidPermissionMode` — the recorded mode is sent verbatim; `default` is only for a genuinely absent recording. |
| `internal/server/launcherpastlist.go` | `handleListPastSessions` now only decodes the query param, validates it via `validateLaunchDirectory` (mapping the same two failures to its own 400/404 split), delegates to the new `listPastSessions`, and encodes (Maintainability Major 2). `listPastSessions` is the extracted domain function — order, cap, `openSessionId` marking, wire prompt cut — callable and testable without an `http.Request`, matching `browseDirectory`'s shape. |

**Blast radius measured**

- `rg -n "AliveByClaudeSessionID" --glob '!*_test.go'` → exactly the 3 call sites the review itself named (`launcherpast.go:75`, `launcherpastlist.go:112`, `launcher.go:466`) plus the method's own declaration; the signature is unchanged, so none needed touching beyond `launcher.go`'s new lock wrap.
- `rg -n "CreateParams\{" --glob '!*_test.go'` → exactly 2 call sites (`launcher.go:312`'s ordinary `Launch`, `launcherpast.go:117`'s `launchResume`); the new field is additive (named-field struct literals), so `Launch`'s call site needed no change and none broke.
- `rg -n "byClaude" internal/session/*.go` (excluding tests) → every remaining use is in `apply.go` (the hook-routing `Resolve`/rebind-escalation path) and `manager.go`'s `LoadAll`/`removeFromMemory`/`Resolve`, none of which `AliveByClaudeSessionID` touches anymore — `byClaude`'s routing job for hook delivery is unchanged, only this one guard stopped reading it.
- `go test -race -count=1 ./internal/session/... ./internal/server/... ./internal/claudecode/... ./internal/store/...` (foreground, full run) → `internal/session`, `internal/server`, `internal/store` all green; `internal/claudecode` shows exactly the one sanctioned `TestBuildArgv` failure below, nothing else moved.

**Re-ran the reviewers' repros** (Go-level equivalents of the browser review's curl/API
sequences, built as a throwaway `_test.go` in `internal/session` — package `session`, so it
could reach the unexported field/method directly — run, output pasted below, then deleted;
never committed, matching this file's own earlier "scratch program... never committed"
precedent):

```
=== RUN   TestZZRepro_ResumeBindIsVisibleToAliveByClaudeSessionID
--- PASS: TestZZRepro_ResumeBindIsVisibleToAliveByClaudeSessionID (0.14s)
=== RUN   TestZZRepro_ClearRebindStopsHoldingItsOldClaudeID
--- PASS: TestZZRepro_ClearRebindStopsHoldingItsOldClaudeID (0.13s)
=== RUN   TestZZRepro_LockClaudeSessionSerializesConcurrentClaims
--- PASS: TestZZRepro_LockClaudeSessionSerializesConcurrentClaims (0.12s)
ok  	github.com/Zalaras/muster/internal/session	2.284s
```

- The first reruns Browser Critical 1 exactly: create a resume-spawned row, `RecordLaunch`
  it, `Apply` an enveloped `KindResumeBind` for its claude id (what a real
  `SessionStart{source:"resume"}` produces), then assert `AliveByClaudeSessionID` still
  returns it afterward — this is precisely the case that returned `openSessionId: null`
  and let a second resume through before the fix.
- The second reruns Correctness Major 1's `/clear` repro: bind, then rebind to a new id via
  the same enveloped-bind escalation Apply already performs, and assert the *old* id stops
  being reported open.
- The third reruns Maintainability Major 3's concrete interleaving at the guard's own
  layer: two goroutines racing `LockClaudeSession` + `AliveByClaudeSessionID` + `CreateSession`
  for the same claude id must produce exactly one winner. A companion test with the lock
  removed (same interleaving, `time.Sleep(5ms)` in the widened window) was run alongside it
  to prove the race is real, not vacuous: `unguarded winners: 2` — confirming the guarded
  version's `winners == 1` is actually exercising the new lock's exclusion.

**Sanctioned test-file breakage (not fixed by me, per Constraints — new this wave):**
- `internal/claudecode/launch_test.go`'s `TestBuildArgv/an_unrecognized_permission_mode_adds_no_flag_(validation_is_the_caller's_job)` (line 81-84) pins the pre-decision behaviour: `PermissionMode: "bogus"` → argv omits `--permission-mode` entirely. The settled `resume-passes-any-recorded-mode` decision (Option A) requires the opposite — "dontAsk then reaches the argv" — which only works if `BuildArgv` stops gating on `ValidPermissionMode`. That gate change is general (not scoped to the resume call site) because all three of `BuildArgv`'s real callers already only ever pass a non-empty, previously-validated (or, for `launchResume`, deliberately unvalidated-by-design) mode string — confirmed by `rg -n "BuildArgv(" --include="*.go" .` (three call sites, all in `internal/server`) — so widening the gate to `PermissionMode != ""` changes behaviour only for this one pinned "bogus" fixture. The test agent should repoint this case to expect `--permission-mode bogus` in argv (or retitle/repurpose it to assert the new "any non-empty mode reaches argv" behaviour) and update its name/comment accordingly. Full-suite `go test -race -count=1 ./...` (via `make test`) shows exactly this one failure, both with and without `-race`.
- `golangci-lint run` (tests included) is clean (`0 issues`), and `golangci-lint run --tests=false ./...` is also clean — this break is a runtime assertion failure, not a typecheck failure, so it does not blind lint.

**Decisions**

- `AliveByClaudeSessionID`'s new implementation is O(alive-sessions-plus-dead) per call
  instead of the old O(1) map lookup — an unavoidable trade of a little CPU (personal,
  single-user daemon, realistically dozens of sessions at most) for correctness the map
  couldn't give (Correctness Major 1's two repros). Not worth a cache: this guard is
  called on every past-sessions list row and every resume/already_open check, never in a
  hot per-keystroke path.
- `claudeLocks` (the new per-Claude-session-id lock) never has `Forget` called on an
  entry, unlike `locks` (the per-Muster-id lock `dropSessionFromMemory` reclaims). A
  Claude session id is effectively never reused the way a Muster row's id slot is, so
  every distinct claude id ever resumed through Muster leaves one small `*sync.Mutex`
  entry in the map for the rest of the daemon's life — a slow, bounded-by-actual-usage
  memory growth, not a correctness issue, accepted for a personal daemon that restarts
  periodically. Calling `Forget` here would be actively wrong, not just an optimisation
  skipped: `keyedlock.Locks.Forget`'s own doc says a fresh mutex allocated after Forget
  "does not prevent" a second, independent holder of the same key from starting up
  alongside a caller still queued on the old one — the exact double-claim this guard
  exists to prevent — so reclaiming the entry here would silently reopen Maintainability
  Major 3's race for any Claude session id that got Forgotten mid-flight.
- design: `errLaunchDirNotAbsolute`/`errLaunchDirNotFound`/`validateLaunchDirectory`
  (`internal/server/launcher.go`) — `rg` before adding
  (`internal/server/browse.go:20-24`'s `errBrowsePathNotAbsolute`/`errBrowseDirNotFound`/
  `errBrowseDirNotReadable` sentinel-error pair-plus-domain-function) showed the exact
  shape already in the package for "a domain check with two failure reasons, mapped to
  different wire codes by different callers" — reused that shape rather than a bespoke
  enum or a third copy of the two `if` blocks.
- design: `listPastSessions` (`internal/server/launcherpastlist.go`) — matches
  `browse.go`'s `handleBrowse`/`browseDirectory` pair exactly: the handler decodes,
  validates, delegates to a plain function taking no `http.Request`, and encodes; the
  domain function returns `(response, error)` with the error meant for the caller to log,
  not to refuse the request with (the existing fail-open behaviour, now expressed as
  "the returned response is already the fail-open shape" rather than mutating a local
  inside the handler).
- `pastSessionsFeature`'s existing `design:` line ("the handler decodes the query param,
  delegates to a store/adapter call, and encodes") is no longer contradicted by the code
  (Maintainability Major 2) — no wording change needed, the code caught up to what the
  line already said.
- Maintainability Minor 2 (file location): kept `pastSessionsFeature` in
  `internal/server/launcherpastlist.go` rather than renaming to a
  `pastsessions.go`/`pastSessionsFeature`-named-after-itself file matching the
  `repos.go`/`browse.go` siblings' shape. Per the orchestrator's own note on this finding:
  the plan's Affected Files deliberately named new files under the launch/past-sessions
  feature globs (`internal/server/launcher*.go`), and the Doc Delta's past-sessions spec
  globs `internal/server/launcherpast*.go` — a rename would need a matching glob update in
  the plan/doc-delta, which is out of scope for a code fix wave. The feature is part of
  the launch/resume story (it exists only to serve the Resume tab launchResume also
  serves) even though it isn't part of `sessionLauncher` itself, which is enough reason to
  share the `launcher*` file family rather than strike out on its own.
- design: `launcherpast.go` as a file, plus `validateResumeRequest`/`findPastSession`/
  `launchResume` — same rationale as the file-location note above: this is the
  resume-from-list branch of the one `POST /api/sessions` route `launcher.go` already
  owns, split into its own file because it's a whole second validate→lookup→guard→spawn
  pipeline, not a one-line addition to `Launch`. `validateResumeRequest`/`launchResume`
  are plain functions/a plain method, matching `launcher.go`'s own
  `validateLaunchRequest`/`Launch` shape — no new type.
- design: `store.TouchRepo`/`TouchRepoParams` (`internal/store/repo.go:74-109`) — a
  sibling function rather than an extra parameter on `UpsertRepo` because the two would
  otherwise need a way to say "leave `last_model`/`last_permission_mode` alone" that
  `UpsertRepoParams`' plain `Model`/`PermissionMode` strings can't express (an empty
  string is a valid model already handled distinctly elsewhere, not "don't touch this
  column") without adding a third do-not-write sentinel value or a bool flag to
  `UpsertRepoParams` that every other caller would have to pass `false` for — a second,
  narrower SQL statement for the one caller that actually needs the different write shape
  was the smaller change.
- design: `Manager.AliveByClaudeSessionID` (`internal/session/manager.go`) — see this
  Fix Attempt's own root-cause paragraph and the method's doc comment for the shape;
  it is no longer "a filtered variant of `Resolve`" (Minor 1's characterization) now that
  it scans `m.sessions` directly instead of routing through `byClaude` the way `Resolve`
  does — the two now share nothing but a similar name and both being small Manager
  reads.
- design: `claudecodetest/transcripts.go`'s regex copy of `nonTranscriptDirChar` — not
  touched this wave (daemon-tests' file), but flagging its own stated reason here per
  Minor 1's ask: `internal/claudecode`'s own in-package tests import `claudecodetest`
  (fixture-writing helpers), so `claudecodetest` cannot import back from
  `internal/claudecode` without a cycle; the regex is copied, not shared, for exactly that
  reason.
- No new `deviation:` or `doc-delta:` lines this wave — every change here implements
  either a review finding already scoped to daemon-impl or a decision the developer
  already settled (both recorded in `plans/resume-and-dangerously-allow/decisions/`); none
  changes the wire shape beyond what those decision records and the already-amended
  `docs/protocol.md`/plan Protocol Contract describe.

## Handoff

**Build status**: `go build ./...` exits 0.

**Verification run in the foreground this wave**:
```
go build ./...                                          # clean
go vet ./...                                             # clean
gofmt -l .                                               # clean (no output)
make lint                                                # golangci-lint run: 0 issues
golangci-lint run --tests=false ./...                    # 0 issues
make build                                               # clean
make test                                                # bin/gatelock run --shared -- go test -count=1 ./...
                                                          #   — every package ok except the
                                                          #     one sanctioned TestBuildArgv
                                                          #     case above
python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-impl   # clean
! rg -n '"custom-title"|"ai-title"|"last-prompt"|\.claude/projects' cmd/ internal/ \
  --glob '!internal/claudecode/**' --glob '!**/*_test.go'                  # D17: clean, exit 0
```

**Test files needing changes** (sanctioned breakage, not fixed by me): see
"Sanctioned test-file breakage" above —
`internal/claudecode/launch_test.go`'s one `TestBuildArgv` subtest.

**Not implemented**: nothing declined — every `[daemon-impl]`-tagged issue in
`review.md`'s cycle-1 findings, plus both settled user decisions touching daemon code, is
addressed above.

## Fix Attempt 2 (daemon-tests implementation-bug, pre-review fix)

**Failures addressed**: `TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue`
(`internal/claudecode/launchtranscripts_test.go:329`) — daemon-tests' documented
implementation bug: `scanTranscript`'s D7 head fallback re-scanned the head chunk into
the same accumulator the tail had already populated, so a stale head-side value of any
field the tail also carried (the repro uses `permission-mode`) unconditionally
overwrote the tail's later, correct value. `apply()` itself was never at fault — it
correctly does last-write-wins within a single `scanChunk` call; the bug was the
*order* the two chunks were fed to it (tail, then head — chronologically backwards).

**Blast radius measured**: `scanTranscript` has exactly one call site
(`rg -n "scanTranscript" internal/` → `launchtranscripts.go:90` inside `PastSessions`,
plus the function's own definition and doc comments; no other package or test calls it
directly — `PastSessions` is the only exported surface). So the only path through this
code is `PastSessions → scanTranscript`, and the fix closes it in that one place; there
is no second call site or "clear-rebind vs. plain re-bind"-style second door here.

**Changes made** (`internal/claudecode/launchtranscripts.go`, `scanTranscript`): restructured
to preserve true last-line-wins across the fallback. First reads the tail into a throwaway
probe scan; if the probe already has `cwd`, that probe *is* the answer (tail alone
sufficed, D7 never triggers — unchanged from before). Only when the tail lacks `cwd` does
it read the head and apply chunks to a fresh accumulator in **chronological file order**:
head first (the earlier part of the file), then the tail on top — so any field the tail
also recorded still wins over a stale head-side value of the same field, and a field only
the head recorded (there being no later occurrence) still survives. This is the same
`apply()`/`scanChunk()` machinery, just fed in the order the file was actually written.

**Re-ran the reviewer's/tester's exact repro**:
```
$ go test -race -count=1 -run TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue -v ./internal/claudecode/...
=== RUN   TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue
--- PASS: TestPastSessions_HeadFallbackDoesNotClobberATailFoundValue (0.07s)
PASS
ok  	github.com/Zalaras/muster/internal/claudecode	1.512s
```
Also re-ran `TestPastSessions_LargeTranscriptTailMissingCwdFallsBackToHead` (D7 itself,
the case the fallback exists for) alongside every other `TestPastSessions_*` — all pass,
confirming the reorder didn't regress the fallback it's built on top of.

**Full verification**:
```
$ go build ./...          # clean
$ gofmt -l .              # clean
$ go vet ./...            # clean
$ go test -race -count=1 ./internal/claudecode/...   # ok
$ make lint               # golangci-lint run: 0 issues
$ make test               # bin/gatelock run --shared -- go test -count=1 ./...  — every package ok, no FAIL
$ make size-warn          # 70 hits, none in internal/claudecode/launchtranscripts.go (file untouched by the size warning) — pre-existing, not from this change
```

**Test files touched**: none. Only `internal/claudecode/launchtranscripts.go` (production
code) changed; no import repair was needed since no test file's import path moved.

**Decisions**: none — a pure reordering fix inside `scanTranscript`; no deviation, no
doc-delta (the D7/D5 documented behaviour — "cwd resolved from head", "last line wins" —
is exactly what this restores; nothing about the contract or the plan's doc claims
changes).

## Fix Attempt 4 (review cycle 2)

**Failures addressed**: Correctness Major 1, Maintainability Minor 1, Maintainability
Minor 2, Maintainability Minor 3.

**Changes made**:

- **Correctness Major 1** (`internal/claudecode/launch.go:33-38`, `internal/session/session.go:47`):
  `LaunchParams`' doc and its `PermissionMode` field comment now say what `BuildArgv`
  actually does — any non-empty value is sent verbatim via `--permission-mode`, whether
  or not it's in `PermissionModes` (citing `kb:adr/launch-resume-passes-any-recorded-mode`),
  and validating it (or deliberately not) is the caller's job. This matches `BuildArgv`'s
  own doc two functions down, which already said this. `internal/session/session.go`'s
  `ValidPermissionMode` doc now says "one of `PermissionModes`" instead of counting four —
  it delegates to `claudecode.ValidPermissionMode`, so it can never drift from that set's
  actual size again. Checked for the same stale count elsewhere: `rg -n "four permission|the four|known permission mode" internal/ docs/` (excluding generated `web/webui` bundles) found only unrelated hits (`internal/kb/check.go`'s four *comment shapes*, `ws_test.go`'s four *hello keys*, etc.) — no other permission-mode count to fix.

- **Maintainability Minor 1** (`internal/session/manager.go:126-136` → now 126-145): moved
  the invariant off the plan log and onto the `claudeLocks` field's own comment. It now
  states, at the declaration: no caller ever calls `Forget` here, *and why not* —
  `keyedlock.Locks.Forget`'s own doc says forgetting a key lets a later `Lock` on it
  allocate a fresh `*sync.Mutex` sharing no exclusion with anyone still queued on the old
  one, which is the exact double-claim this guard exists to prevent (Maintainability
  Major 3's race, from cycle 1). The unbounded-growth trade-off (a Claude session id is
  never reused the way a Muster row's id slot is, so every distinct one leaves a small
  entry for the daemon's life, accepted for a personal single-user daemon) sits right
  beside it, so a newcomer reading `claudeLocks` next to its sibling `locks` (which does
  reclaim, and says so) sees both the rule and the reason without leaving the file, let
  alone the tree. No reference to `plans/` remains in this comment.

- **Maintainability Minor 2** (`internal/server/launcherpastlist.go:68-76`): added a
  `default` arm to `handleListPastSessions`' error switch that logs at Error and writes
  `500 internal_error`, matching `handleBrowse`'s sentinel-error shape
  (`internal/server/browse.go:62-72`) — that shape is the one this handler's own doc
  comment already cites. `validateLaunchDirectory` still returns only the two sentinels
  today, so this is dead code until a third one lands, but a third one now reaches an
  error response here instead of an empty `200`.

- **Maintainability Minor 3** (size warnings with no recorded reason): refreshed the
  existing `size:` line in `## Decisions` above — `internal/server/launcher.go`'s
  recorded `525` was stale; re-measured via `wc -l` at `553` (unchanged by this wave;
  only the note was stale). Added two new `size:` lines below for the two warnings new
  since the last recorded size (`internal/session/manager.go` filelen and
  `internal/server/launcherpast.go`'s `launchResume` funlen) — see the new `Decisions`
  entries in this section; no split was made, per the reviewer's own note that a split
  isn't being asked for.

**Verification**:
```
$ gofmt -l .                                              # clean
$ go vet ./...                                            # clean
$ go build ./...                                          # clean
$ make build                                              # clean
$ make lint                                               # golangci-lint run: 0 issues
$ golangci-lint run --tests=false ./...                   # 0 issues (belt-and-braces; full lint above was already clean)
$ make test                                               # bin/gatelock run --shared -- go test -count=1 ./...  — every package ok, no FAIL (full suite, not just the touched packages)
$ python3 .claude/skills/orchestrate/scripts/comment-checks.py daemon-impl   # comment-checks: clean
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py                    # dead-refs: 836 references checked, 0 missing
$ make size-warn                                          # 72 hits total; the two named below, plus pre-existing unrelated ones
```
`make test`'s full run is green with no failures at all, including the permission-mode
fixture (`TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour`) that an
earlier wave's Handoff flagged as sanctioned test-file breakage — it now passes, so that
carve-out is resolved (presumably by a prior daemon-tests wave); nothing left to escalate
on it here.

**Decisions** (new this wave):
- size: `internal/session/manager.go` crossed `filelen`'s 500-line warning further this
  wave (497 at `3735df2` → 542 before this wave → 551 now) — warn-only
  (`kb:adr/process-size-linters-warn-never-fail`), not split. The growth is the
  Maintainability Minor 1 fix itself: the `claudeLocks` guard's invariant and its reason
  moved from a plan log into the field's own comment, in the one file that already
  declares `Manager` and every guard it owns (per this package's `CLAUDE.md`, `Manager`
  is "the in-memory session registry" — `claudeLocks` is one of its guarded fields, not a
  new concern). Comment weight, not new logic, drove the increase.
- size: `internal/server/launcherpast.go`'s `launchResume` crossed `funlen`'s 60-line
  warning by one line (61) — warn-only, not split. `launchResume` is one coherent
  check-then-spawn body (validate the request, look up the transcript, hold the
  one-alive-row lock across the whole check-then-claim, upsert the repo, write settings,
  build argv, spawn) mirroring `Launch`'s own shape in the sibling file one directory up
  (`launcher.go`); the line that tipped it over is a comment inside that lock block
  documenting the guard it holds (`kb:adr/launch-resume-pending-resume-holds-id`), not a
  new step in the function's control flow. Splitting an arbitrary slice out would only
  relocate the line count, not reduce the function's actual complexity.
