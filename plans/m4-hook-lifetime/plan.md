# Plan: M4 — Hook lifetime: every hook a command wrapper, silent when unmanaged or down

**Created**: 2026-08-27
**Status**: completed
**Work Type**: daemon
**E2E Scope**: none
**Description**: Replace the ten `type:"http"` hook entries Muster writes into a directory's `.claude/settings.local.json` with one generic command wrapper that exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is unreachable; strip Muster's legacy http entries and `allowedHttpHookUrls` from already-instrumented files; make the envelope authoritative for binding on every event. Hook entries become permanent-by-design.

## Overview

Three open M4 items share one root: Muster's hooks are Claude Code's own `type:"http"`
entries in a **per-directory** file. They fire for every Claude Code session in that
directory (managed or not), they cannot tell which is which, and Claude Code prints their
failures inline — so with musterd stopped every session in an instrumented directory prints
`PreToolUse:Bash hook error connect ECONNREFUSED …` per tool call, an unmanaged session
floods the `event` table with unrouted rows (117 of 121 rows in the real DB), and there is
no sane point at which to remove the entries (they must survive a daemon restart under a
live session, so "strip on shutdown" is wrong).

The `SessionStart` and status-line hooks are already `type:"command"` wrappers and have
none of these problems. This plan makes **every** hook a command wrapper — one generic
`hook.sh` in the data dir, registered on all eleven events — whose first line is
`[ -z "$MUSTER_SESSION" ] && exit 0`. Consequences, each measured or structural:
unmanaged sessions post nothing (~6 ms/event); a stopped daemon costs ~32 ms/event and
**no visible error** because Claude Code sees exit 0; the ingest token leaves
`settings.local.json` entirely (it lives only in the 0700 scripts); `allowedHttpHookUrls`
is no longer written; and because the entries reference stable script *paths* rather than
URLs, a port/token rotation no longer touches the settings file at all — `WriteWrapperScripts`
already rewrites the scripts at every start, so live sessions pick up a new URL on their
next event. Cost: ~50 ms/event versus ~25 ms for http (probe 2026-08-27 against 2.1.246,
`spikes/FINDINGS.md` addendum) — ~1 s more on a 20-tool-call turn. Accepted; a compiled
helper (~10 ms) is recorded as a post-v1 option, not built here.

With every event enveloped, binding stops depending on `SessionStart` alone: an enveloped
event whose `session_id` differs from the session's bound one is the protocol's existing
"new `session_id` on a known pane" case and is treated as `/clear` (rebind, reset context
and compactions, → `started`) before the event itself applies; a never-bound session binds
on its first enveloped event. Decided with Damian 2026-08-27: hook entries are
**permanent by design** (no strip-on-remove, no reference counting) — a stale entry now
costs a 6–32 ms `sh` exit, not a line of noise, so the lifetime question dissolves.

## Requirements

