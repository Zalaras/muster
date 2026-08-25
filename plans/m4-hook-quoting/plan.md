# Plan: M4 — Hook-command path quoting + the coverage that lets it be trusted

**Created**: 2026-08-25
**Status**: completed
**Work Type**: daemon
**Description**: Shell-quote the two command-hook paths `MergeSettings` writes, keep the wholesale-replace guarantee for already-instrumented directories, and close the three coverage holes (space-free data dirs, never-executed wrapper scripts, silent canary) that let M3 ship green with zero real status-line data.

## Overview

`MergeSettings` (`internal/claudecode/settings.go`) writes `hooks.SessionStart[].command`
and `statusLine.command` as bare filesystem paths. Both fields are `/bin/sh -c` command
lines, not path fields (probe 2026-08-25, `spikes/FINDINGS.md` addendum, against 2.1.245),
so the default macOS data dir — `~/Library/Application Support/Muster` — word-splits on
its space and **neither wrapper script has ever run against the real daemon**. Everything
M3 renders from status posts has therefore only ever seen synthesized input.

Scope is exactly the two paired TODO.md M4 entries (lines 242–304): the quoting fix and
the coverage gap. No reconcile, resume, end/remove, hook-entry lifetime or unrouted-event
policy — a later M4 plan. No UI changes. No `refreshInterval` in the written `statusLine`
block (M5+ staleness follow-up). No web-impl track: the single web-side change is a
one-token edit to an E2E *harness helper*, owned by e2e-specs (see Affected Files).

Settled decisions carried in from the brief (not re-opened here):

- **Quoting is the fix**, not relocating the data dir or the scripts. Single quotes with
  `'` → `'\''` escaping — `"…"` still interpolates `$`, backticks and `\`.
- `SettingsConfig` keeps **raw** paths; quoting happens only at the write boundary inside
  `MergeSettings`. Second call with the same config stays byte-identical.
- `isMusterEntry` recognises **both** the quoted form and the legacy bare form, so an
  already-instrumented directory's stale bare entry is replaced, not duplicated.
- The quoting rule is recorded in `docs/protocol.md` §4.2 (doc-only delta).

## Requirements

### Must Have
- [x] REQ-1: `MergeSettings` writes `hooks.SessionStart[0].hooks[0].command` and
      `statusLine.command` as the single-quoted shell word of the configured path
      (`'` inside the path escaped as `'\''`). Nothing else in the two entries changes
      (`type:"command"`, `timeout: 2` on SessionStart, no timeout on statusLine).
- [x] REQ-2: `SettingsConfig.SessionStartCommand` / `StatusLineCommand` remain raw
      absolute paths; callers (`internal/server/sessions.go`) pass what
      `WriteWrapperScripts` returned, unchanged. Quoting lives in one function in
      `internal/claudecode/settings.go` (`shellQuote`, unexported).
- [x] REQ-3: `isMusterEntry` recognises a `type:"command"` entry as Muster's own when its
      `command` equals **either** `shellQuote(path)` **or** the bare `path`, for either
      configured script path. A pre-existing bare entry is therefore dropped and replaced
      by the quoted one — one Muster entry per event after the merge, never two.
- [x] REQ-4: `MergeSettings` called twice with the same config produces byte-identical
      output (existing guarantee, must survive; the second call sees its own quoted
      entries and replaces them in place).
- [x] REQ-5: Both generated wrapper scripts, when their `command` strings are taken
      **verbatim** from the generated `settings.local.json` and run through `sh -c` from a
      data dir whose path contains a space, deliver: the SessionStart wrapper binds
      `claude_session_id` to the `MUSTER_SESSION` session; the status-line wrapper
      produces a routed `status_line` event and one `usage_sample` row. (This is the
      assertion that would have failed on day one.)
- [x] REQ-6: Every Playwright E2E spec runs against a daemon whose data dir contains a
      space (`mkdtemp` prefix `"muster e2e-"` in `web/e2e/helpers/daemon.ts`), so the
      full existing suite exercises the production path shape for free.
- [x] REQ-7: `docs/protocol.md` §4.2 records that `hooks[].command` / `statusLine.command`
      are `/bin/sh -c` command lines and that Muster writes the script path single-quoted
      (with the probe citation), so a later refactor can't silently undo it.
- [x] REQ-8: `test/canary/canary_test.go` gains `TestCommandHookPathQuoting`, skipped
      with `needsHarness` like its siblings, whose body encodes the assertion: against
      the pinned binary, a session launched from an instrumented directory whose data dir
      contains a space delivers exactly one `SessionStart` (command hook) and ≥1 status
      post to the capture server.

### Should Have
- [x] REQ-9: Manual verification against the **real** default data dir via `/dev-loop`:
      one haiku session, and each M3 surface (masthead 5h/7d bars, masthead model
      readout, per-session context row, status-line-driven title) renders real data.
      Observed values recorded in this plan's "Manual verification record" section.
      Not automatable; gates the plan's `completed` status, not the review verdict.

### Nice to Have
- (none — the brief is deliberately narrow)

## Protocol Contract

Delta against `docs/protocol.md`: **doc-only, no wire-shape change.** Merge into §4.2 on
approval, as a new paragraph after the `.claude/settings.local.json` paragraph:

> **Command fields are shell command lines.** `hooks.<Event>[].hooks[].command` and
> `statusLine.command` are handed to `/bin/sh -c` by Claude Code (probe 2026-08-25 against
> 2.1.245, `spikes/FINDINGS.md` addendum: a bare space-bearing path fails with
> `/bin/sh: /tmp/muster: No such file or directory` for SessionStart and *silently* for
> the status line). Muster therefore writes each wrapper-script path as a **single-quoted
> shell word** (`'` inside the path escaped as `'\''`), and recognises its own prior
> entries in either the quoted or the legacy bare form when replacing them. Quoting a
> space-free path is harmless (measured). The default macOS data dir
> (`~/Library/Application Support/Muster`) contains a space, so this is the production
> path, not an edge case.

Plus a changelog line under §9. No `usage`/`session`/HTTP changes. No version bump.

## Schema Changes

No schema changes required.

## UI Specifications

None — no dashboard changes. (The `web/e2e/helpers/daemon.ts` edit is harness-only; no
spec's assertions change.)

### Testable UI Elements

None new.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/settings.go` — add `shellQuote(path string) string` (single-quote,
  `'`→`'\''`); apply it in the two `hookEntry{Type:"command", Command: …}` literals in
  `MergeSettings`; extend `isMusterEntry`'s command branch to match `cfg.X`,
  `shellQuote(cfg.X)` for both script paths. Update the doc comments (the
  `SettingsConfig` fields are "absolute path … quoted at write time").
