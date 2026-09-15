---
id: reader-diagram-svg-crosses-dompurify
type: decision
status: accepted
date: 2026-09-15
summary: Mermaid runs strict with HTML labels off, its SVG crosses DOMPurify as a fragment like the markdown, and its click hook is never called; one sanitizer boundary.
features: [reader]
tags: [security]
files: [web/src/reader/markdown.ts, web/src/features/reader.ts, web/src/render/mermaid.ts]
tests: [web/e2e/reader-mermaid.spec.ts]
refs: [plan:mermaid-support, kb:adr/reader-markdown-rendered-in-browser, kb:adr/issue-preview-is-the-leak-check]
supersedes: []
---
**Context.** Diagram source is model-written text from files under a session's directory, rendered into the dashboard's own origin, which holds the UI credential. mermaid ships its own DOMPurify-based label sanitizer and a `securityLevel` setting, so the question is whether the reader trusts mermaid's output as it trusts nothing else.

**Options.** (A) Insert mermaid's SVG string directly, relying on `securityLevel: "strict"`. (B) Run mermaid strict with HTML labels off, then pass the SVG string through the reader's own DOMPurify with the HTML, SVG and SVG-filter profiles, `RETURN_DOM_FRAGMENT`, and never invoke `bindFunctions`. (C) Render in a sandboxed iframe (`securityLevel: "sandbox"`).

**Decision.** B. The reader's rule is that only a DOMPurify fragment ever enters `article.md`; A would make mermaid a second boundary with its own configuration surface — and `htmlLabels` is not on mermaid's `secure` list, so a diagram's own `%%{init}%%` directive can turn HTML labels back on. C costs layout, theme and focus integration for no gain over B. Syntax is checked with `parse` before `render` and `suppressErrorRendering` is on, so mermaid's error SVG never reaches the DOM either.

**Consequences.** Diagrams lose click bindings and HTML-formatted labels by design. If DOMPurify's default profile strips the `<style>` element mermaid's SVG depends on, the allowance is widened by that one tag only, never by event attributes or unknown protocols. The E2E suite feeds a diagram carrying a script label, an `onerror` attribute, a `javascript:` click and a loose init directive and asserts none survive.