### Must Have
- [ ] REQ-1: `MergeSettings` registers a `type:"command"` entry `{"type":"command","command":<quoted hook script path>,"timeout":2}` on every event in `httpHookEvents` **and** `SessionStart` (eleven events), and writes **no** `type:"http"` entry on any event.
- [ ] REQ-2: `MergeSettings` no longer adds to `allowedHttpHookUrls`. On an existing file it removes every entry of that array that is a Muster ingest URL (loopback host + `/ingest/<token>/hook` path shape — the same `isMusterEntry` recognition), preserves foreign entries, and deletes the key when the array becomes empty.
- [ ] REQ-3: On an already-instrumented file, `MergeSettings` drops Muster's legacy entries wholesale — `type:"http"` ingest entries on every event, and the legacy `SessionStart` command entry (`<dataDir>/hook-sessionstart.sh`, bare or quoted) — replacing them with exactly one new command entry per event, never duplicating. Foreign hooks on the same events are preserved in place (the D5 guard, `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives`, must still pass).
- [ ] REQ-4: `SettingsConfig` becomes `{HookCommand, StatusLineCommand string; LegacyCommands []string}` (raw paths; quoted at the write boundary as today). `HookURL`/`StatusURL` are removed from it — settings.local.json carries no URL and no token. `LegacyCommands` lists prior wrapper paths `isMusterEntry` must also recognise (bare or quoted).
- [ ] REQ-5: `WriteWrapperScripts` writes `hook.sh` (posts to `/ingest/<token>/hook`) and `status-line.sh` (posts to `/ingest/<token>/status`) into the data dir, mode 0700, and best-effort removes the legacy `hook-sessionstart.sh`. It returns the hook script path, the status-line script path, and the legacy path (for `LegacyCommands`).
- [ ] REQ-6: Both generated scripts begin, after the shebang/comment, with `[ -z "$MUSTER_SESSION" ] && exit 0` — an unmanaged session (no `MUSTER_SESSION` in its environment) performs **no network call** and produces no output.
- [ ] REQ-7: Both generated scripts **never write to stdout or stderr** and **always exit 0**, including when the daemon is unreachable (`curl --silent --output /dev/null --max-time 2`, trailing `exit 0`). A command hook's stdout is interpreted by Claude Code as a hook decision and a non-zero exit as a block — the wrapper must be inert in both channels.
- [ ] REQ-8: `MergeSettings` stays byte-identical on a second call with the same config against its own output (idempotency guarantee retained).
- [ ] REQ-9: Envelope-authoritative binding. When a routed **enveloped** non-status event's `session_id` differs from the session's bound `ClaudeSessionID` (and the input kind is not itself a bind kind), the manager first applies the `/clear` rebind (as `KindClearRebind`: rebind `byClaude`, reset context gauge and compaction counter, state → `started`), then applies the event. When the session has never been bound (`ClaudeSessionID == ""`), it binds (sets `ClaudeSessionID` and `byClaude`) with **no** state transition, then applies the event. The row is persisted and broadcast once. **Amended 2026-08-28 (review.md cycle 1 Critical 1, Option B chosen by Damian; see `decisions/monotonic-rebind/decision.md`)**: the rebind is *monotonic* — if the incoming `session_id` is already in `byClaude` pointing at *this* session while not being the current `ClaudeSessionID`, it is a reordered straggler from a conversation the session has left: route and apply the event, do **not** rebind, reset, or transition.
- [ ] REQ-10: Raw (non-enveloped) hook posts keep today's behaviour exactly: routed by the `session_id` → session map, never bind, never rebind; unknown ids persist unrouted (D9 unchanged).
- [ ] REQ-11: Status-line posts never bind or rebind regardless of `session_id` (m3-gauges INV-1: status posts mutate nothing state-machine-owned).
- [ ] REQ-12: The generated `settings.local.json` → `/bin/sh -c` → script → POST → route chain is exercised for the **hook** wrapper in the Go round-trip test (extending `TestWrapperScriptsShellRoundTrip`), including the `MUSTER_SESSION`-unset zero-request case and the daemon-unreachable silent-exit-0 case.
- [ ] REQ-13: `docs/protocol.md` §4 / §4.1 / §4.2 / §7.3 and `SPEC.md` §6 are updated to the command-wrapper transport and the envelope-authoritative binding rule (details under Implementation Notes → Doc upkeep).

### Should Have
- [ ] REQ-14: `test/canary/canary_test.go` gains a skipped (`needsHarness`) `TestCommandHooksCarryEnvelopeOnEveryEvent` stub, sibling of `TestCommandHookPathQuoting`, asserting on the real binary that `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd` arrive enveloped with `musterSession` and that a session without `MUSTER_SESSION` produces zero posts. Unskipped by plan `m4-canary`.
- [ ] REQ-15: The `hook.sh` wrapper does not need or take an argument (the payload carries `hook_event_name`); one script serves all eleven events.

### Nice to Have
- [ ] REQ-16: `musterd` logs, once at startup, the resolved hook/status-line script paths at Info level (paths only — never the token or URL).

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). No WS message or UI-facing HTTP endpoint changes; the UI is untouched. The delta is to the **ingest transport** and the **binding rule**.

### §4 — HTTP endpoints — ingest: transport row

`POST /ingest/{token}/hook` body becomes: "One hook payload — **enveloped** (§4.2) from the command wrapper; raw still accepted (canary / legacy)". The bullet "One hook URL for all events … a single `allowedHttpHookUrls` entry" becomes: "One hook URL for all events (`hook_event_name` is in every payload), reached only from the generated wrapper script — Muster writes **no** `allowedHttpHookUrls` and no `type:"http"` entries."

