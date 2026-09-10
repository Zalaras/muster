# Plan: canary-full-coverage

**Created**: 2026-09-10
**Status**: completed
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Description**: Bring `make canary` up to full coverage of the Claude Code interface Muster depends on, so the pre-v1 "version the interface" item can declare a supported range honestly.

## Overview

`make canary` (`test/canary/`) is the inventory-of-record for what Muster depends on in Claude
Code, and the gate for every pin bump (`docs/claude-code-pin.md`). Today it asserts roughly
two-thirds of that surface: hook transport and per-event fields for seven events, the status
line, unknown-vs-zero, command-hook quoting, and `StopFailure` replacing `Stop`. The rest —
`CLAUDE_CODE_SCROLL_SPEED`, the launch flags beyond what runs A/D happen to use, `--resume`,
the theme key, the Keychain item, the usage endpoint, and the four `needsInteractiveDialog`
rows — is either checked by hand on each bump or not at all. The TODO item this plan
implements ("Bring `make canary` up to full interface coverage", Pre-v1 Cleanup) lists the
gaps; this plan closes every one that is a real Muster dependency and names, per row, the
residual that stays a probe ritual.

Three tiers, cheapest first, and every added assertion is zero tokens unless stated. (1)
**Fold into the existing runs**: run D gains `--name` and launches in plan mode; run C becomes
a four-way permission-mode sweep on the zero-token unauthenticated path; run D is followed by
a zero-token `--resume` relaunch through the production argv builder, closing the manual R2
check. (2) A **static tier** reads the installed binary (the Mach-O bundle `claude` symlinks
to) for the interface strings Muster depends on but cannot drive — `CLAUDE_CODE_SCROLL_SPEED`
taken from `LaunchEnv()`, the theme enum, the usage endpoint path and header. A string
surviving does not prove semantics; it catches rename or removal, which is exactly the
silent-degrade failure named for `SCROLL_SPEED`. (3) A **live tier** runs the production
Keychain reader and one `GET /api/oauth/usage` with Damian's real token, and parses the real
`~/.claude.json` — read-only, never printed. Decided 2026-09-10: a missing credential
**fails** the run rather than skipping, since a skip passes silently on the one machine the
gate exists for.

Of the four interactive rows: `Notification{idle_prompt}` is driven by waiting after run D's
turn (measured at 60.03 s after `Stop` on 2.1.259, `test/rig/captures/capture-6.jsonl`);
`PermissionRequest`, `Notification{permission_prompt}` and steps 1–2 of the plan-mode
sequence are driven by one extra haiku turn in the resumed session that ends in
`ExitPlanMode`, asserted **without answering the dialog** — the dialog-driving fragility that
justified the 2026-08-29 skip never arises. Step 3 (`PostToolUse{ExitPlanMode, acceptEdits}`)
needs the dialog answered and stays a named `/interface-probe` ritual (decided 2026-09-10).
`SubagentStop` is dropped from the skip list altogether: `interpret.go` treats it as
`KindInert` and reads nothing from it; Muster's only subagent dependency is `agent_id` on
tool hooks and `PermissionRequest`, which stays a probe ritual (a subagent costs ≥ 2 turns).
Cost after this plan: 4 haiku turns (was 3), 4 zero-token unauth runs (was 1), one
zero-token resume, one HTTPS GET, ~2.5–3 min wall (was ~40 s). Installed today is 2.1.267
against a 2.1.246 pin; the run targets the installed binary as always, and the pin bump on
green is the ritual commit after landing, out of scope here (decided 2026-09-10).

## Requirements

### Must Have

