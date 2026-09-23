# Plan: Frontmatter

**Created**: 2026-09-22
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: reader.spec.ts daemon (the file's existing fixture; every new or rewritten test launches its own session and asserts that session's reader — fresh per test, no reason to change)
**Features**: reader, lifecycle
*Amended 2026-09-23 (developer's call, after doc-reconcile blocked):* `lifecycle` added — review cycle 1's fix moved the plan-retention rule into `Manager.ApplyPlanScan` (`internal/session/manager.go`) and rewrote lifecycle-owned doc comments; review cycle 4 re-reviews with lifecycle in the pack.
**Closes**: #35, #46
**Description**: The reader renders a leading YAML frontmatter block as a key/value table instead of a heading blob, and a session's plan slot never empties once a plan has been named.

## Overview

Two reader defects from the "plan and document tab" group of `TODO.md`.

**#46 — frontmatter.** `web/src/reader/markdown.ts` hands a file's raw bytes straight to
`marked`. A leading `---` / `key: value` lines / `---` block parses as a thematic break followed
by a paragraph that the closing `---` promotes to a **setext `<h2>`** — so every kb record, agent
and skill file opens with one bold heading made of its whole frontmatter, and that heading is
also the first outline entry. The fix splits the block off before `marked` sees the text and
renders it the way GitHub does: a compact key/value table at the top of the body, values as
literal text. A block that is not flat `key: value` lines falls back to a preformatted block of
its raw text. No YAML library (`docs/conventions.md` § Stack — the schema here is "whatever the
file says", and the flat form is the only one we interpret).

**#35 — plan missing.** Not reproduced: it happened on another machine whose data is not
available, the plan was accepted into auto mode (no clear-context option), and every plan named
by a transcript on this machine still exists on disk, so nothing suggests Claude Code deletes
plans. What the code does show is that the plan slot is whatever the session's **latest**
transcript names, and `scanPlan` (`internal/server/reader.go:220`) writes `plan: null` whenever a
scan finds nothing — after `/clear` (measured: a fresh transcript, kb:fact/clear-mints-new-session-id),
and on a transcript that no longer exists (`LocatePlanFile` reads a missing file as "no plan";
Claude Code's transcript cleanup deletes old ones — unmeasured). The developer's call: **if the
session has had a plan, show it.** A scan that finds no plan never clears a known one; a scan
that finds a different plan replaces it; `exists` stays live. This closes the whole class of
"scan found nothing, slot emptied" routes rather than a root-caused one, which is the honest
scope of the #35 fix.

## Requirements

### Must Have
- [ ] REQ-1: When a file's text begins with a frontmatter block — an optional UTF-8 BOM, a line
  that is exactly `---`, zero or more lines, then a line that is exactly `---` (LF or CRLF line
  endings, trailing spaces/tabs on either fence line allowed) — that block's bytes never reach
  `marked`; the rest of the text (everything after the closing fence's line ending) is rendered
  exactly as it would be today.
- [ ] REQ-2: A frontmatter block whose non-blank, non-comment lines all match the flat form
  `^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$` renders as a key/value table — one row per
  such line, in file order, duplicates kept; key = group 1, value = group 2 with surrounding
  whitespace trimmed, `""` when absent. Values are shown verbatim: no quote stripping, no list
  parsing (`tags: [a, b]` shows `[a, b]`). Comment lines (first non-space char `#`) and blank
  lines are skipped.
- [ ] REQ-3: A frontmatter block with any other non-blank, non-comment line (a block-list item
  `  - x`, a continuation, a `|` scalar body, an unkeyed line) renders as one preformatted block
  containing the block's inner text (between the fences) verbatim.
- [ ] REQ-4: A frontmatter block with no non-blank, non-comment lines renders nothing; the block
  is still stripped.
- [ ] REQ-5: The frontmatter rendering (table or fallback) is the first child of the rendered
  body and is built from DOM APIs with `textContent` only — no file byte is ever parsed as HTML
  or markdown on this path (the same shape kb:adr/reader-diagram-failure-keeps-source-with-reason
  uses for its failure line). A value such as `<img src=x onerror=alert(1)>` appears as literal text.
- [ ] REQ-6: Frontmatter contributes no outline entry, and heading ids/dedup are computed over
  the body's headings only.
- [ ] REQ-7: A file whose first line is not exactly `---` (after an optional BOM), or whose opening
  `---` has no closing `---` line, renders exactly as today.
- [ ] REQ-8: Once a session's `plan` is non-null, a transcript scan that finds no plan (planless
  transcript, missing transcript) leaves `plan.path` unchanged; `plan.exists` is re-derived from
  the retained path's existence on that scan. A scan that finds a plan path sets it, replacing
  any previous one.
- [ ] REQ-9: The straggler gate is unchanged: a hook whose Claude session id the session has left
  never moves `plan` (kb:adr/reader-plan-located-by-transcript-scan).

### Should Have
- [ ] REQ-10: The frontmatter table reads as metadata, not content: it reuses `.md table`'s
  styling with the key column in the existing `th` treatment, sits above the body with the
  table's normal bottom margin, and never forces horizontal scroll in a compact tile (values
  wrap).

### Nice to Have
- none

## Protocol Contract

No wire-shape change. One semantic change to the Session object's `plan` (`kb:anchor/ws.session`),
merged into `docs/protocol.md` on approval — the comment block at the `plan` key becomes:

```jsonc
  "plan": { "path": "/Users/bob/.claude/plans/say-hi-golden-finch.md",  // absolute, as the transcript resolved it
            "exists": true }        // false = the path is known but no file is there (plan mode entered,
                                    //   nothing written yet; or the file was since deleted).
                                    //   null until a transcript of this session has named a plan (never
                                    //   entered plan mode). Once non-null it is never null again for the
                                    //   row's lifetime: a scan that finds no plan (a /clear's fresh
                                    //   transcript, a deleted transcript) keeps the path and re-checks
                                    //   exists; a scan that names a plan replaces it.
                                    //   Refreshed by the transcript scan (SessionStart, leaving plan mode,
                                    //   a write under the plans directory, GET /api/sessions/{id}/reader)
                                    //   and flipped to exists:true by a routed write naming the path.
                                    //   Required key. Renders "no plan yet" when null or exists is false.
                                    //   Display-only — never read by the state machine.
```

`GET /api/sessions/{id}/reader`'s `plan` follows (it is `session.plan` plus `writtenAt`); its text
needs no edit. `docChanged` needs none: a routed write naming the retained plan path still counts
("equals `session.plan.path`").

## Schema Changes

No schema changes required. `plan_path` / `plan_exists` (0008) already persist the value; the
change is that a planless scan stops overwriting them.

## UI Specifications

### Views
- Reader body (`article.md`), in all its hosts — Focus, every tile, the pop-out (`/doc.html`),
  which share the component (kb:adr/reader-popout-is-a-second-page). Governing design:
  `docs/design/design-system.md` (tokens only, no new colours) and the reader's existing `.md
  table` rules in `web/src/style.css` (~line 1004). No mockup draws frontmatter; the GitHub-style
  table is the developer's call (this plan).

### DOM
Flat block:
```html
<article class="md">
  <table class="frontmatter" aria-label="Frontmatter">
    <tbody>
      <tr><th scope="row">id</th><td>reader-plan-located-by-transcript-scan</td></tr>
      <tr><th scope="row">tags</th><td>[claude-code-format, store]</td></tr>
    </tbody>
  </table>
  …the sanitized body fragment…
</article>
```
Vertical (one row per key) rather than GitHub's one-header-row layout: kb records carry ~12 keys,
which as columns would overflow every tile. No `<thead>`.

Fallback block:
```html
<pre class="frontmatter"><code>…inner text verbatim…</code></pre>
```

### User Flows
1. Open a `.md` with flat frontmatter in the reader → table first, then the document; the outline
   starts at the document's first real heading.
2. Open one with nested YAML → the raw block in a preformatted box, then the document.
3. After `/clear` in a session that had a plan → the plan slot still shows the plan (badge, path),
   and opening it renders it.

### States
- No data yet: unchanged — the body placeholder carries `loading…` only while nothing has
  rendered (kb:adr/reader-loading-cue-never-clears-a-rendered-body). Frontmatter only exists once
  a file has rendered.
- Daemon down: unchanged — keep the last render, including its frontmatter table.
- Plan slot: `no plan yet` still renders when `plan` is null (never had one) or `exists` is false.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Frontmatter table | `table` | `Frontmatter` | native `<table>` + mandated `aria-label` |
| Frontmatter key cell | `rowheader` | the key, e.g. `status` | `<th scope="row">` |
| Frontmatter value cell | `cell` | the value verbatim, e.g. `[claude-code-format, store]` | `<td>` |
| Frontmatter fallback block | — | the block's inner text verbatim | `pre.frontmatter`; no implicit role — locator is e2e-specs' call |
| Plan slot, plan badge, no-plan text | — | as today (`helpers/reader.ts` `planSlotEntry`, `barPlanBadge`, `noPlanText` → `no plan yet`) | unchanged surfaces |

### Invariants
- **INV-FM-OUT**: frontmatter never produces a heading element in `article.md` and never an
  outline entry — from every block shape (flat, fallback, empty) and every line-ending/BOM
  variant.
- **INV-FM-TEXT**: nothing inside a frontmatter block ever becomes an element other than the
  table/row/cell/pre/code the plan defines (no `script`, `img`, `a`, event attribute).
- **INV-PLAN-STICKY**: once a session's `plan` is non-null it stays non-null for the row's
  lifetime. Source states it must hold from: after a `/clear` pair (either order), after a
  planless `SessionStart{startup|resume}`, after the transcript file is deleted and the reader
  lists, after a daemon restart, after a straggler hook, and with other sessions present (a scan
  of one session never touches another's plan).
  Paths walked against it: `scanPlan` (all four triggers route through it — SessionStart,
  ExitPlanMode Pre/Post, plans-dir write, reader listing) is the only caller that can pass an
  empty path to `SetPlan`; `observeWrite`'s exists-flip only sets `exists: true` on the current
  path; Reconcile and restart load the persisted row and never write `plan`. No other writer.

## Affected Files

### Daemon
- `internal/server/reader.go` — `scanPlan`: when the scan finds no plan and the session already
  has one, keep that path and re-derive `exists` by stat; one place owns the retention rule
  (the daemon-impl agent may put it in `scanPlan` or in `Manager.SetPlan`, and names which in
  Decisions — never both). Update the doc comments that say "plan: null" on a planless scan.

### Web
- `web/src/reader/frontmatter.ts` — **new**, pure (no DOM): `splitFrontmatter(text)` →
  `{ frontmatter: { kind: "entries"; entries: {key, value}[] } | { kind: "raw"; text: string } | null, body: string }`
  (exact names are web-impl's; the shape — pure, DOM-free, unit-testable — is required so REQ-1..4
  and REQ-7 route to web-tests).
- `web/src/reader/markdown.ts` — call the splitter first, feed only `body` to `marked`, build the
  table/fallback with `createElement` + `textContent`, prepend it to the returned fragment after
  the outline walk.
- `web/src/style.css` — `.md table.frontmatter` / `.md pre.frontmatter`: value wrapping
  (`overflow-wrap: anywhere`), key column `white-space: nowrap`, tokens only (contrast gate).
  *Amended (review cycle 1, browser Major 1, measured):* the key column's `nowrap` forced
  horizontal scroll in a 3×2 tile with the explorer open, contradicting REQ-10; the table uses a fixed
  layout with the key column at 40% width, and keys wrap inside it — REQ-10 governs (kb:adr/reader-frontmatter-key-column-may-break).
- `web/src/reader/CLAUDE.md` — hand-written part: one line naming `frontmatter.ts`.

### Tests (owners)
- web-tests: `web/src/reader/frontmatter.test.ts` — new.
- daemon-tests: `internal/server/reader_test.go` — new retention cases.
- e2e-specs: `web/e2e/reader.spec.ts` — new frontmatter tests; **rewrite E5 and E29**, whose
  current assertions (`no plan yet` after a `/clear` pair) this plan reverses; any fixture
  helper it needs goes in `web/e2e/helpers/reader.ts`.

## Edge Cases

1. `/clear` pair whose new transcript names no plan → plan slot keeps the old plan, badge shown → E1
2. `/clear`, then plan mode in the fresh transcript names a new plan → slot moves to the new plan → D3
3. `SessionStart{clear}` applied before the old id's `SessionEnd{clear}` arrives (late SessionEnd) → plan retained; the late SessionEnd triggers no scan → D4
4. `SessionEnd{clear}` applied, `SessionStart{clear}` lost → no rebind, no scan; plan unchanged → untested: nothing runs, identical to today's behaviour (no code path added)
5. Straggler hook from the pre-`/clear` id, carrying the old transcript, after the rebind → plan unchanged (retained old plan, no broadcast) → E2
6. Transcript deleted from disk, reader listing scans → plan retained, `exists` re-derived → D1
7. Retained plan file deleted, then a scan → path kept, `exists: false`, slot shows `no plan yet` → D2
8. Session that never had a plan, planless scan → `plan` stays null, no broadcast → D5
9. Daemon restart after a retained-plan `/clear` → plan loads from the row (no new code; `plan_path` never overwritten) → untested: the persistence path is unchanged and E28 already covers plan-after-restart
10. Another session present during one session's planless scan → its plan untouched → D6
11. Frontmatter opening `---` with no closing fence → rendered as today → W1
12. `---` not on the first line → not frontmatter → W2
13. CRLF line endings → recognised; body keeps its CRLFs → W3
14. Leading UTF-8 BOM → recognised → W4
15. Trailing whitespace on a fence line → recognised; `----` or `--- x` is not a fence → W5
16. Nested YAML (block list, `|` scalar, continuation) → raw fallback → W6
17. Empty block (`---\n---\n`) or comments-only → nothing rendered, stripped → W7
18. Duplicate keys, empty value (`key:`), value containing `:` (`url: http://x`) → rows in order, value after the first `: ` → W8
19. A later `---` in the body (a thematic break) is untouched → W9
20. File that is only frontmatter → table, empty body, empty outline → E3
21. A value carrying HTML (`<img onerror>`, `<script>`) → literal text, no element → E4
22. Fallback block's text renders verbatim with no heading → E5
23. A `# heading`-looking line inside a raw block never reaches the outline → E5 (shared with edge case 22)

## Acceptance Criteria

### Daemon
- **D1**: with a session whose plan is set, deleting its transcript and requesting the reader listing leaves `plan.path` unchanged.
- **D2**: with a session whose plan is set, deleting the plan file and running a planless scan yields `plan.exists == false` with the path unchanged, broadcast once.
- **D3**: a scan whose transcript names a different plan path replaces the retained plan and broadcasts it.
- **D4**: after a `/clear` rebind delivered SessionStart-first, the session's plan equals the pre-clear plan.
- **D5**: a planless scan on a session with no plan broadcasts nothing and leaves `plan` null.
- **D6**: a planless scan of one session leaves every other session's plan unchanged.
- **D7**: the retention rule is implemented in exactly one function, named in the daemon-impl log's Decisions.

### Web
- **W1**: `splitFrontmatter` returns `frontmatter: null` and the input unchanged for an unclosed opening fence.
- **W2**: `splitFrontmatter` returns `frontmatter: null` when `---` is not the first line.
- **W3**: CRLF input is recognised and the returned body is byte-identical to the text after the closing fence's line ending.
- **W4**: a leading BOM is recognised and not included in the body.
- **W5**: fence lines with trailing spaces/tabs are recognised; `----` and `--- x` are not fences.
- **W6**: a block containing any non-flat line returns `kind: "raw"` with the inner text verbatim.
- **W7**: an empty or comments-only block returns no entries and a body with the block stripped.
- **W8**: duplicate keys, empty values and values containing `:` produce entries in file order with the value after the first `: `.
- **W9**: a thematic break later in the body is left in the body.
- **W10**: frontmatter DOM is built with `createElement` and `textContent` only — no HTML-string parse anywhere on the frontmatter path.

### E2E
- **E1**: after a `/clear` pair naming a planless transcript, the plan slot still shows the pre-clear plan with its badge (rewritten E5).
- **E2**: a straggler Write hook from the pre-clear id after the rebind leaves the plan slot showing the retained plan (rewritten E29).
- **E3**: opening a file with flat frontmatter shows a `Frontmatter` table as the body's first element with one row per key, and the outline's first entry is the document's first real heading.
- **E4**: a frontmatter value carrying `<img src=x onerror=…>` and `<script>` shows as literal text and no `img` or `script` element exists in the body.
- **E5**: opening a file with nested-YAML frontmatter shows the raw block verbatim in `pre.frontmatter` and no body heading or outline entry contains frontmatter text.
- **E6**: a file with no frontmatter renders exactly as before (existing E15/E17 pass unchanged).

### Automated Checks

```checks
D0 go build ./...
D8 make test
D9 make lint
D10 make test-race
W11 make web-build
W12 make web-test
W13 make web-lint
E7 make e2e
K1 make check-kb
```

No negative grep: the frontmatter module does not exist yet (a `! rg` over a missing path passes
vacuously) and `markdown.ts` legitimately talks to DOMPurify, so W10 is reviewer-verified.

### Reviewer-Verified
- **D7** (above).
- **W10** (above): read `frontmatter.ts` and the frontmatter path in `markdown.ts`.
- **W15**: no `any` in new web code.
- **W16**: the table wraps long values in a 3×2 tile without horizontal scroll (REQ-10).
- **W17**: no heading element in `article.md` contains frontmatter text for the flat, raw and empty shapes, in Focus and the pop-out (INV-FM-OUT).

## Doc Delta

**reader** (`docs/features/reader/spec.md`) — becomes true:
- § Locating the plan: "The result is the Session object's `plan` (`kb:anchor/ws.session`): the path and whether the file exists — null until a transcript names one, and never null again once it has; a scan that finds nothing keeps the last plan."
- § The reader: "A leading YAML frontmatter block renders as a key/value table above the body (raw when not flat) and never reaches the outline."

**reader** — stops being true:
- § Locating the plan: "…the path and whether the file exists, null when the latest transcript names none." (replaced by the sentence above).

Body length: 687 words today, about 724 after (+15, +22); under the 800 cap with no other cut. The mermaid sentence in § The reader stays as it is.

**`docs/protocol.md`** — the Session object's `plan` comment, per § Protocol Contract (merged at approval, not by doc-reconcile).

## Out of scope

- Nested YAML rendered as nested tables (GitHub does this). The raw fallback is the honest render; revisit if it is ever the common case.
- TOML (`+++`) frontmatter.
- A history of past plans per session (after `/clear` plus a new plan, only the latest is reachable).
- Reproducing #35 on the other machine.

## Implementation Notes

- Decisions this plan makes, each a `status: proposed` ADR at approval:
  - `kb:adr/reader-plan-sticky-once-named` — a planless scan never clears a known plan (refs `kb:adr/reader-plan-located-by-transcript-scan`, which it refines and does not supersede: that ADR's decision text never said "null on clear").
  - `kb:adr/reader-frontmatter-flat-table-raw-fallback` — flat `key: value` block → key/value table via `textContent`; anything else → raw preformatted block; no YAML library.
- kb:fact/clear-mints-new-session-id is the measured route; the deleted-transcript route is inferred from `LocatePlanFile`'s `ErrNotExist` branch and is not a measured Claude Code fact.
- The frontmatter DOM sits outside DOMPurify on purpose: it never parses file bytes as markup, which is the boundary kb:adr/reader-diagram-svg-crosses-dompurify protects (the diagram-failure line set the precedent).
- Doc upkeep (orchestrator): at Completion move the #35 and #46 entries from `TODO.md` to `docs/history/todo-done.md`, flip both ADRs to accepted, add `web/src/reader/frontmatter.ts` to `kb:adr/reader-frontmatter-flat-table-raw-fallback`'s `files` once it exists (kb check refuses a missing path at approval), `make gen-kb`.