### §4.1 — Transport facts

Append: "**All hooks are `type:"command"` wrappers** (m4-hook-lifetime, 2026-08-27). Command hooks see the pane environment on every event (probe 2026-08-27, 2.1.246: 15/15 events enveloped across 3 sessions), so every event can carry the §4.2 envelope, and the wrapper exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is unreachable — an unmanaged session posts nothing and a stopped daemon produces no inline hook errors. Cost ~50 ms/event vs ~25 ms for http (measured)."

### §4.2 — Binding rule (replaces the current "Binding rule" bullet)

- **Binding rule**: every event Muster's wrapper posts is enveloped, and the envelope's `musterSession` routes it (a stale/unknown value is never trusted — persisted unrouted). The enveloped `SessionStart` remains the *normal* binder of `claudeSessionId → session`, but binding is **envelope-authoritative**: any enveloped non-status event whose `session_id` differs from the bound one is the "new `session_id` on a known pane" case below and is applied as a `/clear` rebind first; an enveloped event on a never-bound session binds it without a transition. **Amended 2026-08-28**: rebinding is monotonic — an enveloped event naming a *previous* id of this session (already in `byClaude` → this session, not current) never rebinds backwards; it is routed and applied only. Raw (non-enveloped) posts route by `session_id` through the existing mapping, never bind, and persist unrouted when unknown — never guessed at by `cwd`. Status-line posts never bind or rebind (§7.3, INV-1).

### §7.3 — Transitions table

Row `SessionStart (source:"clear", or any new session_id on a known pane)` becomes:
`SessionStart (source:"clear"), or any enveloped non-status event whose session_id differs from the bound one` | `/clear`: rebind, reset context + compactions → `started`; a non-`SessionStart` trigger then applies its own row.
New row: `Any enveloped non-status event on a never-bound session` | Bind `claudeSessionId` (no transition), then apply the event's own row.

### Changelog entry

- **2026-08-27 — §4/§4.1/§4.2/§7.3: all hooks are command wrappers; envelope-authoritative binding** (plan `m4-hook-lifetime`). Muster writes one `type:"command"` entry per event pointing at `<dataDir>/hook.sh`, no `type:"http"` entries and no `allowedHttpHookUrls`; the wrapper exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is down. Binding may occur on any enveloped event. Wire shapes on `/ingest/*` unchanged; no version bump.

## Schema Changes

No schema changes required.

## UI Specifications

Not applicable — `Work Type: daemon`. The daemon-down banner (`web/src/render/banner.ts`) is unchanged and remains the only daemon-down surface; after this plan it is also the *honest* one, since managed panes no longer show hook errors.

## Affected Files

### Daemon
- `internal/claudecode/settings.go` — `SettingsConfig` reshaped (REQ-4); `MergeSettings` writes command entries on all eleven events (REQ-1), no http entries, strips Muster's `allowedHttpHookUrls` entries (REQ-2), recognises legacy http + legacy command entries via `isMusterEntry` (REQ-3); `WriteWrapperScripts` returns `(hookScript, statusLineScript, legacyScript string, err error)`, writes `hook.sh`, removes `hook-sessionstart.sh` (REQ-5); `writeEnvelopeScript` gains the early-exit line and the never-print contract (REQ-6/7). Keep `shellQuote` unexported (D7 boundary).
- `internal/claudecode/doc.go` — package comment: transport is command wrappers.
- `internal/server/sessions.go` — `sessionLauncher` drops `hookURL`/`statusURL`, gains `hookScript`, `legacyScripts`; `writeSettings` builds the new `SettingsConfig`.
- `internal/server/server.go` — `Config`/launcher wiring for the script paths (lines ~146–147 stop composing hook/status URLs for the launcher; the ingest handlers themselves are unchanged).
- `internal/server/ingest.go` — `process` passes `enveloped := ev.MusterSession != nil` into `manager.Apply` (REQ-9); status path unchanged (REQ-11).
- `internal/session/manager.go` — `Apply` gains `enveloped bool`; implements REQ-9's rebind-then-apply / bind-then-apply, keeping one persist + one broadcast.
- `internal/session/machine.go` — `applyBind` reused for the synthetic `KindClearRebind`; no new state.
- `cmd/musterd/main.go` — consumes the new `WriteWrapperScripts` return values; passes legacy path through to the server config; REQ-16 log line.
- `test/canary/canary_test.go` — REQ-14 skipped stub (daemon track owns this file; test agents never edit it here because it is a harness stub, not a unit test of plan logic — same convention as `TestCommandHookPathQuoting`).
- `docs/protocol.md`, `SPEC.md`, `TODO.md`, `spikes/canary-fields.md` — doc upkeep (REQ-13; details below).

