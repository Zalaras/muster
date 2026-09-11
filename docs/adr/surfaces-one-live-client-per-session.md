---
id: surfaces-one-live-client-per-session
type: decision
status: accepted
date: 2026-08-16
summary: A session is live on exactly one surface at one geometry at a time; every other rendering of it is a static snapshot.
features: [surfaces, tiles, rail]
tags: [tmux, ux]
files: [internal/server/terminal.go, web/src/sessions/live.ts, web/src/render/sessions.ts]
tests: [TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce, web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, spikes/FINDINGS.md, kb:anchor/terminal.ws, kb:adr/surfaces-shared-attach-single-pty]
supersedes: []
---
**Context.** The multi-client sizing matrix showed that tmux sizes a session to its smallest attached client: a live narrow thumbnail beside a live wide pane silently loses content in the wide one. A wider renderer degrades gracefully; a narrower one does not.

**Options.** (A) Render live thumbnails in the session list and accept the clipping. (B) Allow one live client per session and show static snapshots everywhere else.

**Decision.** B. The session's geometry is owned by the one surface that renders it live. The rail and the Tiles strip show static cards. Many sessions may be live at once, but no single session is live on two surfaces at two widths.

**Consequences.** Switching views moves geometry ownership instead of duplicating it, which is a real resize and is debounced, touching only sessions whose live surface changed. The daemon enforces the law server-side: a second terminal socket for the same target takes over and the first is closed with a dedicated code. Anything that wants a second live look at a session is out.
