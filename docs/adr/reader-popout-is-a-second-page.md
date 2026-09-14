---
id: reader-popout-is-a-second-page
type: decision
status: accepted
date: 2026-09-14
summary: The pop-out is a second Vite page with its own composition root sharing the reader component and socket client; a hash route in the dashboard was rejected.
features: [reader]
tags: [ux]
files: [web/vite.config.ts]
tests: []
refs: [plan:markdown-viewing, kb:adr/process-composition-roots-registration-only, kb:adr/stack-frontend-web-app-served-by-daemon]
supersedes: []
---
**Context.** The reader should open in its own browser tab carrying the full component, not a bare render. The dashboard is a single page whose composition root registers features in one line each and holds no logic of its own.

**Options.** (A) A hash or query route inside the dashboard page that boots into a reader-only mode. (B) A second HTML entry served by the same daemon, with a small composition root that builds the app seam, the socket client and the reader controller only.

**Decision.** B. A link with a new-tab target opens the page for a session and a file; the browser owns the tab from there. The page shares the reader component, the socket client and the per-session browser memory with the dashboard.

**Consequences.** The dashboard's composition root never branches on the URL. The pop-out gets live updates through its own socket connection and shows daemon-down in the reader's own status line, since it has no masthead or banner. The build gains one entry in the Vite configuration and the embedded assets gain one page.