### Tests (daemon-tests owns)
- `internal/claudecode/settings_test.go` — REQ-1/2/3/4/8 unit tests incl. the migration fixture (a real pre-plan `settings.local.json` shape with http entries, legacy quoted and bare `hook-sessionstart.sh`, Muster + foreign `allowedHttpHookUrls`).
- `internal/server/settings_shell_test.go` — REQ-12 extension of `TestWrapperScriptsShellRoundTrip`.
- `internal/session/manager_test.go` / `machine_test.go` — REQ-9/10/11 invariant table (see Invariants).

### Web
- None.

## Invariants

- **INV-1 (binding map consistency)**: after any `Apply`, `byClaude[sess.ClaudeSessionID] == sess.ID` whenever `sess.ClaudeSessionID != ""`. Assert from **every** displayed state (`started`, `planning`, `working`, `needs_input`, `failed`, `idle`) and from the `alive=false` (ended, kept-for-resume) row, for each of: enveloped same-id event, enveloped different-id event, enveloped event on never-bound session, raw event, status post.
- **INV-2 (rebind resets)**: an enveloped different-id non-status event leaves `context == nil`, `compactions == 0`, `state == started` *before* its own row applies — i.e. a `UserPromptSubmit` trigger ends in `working`/`planning` with `compactions == 0`; a `Stop` trigger ends in `idle` with `compactions == 0`.
- **INV-3 (raw never binds)**: a raw event with an unknown `session_id` changes no session's `ClaudeSessionID` and no `byClaude` entry, from every source state.
- **INV-4 (status never binds)**: a status post with a different `session_id` changes no `ClaudeSessionID`, no `byClaude` entry, and no state-machine-owned field, from every source state.
- **INV-5 (wrapper inertness)**: for every combination of {`MUSTER_SESSION` set, unset} × {daemon reachable, port closed}, the generated `hook.sh` and `status-line.sh` exit 0 with empty stdout and empty stderr.
- **INV-6 (settings file carries no secret)**: the bytes `MergeSettings` produces contain neither the ingest token nor any `http://` / `https://` URL, for any config.
- **INV-7 (bystanders)**: with two live sessions in the same directory, a rebind on one never changes the other's `ClaudeSessionID` or `byClaude` entry.

## Carried-over measurements — re-checked against this plan's decisions

| Measurement | Measured in | Still valid? |
|---|---|---|
| Command hooks see `$TMUX_PANE` and `tmux new-window -e` vars (2.1.237, SessionStart + status line) | per-directory settings, two command hooks | **Re-measured 2026-08-27 on 2.1.246 for five more events, 15/15** — valid for all-command topology |
| `SessionStart` never delivered over `type:"http"` (2.1.233) | http transport | Irrelevant after this plan (no http hooks) — retained in canary-fields as history |
| Command fields are `/bin/sh -c` lines; quote paths (2.1.245) | two command hooks | Valid — applies to all eleven entries now; `shellQuote` unchanged |
| Hook delivery best-effort, at-most-once; receiver down → event dropped, fails open (2.1.233, http) | http hooks | Valid and now *desired*: the wrapper makes the drop silent. Note the probe showed a **hung** (not down) daemon still costs `min(curl --max-time, hook timeout)` = 2 s/event, same as http today |
| Hook timeout 1–2 s never 5 (SPEC §6) | http | Valid; the command entries carry `timeout: 2` and curl `--max-time 2` |
| `PermissionRequest` http hook timing out renders no decision (2.1.233) | http | Under command hooks, **empty stdout + exit 0 = no decision** is the equivalent — REQ-7 encodes it; not re-measured (structural: Claude Code's documented command-hook contract; the probe's `PreToolUse` wrapper with empty stdout did not block the `echo` tool, 3/3) |

