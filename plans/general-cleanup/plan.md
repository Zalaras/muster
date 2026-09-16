# Plan: General Cleanup

**Created**: 2026-09-16
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: general-cleanup.spec.ts daemon (every test kills or restarts its daemon, or asserts theme, which is daemon-global); plain-shell.spec.ts unchanged fixture (one existing test edited in place)
**Features**: ingest, lifecycle, surfaces, actions, connection, theme, reader, triage, launch
**Description**: One plan closing every open non-feature backlog item before v1 — flaky tests, untested paths, dashboard focus/connection/theme polish, daemon error-body and shutdown hardening, and envelope corroboration — with nothing left over for a follow-up list.

## Overview

`TODO.md`'s Pre-v1 Cleanup and Reported-issues sections carry thirteen non-feature items
(Damian, 2026-09-16 triage). None has acceptance criteria that justify its own pipeline
run, and together they are exactly the kind of accumulated debt a v1 should not ship with.
This plan bundles them into one run, grouped by what they touch: tooling (the triage
version regex), flaky tests (three), missing coverage (two), dashboard polish (focus
restore, pop-out connection input, pop-out theme), and daemon hardening (error bodies, a
context-deadline guard in the tmux layer, envelope corroboration, shells at kill shutdown).

Two of the items carry decisions. Shells at `-on-exit=kill` was ruled by Damian on
2026-09-16 (kill them too, count them in the prompt, `leave` leaves them) and lands as a
`proposed` ADR superseding `kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile`.
Envelope corroboration was settled by `/decide` the same day — strict, by consensus:
`kb:adr/ingest-envelope-pane-must-corroborate`, `decisions/envelope-pane-corroboration/`.

**Nothing left over.** Damian's instruction for this plan is that the run ends with no new
backlog. Anything the pipeline discovers — a review finding, a flake an unrelated spec
exposes under the full-suite sweep, a coverage gap — is a fix wave in this run, not a
`proposed-backlog.md` entry. Only a discovery that needs a product decision comes back to
him, through the orchestrator's existing decision route. See Implementation Notes → Run
policy.

## Requirements

### Must Have

**Group A — tooling**

- [ ] **REQ-1**: `internal/triage/checks.go`'s `CheckVersion` accepts every string
      `git describe --tags --always --dirty` can produce for `musterd.version`: an optional
      leading `v`, dotted numerics, an optional `-<pre>` group, an optional `-<N>-g<hex>`
      commit-count/hash group, and an optional `-dirty` — e.g. `v0.12.6-9-gc6056aa`,
      `v0.12.6-9-gc6056aa-dirty`, `0.2.1`, `v0.13.0-rc.1`. A bare hash (`--always` on an
      untagged clone, e.g. `c6056aa` or `c6056aa-dirty`) also passes. Anything else (spaces,
      a second word, >32 chars) still fails. A self-filed issue from a dev build no longer
      drops the field and no longer routes to the facts-only path on that account alone.

**Group B — flaky tests (test-only edits)**

- [ ] **REQ-2**: `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`
      (`internal/claudecode/version_test.go`) drops its wall-clock `assert.Less(elapsed, 15s)`.
      Its oracle is `require.ErrorIs(err, exec.ErrWaitDelay)` — which can only hold if
      `WaitDelay` fired — plus a `select` bound comfortably under the stub's 60 s sleep (45 s)
      whose only job is to fail with a diagnostic instead of hanging the package if `WaitDelay`
      is ever removed. Proven with 20 consecutive `go test -run` passes under `-count=20` while
      `make e2e` runs alongside.
- [ ] **REQ-3**: `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan`
      (`internal/server/reader_test.go`) waits on a signal, not a 2 s timer. **daemon-impl**
      adds `func (q *ingestQueue) Drain(ctx context.Context) error` — returns once every
      event enqueued before the call has been fully processed (through `Observe`, the reader
      write record), or `ctx.Err()`. **daemon-tests** replaces every `require.Eventually(…,
      2*time.Second, …)` in that test with `Drain` under the test's own context
      (`t.Context()`-style deadline, `testing` default), then asserts directly. Proven with
      `go test -race -run TestIngestRouting_Straggler -count=10 ./internal/server` green.
- [ ] **REQ-4**: `plain-shell.spec.ts`'s E14 ("a file dropped on a shell surface pastes its
      escaped path") waits for the shell pane to be attached — the sizenote
      `/one live client/i` visible, the same oracle E16 in that file already uses — before
      calling `dropFiles`. No timeout changes. Proven with `make e2e-soak
      SPEC=plain-shell.spec.ts N=10` green (retries 0).

**Group C — missing coverage (test-only edits)**

- [ ] **REQ-5**: `session-lifecycle` REQ-12's paths gain failing-first unit tests in
      `internal/server`: (a) two `Ensure` calls for *different* ids proceed concurrently — a
      fake `paneSpawner` whose `NewNamedSession` for id 1 blocks until released must not delay
      id 2's `Ensure`; (b) `Ensure` on `ErrSessionExists` re-checks and returns
      `created:false` with no error when the re-check finds the pane; (c) `Ensure` returns an
      error within `shellTmuxTimeout` plus slack when the fake tmux never returns (bounded
      context); (d) `tmux.Client.KillSession` returns the original error when the post-kill
      `PaneExists` reports still-there, and when the check itself errors — driven through the
      client's injectable run func (docs/conventions.md § Testing), no real tmux; (e) two
      concurrent `Launch` calls for the same directory produce two distinct rows and two
      spawns (Launch takes the per-id lock only after allocating an id, so this pins that
      different ids never serialise), and a `Launch` racing an `End` on the id it just
      allocated cannot interleave — the fake spawner records call order.
