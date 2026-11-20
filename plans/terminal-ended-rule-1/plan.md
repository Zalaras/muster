# Plan: terminal-ended-rule-1

**Status**: completed
**Shape**: fix
**Work Type**: full-stack
**E2E Scope**: none
**Fixture plan**: none
**Render fixtures**: none
**Features**: surfaces
**Touches**: connection
**Description**: A terminal the daemon reports as made is shown while it runs: the window reads a spawn as ended only from the last list applied, and a failed follow-up listing answers a fresh rev and forces the next broadcast.

## Symptom
### e1 — A new terminal can be treated as already ended while it runs
- [ ] **A new terminal can be treated as already ended while it runs** — filed by the developer
  2026-11-20 from `plans/stale-terminals-list-1/proposed-backlog.md`. A terminal just made is not
  switched to when a rename or close reply for the same session arrives before the list that
  includes it, or when the daemon's listing right after the spawn fails. Expected: a terminal the
  daemon reports as made is shown while it runs (`kb:adr/surfaces-terminal-ended-read-from-lists`).

## Findings
Reviewer note: the wire semantics changed here are the developer's committed contract
(`3e3713ad docs(protocol)`, `kb:adr/surfaces-terminal-ended-read-from-lists`), decided before the
batch, so this is not a protocol change on the small track. Review against `docs/protocol.md` as
it stands; raise only a mismatch with it — not "protocol change on the small track", "no Protocol
Contract section" or "`protocolVersion` not bumped" (no wire shape changes). The batch does not
edit `docs/protocol.md` or the ADRs.

Research: `plans/terminal-ended-rule/research/e1.md` (both cases reproduced red).
- Web: `observeSpawnReply` (`web/src/features/surfaces.ts`) tests `rev <= seenRev(revState, id)`;
  `seenRev` is one number per session raised by lists **and** every reply, so a rename/close reply
  lifts the threshold above the spawn reply's rev before the list carrying the new terminal is
  applied → ended. Repro: snapshot rev 5 `{1:[t1]}`; newTerminal + rename pending; rename reply
  `{rev:7}` first, then spawn `{n:2, rev:6}` → `{selected:'claude', shell:1}` instead of
  `{selected:'shell', shell:2}`.
- Daemon: `shellActivityPoller.tick` (`internal/server/shellactivity.go`) returns silently when the
  lister fails; `revs[id]` is unchanged, so routes answer the session's old rev and nothing forces
  a re-broadcast (`reconcile` only broadcasts differing lists). Repro: `"1" is not greater than "1"`
  and `expected: 2 actual: 1` broadcasts.
- Developer's answers: Q1 accept as written — `snapshot.terminalsRev` stays the daemon-wide
  counter; the reconnect-during-a-failed-listing case is not handled. Q2 seam shape is the
  implementation's choice.

## Requirements
### Must Have
- **REQ-1**: A spawn reply (`POST …/shell`, `POST …/shells`) reads as ended only when its `rev` is
  at or below the rev of the last list applied for the session (a `terminals` message or
  `snapshot.terminalsRev`) and that list lacks its `n`. A rename or close reply's `rev` never
  counts toward it; replies raise only the floor below which a list is ignored. (e1)
- **REQ-2**: When the follow-up listing of a terminal route (spawn, new, rename, close, shell
  attach nudge) fails, the route's `rev` is a fresh value of the daemon-wide counter taken without
  a broadcast — above every list sent so far. (e1)
- **REQ-3**: After such a failure, the next successful poll broadcasts that session's list even
  if it is unchanged (an empty list if the session has no terminals). (e1)

## Affected Files
### Daemon (daemon-impl)
- `internal/server/shellactivity.go` — REQ-2, REQ-3: `tick` reports whether the listing succeeded; `sync` takes the session id and, on failure, takes `p.rev++` (no broadcast), records it in `revs[id]`, marks the session forced; `reconcile` broadcasts forced sessions even if unchanged and clears the mark.
- `internal/server/shells.go` — REQ-2: `changed` takes the session id and every call (`spawnInSession`, rename, close, attach `nudge`) passes the session id.
- `internal/server/server.go` — wiring of `shellActivity.poller.sync`.
### Web (web-impl)
- `web/src/terminal/terminalsrev.ts` — REQ-1: keep the per-session applied-list rev beside the floor; snapshot sets both bases, forget clears both.
- `web/src/features/surfaces.ts` — REQ-1: `observeSpawnReply` compares against the applied rev; the `terminals` handler records applied rev; replies raise only the floor.
- `web/src/features/surfacesrev.test.ts` — header citation updated to `kb:adr/surfaces-terminal-ended-read-from-lists` (web-tests).
### Existing tests this breaks
- Any test calling `newShellFeature`/`sync` with the old `changed`/`sync` signature (daemon-tests adapts; behaviour tests unchanged).

## Proof
- e1 web — `web/src/features/surfacesrev.test.ts` (web-tests), wire-level: "a rename reply arriving before the list carrying a new terminal still shows the spawned terminal" (snapshot rev 5 `{1:[t1]}`, newTerminal + rename pending, rename reply rev 7 then spawn reply `{n:2, rev:6}` → selected shell, shell 2); same for a close reply and for `select('shell')`. Red today: `expected { selected: 'claude', shell: 1 } to deeply equal { selected: 'shell', shell: 2 }`. Also `web/src/terminal/terminalsrev.test.ts` for any new state helper.
- e1 daemon — `internal/server/terminalsrevpoller_test.go` (daemon-tests): `TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast` — tick (list `[1]`, rev 1); add terminal 2, lister fails, `sync` for the session; reply rev must exceed every rev sent; lister succeeds with unchanged list, `tick` → one broadcast. Red today: `"1" is not greater than "1"` and `expected: 2 actual: 1`. A route-level variant may sit in `terminalsrev_test.go`.

## Edge Cases
1. A reply's rev equal to the applied rev with the terminal present in the list → not ended (D/W: existing tests keep covering) → W1
2. Snapshot after the failed listing but before the spawn reply lands → accepted by the developer, not handled → untested: developer's answer Q1

## Acceptance Criteria
### Automated Checks
```checks
W1 cd web && npx vitest run src/features/surfacesrev.test.ts src/terminal/terminalsrev.test.ts
D1 go test -count=1 -run 'TestPollerRev_' ./internal/server/
D2 go test -count=1 ./internal/server/
D3 make lint
```
### Reviewer-Verified
- The daemon change matches `docs/protocol.md` § Revisions and ws.shell-activity as they stand.

## Doc Delta
**surfaces** — stops being true: ws.shell-activity (`docs/protocol.md`, the `terminals` message) says a list is broadcast "never when nothing changed". Becomes true: the one exception is the forced re-broadcast of a session's unchanged list on the next successful poll after a failed follow-up listing (as § Revisions already says). Wording consistency only; no wire shape changes.

## Out of scope
Nothing.
