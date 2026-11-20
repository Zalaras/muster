# Doc delta — diff-viewer

Seeded from `plan.md` § Doc Delta and amended by the orchestrator with every `doc-delta:` line in
the implementation logs (fix waves included) and with what the review cycles changed. `plan.md`
stays as approved; this file is doc-reconcile's input.

## diff — becomes true

- `docs/features/diff/spec.md` (authored at approval) states REQ-1 to REQ-28 as present-tense product
  truth: the button and size row, the viewer's scopes and views, word highlight, Review flips, ticks
  and change map, comments and their following, the staleness bar, keys, storage lifetime, privacy
  and the absence of size caps; its protocol list is `diff.summary`, `diff.read`, `diff.review`,
  `diff.comment`, `diff.comment-delete`, `diff.ticks`.
- The daemon reads git without writing the repository: tracked changes are read against a scratch
  copy of the index, so no byte under the git directory changes and no lock is taken, even for a
  checkout holding stat-dirty unchanged files (daemon log, review cycle 1 fix;
  kb:adr/diff-read-only-git-cli carries the mechanism — the spec need only keep "never writes to the
  repository").
- Amended (review cycle 3, web-impl Fix Attempt "merge of main"): picking or creating a terminal from
  the Terminals menu closes the viewer like a segment click; opening the menu, renaming or closing a
  terminal from it does not.
- Amended (review cycle 3 Minor wave, 9733b859): Escape closes an open popover menu (the Terminals
  menu) first, wherever focus is, and only then works through the viewer's own order (comment box,
  selection, the viewer).

Frontmatter globs: already registered by the orchestrator as each file appeared —
`go: [internal/gitdiff/*.go, internal/server/diff*.go, internal/session/diffreview*.go]`,
`web: [web/src/features/diff*.ts, web/src/render/diff*.ts, web/render/diff*.spec.ts, web/render/helpers/diff*.ts]`,
`e2e: [web/e2e/diff*.spec.ts, web/e2e/helpers/diff*.ts]`. `web/src/api/diff.ts` is owned by
connection's `web/src/api/*` glob, so it is not listed under diff.

## diff — stops being true

Nothing (new feature).

## focus — becomes true

- `docs/features/focus/spec.md`: "The row under the pane holds the size note, stating the pane's real
  geometry, and at its right end the diff button while the session's checkout has changes or open
  comments (kb:spec/diff); the row shows with only the button where the pane has no size note."
- `docs/features/focus/spec.md`: the main slot shows the diff viewer while it is open (kb:spec/diff).

## focus — stops being true

- "A size note under the pane states the pane's real geometry." (replaced by the row sentence.)

## surfaces — becomes true

- `docs/features/surfaces/spec.md`, amended for main's Terminals menu (merged at 8f4ae1c9; review
  cycle 3 correctness Major 1): "While the diff viewer is open no segment of the surface switch is
  selected; choosing a segment, or picking or creating a terminal from the Terminals menu, closes the
  viewer and shows that surface; opening the menu, or renaming or closing a terminal from it, leaves
  the viewer open; closing the viewer any other way returns to the surface that was selected
  (kb:spec/diff)."

## surfaces — stops being true

Nothing.

## protocol — becomes true (`docs/protocol.md`, the six diff anchors)

From the daemon log's doc-delta lines, where the contract left the case open:
- A request body that is not JSON answers `400 invalid_request` with message `request body is not valid`.
- A JSON `null` for a required key reads as missing (`400`).
- A ticks or comment body over 1 MiB answers `413`.
- A malformed session id answers `404`, as every session route does.