- `docs/protocol.md` — §4.2 paragraph + §9 changelog (merged at approval by plan-work;
  daemon-impl only touches it if the merged text needs a correction).
- `TODO.md` — tick the two M4 entries at completion (doc upkeep; daemon-impl at the end
  of its pass, or the orchestrator's completion step).

### Daemon tests (daemon-tests)
- `internal/claudecode/settings_test.go` — REQ-1/REQ-3/REQ-4 unit tests (see D1–D5).
  Existing tests that assert the bare path in the generated JSON (e.g.
  `TestMergeSettings_FreshFileRegistersEveryHTTPHookEventAndSessionStartAsCommand`,
  `TestMergeSettings_ReplacesMustersOwnEntriesWholesale`) are **sanctioned-breakage
  updates** — they now expect the quoted form.
- `internal/server/settings_shell_test.go` (new) — the REQ-5 shell round-trip test (D6).
  Lives in `internal/server` because it needs the ingest route, the manager and the store
  together; it obtains wire bodies only via `claudecodetest` helpers (D4/D8 greps stay
  clean).
- `test/canary/canary_test.go` — REQ-8's skipped assertion (D9).

### E2E harness (e2e-specs)
- `web/e2e/helpers/daemon.ts` — `mkdtemp(join(tmpdir(), "muster e2e-"))` (REQ-6). Any
  spec that breaks on the space-bearing path is a **real defect** surfaced, not a spec to
  bend — e2e-specs reports it, doesn't quote around it.

### Audit conclusion — other path-into-shell sites (item 3 of the brief)

Reviewed in planning; **no code change required**:

- **Launch path is argv end-to-end.** `BuildArgv` → `tmux.NewSession` → `exec.Command`;
  the directory and `claude` binary path never pass through a shell.
- **`writeEnvelopeScript` — URL.** `curl … "%s"` is double-quoted; the URL is
  `http://127.0.0.1:<port>/ingest/<hex token>/…` — daemon-composed, no `$`, backtick or
  `"`. Safe.
- **`writeEnvelopeScript` — `$MUSTER_SESSION`.** Interpolated **unquoted into JSON** as a
  number: `"musterSession":$MUSTER_SESSION,`. The value is `strconv.FormatInt(sess.ID)`
  set by the daemon into the pane environment (`internal/server/sessions.go:134`) — always
  decimal digits. If a user manually exported a non-numeric `MUSTER_SESSION` the envelope
  would be invalid JSON and the ingest worker would persist it as an unparseable/unrouted
  body (existing behaviour for garbage input); it cannot execute anything because the
  variable is expanded by the shell *into a string assignment*, not re-evaluated. Accepted
  as-is; noted here so the next reader doesn't re-audit.
- **`writeEnvelopeScript` — `$TMUX_PANE`.** Interpolated inside JSON string quotes:
  `\"tmuxPane\":\"$TMUX_PANE\"`. tmux always sets `%<digits>`; a `"` in it would break the
  JSON, never the shell. Accepted.
- **`writeEnvelopeScript` — the script path itself** is written by `os.WriteFile` (no
  shell) — the *contents* of the script don't reference its own path. Safe.
- **`cmd/musterd/main.go` `-data-dir`** already accepts arbitrary paths; nothing else
  composes a shell string from it.

## Edge Cases

1. **Already-instrumented directory (the one most likely to be got wrong).** Existing
   `settings.local.json` has bare `command` entries from M1–M3. After the merge there is
   exactly one Muster command entry per event, quoted; the bare one is gone (REQ-3, D3).
2. **Path containing a single quote** (e.g. a repo checkout under `~/Damian's stuff`).
   `shellQuote("/a'b")` → `'/a'\''b'`; `isMusterEntry` matches it; `MergeSettings` is
   idempotent on it (D2). Not the production path, but the escaping rule is only worth
   having if it is tested.
3. **Space-free path.** Quoted form is written anyway (harmless, measured). Existing
   test fixtures with `/tmp/...` paths update to expect `'/tmp/...'`.
4. **Foreign command hook on SessionStart** whose command happens to equal one of
   Muster's paths bare or quoted — indistinguishable from Muster's own by construction;
   treated as Muster's (existing semantics, unchanged).
5. **Second daemon instance / token rotation** — unaffected: command entries key on the
   script path, which is per-data-dir and stable; HTTP entries key on path shape (existing).
6. **The shell round-trip test's data dir.** `t.TempDir()` on macOS yields
   `/var/folders/…/T/TestX…/001` — **no space**; the test must
   `filepath.Join(t.TempDir(), "muster data")` and pass that to `WriteWrapperScripts`, and
   assert the resulting command string contains a space before running it (guards the
   test against silently losing its point).
7. **`curl` availability.** The wrapper uses `curl`; it is on every macOS. The Go test
   runs `sh -c` for real, so it is a functional test, not hermetic — acceptable under
   the project's "functional E2E always" bar; skip with `t.Skip` if `curl` is not on
   `PATH` (`exec.LookPath`) so CI portability isn't silently broken.
8. **E2E tmux socket path with a space.** `tmuxSocket = join(dataDir, "tmux.sock")` is
   passed via argv (`-tmux-socket` → `exec.Command`), fine. `stub-claude.sh` is passed
   via `-claude-bin` → `BuildArgv` → argv, fine. If either breaks under the space, that is
   a real defect to fix in impl, not a reason to revert the prefix.
9. **Hook loss/dup/reorder, `/clear`, daemon restart, pane death** — none touched by this
   plan; routing and binding semantics are unchanged (the shell test exercises the
   existing bind path only).

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `E*` e2e, `R*` reviewer/manual.
One clause per criterion.

### Daemon
- **D1**: `MergeSettings` on a fresh file writes `statusLine.command` equal to
  `'<StatusLineCommand>'` and `hooks.SessionStart[0].hooks[0].command` equal to
  `'<SessionStartCommand>'`, for a path containing a space.
- **D2**: `MergeSettings` with a path containing `'` writes the `'\''`-escaped form, and a
  second call on that output is byte-identical to the first.
- **D3**: `MergeSettings` over an existing file holding the **legacy bare** Muster command
  entries (SessionStart hook + statusLine) yields exactly one SessionStart Muster entry,
  quoted, and no bare entry anywhere in the output.
- **D4**: `MergeSettings` over an existing file holding the **quoted** entries (its own
  prior output) is byte-identical (existing test, must still pass post-change).
- **D5**: A foreign `type:"command"` SessionStart hook with an unrelated command survives
  the merge alongside the quoted Muster entry (existing test, re-asserted post-change).
- **D6**: Shell round-trip (`internal/server/settings_shell_test.go`): with a data dir
  containing a space, `WriteWrapperScripts` + `MergeSettings` produce a
  `settings.local.json`; the test parses it, extracts `statusLine.command` and the
  SessionStart `command` **verbatim**, and runs each with
  `exec.Command("sh", "-c", cmd)` with env `MUSTER_SESSION=<seeded session id>`,
  `TMUX_PANE=%1`, and a `claudecodetest` payload on stdin, against
  `httptest.NewServer(srv.Handler())`.
- **D6a**: after the SessionStart run, `event.session_id` for that claude session id equals
  the seeded session's id (bound via the envelope).
- **D6b**: after the status-line run (`EnvelopedStatusLineFull`-style body **without** the
  envelope — the script adds it), `SELECT COUNT(*) FROM usage_sample` is 1 and the
  persisted event has `type = 'status_line'` with `session_id` = the seeded id.
- **D6c**: the test asserts the extracted command string contains a space (Edge Case 6).
- **D7**: `SettingsConfig` fields still hold raw paths — `internal/server/sessions.go`
  passes `WriteWrapperScripts`' return values unchanged (no quoting outside
  `internal/claudecode`).