- [ ] REQ-1: Run C becomes four zero-token unauthenticated headless runs, one per launch
  permission mode — no flag, `plan`, `acceptEdits`, `auto` — each with its own
  `$MUSTER_SESSION`, and the canary asserts `UserPromptSubmit.permission_mode` per run:
  `"default"`, `"plan"`, `"acceptEdits"`, and for `auto` a value in {`"auto"`, `"default"`}
  (haiku's model gate, `spikes/canary-fields.md` § permission-mode probe) with the observed
  value logged. Every existing run-C assertion (`StopFailure` replaces `Stop`,
  `error: authentication_failed`, `UserPromptSubmit` present, `SessionEnd` not asserted)
  holds on all four.
- [ ] REQ-2: Run D launches through `claudecode.BuildArgv` with `Title: "Muster Canary"` and
  `PermissionMode: "plan"`, and the canary asserts `SessionStart.session_title ==
  "Muster Canary"`, the last status-line post's `session_name == "Muster Canary"`, and
  `UserPromptSubmit.permission_mode == "plan"` on the authenticated interactive path — the
  cross-check that the unauthenticated sweep in REQ-1 reflects the flag (the flag→wire
  mapping was measured authenticated only; see Carried-over measurements).
- [ ] REQ-3: After run D's `Stop`, the harness waits for `Notification{notification_type:
  "idle_prompt"}` (bounded at 90 s; measured 60.03 s after `Stop` on 2.1.259) before killing
  the pane, and the canary asserts the Notification field inventory on it: common fields plus
  `prompt_id`, `notification_type`, `message`; `permission_mode` absent.
- [ ] REQ-4: A new run E relaunches the run-D session in a fresh tmux session on the same
  scratch socket through `claudecode.BuildArgv` with `ResumeSessionID` set to run D's
  `session_id` (and `Model`, `PermissionMode: "plan"`, exactly as `internal/server`'s Resume
  passes them), under a distinct `$MUSTER_SESSION`, and asserts `SessionStart.source ==
  "resume"` with `session_id` and `transcript_path` equal to run D's. No prompt is needed
  for this assertion; it is zero tokens on its own.
- [ ] REQ-5: In run E the harness submits one prompt instructing the model to call
  `ExitPlanMode`, waits for `PermissionRequest` (bounded at 90 s), then waits for the
  `Notification{permission_prompt}` that follows it (bounded at 30 s), and kills the pane
  **without answering the dialog**. The canary asserts, on run E: `PreToolUse{tool_name:
  "ExitPlanMode", permission_mode: "plan"}` arrives before `PermissionRequest{tool_name:
  "ExitPlanMode"}`; the `PermissionRequest` field inventory (common fields, `prompt_id`,
  `tool_name`, `tool_input`, `permission_suggestions`, `permission_mode` present); the
  `Notification{permission_prompt}` shares the `PermissionRequest`'s `prompt_id`; and
  `permission_suggestions` is a non-empty array whose first element carries `type`, `mode`
  and `destination` keys.
  *Amended 2026-09-10 (orchestrator, pre-review):* `permission_suggestions` is **optional** on
  the `ExitPlanMode` `PermissionRequest`. The second real run on 2.1.267 (`canary-run.log`,
  run E, 1/1) measured its keys as `cwd, scratchpad_dir, prompt_id, permission_mode,
  session_id, transcript_path, hook_event_name, tool_name, tool_input` — no
  `permission_suggestions`. The shape the plan quoted was measured on a `Write` request in
  `default` mode (`test/rig/captures/capture-6.jsonl`, 2.1.259), never on `ExitPlanMode`; and
  no production code reads the key (`grep -rn permission_suggestions internal/ cmd/` hits only
  the `claudecodetest` fixture), so it is not a Muster dependency and the canary must not
  gate on it. Amended assertion: if the key is present it must be a non-empty array whose
  first element carries `type`, `mode` and `destination`; present or absent is `t.Log`ged with
  the `tool_name` and `permission_mode` (values only). REQ-9's `PermissionRequest` inventory
  row and D5 read the same way.
- [ ] REQ-6: `TestPlanModeSequence` becomes a real test of steps 1–2 (ordering and the
  `permission_mode: "plan"` on the `PreToolUse`) and logs — does not skip — that step 3
  (`PostToolUse{ExitPlanMode, permission_mode: "acceptEdits"}`) is the `/interface-probe`
  ritual because it needs the dialog answered. The `needsInteractiveDialog` constant and
  every `t.Skip` that cites it are removed; the `SubagentStop` inventory row is removed from
  `TestHookFields` with a comment giving the `KindInert` rationale.
- [ ] REQ-7: A new static tier, `TestInstalledBinaryCarriesInterfaceStrings`, resolves the
  `claude` on `PATH` through `exec.LookPath` and `filepath.EvalSymlinks` and asserts the
  resolved file contains each of these byte strings, reported individually by name on
  failure: every key of `claudecode.LaunchEnv()` (today `CLAUDE_CODE_SCROLL_SPEED`; the
  test iterates the map, it never spells the variable), the theme enum members
  `light-daltonized`, `dark-daltonized`, `light-ansi`, `dark-ansi`, the usage endpoint path
  `/api/oauth/usage`, the beta header value `oauth-2025-04-20`, the credential JSON key
  `claudeAiOauth`, the Keychain mechanism `find-generic-password`, and the flag name
  `permission-mode`. It scans the file in bounded chunks (the bundle is ~200 MB) and runs
  under `MUSTER_CANARY_OFFLINE=1` — it launches no Claude session and touches no network.
- [ ] REQ-8: A new live tier gated on the same `MUSTER_CANARY_OFFLINE` skip as the harness
  (offline = no session, no network, no credentials), three tests:
  `TestKeychainCredentialShape` runs the production `claudecode.KeychainTokenReader` for the
  current OS user with `claudecode.RunCommand` and **fails** (never skips) unless a non-empty
  token comes back; `TestUsageAPIResponseShape` calls the production `claudecode.FetchUsage`
  against `https://api.anthropic.com` with that token and asserts no error and at least one
  `ModelScoped` window with a non-empty `DisplayName`, `UsedPct` in [0, 100] and a `ResetsAt`
  after the test's start, then performs one raw GET with the two measured headers and asserts
  the body has top-level `five_hour`, `seven_day` and `limits` keys, every `limits[]` entry
  has `kind`, `percent` and `resets_at`, at least one entry has `kind == "weekly_scoped"` with
  `scope.model.display_name` a string, and every `resets_at` parses as RFC3339Nano;
  `TestThemeConfigParses` asserts `claudecode.ReadThemeFamily(claudecode.DefaultConfigPath())`
  is not `ThemeUnknown`. A 401/403 from the usage endpoint fails the test. Token and body are
  never logged or written anywhere; failure messages name keys only.
