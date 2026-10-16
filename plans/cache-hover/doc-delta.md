# Doc delta: cache-hover

Seeded from `plan.md` § Doc Delta, then amended with the `doc-delta:` lines in
`web-implementation.md` and `test-specs.md` as they stand after review cycle 2. The one log line
(`web/src/render/CLAUDE.md` could name `cardtip.ts`) was already done in `cd5a425c`. `plan.md`
stays as approved.

## rail (`docs/features/rail/spec.md`)

Becomes true:
- The card timer names the warmth in its own hover panel, on the rail card and on the Tiles strip
  card alike. The panel opens 350 ms after the pointer enters the timer, follows the timer when the
  card moves under a still pointer, counts down while open (daemon down included), and closes when
  the pointer leaves the card or presses on it. The warmth text is the timer's accessible
  description; the timer carries no native hover title.

Stops being true:
- Nothing. The spec says only "names the warmth on hover". The hover text itself
  (`kb:adr/rail-timer-tinted-wherever-cache-warmth-known`) is unchanged, and the group header timer
  keeps its native hover.
