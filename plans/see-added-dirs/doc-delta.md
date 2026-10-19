# Doc delta — see-added-dirs

Seeded from plan.md § Doc Delta, then amended with the implementation logs' `doc-delta:` lines.

**card-location** — becomes true:
- `docs/features/card-location/spec.md` has an `## Added directories` section saying: the session's
  added directories come from every status post's `workspace.added_dirs`, launch directory removed,
  normalised like Claude's directory; they are empty until the first such post after a launch or
  resume and on every dead session, kept by `/clear` and a daemon restart; each directory's git
  reading is refreshed by the repo poll, and a missing directory keeps its last one.
- Its closing line names the Focus header as the only surface that renders `addedDirs`.

**card-location** — stops being true:
- nothing (no current sentence is contradicted; the frontmatter summary gains "and the directories
  added to it").

**focus** — becomes true:
- `docs/features/focus/spec.md` says the folder line ends in `+N` while directories are added, and
  that hovering the readout with the mouse opens a panel listing the location, where Claude is
  while moved, and each added directory with its branch and path.

**focus** — stops being true:
- "The session name and the repo readout carry hover text (the name's is its full title; the
  readout's is the launch path and branch, plus where Claude is when it has moved)." becomes "The
  session name carries hover text (its full title); the repo readout opens the location panel."

**design-system** (orchestrator's Doc-Upkeep Backstop) — `docs/design/design-system.md` § "Focus
mainhead": "The location group carries a hover `title` …" is replaced by the panel sentence above.

**design-system** — done by the orchestrator in `docs(see-added-dirs): doc upkeep` (162606d0); nothing for doc-reconcile.

## From the implementation logs

- (daemon-implementation.md) **card-location** — the `## Added directories` section says each
  directory is normalised like Claude's directory: absolute, cleaned and symlink-resolved; a
  relative entry resolves against the launch directory; an entry that does not exist is only
  cleaned (an unresolvable path keeps its spelling), as `claudeLocation` is.
- (daemon-implementation.md) store-schema "0001-0016" → "0001-0017": done by the orchestrator
  (diagram record, 162606d0); nothing for doc-reconcile.
- (web-implementation.md) **focus** — the readout's folder line reads `<repo>+N` with no ` /`
  while directories are added (`muster+2`), and `<repo> /` as today while none are.


## From review cycle 1's fix wave

- (daemon-implementation.md, Fix Attempt 1) **card-location** — the repo poll reads the added
  directories under their own deadline, so a long list never stops the launch directory's branch,
  worktree flag and `claudeLocation` refreshing; a directory whose read did not finish keeps its
  last-known reading. A worktree flag compares resolved paths, so a subdirectory of an ordinary
  checkout is not a worktree (and one inside a linked worktree is).
- (web-implementation.md, Fix Attempt 1) **focus** — while the location panel is open it follows the
  focused session: rebuilt when its content changes, closed when there is no session, never an
  Added section once the session has ended.
- (decisions/location-panel-overflow, outcome B) **focus** — the panel lists every added directory;
  past what fits below the readout it moves to the top of the viewport, over the header, and rows
  past the viewport are not shown (kb:adr/focus-location-panel-lists-every-row).
- (web-implementation.md) web-components module count and `web/src/render/CLAUDE.md`: done by the
  orchestrator (ab7f554b, ada17703); nothing for doc-reconcile.