- [ ] REQ-9: `TestHookFields`' `Notification` and `PermissionRequest` rows are driven
  (`session` = the run that produces them) and asserted like every other row; the
  `permission_mode` always/never split extends to them (`PermissionRequest` present,
  `Notification` absent). *Amended 2026-09-10:* the `PermissionRequest` row's required keys
  are `tool_name`, `tool_input`; `permission_suggestions` is optional (see REQ-5 amendment).
- [ ] REQ-10: `MUSTER_CANARY_OFFLINE=1` stays a zero-token path: with it set, no test
  launches a Claude session, reads the Keychain or opens a network connection. The static
  tier and the pin test run; the harness-backed tests and the live tier skip with a reason
  naming the variable.
- [ ] REQ-11: Payload bodies, tokens and prompt text are never printed by any new code —
  failure messages carry event names, key lists, and the observed `permission_mode` /
  `notification_type` / `source` values only (CLAUDE.md: never log hook payloads).
- [ ] REQ-12: The harness's teardown kills both tmux sessions (D and E) and the scratch
  socket's server, and the four unauth runs and run E reuse the existing `settle`/`waitFor`
  timing primitives — no new fixed sleeps beyond the existing post-`send-keys` pauses.

### Should Have

- [ ] REQ-13: `docs/claude-code-pin.md` "Current state of the canary" is rewritten to match:
  the run table gains the four-way C, the plan-mode D with the idle wait, and E (resume +
  `ExitPlanMode` turn); the static and live tiers are described with what they do and do not
  prove; the "Still manual" list shrinks to exactly: plan-mode step 3, `agent_id` on
  subagent-originated hooks, and the `fable` alias (static inspection by hand); the R2
  resume check is recorded as automated.
