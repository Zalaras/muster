---
id: notes-own-window-is-a-third-page
type: decision
status: accepted
date: 2026-11-04
summary: A session's note opens in its own popup window, a third Vite page with its own composition root; one named window per session per tab.
features: [notes]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:popped-out-note-enhance, kb:adr/reader-popout-is-a-second-page]
supersedes: []
---
**Context.** The developer wants to keep a note beside the browser or on another screen, beyond what
an in-page panel can reach. The docs reader already has a second page for its pop-out.

**Options.** (A) Document Picture-in-Picture, always on top. (B) A third page, `note.html?session=<id>`,
opened as a popup window, following kb:adr/reader-popout-is-a-second-page.

**Decision.** B, by the developer. The page has its own composition root, sharing the note rendering,
editor, save and draft logic and the socket client with the dashboard. It shows only the note,
headed `Note · <title>` (also the document title), reads `connecting…` until its first `hello`,
shows the panel's unsaved status, stays editable after its session ends and reads
`This session has been removed.` after Remove. Each session's window is opened under its own name;
pressing the control again in the same tab brings the open window to the front instead of opening
another. Opening it closes the panel it was pressed in. Escape in the window only leaves edit mode.

**Consequences.** The build gains a third entry and the embedded assets a third page; musterd needs
no change. A second dashboard tab may open a second window for the same session; saves stay in sync,
last write wins.
