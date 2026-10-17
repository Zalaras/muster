---
id: reader-find-highlights-via-css-highlight-api
type: decision
status: accepted
date: 2026-10-17
summary: The reader's find bar highlights matches with the CSS Custom Highlight API; wrapping them in mark elements was rejected as it mutates the sanitized body.
features: [reader-find]
tags: [ux, security]
files: [web/src/render/readerfind.ts, web/src/features/readerfind.ts, web/src/style.css]
tests: [web/e2e/reader-search.spec.ts]
refs: [plan:docs-search-bar, kb:adr/reader-markdown-rendered-in-browser, kb:adr/reader-diagram-svg-crosses-dompurify]
supersedes: []
---
**Context.** Issue #94: Chrome's own find over the reader matches the docbar, nav and outline as well as the document. The reader needs its own find that highlights every match and a current one. The rendered body is a DOMPurify-sanitized fragment and is the only thing ever inserted into the body (`web/src/reader/CLAUDE.md`), and diagram labels are SVG `<text>`.

**Options.** (A) Split text nodes and wrap each match in a `<mark>`, undone on close or re-render. (B) Build `Range`s over the body's text nodes and register them with `CSS.highlights`, styled by `::highlight()`.

**Decision.** B. It leaves the body's DOM untouched, so the sanitized fragment stays the only content and outline ids, scroll-spy and diagram re-renders never see a changed tree. Chrome is the only target, and Chromium 153 was measured at planning to paint a `::highlight()` background on SVG `<text>`, so diagram labels highlight too.

**Consequences.** Highlights are read in tests through `CSS.highlights`, not the DOM. `::highlight()` does not apply `color` to SVG text, so a match is shown by its background. Highlight names are document-global, so each mounted reader must keep its own and never overwrite another's.