- [ ] REQ-14: The `Makefile` `canary` help string reflects the new cost ("4 haiku turns +
  zero-token unauth/resume/live checks; `MUSTER_CANARY_OFFLINE=1` = compile + pin + static
  binary check only") and the package doc comment at the top of `canary_test.go` says the
  same.

### Nice to Have

- [ ] REQ-15: `TestStatusLineFields` logs the resumed session's last status-line
  `session_name` (run E was launched without `--name`) so the next pin bump learns whether
  the title persists across resume — logged, never asserted.

## Protocol Contract

No protocol changes. Nothing here touches the daemon↔UI protocol; the canary talks only to
Claude Code and to its own in-test capture server.

## Schema Changes

No schema changes required.

## UI Specifications

None — daemon-only work with no user-facing surface. No views, flows, states or testable UI
elements.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| — | — | — | no UI in this plan |

## Affected Files

Ownership note: this plan's deliverable is test code. **daemon-tests owns every file under
`test/canary/`** (the existing boundary "impl agents never edit tests" applies — the canary is
`_test.go`). daemon-impl owns the two non-test files below and has no production Go change to
make; `internal/claudecode/` already exports every seam the canary needs (`BuildArgv`,
`LaunchEnv`, `KeychainTokenReader`, `RunCommand`, `FetchUsage`, `ReadThemeFamily`,
`DefaultConfigPath`, `InstalledVersion`). If daemon-tests finds it needs a seam that does not
exist, that is an escalation, not a reason to edit `internal/claudecode/`.

### Daemon (daemon-impl)
- `Makefile` — `canary` target help string (REQ-14). Target body unchanged.
- `docs/claude-code-pin.md` — "Current state of the canary" section and the "Still manual"
  residual list (REQ-13).

### Daemon tests (daemon-tests)
- `test/canary/harness_test.go` — run C ×4 with per-mode `$MUSTER_SESSION` constants and
  `--permission-mode` argv (REQ-1); run D via `BuildArgv` with title + plan mode, idle-prompt
  wait before kill (REQ-2/3); new run E: resume launch in a second tmux session
  (`interactiveResumeTmuxID`), `ExitPlanMode` prompt, `PermissionRequest` +
  `permission_prompt` waits, kill without answering (REQ-4/5); teardown for both sessions
  (REQ-12); package doc comment (REQ-14). Payload bodies still never printed (REQ-11).
- `test/canary/canary_test.go` — `TestHookFields` rows for `Notification`/`PermissionRequest`
  driven, `SubagentStop` row removed, `needsInteractiveDialog` removed (REQ-6/9);
  `TestPlanModeSequence` real (REQ-6); new `TestLaunchFlags` (REQ-1/2/4), new
  `TestNotifications` (REQ-3/5); `TestStopFailureReplacesStop` over all four C runs (REQ-1);
  `TestStatusLineFields` `session_name` assertion (REQ-2) and REQ-15 log.
- `test/canary/static_test.go` (new) — `TestInstalledBinaryCarriesInterfaceStrings` (REQ-7).
- `test/canary/live_test.go` (new) — the three live-tier tests (REQ-8), skipping under
  `MUSTER_CANARY_OFFLINE` (REQ-10).

### Web
- none.

## Named Invariants

- **INV-1 (offline is zero-token and offline).** With `MUSTER_CANARY_OFFLINE` set, no test in
  `test/canary/` launches a Claude session, runs `security`, or opens a network connection.
  Asserted from every test in the package, not just the harness-backed ones: the static tier
  reads a local file and runs `claude --version` only; the live tier skips first thing. → D3
- **INV-2 (nothing sensitive is printed).** No test output, failure message or log line
  contains a hook payload body, a status-line body, a usage-API body, a token, or prompt
  text — from every test including the new tiers and including the failure paths (a failing
  `require` must not dump the map). → D13 (reviewer reads every assertion message)
- **INV-3 (session identity across runs D and E).** Runs D and E carry different
  `$MUSTER_SESSION` values but the same Claude `session_id`; every per-run view groups by the
  envelope's `musterSession`, never by `session_id`, so a late run-D straggler can never be
  mistaken for a run-E event. → D6

## Carried-over measurements (re-checked against this plan's decisions)

- **`--permission-mode` → `UserPromptSubmit.permission_mode`** was measured on the
  *authenticated* headless and interactive paths (2.1.259, 3/3 + 1/1). REQ-1 applies it on
  the *unauthenticated* path. Re-checked: `UserPromptSubmit` demonstrably fires there (run C
  today) and the always/never split says it always carries `permission_mode`; whether the
  value reflects the flag before auth is the open question, which is why REQ-2 asserts a
  non-default value (`plan`) on the authenticated run D as the cross-check. If C-plan reports
  `default` while D reports `plan`, the unauth sweep is invalid for values and the fix is to
  move the sweep onto authenticated runs (a cost decision for Damian), not to loosen the
  assertion.
- **`auto` model-gated to `default` on haiku** (2.1.259, 2/2, authenticated). Whether the gate
  is evaluated before the auth failure is unmeasured — hence REQ-1's {`auto`, `default`} set
  with the value logged, and canary-fields gains the observed fact.
- **Resume carries the same `session_id`/`transcript_path`**: measured headless on 2.1.233
  and interactively by hand on 2.1.246 (R2, 2026-08-30). REQ-4 re-measures it interactively
  on the installed binary via the production argv builder including `--permission-mode plan`
  on the resume line, which `internal/server` also passes — still valid: the flag does not
  touch identity.
- **`idle_prompt` at 60.03 s after `Stop`** (one session, 2.1.259). REQ-3 bounds the wait at
  90 s and never asserts the gap — a timing assertion on a shared machine is a flake
  generator (`docs/design/test-strategy.md`).
- **`session_name` carries the `--name` value** (2.1.233, interactive) and `session_title` is
  present only with `--name` (2.1.237). REQ-2 asserts equality on the run that passes
  `--name`; run E (no `--name`) is logged only (REQ-15).
- **Trust prompt preselection** changed between 2.1.233 (Enter) and 2.1.259 (Down, Enter).
  The harness's loop keys on `SessionStart` arriving, retrying Enter every 3 s; if the installed
  binary preselects "No, exit", Enter exits the session and run D fails at build with "no
  SessionStart within 90s (trust prompt seen: true)". Not asserted by this plan; recorded as
  Edge Case 15 so the first real run's outcome is read correctly rather than as a regression
  in this plan's work.

## Edge Cases

1. `idle_prompt` never arrives within 90 s of run D's `Stop` — harness build fails naming the
   hook types seen (not the pane text); every harness-backed test fails with that message. → D4
2. Haiku answers the `ExitPlanMode` prompt with text and never calls the tool — run E's
   `PermissionRequest` wait expires; build fails naming the hook types. Accepted gate risk of
   the same class as run A's `echo hi`; the rerun guidance in the pin doc is "rerun once
   before reading it as drift". → D5
3. The resume launch (run E) hits the workspace-trust prompt again — the existing
   `looksLikeTrustPrompt` loop answers it; no new code path. → D6
4. The unauthenticated path reports `default` for every mode (the flag is not reflected before
   auth) — REQ-1's `plan`/`acceptEdits` assertions fail while REQ-2's authenticated `plan`
   passes; the pair disambiguates "unauth path unsuitable" from "flag renamed". → D2, D7
5. `auto` on the unauth path reports `auto` or `default` — both accepted, value logged. → D2
6. Keychain read fails (fresh Mac, logged-out Claude Code, access prompt) — live tier fails
   with `ErrNoCredentials`; never skips (decision 1). → D9
7. Usage endpoint returns 401/403 (rejected token) or 5xx — test fails; 5xx is transient and the
   pin doc says rerun. → D10
8. `~/.claude.json` absent or not JSON — `ThemeUnknown`, test fails. → D11
9. `claude` on `PATH` is not a symlink (npm install, a wrapper script) — `EvalSymlinks` returns
   the path itself; if the strings are absent the failure names the resolved path so the
   reader sees what was scanned. → D8
10. `MUSTER_CANARY_OFFLINE=1` — static tier and pin test run; harness-backed and live tests
    skip. → D3
11. `SessionEnd` from killing run D's pane (reason `other`) may or may not land — not asserted,
    as today for the failure path. → untested: best-effort delivery on a kill, no Muster
    dependency beyond what reconcile covers from pane liveness.
12. Run E's `SessionStart` carries no `session_title` (launched without `--name`) — logged, not
    asserted; whether the stored title persists is a fact for canary-fields, not a dependency.
    → untested: title is Muster-side state keyed to the session (SPEC).
13. A late run-D curl (e.g. its `SessionEnd`) arrives after run E's `SessionStart` — same
    `session_id`, different `musterSession`; views group by envelope so it lands on D. → D6
14. Hook loss on any asserted event — `firstHook` is nil and the assertion fails naming the
    event; that is the canary's purpose, not a flake to suppress. Duplicates are harmless
    (`firstHook`). → D4
15. The installed binary preselects "No, exit" on the trust prompt (2.1.259 behaviour) — run D
    fails at build with the trust-prompt message; a hardening of the harness's answer is a
    separate fix if the first real run shows it. → D4
    *Amended 2026-09-10 (orchestrator, pre-review):* the first real run showed exactly this
    (`canary-run.log`: "no SessionStart within 90s (trust prompt seen: true)", every
    harness-backed test red), and a zero-token probe on the installed 2.1.267 measured the
    prompt as `❯ No, exit` / `Yes, I trust this folder`, with Down then Enter reaching the REPL.
    "Separate fix" is incompatible with D12 (a green run is this plan's evidence), so the
    hardening is **in scope**: the harness must answer the prompt by reading which row carries
    the selection marker and moving to "Yes, I trust this folder" before Enter — never a blind
    Enter — so it works on both the 2.1.233 (Yes preselected) and 2.1.259+ (No preselected)
    layouts. Owner: daemon-tests (`harness_test.go`). → D4, D12
16. Two tmux sessions live on the scratch socket at teardown — `kill-server` on the socket
    removes both. → untested: teardown, verified by the reviewer from the run log's absence of
    orphan warnings and `tmux -S <sock> ls` failing after the run (D12).
17. `TestInstalledVersionMatchesPin` is red on 2.1.267 against the 2.1.246 pin — expected
    drift; the pin bump is the ritual commit after landing (decision 4). → D12
18. The 200 MB bundle scan — chunked with overlap ≥ the longest needle so a string spanning a
    chunk boundary is found. → D8

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon (there is no web or e2e track). One
clause per criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `go vet -tags=canary ./test/canary/...` exits 0 (the package compiles with its new
  files; no tokens).
- **D2**: `TestLaunchFlags` asserts, per REQ-1, the four unauth `permission_mode` values and,
  per REQ-2, `session_title`, `session_name` and the interactive `plan` value.
- **D3**: the static tier `TestInstalledBinaryCarriesInterfaceStrings` runs and passes under
  `MUSTER_CANARY_OFFLINE=1` against the installed binary with no session launched (INV-1). The
  check greps for the test's own `--- PASS` line because `go test -run` exits 0 with "no tests
  to run" when the test does not exist yet (verified 2026-09-10 on the current tree).
- **D4**: `TestNotifications` asserts the `idle_prompt` Notification after run D's `Stop` with
  the REQ-3 field inventory.
- **D5**: `TestNotifications` and `TestPlanModeSequence` assert run E's
  `PreToolUse{ExitPlanMode, plan}` → `PermissionRequest{ExitPlanMode}` ordering, the
  `PermissionRequest` inventory, and the `permission_prompt` sharing its `prompt_id` (REQ-5),
  with step 3 logged as the probe ritual (REQ-6). *Amended 2026-09-10:* the inventory excludes
  `permission_suggestions`, which is optional and shape-checked only when present.
- **D6**: `TestLaunchFlags` asserts run E's `SessionStart.source == "resume"` with `session_id`
  and `transcript_path` equal to run D's, read through per-run envelope grouping (REQ-4,
  INV-3).
- **D7**: `TestStopFailureReplacesStop` asserts `StopFailure` without `Stop` and
  `error: authentication_failed` on all four run-C sessions.
- **D8**: `TestInstalledBinaryCarriesInterfaceStrings` reports each missing string by name and
  the resolved binary path, derives the env-var name from `claudecode.LaunchEnv()`, and scans
  in bounded overlapping chunks (REQ-7, Edge Cases 9/18).
- **D9**: `TestKeychainCredentialShape` fails, not skips, on `ErrNoCredentials` (REQ-8,
  decision 1).
- **D10**: `TestUsageAPIResponseShape` asserts the production `FetchUsage` result and the raw
  body shape listed in REQ-8, failing on 401/403.
- **D11**: `TestThemeConfigParses` asserts `ReadThemeFamily(DefaultConfigPath()) !=
  ThemeUnknown`.
- **D12**: One full `make canary` against the installed binary, run by the orchestrator in the
  main session (once per review cycle, never by a subagent), is saved verbatim to
  `plans/canary-full-coverage/canary-run.log`, and every test in it passes except
  `TestInstalledVersionMatchesPin`, whose failure names 2.1.267 vs 2.1.246.
- **D13**: No new or changed assertion message, `t.Log`/`t.Logf` call, or error return in
  `test/canary/` includes a payload map, body bytes, token or prompt string — key lists and
  named scalar values only (INV-2, REQ-11).
- **D14**: `make lint` exits 0 (golangci-lint runs with the `canary` build tag).
- **D15**: `docs/claude-code-pin.md`'s run table and residual list match the shipped harness
  (REQ-13), and the `Makefile` help string and package doc comment state the new cost (REQ-14).
- **D16**: `make test` exits 0 (the non-canary suite is untouched).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. These are the zero-token gates the pipeline may run as often as it
likes; the real run is D12 and is deliberately **not** here (decision 3: agents run the checks
block repeatedly, and each real run burns four haiku turns).

```checks
D1 go vet -tags=canary ./test/canary/...
D3 MUSTER_CANARY_OFFLINE=1 go test -tags=canary -count=1 -v -run '^TestInstalledBinaryCarriesInterfaceStrings$' ./test/canary/... 2>&1 | grep -q -- '--- PASS: TestInstalledBinaryCarriesInterfaceStrings'
D14 make lint
D16 make test
```

### Reviewer-Verified

Criteria that are not a single exit-code check. The review agent verifies these by reading
`plans/canary-full-coverage/canary-run.log` and the code; it must not run `make canary` itself.

- **D2**, **D4**, **D5**, **D6**, **D7**, **D9**, **D10**, **D11**: read the corresponding
  `--- PASS` lines and logged values in `canary-run.log`, and read the assertion code to
  confirm it asserts what the requirement says (a passing test that asserts less than its
  REQ is a Major).
- **D8**: read `static_test.go` — the env-var name is iterated from `LaunchEnv()`, not
  spelled; chunked scan with overlap; per-string failure messages with the resolved path.
- **D12**: the log exists, is a full `make canary` run (all four C sessions, D, E, static and
  live tiers present), and the only `--- FAIL` is `TestInstalledVersionMatchesPin`.
- **D13**: read every new/changed `assert`/`require`/`t.Log*`/`fmt.Errorf` in `test/canary/`
  for INV-2.
- **D15**: read `docs/claude-code-pin.md` and the `Makefile` help line against REQ-13/14.

## Implementation Notes

### For daemon-tests (the harness)

- **Run C ×4.** Keep `headless(ctx, extraEnv...)` but let it take the argv tail: add a variant
  or a parameter carrying `--permission-mode <v>` (omit for the no-flag run). New constants:
  `sessionUnauth` (no flag, 43, unchanged), `sessionUnauthPlan` 45, `sessionUnauthAccept` 46,
  `sessionUnauthAuto` 47. Same `CLAUDE_CONFIG_DIR` unauth config dir for all four (the
  settings copy into it is already written once). Each is ~1–2 s and zero tokens
  (`spikes/canary-fields.md` "Hooks are not awaited on the authentication-failure exit" —
  `StopFailure` landed 2/2, `SessionEnd` 0/2; keep not asserting `SessionEnd`).
- **Run D.** Replace the bare `LaunchParams{Model: haikuModel}` with `{Model: haikuModel,
  Title: "Muster Canary", PermissionMode: "plan"}`. After the existing "wait for a post-turn
  status line with `rate_limits`" step, add `waitFor(90 s, Notification idle_prompt on
  sessionInteract)`; record its arrival time; then kill the pane as today. Store run D's
  `session_id` and `transcript_path` from its `SessionStart` for run E.
- **Run E.** `interactiveResumeTmuxID` 98, `sessionResume` 48. Argv:
  `claudecode.BuildArgv("claude", LaunchParams{Model: haikuModel, PermissionMode: "plan",
  ResumeSessionID: <run D session_id>})` — this is byte-for-byte what
  `internal/server/sessions.go`'s Resume builds. Same env shape as run D (`MUSTER_SESSION`,
  `LANG`, `TERM`), same `ResizeWindow(200, 50)`, same trust-prompt loop keyed on
  `SessionStart` for `sessionResume`. Then type-and-submit (separately, as today) a prompt of
  the form "Call the ExitPlanMode tool now with a one-line plan; do nothing else." Wait for
  `PermissionRequest` (90 s), then `Notification` with `notification_type: "permission_prompt"`
  (30 s), then `KillSession`. Never send Enter, Down or Escape after the prompt — the dialog
  is left unanswered by design.
- **Teardown.** Kill both `muster-99` and `muster-98` before `kill-server`.
- **Timeouts.** The `build` context is 8 min; the new steps add ~60 s (idle) + ~35 s (resume
  startup + turn) + ~8 s (unauth ×3). Leave the 8 min as is.

### For daemon-tests (the assertions)

- `TestHookFields`: `Notification` row → `{"Notification", sessionInteract, []string{
  "notification_type", "message"}, false}` (the idle one from run D); `PermissionRequest` row
  → `{"PermissionRequest", sessionResume, []string{"tool_name", "tool_input"}, true}`
  (*amended 2026-09-10:* `permission_suggestions` dropped from the required list — absent on
  the 2.1.267 `ExitPlanMode` request; optional, shape-checked when present, presence logged). Delete the `SubagentStop` row with a comment: Muster
  reads nothing from it (`interpret.go` → `KindInert`); the `agent_id`-on-tool-hooks
  dependency is a probe ritual. `scratchpad_dir` (new common key on 2.1.259) is a superset
  and fine — log extras as `TestStatusLineFields` already does for the status line.
- `TestPlanModeSequence`: find the run-E `PreToolUse` and `PermissionRequest` with
  `tool_name == "ExitPlanMode"` by arrival index; assert index order, `permission_mode ==
  "plan"` on the `PreToolUse`; `t.Log` the step-3 ritual.
- `TestLaunchFlags`: table of `{session, want}` for the four C runs plus D; for `auto`,
  `assert.Contains([]string{"auto","default"}, got)` and `t.Logf("auto on haiku → %q", got)`.
  Resume: compare `SessionStart.session_id` and `transcript_path` between `sessionInteract`
  and `sessionResume` captures; assert `source == "resume"` on E and `"startup"` on D.
- `TestNotifications`: idle — the Notification on `sessionInteract` has `notification_type ==
  "idle_prompt"` and arrives after that session's `Stop` (compare capture `at`);
  permission — the Notification on `sessionResume` has `notification_type ==
  "permission_prompt"` and its `prompt_id` equals the `PermissionRequest`'s.
- `static_test.go`: `exec.LookPath("claude")` → `filepath.EvalSymlinks` → open, read in
  4 MiB chunks keeping the last 64 bytes of the previous chunk as overlap (longest needle is
  25 bytes), `bytes.Contains` per needle, collect misses, `assert.Emptyf(t, misses,
  "installed binary %s lacks interface strings: %v", path, misses)`. Do not read the whole
  file into memory. The needles are inventory knowledge and live in the test (test/canary is
  the inventory-of-record); the one exception is the env var, which must come from
  `claudecode.LaunchEnv()` so the assertion follows production.
- `live_test.go`: a `live(t)` helper that `t.Skipf`s under `offlineEnv` exactly as
  `harness(t)` does, then the three tests. Keychain: `user.Current()` → `Username` (what
  `cmd/musterd/main.go`'s `keychainUser` does). Usage raw GET: headers `Authorization:
  Bearer <token>` and `anthropic-beta: oauth-2025-04-20` (`spikes/canary-fields.md` "GET
  /api/oauth/usage measured live"), 10 s client timeout, decode into `map[string]any`, assert
  keys only. Base URL `https://api.anthropic.com` matches `main.go`'s `-usage-api-url`
  default.
