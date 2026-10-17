---
id: reader-find-query-follows-file-switch
type: decision
status: accepted
date: 2026-10-17
summary: An open find bar keeps its query across a re-render, without scrolling, and across a file switch, jumping to the first match; closing on switch rejected.
features: [reader-find]
tags: [ux]
files: [web/src/features/reader.ts, web/src/features/readerfind.ts]
tests: [web/e2e/reader-search.spec.ts]
refs: [plan:docs-search-bar, kb:adr/reader-change-signal-is-the-write-hook, kb:adr/reader-loading-cue-never-clears-a-rendered-body]
supersedes: []
---
**Context.** The open document re-renders under the reader on a write hook, a plan refocus or a theme change, and the developer switches files from the nav. An open find bar must do something sensible in both cases.

**Options.** (A) Close the bar on any re-render or switch, as Chrome's find bar closes on navigation. (B) Keep the bar and query, re-run it, and treat a re-render and a switch differently, as VS Code's find widget carries one term across editors.

**Decision.** B. A file switch in the reader happens inside one page, which is closer to switching editors than to navigating. A re-render keeps the current ordinal, clamped to the new count, and never scrolls — the developer did not ask to move. A switch starts at the first match and scrolls to it, because the developer is searching the new file.

**Consequences.** The query is not remembered across a reload or a session switch. A re-render that leaves no matches shows `no matches` with the bar still open.
