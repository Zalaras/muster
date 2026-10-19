# Plan: search-bar-text-length

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: reader-search.spec.ts daemon (the file's existing per-test choice: the reader auto-opens on the only session in Focus)
**Features**: reader, reader-find
**Touches**: ingest
**Description**: The reader's find bar count reads "No results" instead of going blank, and reserves room for its longest text so the bar keeps one width.

## Symptom

From `TODO.md` › Docs reader ([#102](https://github.com/Zalaras/muster/issues/102)):

> **Search box in docs should go to the first arrow** — In the docs search box there is a large
> gap between the text input and the first arrow button. Expected: The gap between the text input
> and the first arrow button should be small, like the gap between the two arrow buttons.

The issue's screenshot shows the bar just opened, query empty: a wide empty space between the
query box and the ↑ button.

## Findings

Measured in Playwright's Chromium against a scratch daemon, Focus view, one reader:

| Query | Count text | Count width | Bar width | Bar left edge |
|---|---|---|---|---|
| (empty) | `` | 47 px | 267 px | 757 |
| `quokka` | `1 of 150` | 54 px | 273 px | 751 |
| `zzzz` | `no matches` | 68 px | 287 px | 737 |

- The gap is the count's reserved width with nothing in it: `.find-count { min-width: 7ch }`
  (`web/src/style.css:1546`; `6ch` in compact tiles at `:1571`) plus the bar's 4 px gap on each
  side — 56 px from the query box to ↑, against 4 px between the arrows.
- `countText` (`web/src/reader/find.ts:64`) returns `""` for an empty query, per the
  docs-search-bar plan's REQ-6; no ADR or spec sentence records that choice.
- The reserved width is also narrower than the texts it holds, so the right-anchored bar grows
  leftwards by 20 px as the count changes.

The developer chose VS Code's pattern (2026-10-19): the count never goes blank — it reads
`No results` while the query is empty and when nothing matches, `<i> of <n>` otherwise.

## Requirements

### Must Have

- **REQ-1**: With the bar open and the query empty, the count reads `No results`.
- **REQ-2**: With a non-empty query that matches nothing, the count reads `No results`
  (replacing `no matches`). With matches it reads `<i> of <n>` as today.
- **REQ-3**: The bar's width and left edge are the same with an empty query, a query showing a
  count of up to `999 of 999`, and a query with no matches — in Focus and in a compact tile.

## Affected Files

### Web (web-impl)

- `web/src/reader/find.ts` — REQ-1, REQ-2: `countText` returns `No results` for an empty query
  and for zero matches.
- `web/src/style.css` — REQ-3: `.find-count` and `.reader.compact .find-count` reserve the width
  of their longest text (`999 of 999`, 10 characters).

### Existing tests this breaks

- `web/src/reader/find.test.ts`: `countText (W3)` expects `""` and `no matches`.
- `web/e2e/reader-search.spec.ts`: asserts an empty count (`/^$/`) and `no matches`.
- `web/e2e/helpers/reader-search.ts`: its header describes the count as `no matches` or empty.

## Proof

- **web-tests**: `web/src/reader/find.test.ts` › `countText (W3)` — the rows for an empty query
  and zero matches expect `No results`; red today (`""`, `no matches`).
- **e2e-specs**: `web/e2e/reader-search.spec.ts` — the existing `/^$/` and `no matches`
  assertions become `No results`, and a new test opens the bar in Focus and in a compact tile and
  asserts the bar's width and left edge are equal (±0.5 px) across an empty query, a `1 of N`
  count and a no-match query; red today.

## Edge Cases

1. Closed bar — the count is not shown, nothing to read. → untested: the bar is hidden.
2. A current match past 999 (`1000 of 1234`, 12 characters) — the bar widens by two characters. →
   untested: accepted, documents that size are rare.

## Acceptance Criteria

### Automated Checks

```checks
W1 cd web && npx vitest run src/reader/find.test.ts
E1 cd web && npx playwright test reader-search.spec.ts
W2 make web-lint
```

### Reviewer-Verified

- In Chrome, the opened bar shows `No results` between the query box and ↑, with no blank gap.

## Doc Delta

**reader-find** — becomes true: the count reads `No results` while the query is empty or
matches nothing, `<i> of <n>` otherwise, and the bar keeps one width as it changes.

## Out of scope

Nothing.