- **Evidence rule.** Payload maps must never appear in an assertion message. Use
  `keys(payload)` (already in the file) or the single named scalar.

### For daemon-impl

- `Makefile` line 70 help text and nothing else in the target.
- `docs/claude-code-pin.md`: rewrite the run table to A / B / C×4 / D / E with cost and
  "proves" columns; add a "Static and live tiers" paragraph stating what each proves and does
  not (string presence ≠ semantics; live tier uses the real token read-only); replace the
  "Still manual" paragraph with the three residual rituals (plan-mode step 3; `agent_id` on
  subagent-originated hooks; `fable` alias by static inspection); mark R2 automated; add the
  "rerun once before reading it as drift" guidance for Edge Cases 2 and 7; note the
  `canary-run.log` convention for plan reviews.

### For the orchestrator

- **Decision 3 (2026-09-10).** Run `make canary` **once per review cycle, yourself, in the
  main session**, and save the full output to `plans/canary-full-coverage/canary-run.log`
  (`make canary 2>&1 | tee plans/canary-full-coverage/canary-run.log`). Never delegate the
  real run to a subagent and never add it to the checks block. It burns four haiku turns
  (~2.5–3 min); the log is the review agent's evidence for D12. Before running, confirm the
  tree compiles (D1) so a compile error doesn't cost a real run. Before and after the run,
  `md5 -q ~/.claude/settings.json` must match (the harness never touches it — the check is
  the ritual's, not the plan's).
