---
id: diff-open-view-never-redraws
type: decision
status: accepted
date: 2026-11-20
summary: An open diff never redraws by itself; a fingerprint mismatch shows a bar under the toolbar, and Refresh is the only redraw.
features: [diff]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:diff-viewer, plans/diff-viewer/mockups/changed-notice.html]
supersedes: []
---
**Context.** A diff that moves under the developer loses their place mid-read and mid-comment, yet the button's counts and the open diff must never silently disagree.

**Options.** (A) Redraw on change. (B) A notice: a bar under the toolbar, the Refresh button changing in place, or a floating pill with dots on changed files.

**Decision.** B with the bar, the developer's choice: each scope carries a content fingerprint; when the polled one differs from the shown diff's, the dashboard reads the scope again in the background and the bar names what changed by file, with Refresh.

**Consequences.** The fingerprint depends only on content and base, so it is stable across reads and restarts. The lines on screen move only by the bar's height.
