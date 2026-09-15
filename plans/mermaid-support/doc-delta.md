# Doc Delta — mermaid-support

Seeded from `plan.md` § Doc Delta, amended by the orchestrator with what the run actually
produced. `doc-reconcile` owns `docs/features/*/spec.md` and `docs/protocol.md`; every claim
below is to be verified against the code before it lands.

## reader — becomes true (`docs/features/reader/spec.md`, § The reader)

Replace the sentence beginning "Rendering is in the browser with marked and DOMPurify, pinned
exactly" with:

> "Rendering is in the browser with marked, DOMPurify and mermaid, pinned exactly; mermaid is
> imported only when a document contains a ```` ```mermaid ```` fence and is bundled into the
> binary, never fetched. A fence becomes a diagram whose SVG crosses DOMPurify like the markdown
> does; one mermaid cannot parse keeps its fenced source with a labelled reason beneath. Diagrams
> follow the dashboard theme and re-render when it changes, and each enlarges into a modal with
> zoom and pan."

## reader — frontmatter

- `refs` gains `plan:mermaid-support`.
- `web` gains `web/src/render/diagrams.ts`, `web/src/render/diagramdialog.ts` and
  `web/src/render/mermaid.ts`. The existing `web/src/reader/**` glob already covers the new
  `reader/mermaid.ts` and `reader/zoom.ts`.
- **`e2e` gains `web/e2e/reader-mermaid.spec.ts`** — *added by the orchestrator; the plan's Doc
  Delta omitted it.* `go run ./tools/kb check` reports this file as "owned by no feature"
  alongside the three `render/*` modules, so the run cannot reach a green `check-kb` until this
  glob lands. Verified 2026-09-15 against `kb check`'s 4 open ownership problems.

## Not changing

- `docs/protocol.md` — no protocol change. The reader still fetches `kb:anchor/sessions.reader`
  and `kb:anchor/sessions.reader-file` unchanged, and the daemon serves raw `text/markdown`.
- No kb `diagram` record depicts the changed files (`kb for` on `render/diagrams.ts`,
  `features/reader.ts`, `render/reader.ts` returns decisions only). The plan's own sequence
  diagram documents the new post-pass but the Doc Delta does not ask for it to land inline in the
  spec, so it stays in the plan.

## From the implementation logs

No `doc-delta:` lines were emitted by `web-implementation.md`. Amend this section if a fix wave
adds any.
