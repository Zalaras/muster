# Doc delta: bugs-one-batch-1

Seeded from `plan.md` § Doc Delta, then amended with the `doc-delta:` lines in
`web-implementation.md` and `daemon-implementation.md`. The web log's first line (the `web:` glob
for `readerscroll.ts`) was done in `2223999c`. `plan.md` stays as approved.

## lifecycle (`docs/features/lifecycle/spec.md`, `docs/protocol.md` § `kb:anchor/state.liveness`)

Becomes true:
- `alive` is nudged by a non-clear `SessionEnd` too: a bounded pane re-check (about every 200 ms
  for up to about 3 s) ends the session as soon as the pane is gone; the shutdown guard covers it.
  A clear `SessionEnd` starts no re-check. `alive` is still decided by pane existence alone.

Stops being true:
- "nudged by PTY EOF and End" alone. In `docs/protocol.md` `kb:anchor/state.liveness`,
  "event-nudged (PTY EOF, End)" gains the SessionEnd re-check; no message, field or anchor changes.
  The spec is at 797 words: edit the sentence in place and cut an equal number of words from the
  same paragraph.

## rail (`docs/features/rail/spec.md`)

Becomes true:
- In Select mode a right-click on a selected card opens the selection's menu: its label names the
  count (`Actions for N sessions`, `Actions for 1 session` at one); Stop…, Remove… and Move to
  apply to the selection; no Resume
  and no Pin. An unselected card keeps its own single-card menu and the selection as it was.

Stops being true:
- The single-card-in-Select-mode sentence and its citation of
  kb:adr/rail-card-right-click-menu-holds-session-actions, replaced by
  kb:adr/rail-card-menu-on-selected-card-acts-on-selection (proposed on this branch; the
  orchestrator flips it to accepted and the superseded one to superseded). The spec is at 792
  words: cut as many as are added.

## groups (`docs/features/groups/spec.md`)

Becomes true:
- § Select mode names the card menu as a way to act on the selection, and that the mode stays on
  afterwards.

Stops being true:
- Nothing. The spec is at the 800-word cap: cut as many words as are added.

## actions (`docs/features/actions/spec.md`)

Becomes true:
- The card menu on a selected card is a third origin of the Stop and Remove batches.
- The action-error line clears a `Could not reach musterd.` message when the connection returns
  (the next hello), and keeps any other message (a refusal, a partial batch report) until the next
  action replaces or clears it.

Stops being true:
- Nothing.

## notes (`docs/features/notes/spec.md`)

Becomes true:
- Closing the panel from the keyboard (Escape inside it), the popped panel's close control or the
  glyph returns keyboard focus to the selected surface's terminal, or to the glyph when no
  terminal is showing (Docs selected, or an ended session).

Stops being true:
- Nothing. The spec is at the 800-word cap: cut as many words as are added.

## reader (`docs/features/reader/spec.md`)

Becomes true:
- The reading position per document is remembered beside the last open file, expanded folders and
  folds, in the same browser memory. It applies on any open with the loading cue (the remembered
  open at build, a nav or plan click on a document with a stored position returns to it), is
  re-applied after the diagram pass, and is never applied on a `storage`-event adoption. Silent
  refetches never touch scroll. (web log: "last open file" only would be incomplete.)
- The pop-out reloads after an update restart like the dashboard.

Stops being true:
- Nothing. The spec is at 778 words: edit the existing memory sentence in place.

## update (`docs/features/update/spec.md`)

Becomes true:
- Only the dashboard shows the updating banner and the `Updated to` confirmation; every window,
  the pop-out included, reloads on its first reconnect.

Stops being true:
- Nothing.

## surfaces (`docs/features/surfaces/spec.md`, `docs/protocol.md` § `kb:anchor/terminal.ws`)

Becomes true:
- The client sends its first resize frame on open once the surface has a layout; a surface
  without one (a shell kept behind Docs, never mounted) sends none until it is mounted, so a
  background shell's tmux window keeps its fitted size. No message, field or anchor changes.

Stops being true:
- "The client sends a resize frame on open and then debounced" (surfaces spec) and "client sends
  one immediately after open" (protocol, `kb:anchor/terminal.ws`) as unconditional statements.

The wheel carry itself is not described and needs no sentence. The daemon log carries no
`doc-delta:` line beyond the lifecycle item above.