- [ ] **REQ-6**: `markdown-render-fixes` edge case 5 is pinned. **web-impl** extracts the
      reader's `docChanged` dispatch into an exported pure function
      `classifyDocChanged(openPath: string | null, changedPath: string): "refetch" | "dots"`
      in `web/src/reader/` (the `handleDocChanged` method calls it); **web-tests** covers
      `openPath` moved to B while a `docChanged` for A arrives → `"dots"`, same path →
      `"refetch"`, `openPath === null` → `"dots"`.

**Group D — dashboard polish**

- [ ] **REQ-7**: Focus survives a daemon drop. When the socket leaves `connected` while an
      action control inside `#app` holds keyboard focus (any `button`/`select` that a render
      then disables), the dashboard remembers that element; on the render where the socket
      returns to `connected`, if `document.activeElement` is `body` and the remembered element
      is still in the document and no longer disabled, focus moves back to it. Once. By element
      identity — a control the render replaced is not chased. Covers every site that sets
      `disabled = !connected`: mainhead (Rename/End/Resume/Remove), dead-surface Resume, tile
      actions (End/Resume/Remove), the `claude | shell | docs` segment, the Issue button, and
      the sessions-rail card actions. Implemented once, in the connection feature, not per site.
- [ ] **REQ-8**: The pop-out (`/doc.html`) never shows "musterd unreachable — showing last
      render" before its first `hello`. `RenderFrame` gains `connection: ConnectionStatus`
      alongside the existing boolean; the reader's notice derivation takes the status: while
      `"connecting"` (never connected) the status line reads `connecting…` (the masthead's
      exact word), while `"reconnecting"` it reads the unreachable text as today, and while
      `"connected"` the existing loading/outcome rules apply. `deriveNotice` is exported from
      `web/src/reader/` as a pure function.
- [ ] **REQ-9**: An open pop-out follows a live theme change. `doc.ts` wires the socket's
      `onPrefs` and `onClaudeTheme` to `app.emit("prefs" | "claudeTheme")` and calls
      `initTheme(app, { surfaces: { applyTheme() {} } })` — the pop-out has no terminal
      surfaces to re-theme. Both windows write the same first-paint hint; no new storage.

**Group E — daemon hardening**

- [ ] **REQ-10**: No HTTP error body carries a raw Go/tmux error string. Every 5xx `message`
      in `internal/server` is a fixed phrase from the table in Implementation Notes → Error
      vocabulary, and the raw error goes only to the daemon log (the `log.Error().Err(…)`
      line already beside each site). Sites: `sessions.go` `end_failed` (End and Remove),
      `launch_failed` (all six constructions, including the `fmt.Sprintf("…: %v", err)`
      ones), `internal_error` (SetTitle); `shells.go` `shell_spawn_failed` and
      `internal_error`. Codes and statuses are unchanged; only `message` text changes.
- [ ] **REQ-11**: A context deadline is never mistaken for "not there". In
      `internal/tmux`, when `run` fails and `ctx.Err() != nil`, the returned error wraps
      `ctx.Err()` (so `errors.Is(err, context.DeadlineExceeded)` holds) instead of the bare
      `*exec.ExitError("signal: killed")`. Consequently `PaneExists` on an expired context
      returns `(false, err)`, never `(false, nil)`, and `KillSession`'s post-kill verify
      cannot report a deadline-killed check as "gone". Unit-tested through the injectable run
      func with an already-cancelled context.