- **D8**: `make test` passes.
- **D11**: `go build ./...` passes.
- **D12**: `make lint` passes.
- **D9**: `test/canary/canary_test.go` contains `TestCommandHookPathQuoting` (skipped with
  `needsHarness`) whose body states the expectation table from the probe (bare+space → 0
  SessionStart / no status post; quoted+space → 1 / ≥1) in executable form.
- **D10**: no `hook_event_name` outside `internal/claudecode` (m3's D4 grep, kept).
- **D13**: no status-line payload field names outside `internal/claudecode` (m3's D6 grep,
  kept; the new server test uses only `claudecodetest` helpers and settings-file keys).

### E2E
- **E1**: `web/e2e/helpers/daemon.ts` creates the scratch data dir with prefix
  `"muster e2e-"`.
- **E2**: `make e2e` passes in full (71/71 at time of writing) against the space-bearing
  data dir.

### Automated Checks

```checks
D8 make test
D11 go build ./...
D12 make lint
D10 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
D13 ! rg -n '"rate_limits"|"used_percentage"|"context_window"|"session_name"|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'
D7 ! rg -n "shellQuote|'\\\\''" cmd/ internal/server/
D9 rg -q "func TestCommandHookPathQuoting" test/canary/canary_test.go
E1 rg -q 'mkdtemp\(join\(tmpdir\(\), "muster e2e-"\)\)' web/e2e/helpers/daemon.ts
E2 make e2e
```

Grep scope note: `D7` covers non-test and test code in `cmd/` and `internal/server/` —
the server-side shell test must not re-implement quoting; it reads the *generated* file.
`D10`/`D13` greps deliberately include `_test.go` (as in m3); wire bodies come from
`claudecodetest`. Dry-run (2026-08-25): all three negative greps exit 1 (clean) against the
current tree. The plan text mentions `shellQuote`, `'\''` and `session_name`, but every
negative grep is scoped to `cmd/`/`internal/…`, never `plans/`, and none of those strings
is something an agent would copy from here into `cmd/` or `internal/server/` — the only
legal home for `shellQuote` is `internal/claudecode`, which D7 does not scan.

### Reviewer-Verified
- **R1**: `isMusterEntry`'s command branch compares against both forms for *both* paths
  (four comparisons or equivalent) — read the code; D3 only exercises one path shape.
- **R2**: No change to what the wrapper scripts *contain* (`writeEnvelopeScript` body
  unchanged) — the fix is in the settings file, not the scripts.
- **R3**: The audit conclusions above still match the code at review time (argv launch
  path; `$MUSTER_SESSION`/`$TMUX_PANE` interpolation unchanged).
- **R4**: `docs/protocol.md` §4.2 paragraph and §9 changelog present; SPEC §11 changelog
  entry and TODO ticks land (doc-upkeep backstop).
- **R5 (manual, REQ-9)**: the "Manual verification record" below is filled in with
  observed values from a real haiku session on the default data dir. Not a review gate;
  a `completed`-status gate.

## Manual verification record (REQ-9 — fill in after the pipeline)

Procedure: `/dev-loop` (`make run`, real data dir `~/Library/Application Support/Muster`);
confirm `~/Library/Application Support/Muster/hook-sessionstart.sh` and `status-line.sh`
exist; launch **one** session from the dashboard with model `claude-haiku-4-5-20251001`
into a scratch repo; send "say hi"; inspect the generated `.claude/settings.local.json`
in that repo (both `command` fields single-quoted); observe; then **kill the session**.

| Surface | Expected | Observed | When |
|---|---|---|---|
| `settings.local.json` `statusLine.command` | `'/Users/damian/Library/Application Support/Muster/status-line.sh'` | `'/Users/damian/Library/Application Support/Muster/status-line.sh'` (SessionStart likewise quoted) | 2026-08-25 21:37 |
| `sqlite3 muster.db "select count(*) from event where type='status_line' and session_id is not null"` | ≥ 1 | 3 (all bound to session 3; 1 bound `SessionStart` command-hook event too) | 2026-08-25 21:39 |
| `sqlite3 muster.db "select count(*) from usage_sample"` | ≥ 1 | 1 — `claude-haiku-4-5-20251001` / `Haiku 4.5`, 5h 18% resets 2026-08-25T21:00Z, 7d 4% resets 2026-09-01T14:00Z | 2026-08-25 21:37 |
| Masthead 5h bar | a % and reset time, not "unknown" | 18%, reset 21:00 (Damian, dashboard) | 2026-08-25 21:38 |
| Masthead 7d bar | a % and reset time, not "unknown" | 4%, reset 1 Sep 14:00 (Damian, dashboard) | 2026-08-25 21:38 |
| Masthead model readout | Haiku display name | Haiku 4.5 (Damian, dashboard; `usage_sample.model_display_name`) | 2026-08-25 21:38 |
| Session card context row | used % + tokens, not "unknown" | 20% / 40,529 of 200,000 tokens (`session.context_*` for id 3) | 2026-08-25 21:38 |
| Session title | status-line `session_name` | no name — all 3 status posts carried `session_name: null` for this haiku session; title fell back (not a routing failure) | 2026-08-25 21:39 |
| Session killed afterwards | yes | yes — `tmux -L muster kill-session -t muster-3` after the daemon was stopped; socket empty | 2026-08-25 21:45 |

## Implementation Notes

- **`shellQuote`**: `"'" + strings.ReplaceAll(s, "'", `'\''`) + "'"`. No other characters
  need handling inside single quotes. Keep it unexported in `internal/claudecode`; a
  second user elsewhere is a boundary smell (D7).
- **`isMusterEntry`** command branch becomes: for each of `cfg.SessionStartCommand`,
  `cfg.StatusLineCommand`: `e.Command == p || e.Command == shellQuote(p)`. Empty config
  paths must not match an empty foreign command — guard `p != ""` (the existing code has
  the same latent issue; fix in passing, and daemon-tests may add a case).
- **Shell round-trip test skeleton** (`internal/server`): `srv := newTestServer(…)`;
  `srv.Start()`; `seedLiveSession`; `hs := httptest.NewServer(srv.Handler())`; `dataDir :=
  filepath.Join(t.TempDir(), "muster data")`; `WriteWrapperScripts(dataDir, hs.URL,
  testIngestToken)`; `MergeSettings(nil, cfg)`; `json.Unmarshal` into a minimal local
  struct (`map[string]json.RawMessage` — do **not** import Claude-Code field names beyond
  `hooks`/`statusLine`/`command`, which are settings-file keys, not payload keys); run
  `sh -c`; poll with `require.Eventually` on the DB as `ingest_routing_test.go` does. For
  the status-line stdin body use the **raw** payload — `claudecodetest` currently exposes
  only enveloped status bodies (`EnvelopedStatusLineFull`), so daemon-tests may add a
  `RawStatusLineFull` sibling in `claudecodetest` (test-helper package; daemon-tests owns
  it) rather than string-stripping the envelope.
- **Why the E2E flip is cheap and sufficient**: the harness's fake `claude` never reads
  `settings.local.json`, so the flip proves only that the *daemon* tolerates a
  space-bearing data dir end-to-end (tmux socket, DB, scripts written, launch). The
  settings→shell→script→POST chain is proven by D6, not by E2. Both are needed; neither
  substitutes for the other.
- **Canary body** (D9): mirror `TestHookTransport`'s style — a table of
  `{pathHasSpace, form, wantSessionStart, wantStatusPost}` with the six probe rows, `_ =
  table`, skipped with `needsHarness`. The comment must cite the 2026-08-25 addendum and
  say this assertion is what the M4 harness will make binding.
- **Pin drift**: the probe ran on 2.1.245; the pin is 2.1.233. The quoting behaviour is
  POSIX-shell semantics, not a Claude Code version quirk — no pin action in this plan.
