---
id: reader-diagram-failure-keeps-source-with-reason
type: decision
status: accepted
date: 2026-09-15
summary: A mermaid fence that fails keeps its fenced source and gains one labelled line with mermaid's reason; the rest renders and the error SVG never shows.
features: [reader]
tags: [ux, user-decision]
files: [web/src/features/reader.ts, web/src/style.css, web/src/render/diagrams.ts, web/src/reader/mermaid.ts]
tests: [web/e2e/reader-mermaid.spec.ts]
refs: [plan:mermaid-support, kb:adr/reader-loading-cue-never-clears-a-rendered-body, docs/design/design-system.md]
supersedes: []
---
**Context.** Diagrams in plans and kb records are written by the model and edited by hand; a syntax slip is routine. mermaid's default behaviour on a bad fence is to inject a red "Syntax error in text" SVG where the diagram would be.

**Options.** (A) Let mermaid's error SVG stand. (B) Silently leave the fenced source as a code block. (C) Keep the fenced source and append one line, `diagram not rendered: <first line of mermaid's message>`, falling back to `syntax error`; check with `parse` before `render` so the error SVG never appears.

**Decision.** C. A hides the source the reader needs to fix the diagram; B hides that anything went wrong, against the design system's rule that a degraded state is labelled, not hidden. The label carries mermaid's own message, which usually names the line.

**Consequences.** Every other fence in the document renders normally; a failure is local to its block. The failure text is built with `textContent` from a pure function, so the boundary that only DOMPurify fragments enter the body holds on the failure path too. `suppressErrorRendering` stays on so a render-time failure after a successful parse degrades the same way.
