---
id: reader-diagram-enlarge-is-a-zoomable-modal
type: decision
status: accepted
date: 2026-09-15
summary: Each diagram enlarges into one modal per reader root, opened at fit, with wheel, drag, key and button zoom and pan on a CSS transform; new tab rejected.
features: [reader]
tags: [ux, user-decision]
files: [web/index.html, web/doc.html, web/src/render/reader.ts, web/src/style.css, web/src/render/diagramdialog.ts, web/src/reader/zoom.ts]
tests: [web/e2e/reader-mermaid.spec.ts]
refs: [plan:mermaid-support, kb:adr/reader-popout-is-a-second-page, docs/design/design-system.md]
supersedes: []
---
**Context.** Diagrams in the reader body are constrained to the column width; a large flowchart or C4 diagram is unreadable there, and in a compact tile more so. The developer asked that a diagram be enlargeable and, for large ones, zoomable and pannable.

**Options.** (A) Open the sanitized SVG in a new tab as a blob URL and rely on the browser's native zoom. (B) A modal dialog showing the diagram fitted to the viewport, no further control. (C) One `dialog.modal` per reader root — the pattern launch, confirm, issue and Settings already use — opened fitted, with wheel zoom around the pointer, pointer-drag pan, `Zoom in`, `Zoom out`, `Reset zoom` and `Close` buttons and the `+`, `-`, `0` and arrow keys, applied as a CSS transform on a clone of the SVG.

**Decision.** C. A loses the dashboard theme unless wrapped in a page, opens a tab per look and cannot be exercised the same way on the pop-out; B does not serve a large diagram at all. The transform keeps the vector crisp at any scale, and the arithmetic lives in a pure module so the zoom-around-pointer maths is unit-tested.

**Consequences.** The dialog markup is duplicated into both page templates and must stay byte-identical. Zoom is clamped to a quarter and eight times fit, exposed as a data attribute for tests, and resets on every open. The dialog holds a clone, so a body re-render while it is open never empties it, and drops it on close so a closed modal keeps neither a full SVG copy nor its duplicate ids in the document. Focus returns to the diagram's button on close. Wheel handling is non-passive so trackpad pinch never zooms the page.
