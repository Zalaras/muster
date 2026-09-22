---
id: surfaces-snapshot-restored-tick-always-self-clears
type: decision
status: accepted
date: 2026-09-22
summary: A done tick restored from a snapshot gap always self-clears after ~3s, where a tick from a live idle message persists until the shell surface is selected.
features: [surfaces]
tags: [ux]
files: [web/src/terminal/shellactivity.ts, internal/server/shellactivity.go]
tests: [web/e2e/shell-activity.spec.ts]
refs: [plan:terminal-fixes-cleanup, plans/terminal-fixes-cleanup/web-implementation.md, kb:adr/surfaces-shell-busy-from-tmux-process-state]
supersedes: []
---

## Context

A session that was busy and is absent from the next `snapshot.shellsBusy` has one wire
signature and two required meanings:

- **W6** — work finished during a WS disconnect. Show the tick.
- **E8** — the daemon restarted and reconcile killed every `muster-<n>-shell`, so the shell is
  *gone*. Clear to nothing, not to a tick.

The daemon cannot separate them and says so: `reconcile()` records that an exit-while-busy
(E7), a reconcile-kill (E8) and an ordinary busy→idle all "read as 'no longer in newBusy', the
same path as going idle". A killed shell and a finished command are the same absence.

Measured: with one `observeIdle` serving both, gated only on surface selection, the mainhead's
`span.shellact` held `data-act="done"` for a full 20 s after `daemon.restart()`. Nothing
scheduled a clear, so E8 could never pass.

## Decision

Split the busy→idle transition by **source**:

- `observeIdle` — a live `shellActivity{busy:false}`. REQ-4 as written: the tick persists until
  the user selects that `shell` surface, or self-clears after ~3 s if it is already selected.
- `restoreIdle` — absence from a post-gap snapshot. Resolves to `done` (W6) and **always**
  schedules the ~3 s self-clear.

## Consequences

REQ-4 is narrowed on the reconnect path only: a tick owed to a WS blip vanishes after ~3 s even
if nobody selects `shell`. The live path — every ordinary command — keeps User Flow 3's "becomes
a tick and stays".

This is the cheaper side. The alternative preserves "and stays" where no one can observe the
difference, and pays with a tick stuck forever after a restart, claiming work finished for a
shell that no longer exists.

A protocol field separating "finished" from "gone" would dissolve the ambiguity — not worth a
wire change for ~3 s on a reconnect, and recorded so it stays visible.
