# Web Implementation: Frontmatter

**Plan**: frontmatter
**Mode**: initial
**Pack**: kb: pack 8132 words (budget 8000) — sections: rules 1053 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 2196 · runbooks 2 (WARN: pack exceeds budget of 8000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/reader/frontmatter.ts` | created | Pure `splitFrontmatter(text)` (REQ-1..REQ-4, REQ-7, W1-W9): detects the leading BOM/`---`/lines/`---` block, strips it, and classifies the inner text as `{kind:"entries"}` (flat `key: value` lines, REQ-2), `{kind:"raw"}` (any other non-blank/non-comment line, REQ-3), or `null` (no block, unclosed block, or empty/comments-only block, REQ-4/W7) |
| `web/src/reader/markdown.ts` | edited | `renderMarkdown` calls `splitFrontmatter` first, feeds only `body` to `marked`; after the existing outline walk (unchanged), builds the frontmatter table/`pre.frontmatter` fallback via `createElement`/`textContent` only and prepends it to the fragment (REQ-5, REQ-6, REQ-10) |
| `web/src/style.css` | edited | `.md table.frontmatter` gets `width: 100%`, key column `width: 1%; white-space: nowrap`, value column `overflow-wrap: anywhere` — reuses `.md table`/`.md th`/`.md td`'s existing tokens/rules as-is (no new tokens); makes the table wrap instead of forcing horizontal scroll in a compact tile (REQ-10) |
| `web/src/reader/CLAUDE.md` | edited | One line adding `frontmatter.ts` to the Owns list, per Affected Files |

No daemon files touched (`internal/server/reader.go` is daemon-impl's, running in parallel — left alone per instructions). No protocol-contract edits: `docs/protocol.md`'s `plan` comment already carried the plan's delta when the kb pack was generated.

## Decisions

- Every REQ-1..REQ-10 this plan lists for web is implemented in the Changes table above. No REQ deliberately skipped.
- design: `frontmatter.ts` follows `slug.ts`'s exemplar shape (pure, no DOM, one derivation per module) — `docs/conventions.md`'s reader CLAUDE.md names `slug.ts` as the copy-this-shape exemplar; grepped `web/src/reader/*.ts` for an existing frontmatter/YAML splitter first (`rg -il "frontmatter" web/src` before writing → no hits), so this is new, not a duplicate.
- design: the frontmatter DOM builders (`buildFrontmatterTable`/`buildFrontmatterFallback`) live in `markdown.ts`, not a new `render/` module, per the plan's own Affected Files instruction ("build the table/fallback with createElement + textContent" listed directly under `markdown.ts`, not as a new file) — `markdown.ts` already mixes DOM-building into this otherwise-pure directory (documented exception in `reader/CLAUDE.md`) because DOMPurify needs a real `window`, so the frontmatter node-building joins that existing exception rather than starting a second one.
- design: state ownership — `splitFrontmatter`'s output is consumed once per `renderMarkdown` call and never retained across render passes; no memoization/reuse concern (unlike the focusable-control rule) since neither the table nor the `pre` fallback holds any browser-only state (no focus, no caret, no scroll position) — they're read-only readouts rebuilt every render like the rest of the body fragment.
- The `.md table`/`.md th`/`.md td`/`.md pre`/`.md pre code` rules already select any table/pre inside `article.md` regardless of class, so REQ-10's "reuses `.md table`'s styling" happens for free; only the wrap/no-horizontal-scroll behaviour needed new, token-only CSS (no color/font/spacing literal added — `.md table.frontmatter` reuses existing selectors' `border`, `color`, `background` etc., the new rules are layout-only: `width`, `white-space`, `overflow-wrap`).
- No size-warning kept on purpose: `make size-warn` shows no new hits for `frontmatter.ts` or `markdown.ts` (both files are well under the 500-line/funlen thresholds).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

**Locator defect found while running the plan's own E2E specs (not mine to edit — `web/e2e/helpers/reader.ts` is e2e-specs'/web-tests' surface):**

`frontmatterRow()` in `web/e2e/helpers/reader.ts` (used by `frontmatterKeyCell`/`frontmatterValueCell`, which the E3 and E4 tests in `web/e2e/reader.spec.ts` depend on) builds its `.filter({ has: ... })` inner locator off `table` instead of off `page`:

```ts
function frontmatterRow(region: Locator, key: string): Locator {
  const table = frontmatterTable(region);
  return table
    .locator("tr")
    .filter({ has: table.getByRole("rowheader", { name: key, exact: true }) });
}
```

Playwright's `.filter({ has })` re-applies the **inner locator's full selector chain** scoped to each `tr` candidate. Because the inner locator here was built as `table.getByRole(...)`, the reapplied chain looks for a nested `<table>` *inside* each `<tr>` — which never exists — so the filter always matches zero rows regardless of what's actually rendered. I confirmed this is a locator defect, not a rendering defect, two ways:

1. Isolated repro (`page.setContent` with a plain two-row table, no daemon/reader involved): `table.locator("tr").filter({ has: table.getByRole(...) })` times out with "element(s) not found"; the identical query built as `table.locator("tr").filter({ has: page.getByRole(...) })` (rooted at `page` instead of `table`) resolves in 160ms.
2. `npx playwright test e2e/reader.spec.ts -g "opening a file with flat frontmatter shows a Frontmatter table..."` (E3) and `-g "a frontmatter value carrying <img onerror>..."` (E4) both fail at the `frontmatterKeyCell`/`frontmatterValueCell` call — but the failure's own `error-context.md` accessibility snapshot shows the table rendered exactly right: `table "Frontmatter": rowgroup: row "id reader-plan-located-by-transcript-scan": rowheader "id", cell "reader-plan-located-by-transcript-scan"` etc. The count-only assertion one line above each failure (`frontmatterKeyCells(region)).toHaveCount(3)`) passes, confirming three real rowheaders exist; only the per-key `.filter({has: table.getByRole(...)})` lookup fails.
3. E5 (`opening a file with nested-YAML frontmatter...`), which uses `frontmatterFallback` (a plain CSS `pre.frontmatter` locator, no `.filter({has})`), passes cleanly, and all four pre-existing E6 regression pins (E15, E16, E17, edge-case-26 dedup) still pass — so `markdown.ts`'s change doesn't regress ordinary rendering.

Fix (for whichever agent owns this helper next): change `has: table.getByRole(...)` to `has: page.getByRole(...)` (or any locator not chained off `table`) in `frontmatterRow`. I did not make this edit — `web/e2e/helpers/reader.ts` is outside my constraints (not a test file I broke; it's e2e-specs' authored helper). No test files needed changes from my own refactors.

No other test files needed changes.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Major 2 and browser Major 1 from `plans/frontmatter/review.md` cycle 1. Both are `[web-impl]` findings; the daemon Major, the daemon-tests Major, the e2e-specs Major and the orchestrator's diagram-drift note belong to other roles.

**Changes made**:

1. **correctness Major 2 — reversed `/clear` comments.** Two web comments still described the pre-REQ-8 behaviour (plan nulled by `/clear`) instead of the sticky-once-named rule REQ-8 actually ships.
   - `web/src/protocol.ts:112-118` (`SessionPlan`'s doc comment): rewritten to match `docs/protocol.md`'s `plan` comment (`docs/protocol.md:926-938`) — null only until a transcript first names a plan, then sticky for the row's lifetime; a planless scan (`/clear`'s fresh transcript, or a deleted transcript) keeps the path and re-checks `exists`; only a scan naming another plan replaces it. Added the `exists: false` deleted-file case the old comment omitted, and cited `kb:adr/reader-plan-sticky-once-named`.
   - `web/src/features/reader.ts:449-453` (`buildBarVM`'s fallback comment): dropped the "must not resurrect the old plan's badge" framing (E5 now asserts the opposite — the badge *does* stay after `/clear`) and restated why the listing-fallback branch still exists: only for the rare case `session` itself isn't known yet, not for surviving a `/clear`. The `session`-is-authoritative rule itself is unchanged, per the review's instruction.
   - I grepped the full tree for other instances of the same reversed claim in web code (`rg -n "clear.{0,20}(null|plan)" web/src --glob '!*.test.ts' -i` plus a manual read of every `/clear` mention in `web/src`) and found no third site — these two were the only ones the review named and the only ones present.

2. **browser Major 1 — frontmatter table forces horizontal scroll in a 3×2 tile with the explorer open.** `web/src/style.css`'s `.md table.frontmatter` rules (previously `th { width: 1%; white-space: nowrap }`) let a long or underscore-only key (no space/hyphen break opportunity) size the key column to its full content width, leaving ~30px for the value column and forcing `article.md` to scroll horizontally. Per the orchestrator's plan amendment, REQ-10 supersedes the plan's Affected Files `nowrap` instruction.
   - First attempt: `th { width: 1%; max-width: 40%; overflow-wrap: anywhere }` (auto table layout, `max-width` as a hint). Measured with a throwaway Playwright script against the real built CSS (`internal/webui/assets/assets/ws-*.css`) and a 233px-wide `article.md` (the reviewer's tile-with-explorer-open width): a 60-char key still gave `scrollWidth 525 > clientWidth 233` — auto layout only takes a cell's `max-width` as an input to its content-based sizing, not a hard cap, so an unbreakable-looking run of characters still grew the table past the container even with `overflow-wrap: anywhere` present.
   - Fix: added `table-layout: fixed` to `.md table.frontmatter`, changed the key column to a real (not `max-`) `width: 40%`, dropped `white-space: nowrap` in favor of `overflow-wrap: anywhere` alone. Fixed layout makes column widths authoritative from the declared widths rather than derived from content, so the 40% is a hard cap the browser must wrap inside.
   - Re-measured (same throwaway script, same built CSS, `article.md` 233px wide, `overflow-x: auto`): `verified_claude_code_version` (29-char key, the reviewer's `fact.md` example) → `scrollWidth 233 == clientWidth 233`; a 60-char key → `scrollWidth 233 == clientWidth 233` (was `525 > 233` before the fix). Also re-ran the same 11-row mix (including the 60-char key) at all four host widths the browser review used — 233 (tile, explorer open), 423 (tile, explorer closed), 744 (Focus), 1044 (pop-out) — all four came back `scrollWidth == clientWidth`.
   - Blast radius: `.md table.frontmatter`/`th`/`td` are new selectors this plan introduced (not shared with any other table on the page — `.md table` unscoped rules are untouched), so the only consumer is the frontmatter table itself; `rg -n "table\.frontmatter" web/src --glob '!*.test.ts'` shows exactly `style.css` (the 3 rules) and `markdown.ts` (`table.className = "frontmatter"`), confirming no other CSS or markup depends on the old `width: 1%`/`nowrap` behaviour.
   - Rebuilt with `make web-build build` before every measurement pass (three times total, once per CSS iteration), per the fix-mode instruction.

**Verification**: `npx tsc --noEmit` (clean), `npm run build` (clean), `npm run -s lint` (Checked 179 files, no fixes applied), `make size-warn` (no new hits attributable to these edits — `web/src/protocol.ts`, `web/src/features/reader.ts` and `web/src/style.css` size warnings, if any, are pre-existing and unrelated to the touched lines), `python3 .claude/skills/orchestrate/scripts/dead-refs.py` (579 checked, 0 missing). `make web-build build` then `npx playwright test e2e/reader.spec.ts` from `web/`: **52 passed** (18.7s), including the plan's own frontmatter E3/E4/E5 specs and the REQ-8 `/clear`-retention E1/E2 specs.

**Decisions**: no new `deviation:` or `doc-delta:` line. The CSS change is exactly the amendment the orchestrator already recorded (REQ-10 supersedes the plan's `nowrap` instruction) — not a fresh deviation of my own. The two comment rewrites bring the code in line with `docs/protocol.md`, which the correctness reviewer confirmed already carries the current text; no doc content changes as a result.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: maintainability Minor 1 from `plans/frontmatter/review.md` cycle 2 — the two comments added in the cycle-1 fix (`web/src/style.css:1035-1048`, `web/src/features/reader.ts:451-453`) narrated history (the failed first CSS attempt, the Playwright-measured `scrollWidth`/`clientWidth` numbers, "This supersedes the plan's Affected Files instruction … (review cycle 1, browser Major 1 …)"; "Since REQ-8 … so this fallback is no longer about surviving a `/clear`; E5 now asserts …") instead of stating the current reason, per `docs/conventions.md` § Comments ("don't narrate history").

**Changes made** (comment-only; no CSS rule or code touched — confirmed with `git diff -- web/src/style.css web/src/features/reader.ts`, which shows only comment-block lines changed):

1. `web/src/style.css:1035-1041` (comment above `.md table.frontmatter`): rewritten to state only the current constraint — the table reuses `.md table`/`.md th`/`.md td`'s existing selectors/tokens; auto table layout treats a cell's `width`/`max-width` as a hint rather than a constraint, so a long or underscore-only key can still grow the table past the article and force scroll; `table-layout: fixed` makes the declared widths authoritative, so the 40% key-column width is a hard cap the browser must wrap inside. Dropped the failed-first-attempt narrative, the `scrollWidth 525 > clientWidth 233` measurement, and the "supersedes the plan's Affected Files instruction (review cycle 1, browser Major 1 …)" framing — that history already lives in this file's Fix Attempt 1 section above.
2. `web/src/features/reader.ts:449-451` (comment above `buildBarVM`'s `planPath` fallback): rewritten to state only that the listing's own plan path is a fallback for the rare case `session` itself isn't known yet, citing `kb:adr/reader-plan-sticky-once-named` for the sticky-once-named rule the `session` branch itself implements. Dropped "Since REQ-8 a `/clear` keeps the retained plan … so this fallback is no longer about surviving a `/clear`; E5 now asserts the badge stays after one" — that's what the code used to be for, not what it does now; the Fix Attempt 1 section above already carries that history.

I swept for other instances of the same category before restricting to these two: `grep -rn "review cycle 1" web/src/` and `grep -rn "REQ-10\|REQ-8" web/src/` turned up many hits, but every other one either cites a requirement number as a stable current-behaviour anchor (the repo-wide convention, e.g. `web/src/reader/tree.ts`'s `REQ-10: nests every relative .md path…`) or predates this plan entirely (`web/src/style.css:1334`'s "used to be written on the bare class" is from the unrelated `m4-reconcile` plan, confirmed via `git log --oneline -S"used to be written on the bare class" -- web/src/style.css` → commit `cceb5b7 feat(m4): reconcile on start...`, not touched by any frontmatter-plan commit) or is a test file I may not edit (`web/src/render/masthead.test.ts:947`). `git show ad98454 --stat` (the cycle-1 fix commit that introduced the two flagged comments) confirms it touched exactly `web/src/features/reader.ts`, `web/src/protocol.ts`, `web/src/style.css` and the plan log; `web/src/protocol.ts`'s comment from that same commit (`SessionPlan`'s doc comment, lines 112-118) states only current behaviour with no "used to be"/"no longer"/review-cycle narration, so it needed no change.

**Verification**: `npx tsc --noEmit` (clean, no output), `npm run build` (clean, exit 0 — only the pre-existing chunk-size-warning notice, unrelated to these files), `npm run -s lint` ("Checked 179 files in 173ms. No fixes applied."), `python3 .claude/skills/orchestrate/scripts/dead-refs.py` ("611 references checked, 0 missing" — confirms `kb:adr/reader-plan-sticky-once-named` and every other citation in the touched comments still resolves).

**Decisions**: no new `deviation:` or `doc-delta:` line — this fix only restates existing comments to match `docs/conventions.md` § Comments; no behaviour, doc claim, or REQ coverage changed.
