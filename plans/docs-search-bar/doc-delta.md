# Doc delta: docs-search-bar

Seeded from `plan.md` § Doc Delta, then amended by the orchestrator with every `doc-delta:` line in
`web-implementation.md` (initial run and the review cycle 1 fix wave, Fix Attempt 2).

## reader-find — `docs/features/reader-find/spec.md` (new feature, split from reader 2026-10-17)

The developer chose (2026-10-17, doc-reconcile blocked on the reader spec's 800-word budget) to give the find bar its own feature spec. The orchestrator created it with frontmatter and a two-line stub body; write its body from these claims.

Becomes true:
- A find bar — an icon at the body's top-right, or Command-F in the reader — highlights case-insensitive matches in the rendered document alone (kb:adr/reader-find-highlights-via-css-highlight-api).
- While the bar is open it reserves the top of the reading area, so no match ever sits under it; the current match is revealed against the bar's bottom edge, and stepping scrolls every horizontal scroll container between the match and the body (a code block, a table, a diagram) as well as the body itself. (From `web-implementation.md` Fix Attempt 2 `doc-delta:`.)
- An open bar keeps its query across a re-render and a file switch; on a user-initiated switch the first match is revealed again once the file's diagrams have rendered, unless the developer typed or stepped meanwhile (kb:adr/reader-find-query-follows-file-switch; Fix Attempt 2 `doc-delta:`).

Also true of what shipped (verified by review cycle 4): closing the bar at any scroll position, the end of the body included, leaves the text where it was; only within the bar's own height of the top can it move, since scrollTop cannot go below zero.

Below the spec's level of detail (do not promote): the typing debounce (120 ms, rising to 800 ms in very large documents), the 44 px / 38 px clearance values, the highlight names.

Stops being true:
- nothing.

## reader — `docs/features/reader/spec.md`

Becomes true:
- At most one sentence pointing at the find bar (kb:spec/reader-find); its behaviour lives there, not here. The reader spec is at 774 of 800 words.

Stops being true:
- nothing.

## shortcuts — `docs/features/shortcuts/spec.md` chord list

Becomes true:
- Command-F opens the find bar of the reader holding keyboard focus (Focus, tile or pop-out), and is otherwise left to the browser (kb:spec/reader-find). Already promoted by doc-reconcile's first pass, commit 375751b0 — update its citation from kb:spec/reader to kb:spec/reader-find if it cites the reader.

Stops being true:
- nothing.

## Already applied by the orchestrator (verify only)

- `docs/design/design-system.md` § 1 token table: `--find-match` / `--find-current` row (impl log `doc-delta:` line 44; commit 388806c8).

## Not a doc edit

- `web/src/features/shortcuts.ts` header still says it is the one window listener "for every bound chord" (impl log line 45). That is a code comment, so it belongs to the comment pass, not to this delta.