- [ ] **REQ-12**: Envelope corroboration, strict (`kb:adr/ingest-envelope-pane-must-corroborate`).
      `resolveSessionID`: an envelope with `musterSession` routes iff the session exists
      **and** (its stored `TmuxPane` is empty — the spawn-to-record window, "cannot
      corroborate" — **or** the envelope's `tmuxPane` is present and equals it). An absent
      `tmuxPane` against a stored pane, or a mismatch, is persisted unrouted (NULL
      `event.session_id`) and logged at Info with kind, muster session and both panes
      (never the payload). Raw posts are unchanged. Fixtures state the pane at every site:
      **daemon-impl** removes `claudecodetest`'s `%12` default (an empty `TmuxPane` opt omits
      the field — the headless shape — rather than filling it); **daemon-tests** updates the 26
      Go call sites to pass the seeded pane (`%1`) where routing is expected; **e2e-specs** adds
      `daemon.tmuxPaneId(tmuxTarget)` (`tmux -S <sock> list-panes -t <target> -F '#{pane_id}'`,
      memoised per target for the daemon's life) to `web/e2e/helpers/daemon.ts`, removes
      `payloads.ts`'s `tmuxPane` default, and updates the 123 enveloped spec call sites to pass
      `tmuxPane: await daemon.tmuxPaneId(session.tmuxTarget)` (a helper that takes the
      `SessionObject` and returns the envelope opts is fine).
- [ ] **REQ-13**: `-on-exit=kill` kills every shell too, and the prompt counts them (Damian,
      2026-09-16). `Manager.KillAllShells(ctx) (int, error)` lists the socket and kills every
      `IsShellSessionName` match (reconcile's loop, reused); `Manager.ShellCount(ctx) (int,
      error)` counts them. `cmd/musterd`: the on-exit path runs when `live > 0 || shells > 0`;
      `kill` ends sessions then kills shells and logs `ended live sessions on shutdown` (message
      unchanged) with `count` and a new `shells` field; `leave` logs `leaving live sessions
      running` with the same two fields; the `ask` prompt reads
      `%d live sessions and %d shells on tmux socket %s — kill them? [y/N] ` (shell count may be
      0). A `ShellCount` error is logged and treated as 0 shells — never blocks shutdown. The
      shell-lifetime ADR is superseded by a `proposed` one adding "daemon shutdown with kill".

### Should Have

- [ ] **REQ-14**: `internal/server`'s `Drain` (REQ-3) is used by any other test in the
      package that currently waits on a fixed-duration `Eventually` for ingest processing
      (`grep -n 'time.Second' internal/server/*_test.go` shows one today), so the class is
      closed, not the instance.

### Nice to Have

- None. Everything here blocks v1 by Damian's 2026-09-12 ruling.

## Protocol Contract

**No wire-shape changes.** Two prose deltas against `docs/protocol.md`, merged on approval:

1. `kb:anchor/ingest.envelope`, Binding rule paragraph (~line 716-718). The sentence
   "(a stale/unknown value is never trusted — persisted unrouted)" becomes:
   "(a stale/unknown value is never trusted — persisted unrouted; and the envelope's
   `tmuxPane` must equal the session's recorded pane — an absent or different pane is
   persisted unrouted too, except while the session's pane is not yet recorded, the
   spawn-to-record window, when `musterSession` alone routes)". The envelope example's
   comment `// from $TMUX_PANE; absent outside tmux (headless probes)` gains
   `— absent never routes to a managed session`.
2. `kb:anchor/transport` error line (~line 57): `{"error": {"code": "<machine_token>",
   "message": "<human>"}}` gains one sentence: "`message` is display text for the user —
   never a wrapped tool or OS error string; those go to the daemon log."

Error `code` values, statuses and every JSON shape are unchanged. `message` values for the
5xx codes change to the fixed phrases below; no client switches on `message`.

## Schema Changes

No schema changes required.

## Diagrams

None. No state machine, sequence, schema or component boundary changes. The ingest sequence
in `docs/features/ingest/spec.md` (inline, "One post, end to end") already shows the route/
unrouted fork at the queue; the corroboration is a new predicate on that fork, not a new
step — doc-reconcile edits the fork's label if it names the predicate.

## UI Specifications

### Views

- **Dashboard (`/`)** — REQ-7 only: no new elements. Behaviour change on the
  disconnect→reconnect pair of renders.
- **Pop-out (`/doc.html`)** — REQ-8: the reader status line (`.reader-notice[role=status]`)
  shows `connecting…` until the first `hello`; REQ-9: `<html data-theme>` and
  `data-claude-family` follow prefs/claudeTheme broadcasts exactly as the dashboard's do.

### User Flows

1. **Focus restore.** User Tabs to the mainhead End button. Daemon dies. Button disables,
   focus falls to `body`. Daemon returns, `hello` arrives, render re-enables the button, focus
   moves back to End. User presses Enter → the End dialog opens, as it would have.
2. **Pop-out first paint.** User opens a pop-out while the daemon is down. Body shows its
   placeholder, status line reads `connecting…`. Daemon comes up → status line clears (or
   shows the load outcome). Never `musterd unreachable` on the way.
3. **Pop-out theme.** Dashboard and pop-out open side by side. User picks Dark in Settings.
   Both windows switch without a reload.

### States

- **No data yet**: pop-out status line `connecting…` (REQ-8) — the word the masthead already
  uses; the reader body keeps its existing `loading…`/placeholder behaviour.
- **Data**: unchanged.
- **Daemon down (after a first hello)**: unchanged — `musterd unreachable — showing last render`
  in the pop-out, banner in the dashboard, buttons disabled. Focus is remembered (REQ-7),
  nothing visible changes.

### Design system

`docs/design/design-system.md` §6 (honesty: unknown is a word, never an empty gauge — REQ-8's
`connecting…` follows the masthead's own readout) and §6.7 (daemon-down wins the status
line). No new tokens, no new elements. `kb:adr/connection-banner-only-after-first-hello` is
the rule REQ-8 extends to the pop-out.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Mainhead End button | `button` | `End` | existing (`web/index.html:73`); REQ-7's focus target in E1 |
| Pop-out reader status line | `status` | `connecting…` while never-connected; `/musterd unreachable/i` after a lost connection | existing element `.reader-notice[role=status]` in `web/doc.html:37`; `readerStatusLine()` helper exists |
| Settings theme radio | `radio` | `Dark` | existing; `themeRadio(dialog, "Dark")` helper in theme.spec.ts |
| Root theme attribute | — | `html[data-theme="dark"]` | attribute, not a locator — `htmlTheme(page)` helper pattern |

### Invariants

- **INV-FOCUS**: after any `connected` → not-connected → `connected` round trip, if a
  control inside `#app` held focus at the drop and still exists enabled at the return, it holds
  focus again; otherwise focus is wherever the browser left it (never forced elsewhere).
  Source states to assert from: Focus view (mainhead button), Tiles view (tile action button),
  the segment control (`claude | shell | docs`), and the Issue button. → E1 (mainhead), E2
  (tiles), W2 (the pure decision table for all four).
- **INV-POPOUT-CONNECTING**: a pop-out that has never received `hello` never renders the
  unreachable text, from any starting state (daemon up before load, daemon down before load,
  daemon killed mid-load). → E3 (down before load), W3 (the derivation table: every
  `ConnectionStatus` × `loadingPath` × `bodyRendered` cell).
- **INV-CORROBORATE**: an enveloped event whose `tmuxPane` differs from the session's recorded
  non-empty pane never changes that session's state, binding, transcript, plan or title, from
  any session state (started, idle, working, needs_input, ended) and any binding state
  (unbound, bound, rebound after clear). → D9 (table), E4 (one e2e path).
- **INV-EMPTY-PANE-ROUTES**: an enveloped `SessionStart` arriving while the session's pane is
  still empty routes and binds. → D10.
- **INV-5XX-NO-RAW**: no 5xx body in `internal/server` contains a `%w`/`%v`-formatted or
  `.Error()` error. → D6 (grep), D7 (behavioural: a failing fake tmux yields the fixed phrase).
- **INV-SHELLS-AT-KILL**: after `-on-exit=kill` exits, no `muster-<n>-shell` session remains
  on the socket, whether zero or many Claude sessions were alive; after `-on-exit=leave`, every
  shell that was there still is. → D13, D14, D15.

### Carried-over measurements

- `kb:fact/command-hooks-inherit-pane-env` (interactive SessionStart carries `tmuxPane`) —
  re-checked against REQ-12: still valid; the fact is about the production wrapper inside a
  tmux pane, which REQ-12 does not change. Its `guard` is the canary, which posts to its own
  capture server and never reaches `resolveSessionID` (`test/canary/harness_test.go:254`), so
  REQ-12 cannot make the canary red.
- Advocate-b's `list-panes` cost (1.014 s / 100 calls, ~10 ms each, scratch socket,
  2026-09-16) — applies as measured: same socket kind, same command, memoised per target so
  at most one per launched session.

## Affected Files

### Daemon (daemon-impl)

- `internal/triage/checks.go` — REQ-1: `reVersion` widened (`^v?[0-9]+(\.[0-9]+)*(-[A-Za-z0-9.]+)?(-[0-9]+-g[0-9a-f]+)?(-dirty)?$` or an equivalent that also admits a bare `[0-9a-f]{7,40}(-dirty)?`); doc comment names the `git describe` shapes.
- `internal/server/ingest.go` — REQ-3: `ingestQueue.Drain(ctx)`; REQ-12: `resolveSessionID` corroboration predicate and the unrouted log line.
- `internal/claudecode/claudecodetest/claudecodetest.go` — REQ-12: no `%12` default; empty `TmuxPane` omits the field; `EnvelopedHookBody`'s positional `tmuxPane` likewise omits when `""`.
- `internal/server/sessions.go`, `internal/server/shells.go` — REQ-10: fixed 5xx messages; raw error stays on the adjacent log line.
- `internal/tmux/tmux.go` — REQ-11: `run` wraps `ctx.Err()` on failure after expiry; `PaneExists`/`KillSession`/`ListSessions` doc comments updated.
- `internal/session/manager.go` — REQ-13: `KillAllShells`, `ShellCount` (reusing `classifyTmuxNames`).
- `internal/server/server.go` — REQ-13: `KillAllShells`/`ShellCount` pass-throughs (one line each — composition-root registration only).
- `cmd/musterd/main.go` — REQ-13: guard, prompt text, kill/leave log fields.

### Daemon tests (daemon-tests)

- `internal/triage/checks_test.go` (new or existing) — REQ-1 table.
- `internal/claudecode/version_test.go` — REQ-2.
- `internal/server/reader_test.go` — REQ-3 (`Drain`), REQ-14 sweep; REQ-12: `%1` at the enveloped sites.
- `internal/server/ingest_routing_test.go`, `ingest_test.go`, `gauges_test.go` — REQ-12 pane at enveloped sites; new corroboration table (D9, D10).
- `internal/server/shells_test.go` — REQ-5 (a)(b)(c); REQ-10 behavioural (D7).
- `internal/server/sessions_test.go` (or the launch test file) — REQ-5 (e); REQ-10 (D7).
- `internal/tmux/tmux_test.go` — REQ-5 (d); REQ-11.
- `internal/session/manager_test.go` — REQ-13 `KillAllShells`/`ShellCount` with the fake killer.
- `cmd/musterd/onexit_test.go` — REQ-13: kill with a shell present (D13), leave with a shell (D14), shells-only kill (D15), prompt text (D16).

### Web (web-impl)

- `web/src/app.ts` — REQ-8: `RenderFrame.connection: ConnectionStatus` (keep `connected`).
- `web/src/features/connection.ts` — REQ-7: remember-on-drop / restore-on-return around the two `app.render()` calls, via the pure decision in `web/src/render/focusrestore.ts` (new).
- `web/src/render/focusrestore.ts` (new) — REQ-7: `shouldRestoreFocus({ activeIsBody, stillInDocument, disabled }): boolean` and `isRestorableControl(el)`.
- `web/src/features/reader.ts` — REQ-6/REQ-8: call the extracted pure functions; pass `frame.connection`.
- `web/src/reader/notice.ts` (new) — REQ-8: exported `deriveNotice(status, loadingPath, bodyRendered, noticeText)`; REQ-6: exported `classifyDocChanged`.
- `web/src/doc.ts` — REQ-9: `onPrefs`, `onClaudeTheme`, `initTheme` with a no-op surfaces dep.

### Web tests (web-tests)

- `web/src/render/focusrestore.test.ts` (new) — W2.
- `web/src/reader/notice.test.ts` (new) — W3, W4.
- `web/src/app.test.ts` — W1: the frame carries both `connection` and the derived `connected`.

### E2E (e2e-specs)

- `web/e2e/general-cleanup.spec.ts` (new, `daemon` fixture) — E1–E5.
- `web/e2e/plain-shell.spec.ts` — REQ-4: E14 waits for the sizenote.
- `web/e2e/helpers/daemon.ts` — REQ-12: `tmuxPaneId(tmuxTarget)` memoised.
- `web/e2e/helpers/payloads.ts` — REQ-12: no `tmuxPane` default; an `envelopeFor(session, daemon)`-style convenience is allowed.
- Every spec with an enveloped call site (19 files, 123 sites) — REQ-12: pass the real pane.

## Edge Cases

1. **Dev-build version with `-dirty` and a hash** (`v0.12.6-9-gc6056aa-dirty`) passes; the same string with a trailing space fails. → D1
2. **`WaitDelay` reverted** — REQ-2's test fails at its 45 s select with the diagnostic, never hangs the package for 60 s. → untested: reverting production code to prove a test's negative is not a repeatable check; the diagnostic message is reviewed (D2 prose).
3. **`Drain` called with nothing queued** returns immediately; called with the worker stopped returns `ctx.Err()` at the deadline rather than hanging. → D3
4. **Drop before attach on a shell** still shows "Pane isn't connected — nothing pasted" — behaviour unchanged; the test just stops racing it. → E7
5. **Two `Ensure` calls, different ids, one tmux blocked** — the unblocked id completes. → D4
6. **`ErrSessionExists` then re-check says gone** — `Ensure` returns the spawn error (not a false `created:false`). → D4 (shared with edge case 5)
7. **`docChanged` for A while B's open is in flight** — `"dots"`; B's load unaffected. → W4
8. **Focus on a control that the reconnect render replaced** (tile re-rendered) — not restored, no error. → W2 (the `stillInDocument:false` row)
9. **Focus on a control that stays disabled after reconnect** (Resume on a live session) — not restored. → W2 (`disabled:true` row; shared with edge case 8)
10. **Focus was in a terminal (xterm textarea), not a control** when the socket dropped — nothing remembered, nothing restored. → W2 (`isRestorableControl` false for non-button/select; shared with edge case 8)
11. **Two drops before one reconnect** — the second drop overwrites nothing (already remembered; `activeElement` is `body` by then). → W2 (shared with edge case 8)
12. **Pop-out loads with the daemon down, then daemon starts** — `connecting…` → cleared/outcome, never unreachable. → E3
13. **Pop-out connected, daemon dies, comes back** — unreachable text during, cleared after (unchanged). → untested: behaviour this plan does not change; markdown-viewing's existing reader.spec.ts test for a mid-session daemon stop stays green under E6
14. **Theme changed while the pop-out is mid-load** — the attribute flips; the load is unaffected. → E5
15. **Pop-out and dashboard write the hint concurrently** — same value, last write wins, harmless. → untested: identical writes have no observable order.
16. **Launch fails at `writeSettings`** — body reads the fixed phrase; the log line carries the path and error. → D7
17. **End fails because tmux is unreachable (EACCES socket)** — `500 end_failed` with the fixed phrase, row untouched (`kb:adr/actions-kill-is-idempotent` unchanged). → D7 (shared with edge case 16)
18. **`PaneExists` with an already-expired context** — `(false, err)` wrapping `context.DeadlineExceeded`; `KillSession`'s verify on that context returns the kill error, not success. → D8
19. **Enveloped SessionStart during the spawn-to-record window** (stored pane empty) — routes and binds. → D10
20. **Straggler from the pre-resume pane after Resume recorded the new pane** — mismatch, unrouted, session untouched. → D9, E4
21. **Envelope with `musterSession` but no `tmuxPane` against a recorded pane** (headless shape) — unrouted. → D9 (shared with edge case 20)
22. **Raw post (no envelope)** — routes by `session_id` exactly as before. → D9 (control row; shared with edge case 20)
23. **Reconcile repaired `tmux_pane` at start** (`manager.go:616`) — subsequent envelopes from the repaired pane match. → untested: reconcile's repair is covered by `kb:adr/lifecycle-reconcile-converges-with-the-socket`'s tests; the predicate reads the same field.
24. **Kill shutdown with zero Claude sessions and one shell** — prompt/kill path runs; shell dies. → D15
25. **`ShellCount` errors (socket unreachable)** — logged, treated as 0; shutdown proceeds. → D12
26. **`leave` with shells** — shells survive; log names both counts. → D14
27. **Kill with a shell whose tmux session is already gone** — counted as killed (idempotent kill), no error. → D11
28. **`ask` with stdin not a TTY** — resolves to leave without printing, shells included in the log. → D14 (subprocess path already non-TTY; shared with edge case 26)
29. **Flake exposed in an unrelated spec during the full sweep** — fixed in this run under the Run policy, proven with `e2e-soak`; not proposed. → untested: policy, verified by the review reading `proposed-backlog.md` is absent or empty (R2).

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e, `R*`
reviewer-only. One clause per criterion.

### Daemon
- **D1**: `CheckVersion` accepts `v0.12.6-9-gc6056aa`, `v0.12.6-9-gc6056aa-dirty`, `0.2.1`, `v0.13.0-rc.1`, `c6056aa`, `c6056aa-dirty` and rejects `0.2.1 `, `v0.2.1 foo`, a 33-char string (table test).
- **D2**: `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup` has no elapsed-time assertion and passes 20/20 with `-count=20` while `make e2e` runs.
- **D3**: `ingestQueue.Drain` returns after the last enqueued event has been observed by the reader, and returns `ctx.Err()` on a stopped queue.
- **D4**: REQ-5 (a)(b)(c)(e) tests exist and fail against a build with the lock/tolerance/bound removed (evidence: the reviewer reverts one and pastes the red).
- **D5**: `go test -race -run TestIngestRouting_Straggler -count=10 ./internal/server` passes.
- **D6**: no `internal/server` non-test file passes `.Error()` or a `%v`/`%w`-formatted error into `writeJSONError` or a `launchError` message.
- **D7**: with a fake tmux that fails End, Remove, shell spawn and launch-settings, each response body's `message` equals its fixed phrase and the log line carries the raw error.
- **D8**: `PaneExists` with a cancelled context returns an error satisfying `errors.Is(err, context.Canceled)`; `KillSession` on a cancelled context after an `ExitError` returns an error.
- **D9**: corroboration table — for each session state × binding state, an enveloped event with a mismatched pane, and one with no pane, leaves state/binding/transcript/plan/title unchanged and persists with NULL `session_id`; a matching pane routes; a raw post routes as before.
- **D10**: an enveloped `SessionStart` against a session whose stored pane is empty routes and binds.
- **D11**: `KillAllShells` kills every `muster-<n>-shell` on the socket and none of the `muster-<n>` sessions, and counts an already-gone shell as killed.
- **D12**: a `ShellCount` error is logged and shutdown proceeds with `shells=0`.
- **D13**: `-on-exit=kill` with one live session and one shell exits 0 with no tmux sessions left on the socket.
- **D14**: `-on-exit=leave` with one live session and one shell exits 0 with both still on the socket and the leave log line naming `shells=1`.
- **D15**: `-on-exit=kill` with zero live sessions and one shell exits 0 with the shell gone.
- **D16**: `askKillPrompt` writes `2 live sessions and 1 shells on tmux socket <sock> — kill them? [y/N] ` for (2, 1).

### Web
- **W1**: `createApp().render()` frames carry `connection` equal to `state.connection` and `connected === (connection === "connected")`.
- **W2**: `shouldRestoreFocus` returns true only for `{activeIsBody:true, stillInDocument:true, disabled:false}`; `isRestorableControl` is true for `button`/`select` inside `#app` and false for a textarea, an anchor, or `body`.
- **W3**: `deriveNotice` over every `ConnectionStatus` × `loadingPath` × `bodyRendered` cell returns `connecting…` for `"connecting"`, the unreachable text for `"reconnecting"`, and the existing loading/outcome rules for `"connected"`.
- **W4**: `classifyDocChanged` returns `"dots"` when `openPath` differs from or is null, `"refetch"` when equal.
- **W5**: `make web-build` passes.
- **W6**: `make web-test` passes.

### E2E
- **E1**: focus the mainhead End button, `daemon.kill()`, `daemon.restart()`; after the banner clears, `document.activeElement` is that End button.
- **E2**: in Tiles view, focus a tile's End button, kill and restart; focus returns to that button.
- **E3**: `daemon.kill()`, then `page.goto('/doc.html?session=<id>&path=<p>')` on a still-authed page; the reader status line reads `connecting…` and never `/unreachable/i` (a `settleFor` stays-unchanged check); `daemon.restart()` clears it.
  *Amended 2026-09-16 (e2e-specs authoring, measured):* the literal mechanism is impossible —
  a killed daemon has no listener, so `page.goto('/doc.html…')` rejects with
  `ERR_CONNECTION_REFUSED` and there is no response to read a status line from. The test
  withholds the pop-out's own WebSocket with `page.routeWebSocket("**/ws", …)` instead, the
  technique `actions.spec.ts`'s E14 already uses in this suite, which reproduces
  INV-POPOUT-CONNECTING's "no hello has ever arrived" state deterministically. The criterion's
  assertions are unchanged.
- **E4**: launch a session, read its real pane, post an enveloped `SessionStart` with pane `%999` → the session stays unbound (`claudeSessionId` null via `/api/state`); post the same with the real pane → bound.
- **E5**: with a pop-out open, choose Dark in the dashboard's Settings; the pop-out's `html[data-theme]` becomes `dark` without reload.
- **E6**: `make e2e` passes.
- **E7**: `make e2e-soak SPEC=plain-shell.spec.ts N=10` passes.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Test-file scope for the negative greps: `_test.go` files are **excluded**
(a test legitimately builds a body from `err.Error()` to assert on it); the rule is about what the
daemon sends.

```checks
D0 go build ./...
D1 go test ./internal/triage -run 'TestCheckVersion' -count=1
D2 go test ./internal/claudecode -run 'TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup' -count=20
D5 go test -race ./internal/server -run 'TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan' -count=10
D6 ! rg -n 'writeJSONError\([^\n]*\.Error\(\)\)|launchFailed\((fmt\.Sprintf|[A-Za-z]+\.Error\(\))|launchError\{[^\n]*\.Error\(\)' internal/server --glob '!*_test.go'
D17 make test
D18 make lint
W5 make web-build
W6 make web-test
E6 make e2e
E7 make e2e-soak SPEC=plain-shell.spec.ts N=10
```

### Reviewer-Verified

- **D2** (prose half): the 45 s select's failure message names the `WaitDelay` revert as the cause.
- **D3, D4, D7, D8, D9, D10, D11, D12**: the named tests exist, are failing-first where the criterion says so, and assert what the criterion states (run by `make test`; the reviewer reads them).
- **D13–D16**: subprocess tests in `cmd/musterd/onexit_test.go` exist and assert the socket contents and log/prompt text stated.
- **W1–W4**: the named Vitest files cover the stated tables (run by `make web-test`; the reviewer reads them).
- **E1–E5**: present in `general-cleanup.spec.ts` and green under `make e2e`.
- **R1**: no `disabled = !connected` site gained a per-site focus hack — REQ-7 lives in `connection.ts` + `focusrestore.ts` only.
- **R2**: `plans/general-cleanup/proposed-backlog.md` is absent, or contains only items tagged `needs-decision` that the orchestrator routed to the user (Run policy).
- **R3**: the 13 `TODO.md` entries listed under Implementation Notes → Doc upkeep are ticked and moved to `docs/history/todo-done.md` with their `issues/N` links intact (none of these carry one; the check is that no other entry moved).
- **R4**: the `lifecycle` feature spec's body stays under its 800-word cap after reconcile.
  *Amended 2026-09-16 (review cycle 1, Major 2, measured):* the original criterion demanded net
  ≤ 0 words on the premise that the body was "at the 800-word cap". It is not — the body measures
  647 words excluding the mermaid fence (confirmed twice, by the reviewer and by the orchestrator),
  leaving 153 words of headroom. The Doc Delta as written is net +12 there, which the false premise
  would have failed for no reason. The cap, which `make check-kb` enforces, is the real constraint.

## Doc Delta

**ingest** — becomes true:
- `docs/features/ingest/spec.md` § The envelope says the envelope routes only when its `tmuxPane` equals the session's recorded pane, that an absent or different pane is persisted unrouted, and that a session whose pane is not yet recorded routes on `musterSession` alone (`kb:adr/ingest-envelope-pane-must-corroborate`).
- `docs/protocol.md` `kb:anchor/ingest.envelope` carries the Protocol Contract sentence above.

**ingest** — stops being true:
- The unqualified "a stale or unknown value is persisted unrouted, never guessed from `cwd`" (spec ~line 102) — replaced by the qualified sentence, not appended to.

**lifecycle** — becomes true:
- § Liveness, reconcile, shutdown: "`kill` also kills every shell and the prompt counts them; `leave` leaves shells as it leaves sessions" (cites the new ADR).

**lifecycle** — stops being true:
- The clause "unknown Muster-shaped tmux sessions are logged and never adopted, and every shell tmux session is killed" is compressed to "unknown `muster-` names are logged, never adopted; shells are killed" (the ADR citations carry the detail). *Amended 2026-09-16:* the body is 647 words, not at the 800-word cap, so this compression is a readability choice, not a budget necessity — see R4.

**surfaces** — becomes true:
- "dies on exit, Remove, reconcile or a kill shutdown" (spec line 58), citing the superseding ADR.

**surfaces** — stops being true:
- "dies on exit, Remove or reconcile" and its citation of `kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile` (now superseded).

**actions**, **launch**, **surfaces** (shell spawn) — becomes true:
- One sentence each: a 5xx `message` is a fixed phrase; the raw tmux/OS error is in the daemon log only.

**actions**, **launch**, **surfaces** — stops being true:
- Nothing (no spec sentence claims raw errors today).

**connection** — becomes true:
- The pop-out reads `connecting…` until its first `hello` and follows theme broadcasts, sharing `kb:adr/connection-banner-only-after-first-hello`'s rule.

**reader** — becomes true:
- § The reader: "the pop-out's status line shows `connecting…` until its first `hello`, the unreachable text after a lost connection, and its theme follows the dashboard's live" (replaces the existing "shows daemon-down in the reader's own status line" phrasing if present — one sentence, not two).

**theme** — becomes true:
- The pop-out applies `prefs` and `claudeTheme` broadcasts like the dashboard.

**triage** — becomes true:
- The version check accepts `git describe` dev-build strings (`v`, `-N-gHASH`, `-dirty`).

**triage**, **connection**, **theme**, **reader** — stops being true:
- Nothing.

**protocol.md** — see Protocol Contract (two prose sentences).

## Out of scope

Nothing. This plan's instruction is that the run leaves no open backlog item behind; a
discovery is fixed in-run or, if it needs a product decision, brought to Damian through the
orchestrator's decision route — never filed.

## Implementation Notes

### Run policy — nothing left over (Damian, 2026-09-16)

- A review finding, a flake exposed by the full-suite sweep, a coverage gap, or any other
  code/test defect discovered during this run is a **fix wave in this run**. It is not written
  to `proposed-backlog.md`.
- Only a discovery that needs a *product* decision (two defensible behaviours, no ADR settles
  it) is written to `proposed-backlog.md` tagged `needs-decision`, and the orchestrator brings
  it to Damian via `[orchestrator:decision]` / `/decide` before the next fix wave. The 2-debates
  cap stands; a third stops the run and asks.
- A pre-existing flake in an unrelated spec is in scope: fix, prove with
  `make e2e-soak SPEC=<file> N=10`, move on.
- The reviewer's approval requires R2.

### Error vocabulary (REQ-10)

| code | status | fixed `message` |
|------|--------|-----------------|
| `end_failed` (End) | 500 | `couldn't end the session — tmux reported an error; see the daemon log` |
| `end_failed` (Remove) | 500 | `couldn't remove the session — tmux reported an error; see the daemon log` |
| `launch_failed` | 500 | `couldn't launch — see the daemon log` |
| `shell_spawn_failed` | 500 | `couldn't open a shell — tmux reported an error; see the daemon log` |
| `internal_error` | 500 | `something went wrong on the daemon — see the daemon log` |

Em dash (U+2014) with spaces, matching the dashboard's other notice texts. 4xx messages are
unchanged (they are already fixed phrases). The adjacent `log.Error().Err(err)` line is the
raw error's only home; where a site has none (`launchFailed` constructions), add one at the
handler that writes the response.

### Corroboration predicate (REQ-12)

```go
// route iff: exists && (stored == "" || (ev.TmuxPane != nil && *ev.TmuxPane == stored))
```

`Manager` needs a `PaneOf(id) (pane string, ok bool)` read (or `Get`) under its lock; the
predicate lives in `resolveSessionID`, the only routing site. The Info log on rejection
carries `kind`, `muster_session`, `stored_pane`, `envelope_pane` (`""` when absent) — never
the payload (CLAUDE.md hard rule). `kb:adr/ingest-envelope-authoritative-binding`,
`kb:adr/ingest-monotonic-rebind` and `kb:adr/ingest-envelope-binds-never-cwd` are unchanged:
corroboration runs *before* binding; a corroborated envelope binds exactly as today.

Fixture discipline (from the debate): the field must be **stated** at every enveloped site.
No helper reintroduces a default pane. `claudecodetest`'s `SessionStartOpts.TmuxPane == ""`
means *omit the field*; `EnvelopedHookBody`'s `tmuxPane == ""` likewise. The e2e helper
`daemon.tmuxPaneId(target)` memoises per target for the daemon's life — a `restart()` clears
the memo (panes are re-created).

### Shells at shutdown (REQ-13)

Order under `kill`: `EndAllSessions` first (sessions may hold the socket busy), then
`KillAllShells`, each under its own `shutdownTimeout` context. `ShellCount` runs before
`resolveOnExit` so the prompt can name it; its error path logs at Warn and uses 0. The
`ask` prompt's grammar is deliberately plural-fixed (`1 shells`) to keep D16 a string
equality — Damian accepted "N live sessions and M shells". Existing assertions on
`ended live sessions on shutdown` / `leaving live sessions running` keep passing: the message
text is unchanged, only fields are added.

Decision record: `docs/adr/surfaces-shell-dies-at-kill-shutdown-too.md`,
`status: proposed`, `supersedes: [surfaces-shell-lifetime-until-exit-remove-or-reconcile]`,
`tags: [user-decision]`, `refs: [plan:general-cleanup]`. Written at approval; the orchestrator
flips it to `accepted` at Completion and marks the old one `superseded`.
`kb:adr/lifecycle-shutdown-leaves-sessions-running` stays accepted and true: `leave` is still
the default and still leaves everything.

### Focus restore (REQ-7)

In `initConnection`'s `onChange`: before the `app.render()` for a non-connected status,
`remembered = isRestorableControl(document.activeElement) ? activeElement : remembered`;
after the `app.render()` for `connected`, `if (shouldRestoreFocus({activeIsBody:
document.activeElement === document.body, stillInDocument: remembered?.isConnected ?? false,
disabled: remembered?.disabled ?? true})) remembered.focus(); remembered = null`. The two
pure functions are the unit surface (no jsdom in Vitest — docs/conventions.md); the DOM
effect is E1/E2. `kb:adr/focus-rail-click-focuses-terminal` is untouched: this never moves
focus into a terminal.

### Context deadline (REQ-11)

`run`'s failure path: `if ctx.Err() != nil { return out, fmt.Errorf("tmux %s: %w (%v)", args[0],
ctx.Err(), err) }` before the `ExitError` return. Every caller that does `errors.As(err,
&exitErr)` then sees a non-`ExitError` and takes its "genuine failure" branch — which is the
honest reading `kb:adr/actions-kill-is-idempotent` wants. Reviewer traces `KillSession`'s
verify, `endLocked`'s post-kill check and the liveness poll once more after the change (the
TODO entry's two incidental safeties become structural).

### Doc upkeep — addressed to the orchestrator (Completion)

- Tick and move to `docs/history/todo-done.md` (same headings) these `TODO.md` entries:
  Pre-v1 Cleanup → "Flaky: drop-paste E14", "Flaky: `TestInstalledVersion_…`", "`triage`'s
  `CheckVersion` regex", "Restore focus when an action button goes `disabled`", "Pop-out paints
  'musterd unreachable'", "An open pop-out doesn't follow a live theme change"; Reported issues →
  "Ingest: corroborate an envelope", "`-on-exit=kill` does not kill shells", "Raw tmux stderr",
  "`TestIngestRouting_Straggler…`", "REQ-12 of `session-lifecycle` shipped on inspection",
  "A context timeout reaches Go as an `ExitError`", "Edge case 5 of `markdown-render-fixes`".
  None carries an `issues/N` link.
- Flip `kb:adr/ingest-envelope-pane-must-corroborate` and the shell-lifetime ADR to
  `accepted`; set the old shell-lifetime ADR `superseded`; fill their `tests:` from the landed
  test names.
- `docs/features/*/spec.md` and `docs/protocol.md` per Doc Delta, via `/doc-reconcile`;
  `make gen-kb && make check-kb`.
- `/retro general-cleanup` on this branch before `/land`.
