---
id: rename-muster-owned-title-override-wins
type: decision
status: accepted
date: 2026-09-03
summary: A post-launch rename is a Muster-owned nullable title override that wins over the status-line name; the wire title is the display title.
features: [rename, tiles, focus]
tags: [ux, envelope, user-decision]
files: [internal/server/sessions.go, internal/session/session.go, internal/store/migrations/0007_title_override.sql, web/src/features/rename.ts, web/src/render/rename.ts, web/src/sessions/rename.ts]
tests: [TestApplyStatusUpdate_NeverTouchesTitleOverride, TestHandleSetTitle_AbsentKeyIs400ButExplicitNullIs204, TestSetTitle_BroadcastsOnceOnARealChangeZeroOnEdgeCases3And4, TestSession_DisplayTitle, web/e2e/rename.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:ui-text-and-focus, kb:anchor/sessions.title, kb:anchor/ws.session, kb:adr/rename-title-from-status-line-session-name, kb:fact/status-session-name-source, "#10"]
supersedes: [rename-title-from-status-line-session-name]
---
**Context.** The title was written once from the launch form and then overwritten by the status line's session name on every post; there was no rename route. Renaming from the dashboard needed a source that the status line could not clobber, and the no-terminal-parsing rule forbids driving Claude Code's own rename command through the pane.

**Options.** (A) Keep reading the status line only; rename by typing Claude Code's slash command in the terminal. (B) A Muster-owned nullable override stored per session and set over HTTP, winning over the status line while set; clearing it reverts to Claude Code's name.

**Decision.** B, pulled in directly by Damian without a separate spec pass. The wire title becomes the display title, override else last-known Claude name, with the override exposed as its own field.

**Consequences.** Status posts still refresh Claude Code's name and never touch the override; a hidden Claude-name change persists without a broadcast, and the endpoint broadcasts only on a wire change. An absent key is a bad request while an explicit null clears. The affordance is click-to-edit on the Focus heading and every tile header from one shared editor: Enter and blur commit, Escape cancels. The UI shows only the last broadcast, never a locally typed value.