- **Doc upkeep** (yours, not the impl agents'): `TODO.md` — tick "Bring `make canary` up to
  full interface coverage" and the `#13` sub-item "`make canary` must assert
  `CLAUDE_CODE_SCROLL_SPEED`" (line ~853), noting it is a static string assertion; `SPEC.md`
  changelog entry (canary coverage; `SubagentStop` reclassified as not a surface; plan-mode
  step 3 the one interactive residual); `spikes/canary-fields.md` — header re-validation
  line for the installed version the run used, the observed `auto`-on-unauth value, the
  measured `idle_prompt` gap on this run, `session_title`/`session_name` equality with
  `--name`, the resume same-id fact re-measured interactively on the installed binary, and
  the static-inspection facts now asserted (SCROLL_SPEED, theme enum, usage path/header)
  losing their "not asserted by `make canary`" caveats.
- **Decision 4.** The pin bump (2.1.246 → the installed version on green) is **not** part of
  this plan. `TestInstalledVersionMatchesPin` red in `canary-run.log` is expected (D12).
  After `/land`, Damian runs the ritual in `docs/claude-code-pin.md` step 2.

### Measured facts this plan leans on

- `idle_prompt` 60.03 s after `Stop` (2.1.259, `test/rig/captures/capture-6.jsonl`).
- `permission_prompt` follows `PermissionRequest` and shares its `prompt_id`
  (`spikes/FINDINGS.md` §5).
- Plan-mode sequence and `permission_suggestions` shape (`spikes/canary-fields.md` "Values
  worth asserting").
- Interface strings present in the installed 2.1.267 bundle (probed 2026-09-10 during
  planning): `CLAUDE_CODE_SCROLL_SPEED` 5 hits, `light-daltonized` 6, `/api/oauth/usage` 2,
  `oauth-2025-04-20` 3, `claudeAiOauth` 7, `find-generic-password` 9, `permission-mode` 68.
  `Claude Code-credentials` has **0** hits (composed at runtime from a `-credentials`
  suffix), which is why the Keychain item is covered by the live tier and not the static one.
