---
id: launch-bypass-offered-with-danger-guardrails
type: decision
status: accepted
date: 2026-09-28
summary: Start in offers bypass as a danger segment with a warning line and a danger Launch without checks button; a bypass chip marks the session wherever it shows.
features: [launch, rail, focus, tiles]
tags: [ux, security, user-decision]
files: [web/src/features/launch.ts, web/src/sessions/permission.ts, web/src/render/sessions.ts, web/src/render/mainhead.ts, web/src/render/tiles.ts, internal/claudecode/launch.go]
tests: []
refs: [plan:resume-and-dangerously-allow, kb:adr/launch-bypass-and-dontask-unoffered, kb:fact/bypass-permission-mode-on-wire, kb:fact/bypass-acceptance-blocks-startup, "#61"]
supersedes: [launch-bypass-and-dontask-unoffered]
---
**Context.** Bypass and dont-ask were held back until a permissions editor supplied guardrails,
on the grounds that a one-click radio is too easy a place to drop every permission check. Issue
#61 asked for bypass; the editor is not built.

**Options.** (A) Keep waiting on the editor. (B) Offer bypass now behind guardrails of its own.
(C) Offer bypass and dont-ask both.

**Decision.** B, the developer's call. Bypass is a fifth Start-in segment in the danger family.
While it is checked a warning line names what it removes and the primary button becomes
danger-filled `Launch without checks`. A danger `bypass` chip sits on the rail card, the Focus
mainhead and the tile header whenever the session's last-known mode is bypass. Dont-ask stays
unoffered.

**Consequences.** This reverses kb:adr/launch-bypass-and-dontask-unoffered for bypass; at Completion this record gains `supersedes` on it and it becomes superseded, since the check allows a proposed record to supersede only an accepted one. The request's mode set gains `bypassPermissions`. The chip reads the latch, so a
mode changed with Shift+Tab (which fires no hook) keeps the chip until the next hook corrects it.
Claude Code's own warning adds a second confirmation in the terminal on machines that have not
accepted it.
