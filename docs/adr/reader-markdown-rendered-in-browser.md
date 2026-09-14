---
id: reader-markdown-rendered-in-browser
type: decision
status: accepted
date: 2026-09-14
summary: Markdown is rendered in the browser with marked and DOMPurify pinned exactly; the daemon hands raw text/markdown bytes and trusts nothing it serves.
features: [reader]
tags: [deps, security]
files: [web/package.json]
tests: []
refs: [plan:markdown-viewing, docs/history/design/markdown-viewing.md, kb:adr/issue-preview-is-the-leak-check, kb:adr/stack-terminal-rendering-xterm-js]
supersedes: []
---
**Context.** The reader shows the plan a session wrote and any markdown under its directory. The plan is composed by the model from whatever it read, including web pages and third-party repos, and the render lands in the dashboard's own origin, which holds the UI credential and can end, remove and launch sessions and file public issues. Sanitization is therefore mandatory, and somebody has to turn markdown into HTML.

**Options.** (A) Browser: marked 18.0.13 (markdown to HTML) plus DOMPurify 3.4.15 (sanitizer), about 24 kB gzip, 50 ms for the largest plan on disk, task-list checkboxes kept; the daemon hands bytes. (B) Daemon: goldmark plus bluemonday, 153 kB of binary, 5 ms per render, but the dashboard must then trust daemon HTML and bluemonday's UGC policy strips task-list checkboxes. Rejected within A on 2026-09-13: markdown-it (six transitive dependencies against none, slower cadence), micromark/remark (no release in eighteen months, large ecosystem), showdown (unmaintained), sanitize-html (archived). The browser-native Sanitizer API is the eventual exit for DOMPurify once it ships across browsers.

**Decision.** A. Two runtime dependencies, pinned to exact versions like xterm; the sanitized output enters the DOM as a fragment, never through innerHTML.

**Consequences.** The daemon stays Claude-format-only and hands raw markdown as the issue preview already does. Rendering cost is paid in the tab, never in the daemon. No dependency-update automation exists in this repository; bumps are manual and each one re-runs the sanitizer E2E criterion.
