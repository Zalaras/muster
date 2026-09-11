---
id: actions-pane-snapshot-display-only
type: decision
status: accepted
date: 2026-08-27
summary: The daemon captures each live pane on every liveness tick and serves the last capture for a dead session, dimmed under an ended cap; display only.
features: [actions, focus]
tags: [tmux, ux]
files: [internal/server/sessions.go, internal/tmux/tmux.go, web/src/render/dead.ts]
tests: [TestHandlePaneSnapshot_404BeforeCaptureThen200WithTextAfter, TestCapturePane_ReturnsPaneTextAndTrimsTrailingBlankLines, web/e2e/actions.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m4-reconcile, plan:m2-terminal, kb:anchor/sessions.pane, kb:adr/surfaces-shared-attach-single-pty]
supersedes: []
---
**Context.** Rail and strip cards are static metadata cards, so the pane endpoint was deferred at the terminal milestone as having no consumer. The one real consumer is a dead session: its terminal socket cannot open, and the user wants to see what the screen last showed.

**Options.** (A) No snapshot; a dead session shows metadata only. (B) Capture the pane on every liveness tick, keep the last capture in memory, and serve it for dead sessions under a session-ended cap that carries Resume.

**Decision.** B. The capture is a display source, never a state source, in keeping with the terminal-parsing rule.

**Consequences.** The endpoint answers not-found before the first capture and a session with no capture shows a no-snapshot message. A capture failure leaves the previous snapshot and never touches alive. A resume clears the snapshot so the fresh pane is not shown behind a stale one.
