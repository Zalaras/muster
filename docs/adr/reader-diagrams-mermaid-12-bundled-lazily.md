---
id: reader-diagrams-mermaid-12-bundled-lazily
type: decision
status: accepted
date: 2026-09-15
summary: Mermaid fences render with mermaid 12.0.0 pinned exactly, bundled into the embedded dashboard and imported on the first fence; no CDN, no daemon render.
features: [reader]
tags: [deps, security, user-decision]
files: [web/package.json, web/vite.config.ts, web/src/render/mermaid.ts]
tests: [web/e2e/reader-mermaid.spec.ts]
refs: [plan:mermaid-support, kb:adr/reader-markdown-rendered-in-browser, kb:adr/stack-system-font-stacks-only, kb:adr/knowledge-diagrams-are-mermaid-records]
supersedes: []
---
**Context.** The kb standardised on mermaid for every system and feature diagram and deferred rendering them in the docs reader. The reader must render fences without any network dependency, and the developer requires ELK layout support for large graphs.

**Options.** (A) Load mermaid from a CDN at runtime. (B) Render in the daemon with mermaid-cli, which needs a headless Chromium. (C) mermaid 11.17.2, the mature line, plus a second pinned ELK add-on package registered by hand. (D) mermaid 12.0.0 (2026-09-10), which bundles ELK as the default layout for flowchart, state, class and ER diagrams, pinned exactly, bundled by Vite into hashed chunks that `//go:embed` compiles into the binary, and imported dynamically only when a rendered document contains a fence.

**Decision.** D. A CDN makes a local tool depend on the network and leaks a request, the reasoning that already rules out web fonts; daemon-side rendering drags a browser into the daemon and would make the dashboard trust daemon HTML. Between C and D, ELK being required tips it: one dependency, no registration call. 12.0.0 is five days old and ES2024-only, which the dashboard's Chromium-class browsers meet; a 12.0.x patch is a routine bump. The dynamic import keeps the entry chunk and first paint unchanged for sessions that never open a diagram.

**Consequences.** The musterd binary roughly doubles, measured 21.4 MB to 43.0 MB, carrying ELK, cytoscape, katex and dagre. The entry chunk is unchanged (387,566 to 387,543 bytes): a session that never opens a diagram pays none of it. The bundle carries mermaid's own copies of marked (16.x) and DOMPurify beside the reader's pinned ones. Vite's chunk-size warning fires and is informational. No dependency-update automation exists; bumps are manual and each re-runs the sanitizer and origin E2E criteria. mermaid 12's redux-colour and neo defaults are not adopted here (kb:adr/reader-diagram-theme-maps-to-builtin-themes).
