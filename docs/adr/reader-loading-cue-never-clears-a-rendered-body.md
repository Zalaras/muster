---
id: reader-loading-cue-never-clears-a-rendered-body
type: decision
status: accepted
date: 2026-09-14
summary: A user-initiated open greys the reading area out and names the file on the status line instead of replacing the body; re-fetches are silent.
features: [reader]
tags: [ux]
files: [web/src/features/reader.ts, web/src/render/reader.ts, web/src/style.css]
tests: [web/e2e/reader.spec.ts]
refs: [plan:markdown-render-fixes, kb:adr/reader-change-signal-is-the-write-hook, docs/design/design-system.md]
supersedes: []
---
**Context.** `openFile` set `openPath` and then awaited its fetch without requesting a render, so between a click and the content there was no feedback at all — the bar still named the old file and `aria-current` had not moved. Issue #25 reported the delay with nothing shown for it. The reader's failure surfaces deliberately keep the last good render when an open fails, so a cue that blanked the body would overturn that.

**Options.** (A) Replace the body with a `loading…` placeholder. (B) A modal over the reading area. (C) Grey the reading area out — a dimmed `article.md` carrying `aria-busy` — and name the file on the status line, the body placeholder carrying the cue only while nothing has rendered.

**Decision.** C. A overturns the keep-the-last-render contract and jolts the layout on every click; B needs modal wiring in a component cloned into up to eight hosts, and blocks interaction for a local file read. One `loadingPath` drives both dim and text, so they cannot disagree. A re-fetch of the file already open — a routed write, window focus, a post-reconnect snapshot — shows nothing, so Claude saving the plan under the reader never flashes a cue. Ahead of every cue, `openFile` renders synchronously before its await, so the bar and `aria-current` move on the click itself.

**Consequences.** A failed open simply un-dims the document already there, so keep-the-last-render holds by construction rather than by a special case. The dim is a 120 ms opacity transition, and that fade is the flash protection: a fetch resolving in 20 ms never reaches a visible dim while a slow one greys out fully, so no timer or threshold exists in the feature. E2E asserts `aria-busy`, never an opacity read mid-transition.
