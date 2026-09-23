# web/src/reader — pure reader logic, no DOM

**Owns**: everything the reader derives without touching the DOM — sanitized markdown
rendering + outline extraction (`markdown.ts`), splitting a leading frontmatter block off
a file's raw text into a table/raw-fallback shape (`frontmatter.ts`), heading-id slugging
(`slug.ts`), the nav tree (`tree.ts`), the freshness cue's text (`freshness.ts`), the
browser-side "last open file / which writes are acknowledged" memory (`memory.ts`),
basename plus the loading-cue status text (`paths.ts`), mermaid fence/theme/error-text/id
helpers (`mermaid.ts`) and the diagram modal's zoom/pan arithmetic (`zoom.ts`). `render/reader.ts`
draws the results; `render/mermaid.ts` and `render/diagrams.ts` are the DOM half of the
diagram pass; `features/reader.ts` owns the socket, the fetches and which session gets a
mounted instance. **Features**: reader.

**Invariants** (violations are review-Critical):
- Every module here is Vitest-testable with no DOM and no socket (docs/conventions.md) —
  except `markdown.ts`, whose DOMPurify default export needs a real `window` and throws
  `default.sanitize is not a function` under this project's jsdom-less Vitest (measured
  2026-09-13). Its coverage is Playwright's: W15, E15, E16. `render/mermaid.ts` is the
  same shape (needs `window` for mermaid/DOMPurify) — not Vitest-importable either;
  `mermaid.ts` and `zoom.ts` themselves are pure and join `slug.ts` as exemplars.
- The sanitized fragment `markdown.ts` returns is the only thing ever inserted into the
  reader body, via `replaceChildren` — never `innerHTML` with interpolated data (W15).
- `memory.ts` never throws: every storage access is try/caught, defaulting to empty.
- A write is acknowledged by its own `writtenAt`/`docChanged.at` value, not a boolean —
  the same path written again after being opened must re-dirty (REQ-13).

**Exemplar**: `slug.ts` + `slug.test.ts` — a small pure function pair; copy this shape for
a new derivation.

**Gotchas**:
- `tree.ts`'s `filterTree` doesn't remember anything across calls; "clearing restores the
  collapsed tree" is `features/reader.ts` dropping its own manual-expand set, not a tree
  property.
- `markdown.ts` assigns heading `id`s during the same walk that builds the outline, so
  the two can never name different headings for the same entry.