## Edge Cases

1. **Already-instrumented directory (every existing user directory).** File holds ten http entries, a quoted or bare `hook-sessionstart.sh` command, `allowedHttpHookUrls` with Muster's URL. After launch: eleven command entries, no http, no legacy command, key `allowedHttpHookUrls` absent (or holding only foreign URLs). This is the case most likely to be got wrong — test it with a verbatim fixture.
2. **Foreign hooks share the events.** A foreign `type:"http"` on `PostToolUse` (remote host) and a foreign `type:"command"` on `SessionStart` both survive, positions preserved relative to each other; Muster's entry is appended after them (today's ordering).
3. **Foreign `allowedHttpHookUrls`.** `["https://example.com/*", "http://127.0.0.1:8765/ingest/tok/hook"]` → `["https://example.com/*"]`; `["http://127.0.0.1:8765/ingest/tok/hook"]` → key deleted.
4. **Lost `SessionStart(clear)`.** `/clear` in a managed pane, the `SessionStart` post is dropped; the next `UserPromptSubmit` arrives enveloped with the new `session_id` → rebind + reset, then `working`. (REQ-9; today this event would be persisted unrouted because `Resolve` fails and `musterSession` is honoured only for routing, not binding — actually routed, but never bound, so subsequent *raw* events would be lost; no raw events exist after this plan, but the map must still be correct for `Resolve`-based tests and the canary.)
5. **Lost initial `SessionStart(startup)`.** First enveloped event is `UserPromptSubmit` on a never-bound session → bind without transition, then `working`. The model field stays `nil` until a status post supplies it (already the M3 behaviour).
6. **`SessionEnd(reason:"clear")` for the old id arrives enveloped** — its `session_id` is the *currently bound* one, so no rebind; existing row: not a death hint.
6a. **Reordered `SessionEnd(reason:"clear")` arrives *after* the new conversation is bound and working** (amended 2026-08-28, review Critical 1) — its `session_id` is a previous id of this session; monotonic rule: no rebind, no reset, state stays `working`, compactions unchanged.
6b. **Residuals of the monotonic rule** (review cycle 2 Minor 2, measured, accepted): a resume-back to an earlier conversation whose `SessionStart(source:"resume")` is lost keeps a stale `ClaudeSessionID` (state still correct; next bind event fixes it); a cross-session id collision (one conversation under two `MUSTER_SESSION` values) leaves the bystander's `ClaudeSessionID` unattributed in `byClaude` — pre-existing on `KindResumeBind`. Recorded in `docs/protocol.md` §4.2 and changelog.
7. **Enveloped event for an ended-but-kept session** (`alive=false`, resume chance): routed today via `Exists`; REQ-9 applies the same way. `--resume` then delivers `SessionStart(source:"resume")` with the same id → `KindResumeBind` as today.
8. **`MUSTER_SESSION` present but not an integer** (user exported junk) → envelope is invalid JSON → dropped as unparseable (existing path), logged without payload.
9. **Two managed sessions in one directory** — same file, same eleven entries; each pane's env disambiguates. INV-7.
10. **Daemon hung, not down** — each hook costs up to 2 s; unchanged from today's http behaviour; out of scope.
11. **Daemon restarts on a new port/token** — scripts are rewritten at start; `settings.local.json` needs no change (entries are paths). Live sessions' next event posts to the new URL. This is *better* than today; note in protocol §4.1.
12. **Data dir moved** (`-data-dir` changed) — the old file points at scripts that no longer exist; Claude Code prints `/bin/sh: … No such file` once per event in that directory. **Amended 2026-08-28 (review.md Major 1)**: this does *not* heal on the next Muster launch — `isMusterEntry` matches command paths exactly, so entries from another data dir are unrecognisable and survive every future launch (measured in the review rig). Accepted residual; documented in Implementation Notes and `TODO.md` (it is the same failure as any deleted hook script).
13. **`hook.sh` invoked with stdin closed / empty payload** — `input=$(cat)` yields empty, body `{"musterSession":N,"payload":}` is invalid JSON → daemon drops it as unparseable; script still exits 0.
14. **Legacy `hook-sessionstart.sh` removal fails** (permissions) — best-effort, logged at Info, launch continues; the settings entry for it is dropped regardless.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon (incl. Go tests), `E*` regression gates. One clause per criterion.

