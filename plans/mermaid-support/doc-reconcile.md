# Doc Reconcile: mermaid-support

**Verdict**: reconciled
**Features derived**: reader (plan header: reader)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| reader | Rendering is in the browser with marked, DOMPurify and mermaid, pinned exactly | `web/package.json` (`"mermaid": "12.0.0"` under `dependencies`) | replaced sentence |
| reader | mermaid is imported only when a document contains a ```` ```mermaid ```` fence | `web/src/render/diagrams.ts:renderDiagrams` (no-op return when `findFences` is empty, before `render/mermaid.ts`'s dynamic import is ever reached); `web/src/render/mermaid.ts:loadEngine` (the only dynamic `import("mermaid")`) | replaced sentence |
| reader | bundled into the binary, never fetched | `web/e2e/reader-mermaid.spec.ts` E5 (`OriginRequestTracker.assertAllSameOrigin`, `scriptRequestsContaining("mermaid")` only fires once a diagram file opens) | replaced sentence |
| reader | a fence becomes a diagram whose SVG crosses DOMPurify like the markdown does | `web/src/render/mermaid.ts:renderDiagramSvg` (`DOMPurify.sanitize(svg, …)`) | replaced sentence |
| reader | one mermaid cannot parse keeps its fenced source with a labelled reason beneath | `web/src/render/diagrams.ts:renderDiagrams`/`appendErrorLine`; `web/e2e/reader-mermaid.spec.ts` E3 (`diagram not rendered: ` text, kept `<pre>` as the error line's previous sibling) | replaced sentence |
| reader | diagrams follow the dashboard theme and re-render when it changes | `web/src/render/diagrams.ts:rerenderDiagrams`; `web/e2e/reader-mermaid.spec.ts` E6 | replaced sentence |
| reader | each enlarges into a modal with zoom and pan | `web/src/render/diagramdialog.ts:wireDiagramDialog`; `web/e2e/reader-mermaid.spec.ts` E8/E13/E14 | replaced sentence |
| reader (deleted) | "Rendering is in the browser with marked and DOMPurify, pinned exactly" | — | deleted (superseded by the mermaid-inclusive sentence) |
| reader — frontmatter | `web` gains `web/src/render/diagrams.ts`, `web/src/render/diagramdialog.ts`, `web/src/render/mermaid.ts` | `go run ./tools/kb check` listed these 3 as "owned by no feature" before the edit | added to `web:` glob |
| reader — frontmatter | `e2e` gains `web/e2e/reader-mermaid.spec.ts` | same `kb check` output, 4th "owned by no feature" entry | added to `e2e:` glob |
| reader — frontmatter | `refs` gains `plan:mermaid-support` | plan directory `plans/mermaid-support/` | added |

## Contradictions

None.

## For the orchestrator

None — `docs/protocol.md` needs no change (confirmed below), and no diagram record depicts the
changed files (the plan's own sequence diagram stays in the plan per the delta's "Not changing"
section).

## Checks

`docs/protocol.md`: confirmed unchanged is correct — `kb:anchor/sessions.reader` and
`kb:anchor/sessions.reader-file` (`docs/protocol.md:552`, `:590`) are untouched; no new anchor
needed since neither the request/response shape nor the served content-type changed.

Before the edit, `go run ./tools/kb check` reported 4 "owned by no feature" problems for
`web/src/render/diagrams.ts`, `web/src/render/diagramdialog.ts`, `web/src/render/mermaid.ts` and
`web/e2e/reader-mermaid.spec.ts`. After the frontmatter edit and `make gen-kb`:

```
$ make gen-kb
go run ./tools/kb gen
kb: regenerated 2 file(s): .claude/rules/reader.md, docs/features/reader/INDEX.md

$ make check-kb
go run ./tools/kb check
kb: 363 records, 23 features, 0 problem(s)
kb: all checks pass
```

`docs/features/reader/spec.md` body word count (frontmatter excluded): 661 words, under the
800-word spec budget (`internal/kb/budget.go:SpecWords`).

`make refs` is red with 29 missing references (task description said 28; count may have drifted
by one commit since) — all resolve to `test/rig/captures/*` and `.claude/settings.local.json`,
both gitignored/local-only paths untouched by this plan. Not fixed, per instruction.

Committed as `d3b46a9` on `plan/mermaid-support`:
`docs/features/reader/spec.md`, `docs/features/reader/INDEX.md` (generated),
`.claude/rules/reader.md` (generated).
