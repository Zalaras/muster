# Doc delta: launch-dialog-fixes

Seeded from plan.md § Doc Delta, plus review cycle 1 note 1 (review.code.cycle1.md).

**launch**
- Becomes true: the launch dialog opens showing the most recent directory's remembered model,
  mode and effort from the repos list the dashboard last fetched (at page load and after every
  successful launch from the dialog, New or Resume); the open's own fetch then applies the
  fresh first recent to every field the developer hasn't changed
  (kb:adr/launch-restore-from-last-known-repos-at-open).
- Becomes true: when the open's first recent's directory is gone, or the open's repos fetch
  fails or returns no recents, every untouched field returns to the defaults (sonnet, auto,
  effort default).
- Becomes true: a late `model_unrecognized` refusal moves focus to the invalid control only
  while the refused model is still the selection; its verdict is recorded either way.
- Stops being true: anything saying the remembered values appear only after the open's fetch
  and navigation succeed.