### Daemon
- **D1**: `MergeSettings` output for a fresh file contains a `type:"command"` entry on each of the eleven events (`httpHookEvents` + `SessionStart`), each with `timeout: 2` and `command` equal to the single-quoted hook script path.
- **D2**: `MergeSettings` output contains no `"type":"http"` entry on any event, for a fresh file and for the Edge Case 1 fixture.
- **D3**: `MergeSettings` output for the Edge Case 1 fixture has exactly one Muster command entry per event (no duplicates) and no entry whose command is the legacy `hook-sessionstart.sh` path in either form.
- **D4**: `MergeSettings` removes Muster ingest URLs from an existing `allowedHttpHookUrls`, preserves foreign URLs, and deletes the key when empty (Edge Case 3, both variants).
- **D5**: `MergeSettings` never adds an `allowedHttpHookUrls` key to a file that lacks one.
- **D6**: Foreign entries on `PostToolUse` (http, remote host) and on `SessionStart` (command) survive the merge with the Edge Case 1 fixture (existing D5-guard test still green plus the new fixture).
- **D7**: `MergeSettings` applied to its own output with the same config is byte-identical.
- **D8**: `MergeSettings` output contains neither the ingest token nor the substring `http://` or `https://` (INV-6) — asserted for a config whose paths are space-bearing and single-quote-bearing.
- **D9**: `WriteWrapperScripts` writes `hook.sh` and `status-line.sh` with mode 0700 and removes a pre-existing `hook-sessionstart.sh`.
- **D10**: Each generated script's first non-comment line is `[ -z "$MUSTER_SESSION" ] && exit 0` (asserted on the file bytes).
- **D11**: Running the generated hook command extracted from `settings.local.json` through `sh -c` with `MUSTER_SESSION` set and a `PreToolUse` body on stdin produces a routed `event` row (`session_id` = the session) with `type = PreToolUse` and the envelope columns populated.
- **D12**: The same run with `MUSTER_SESSION` unset produces zero HTTP requests to the test server, zero new `event` rows, exit status 0, empty stdout, empty stderr.
- **D13**: The same run with `MUSTER_SESSION` set but the URL pointing at a closed loopback port exits 0 with empty stdout and stderr in under 3 s (INV-5, daemon-down case).
- **D14**: INV-1 holds from every displayed state and the ended row for every input class listed (table-driven test, `internal/session`).
- **D15**: INV-2 holds for both a `UserPromptSubmit` and a `Stop` trigger, from every displayed state.
- **D16**: INV-3 and INV-4 hold from every displayed state.
- **D17**: INV-7 holds: a rebind on session A leaves session B's binding untouched (two-session manager test).
- **D18**: `Apply` on the rebind-then-apply path calls `store.UpdateSession` once and broadcasts once (counting fake store / broadcaster).
- **D19**: `make test` passes.
- **D20**: `go build ./...` succeeds.
- **D21**: `make lint` passes.
- **D22**: No Claude-Code-format key names leak outside `internal/claudecode` (existing boundary grep, unchanged).
- **D23**: `shellQuote` and the `'\''` escape appear nowhere outside `internal/claudecode` (existing D7 boundary grep, unchanged).
- **D24**: `sessionLauncher` in `internal/server` no longer holds or composes an ingest URL for the settings file (grep: no `hookURL`/`statusURL` field in `internal/server/sessions.go`).
- **D25**: `test/canary/canary_test.go` contains `func TestCommandHooksCarryEnvelopeOnEveryEvent` (skipped stub, REQ-14).
- **D26**: `docs/protocol.md` §4, §4.1, §4.2, §7.3 and changelog carry the Protocol Contract delta verbatim in substance (reviewer reads).
- **D27**: `SPEC.md` §6 daemon-down bullet is amended and the §11 changelog carries this plan's entry (reviewer reads).
- **D28**: `TODO.md` ticks the three M4 entries this plan resolves and records the permanent-by-design decision (reviewer reads).
- **D29**: No generated script writes to stdout or stderr on any path (reviewer reads the template: `--silent --output /dev/null`, no `echo`/`printf`, `exit 0` last).
- **D30**: `internal/claudecode` still has no dependency on `internal/usage` or `internal/store` (`go list -deps`).

