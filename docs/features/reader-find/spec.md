---
id: reader-find
type: spec
status: active
date: 2026-10-17
summary: The reader's own find bar — case-insensitive matches in the rendered document alone, highlighted without touching the sanitized body, in every reader host.
features: [reader-find]
tags: [ux]
go: []
web: [web/src/reader/find*.ts, web/src/features/readerfind.ts, web/src/render/readerfind.ts]
e2e: [web/e2e/reader-search.spec.ts, web/e2e/helpers/reader-search.ts]
protocol: []
refs: [plan:docs-search-bar, kb:spec/reader, kb:spec/shortcuts, kb:adr/reader-find-highlights-via-css-highlight-api, kb:adr/reader-find-overrides-cmd-f-inside-reader, kb:adr/reader-find-query-follows-file-switch, docs/design/design-system.md]
---
The docs reader (kb:spec/reader) has a find bar: an icon at the body's top-right, or Command-F
in the reader holding keyboard focus (kb:spec/shortcuts), in Focus, a tile or a pop-out. It
highlights case-insensitive matches in the rendered document alone, never in the bar or chrome
(kb:adr/reader-find-highlights-via-css-highlight-api).

While the bar is open it reserves the top of the reading area, so no match ever sits under it.
The current match is revealed against the bar's bottom edge, and stepping scrolls every
horizontal scroll container between the match and the body (a code block, a table, a diagram) as
well as the body itself. Closing the bar leaves the text where it was at any scroll position,
the end of the body included; only within the bar's own height of the top can it move, since
scrollTop cannot go below zero.

An open bar keeps its query across a re-render and a file switch. On a user-initiated switch the
first match is revealed again once the file's diagrams have rendered, unless the developer typed
or stepped meanwhile (kb:adr/reader-find-query-follows-file-switch).
