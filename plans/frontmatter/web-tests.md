# Web Tests: Frontmatter

**Plan**: frontmatter
**Verdict**: pass
**Pack**: kb: pack 6371 words (budget 8000) — sections: rules 841 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 647 · runbooks 2

## Summary

Tests created: 33 | Passing: 33 | Failing: 0

Scope: `web/src/reader/frontmatter.ts`'s `splitFrontmatter` is the only new web logic this
plan adds that is Vitest-testable. `markdown.ts` — where `splitFrontmatter`'s output is
turned into the `table.frontmatter` / `pre.frontmatter` DOM (REQ-5, REQ-6, REQ-10, W10) —
is explicitly out of unit-test scope per `web/src/reader/CLAUDE.md`'s own invariant:
DOMPurify's default export needs a real `window` and throws `default.sanitize is not a
function` under this project's jsdom-less Vitest (measured 2026-09-13); its coverage is
Playwright's (plan's own Reviewer-Verified W10/W15/W16/W17 and E2E criteria E3/E4/E5). I
read `markdown.ts` to confirm the DOM-building functions (`buildFrontmatterTable`,
`buildFrontmatterFallback`) are unexported, private, and only ever called with
`splitFrontmatter`'s already-classified output — so there is no additional pure surface
hiding in that file to unit-test; the classification logic itself lives entirely in
`frontmatter.ts`.

All of REQ-1..REQ-4, REQ-7 and W1-W9 are covered here against the shipped
`splitFrontmatter` (not reimplemented arithmetic — every test calls the real function).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `frontmatter.test.ts` | no fence at all → null, unchanged | REQ-7, no block | pass |
| `frontmatter.test.ts` | `---` not first line → null, unchanged | W2 | pass |
| `frontmatter.test.ts` | unclosed opening fence → null, unchanged | W1 | pass |
| `frontmatter.test.ts` | later thematic break with no real opener → null, unchanged | W2 | pass |
| `frontmatter.test.ts` | fence with trailing spaces recognised | W5 | pass |
| `frontmatter.test.ts` | fence with trailing tabs recognised | W5 | pass |
| `frontmatter.test.ts` | `----` is not a fence | W5 | pass |
| `frontmatter.test.ts` | `--- x` is not a fence | W5 | pass |
| `frontmatter.test.ts` | a line with trailing content after dashes doesn't close; classifies as raw | W5, REQ-3 | pass |
| `frontmatter.test.ts` | leading BOM stripped, not in body | REQ-1, W4 | pass |
| `frontmatter.test.ts` | CRLF fences recognised, body byte-identical | REQ-1, W3 | pass |
| `frontmatter.test.ts` | CRLFs kept verbatim inside a raw fallback | W3, REQ-3 | pass |
| `frontmatter.test.ts` | BOM + CRLF together | REQ-1, W3, W4 | pass |
| `frontmatter.test.ts` | one row per `key: value` line, file order | REQ-2 | pass |
| `frontmatter.test.ts` | duplicate keys kept as separate rows in order | REQ-2, W8 | pass |
| `frontmatter.test.ts` | `key:` with nothing after colon → empty value | REQ-2, W8 | pass |
| `frontmatter.test.ts` | value whitespace trimmed, otherwise verbatim | REQ-2 | pass |
| `frontmatter.test.ts` | value containing `:` → text after first `: ` | REQ-2, W8 | pass |
| `frontmatter.test.ts` | list-shaped value shown as literal text, no list parsing | REQ-2 | pass |
| `frontmatter.test.ts` | blank and comment lines skipped, no rows | REQ-2 | pass |
| `frontmatter.test.ts` | dots/hyphens/underscores allowed in a key | REQ-2 | pass |
| `frontmatter.test.ts` | block-list item → raw fallback | REQ-3, W6 | pass |
| `frontmatter.test.ts` | `\|` scalar body → raw fallback | REQ-3, W6 | pass |
| `frontmatter.test.ts` | unkeyed line → raw fallback | REQ-3, W6 | pass |
| `frontmatter.test.ts` | `key:value` (no space) → raw fallback | REQ-3, W6 | pass |
| `frontmatter.test.ts` | one non-flat line among several flat ones → whole block raw | REQ-3, W6 | pass |
| `frontmatter.test.ts` | raw text kept verbatim incl. blank lines/comments | REQ-3, W6 | pass |
| `frontmatter.test.ts` | empty block → null, stripped | REQ-4, W7 | pass |
| `frontmatter.test.ts` | comments-only block → null, stripped | REQ-4, W7 | pass |
| `frontmatter.test.ts` | whitespace-only block → null, stripped | REQ-4, W7 | pass |
| `frontmatter.test.ts` | later thematic break in body left untouched | W9 | pass |
| `frontmatter.test.ts` | file that is only frontmatter → empty body | edge case 20 | pass |
| `frontmatter.test.ts` | only frontmatter, no trailing newline → empty body | edge case 20 | pass |

33 `it` blocks total (line count verified with `grep -c '  it(' frontmatter.test.ts`); the
table above lists all 33.

## Implementation Bugs

None found. `splitFrontmatter` matches every REQ-1..REQ-4/REQ-7 and W1-W9 case in the plan,
including the two cases most likely to be missed in a naive implementation: `key:value`
with no space after the colon correctly falls back to raw (the regex's `(?:[ \t]+(.*))?`
group cannot match `value` without a leading space, so the line fails `FLAT_LINE` entirely
rather than silently producing a wrong split), and a `key:` bare line with a following
`|`-scalar line correctly triggers the whole-block raw fallback rather than emitting a
partial table.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v5.0.0 /Users/damian/Documents/code/Projects/muster/web

 Test Files  44 passed (44)
      Tests  1822 passed (1822)
   Start at  22:44:20
   Duration  2.20s

$ npx tsc --noEmit
(exit 0, no output)

$ npm run build
✓ built in 1.58s
(pre-existing chunk-size-limit warning from the mermaid bundle, unrelated to this plan —
kb:adr/reader-diagrams-mermaid-12-bundled-lazily)

$ make web-lint
Checked 179 files in 178ms. No fixes applied.
```

## Note for the orchestrator (not mine to fix)

`web-implementation.md`'s Handoff section flags a locator defect in
`web/e2e/helpers/reader.ts`'s `frontmatterRow()` (used by E3/E4 in `web/e2e/reader.spec.ts`):
its `.filter({ has: ... })` inner locator is chained off `table` instead of `page`, so
Playwright reapplies the full selector chain scoped to each `<tr>` and looks for a nested
`<table>` inside it, which never exists — the filter always matches zero rows regardless of
what's rendered. That file is e2e-specs'/e2e-validate's surface, not web-tests', so I did
not touch it; flagging it here so it isn't lost between logs.