### E2E (regression gates only — `E2E Scope: none`)
- **E1**: The existing Playwright suite still passes (the fake `claude` never read `settings.local.json`, so this is a pure regression gate).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes iff its command exits 0.

```checks
D19 make test
D20 go build ./...
D21 make lint
D22 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
D23 ! rg -n "shellQuote|'\\\\''" cmd/ internal/server/ internal/session/
D24 ! rg -n "hookURL|statusURL" internal/server/sessions.go
D25 rg -q "func TestCommandHooksCarryEnvelopeOnEveryEvent" test/canary/canary_test.go
D30 ! go list -deps ./internal/claudecode | rg -q "internal/(usage|store)"
E1 make e2e
```

Test-file scope note for the negative greps: D22 and D23 are the standing boundary checks and already exclude nothing by file type — `_test.go` files in `cmd/`, `internal/server/`, `internal/session/` are in scope, as before; tests obtain wire bodies via `internal/claudecode/claudecodetest` (`RawHookBody`, `EnvelopedHookBody`, `RawStatusLineFull`). D24 is scoped to one non-test file. Dry run against this document: D22's pattern occurs in this plan only inside prose about the *payload* (REQ-15, Edge Case 4) and in this note — none of it is code an agent would copy into `internal/server`; D23's pattern does not occur here outside the checks block. There is deliberately **no** negative grep for `allowedHttpHookUrls` or `"http"` in `settings.go`: the implementation must reference both strings to *recognise and strip* legacy entries (REQ-2/3), so the "never written" guarantee is asserted behaviourally by D2/D5/D8, not lexically.

### Reviewer-Verified

- **D1–D18**: present as named unit/integration tests in the listed test files, each asserting the stated clause (the reviewer maps each ID to a test name and confirms the assertion is real, not vacuous — the m4-reconcile FakeDomNode lesson).
- **D26**, **D27**, **D28**: doc edits present and consistent with the shipped code.
- **D29**: script template inertness by reading `writeEnvelopeScript`.
- **REQ-16** (nice-to-have): startup log line names paths only.
- **Manual (Damian, post-merge, burns subscription)**: launch a real haiku session from the dashboard in a directory whose `settings.local.json` still has the legacy http entries; confirm the file is migrated (eleven command entries, no `allowedHttpHookUrls`), the card binds and reaches `idle`, then stop musterd and run one prompt in the still-live pane — **no hook error lines appear**; then start an unmanaged `claude` in the same directory and confirm `event` gains zero rows. Record the result in `spikes/canary-fields.md`; kill both sessions after.

## Implementation Notes

- **Script template** (`writeEnvelopeScript`, one template, two URLs):
  ```sh
  #!/bin/sh
  # Generated by musterd (internal/claudecode.WriteWrapperScripts). …
  [ -z "$MUSTER_SESSION" ] && exit 0
  input=$(cat)
  fields="\"musterSession\":$MUSTER_SESSION,"
  if [ -n "$TMUX_PANE" ]; then fields="$fields\"tmuxPane\":\"$TMUX_PANE\","; fi
  body="{${fields}\"payload\":${input}}"
  curl --max-time 2 --silent --output /dev/null -H 'Content-Type: application/json' --data-binary "$body" '<url>'
  exit 0
  ```
  The `musterSession` field is now unconditional (the early exit guarantees it is set). Keep the URL single-quoted as today. Keep 0700 (token in cleartext). This exact shape was the probe's `muster-hook.sh` (2026-08-27), so its behaviour is measured, not assumed.
- **Command entry for the eleven events**: identical string for all — `shellQuote(cfg.HookCommand)` with `timeout: 2`. No per-event argument (REQ-15). The status line stays `{"type":"command","command":shellQuote(cfg.StatusLineCommand)}` plus whatever `refreshInterval` M3 settled (unchanged).
- **`isMusterEntry`** must recognise, for removal: (a) http entries by the existing URL-shape + loopback rule (unchanged — this is what deletes the legacy ten); (b) command entries equal to `HookCommand`, `StatusLineCommand`, or any `LegacyCommands[i]`, bare or quoted, with the existing `p != ""` guard. Do **not** try to recognise legacy commands by suffix (`…/hook-sessionstart.sh`) — exact path from `LegacyCommands` only, so a foreign script with the same basename elsewhere is never touched.
- **`allowedHttpHookUrls` stripping** reuses `musterIngestPath` + `isLoopbackHost` on each array element parsed as a URL; unparseable elements are foreign (kept). Sort is no longer applied when the key is removed; when foreign entries remain, keep today's `sort.Strings` for idempotency (D7).
- **`Manager.Apply(ctx, musterID, claudeID, promptID, input, enveloped bool)`**: before `applyInput`, if `enveloped && input.Kind` is not one of `KindBind/KindClearRebind/KindResumeBind`: if `sess.ClaudeSessionID == ""` → set it and `byClaude`; else if `sess.ClaudeSessionID != claudeID` → `applyBind(sess, claudeID, StateInput{Kind: KindClearRebind}, now)` and `byClaude` update. Then `applyInput` as today. Single persist + broadcast after. Tests in `internal/session` reach every state via the existing table helpers (m1-sessions' "every input against every starting state" machinery — extend it, don't fork it).
- **`ingest.go`** passes `ev.MusterSession != nil` as `enveloped`. The status path (`processStatus`) is untouched (REQ-11).
- **Do not** change `ParseIngestBody` or the `/ingest` handlers — wire shapes are unchanged; raw bodies remain accepted for the canary and `claudecodetest.RawHookBody` users.
- **`cmd/musterd/main.go`**: `hookScript, statusLineScript, legacyScript, err := claudecode.WriteWrapperScripts(...)`; server config carries `HookScript`, `StatusLineScript`, `LegacyScripts: []string{legacyScript}`. The ingest URLs are still composed for the *server's own* routes — only the launcher stops needing them.
- **Test fixture for Edge Case 1**: build it from today's `MergeSettings` output (run the pre-change code once in the test via a checked-in literal, not by calling the new code) so it is a faithful "file a real user has on disk". Include one foreign http hook (remote host), one foreign command on `SessionStart`, and both a bare and a quoted legacy `hook-sessionstart.sh` entry.
- **Canary stub** (REQ-14): same `needsHarness` skip mechanism as `TestCommandHookPathQuoting`; body documents the 2026-08-27 probe recipe (settings B, `--allowedTools Bash`, `echo hi`) so `m4-canary` can unskip it without re-deriving.
- **Doc upkeep (REQ-13 / D26–D28)** — merge the Protocol Contract into `docs/protocol.md` on approval (plan-work does this); on completion: `SPEC.md` §6 bullet "While the daemon is down, every managed pane fills with inline hook-error lines…" → "…command-wrapped hooks exit 0 silently when the daemon is unreachable (m4-hook-lifetime), so panes stay clean; the dashboard banner is the only daemon-down surface" + §11 changelog entry; `TODO.md`: tick "Surface daemon down prominently", "Per-directory hooks instrument every Claude Code session", "Muster never removes its own hook entries" with the permanent-by-design decision and the ~50 ms/event measurement; add the post-v1 "compiled hook helper (~10 ms/event)" note under M5+; `spikes/canary-fields.md` already carries the probe fact (written 2026-08-27 during planning).
- **Known remaining noisy case** (Edge Case 12): a moved/deleted data dir leaves entries pointing at missing scripts. Not solved here, and (amended per review.md Major 1) **not** healed by a later launch from a different data dir — exact-path matching leaves the old entries in place. Recorded in TODO under the ticked hook-lifetime entry as the residual.
- **Measured basis**: `spikes/FINDINGS.md` "Addendum — command-hook latency probe (2026-08-27, against 2.1.246)"; capture `test/rig/captures/capture-3.jsonl`. Pin is 2.1.233 — drift acknowledged, post-v1 pin-strategy item unchanged.
