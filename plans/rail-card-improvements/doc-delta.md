# Doc Delta — rail-card-improvements

Seeded from the approved plan's `## Doc Delta` by the orchestrator, to be amended with every
`doc-delta:` line the implementation logs (fix waves included) produce before `doc-reconcile`
is spawned. `plan.md` itself stays as approved.


**rail** — becomes true:
- The card is a state row (badge, time in state, pin) above a title that wraps, then the repo and
  branch line with its full text on hover, the context gauge, and an activity line whose text
  `prefs.railActivity` chooses: turn-aware by default (the user's prompt while a turn is open,
  Claude's reply once it closes), or the prompt, the reply, or both (kb:adr/rail-activity-line-turn-aware-default-with-pref).
- Density is `prefs.railDensity`, chosen from an icon control in the rail head: comfortable is the
  reference, compact clamps the title to one line and drops the gauge track and activity line,
  expanded lets the activity line run to three lines; the strip follows
  (kb:adr/rail-card-state-row-then-wrapping-title).
- A session that finishes a turn while no window has its terminal open is unread until one attaches;
  the daemon infers it from its terminal registry, the card shows a neutral dot before the title and
  a read idle title is muted (kb:adr/rail-unread-inferred-from-live-terminal-client,
  kb:adr/rail-unread-marker-neutral-dot).
- Attention sorts the unpinned group `needs_input` longest-blocked first, `failed` most recent
  first, unread `idle` longest-idle first, `started`, `planning`, `working`, then read `idle`
  longest-idle first (kb:adr/rail-attention-order-your-turn-before-active).
- The rail head shows the sort select, the session count and the density control.

**rail** — stops being true:
- "A card shows the display title, the state badge, time in the current state, the repo and
  branch line …, and a reason line: … the last activity for `idle`" (replaced by the sentences
  above; the note behaviour for `needs_input`, `failed` and `started` stays).
- "Attention sorts the unpinned group by `needs_input` longest-blocked first, then `failed` most
  recent first, `planning`, `working`, `started`, and `idle` longest-idle first
  (kb:adr/rail-attention-sort-order)."
- "The rail head shows the session count."

**settings** — becomes true:
- The fields are view, density, usage model, rail sort, rail density, rail activity, theme and
  update check, each with a daemon default.
- The Settings dialog's Rail card shows fieldset offers Turn-aware, Your prompt, Claude's reply and
  Both as radios (kb:adr/rail-activity-line-turn-aware-default-with-pref); the rail density control
  sits in the rail head (kb:adr/rail-card-state-row-then-wrapping-title).

**settings** — stops being true:
- "The fields are view, density, usage model, rail sort, theme and update check".
- "The Settings dialog … holds two sections."

**views** — becomes true:
- One New session button sits in the masthead beside the view switcher and is visible in both
  views (kb:adr/launch-new-session-button-in-masthead).

**views** — stops being true:
- "Each view hides the other's New session button so exactly one is visible."

**tiles** — becomes true:
- Sessions are launched from the masthead's New session button (kb:adr/launch-new-session-button-in-masthead).

**tiles** — stops being true:
- "the New session button lives in the density toolbar (kb:adr/tiles-new-session-button-in-toolbar)."

**launch** — becomes true:
- The dialog opens from the masthead's New session button or the launch chord.

**launch** — stops being true:
- "The dialog opens from the rail's New session button, the Tiles toolbar button or the launch chord."

**lifecycle** — becomes true:
- `idle` carries `lastActivity`, the user's `lastPrompt`, and `unread`, which is set when the turn
  closed with no terminal client attached and cleared by any transition out of idle or by an attach.

**lifecycle** — stops being true:
- "`idle` (a turn finished, with `lastActivity`)" (extended as above; the sentence is replaced, not
  appended to, so the spec stays under its word budget).

**protocol** (`docs/protocol.md`) — becomes true: the Protocol Contract section above, verbatim
under `kb:anchor/ws.session`, `kb:anchor/prefs.put`, `kb:anchor/ws.prefs`, `kb:anchor/terminal.ws`,
`kb:anchor/terminal.shell-ws`, `kb:anchor/state.tracked` and `kb:anchor/state.transitions`; the
`kb:anchor/ws.snapshot` sort sentence names the new order. Stops being true: the prefs defaults
line without the two new keys, and the ws.snapshot sort sentence's old order.


## Amendments from the implementation logs

- `daemon-implementation.md` carries no `doc-delta:` line. Its one recorded decision is a spelling
  correction, not a doc claim: the terminal registry's method is the exported `Watched` (the
  plan's Requirements already spell the port `Watcher.Watched`; only its Affected Files prose said
  `watched`).
- `web-implementation.md`: `doc-delta: none beyond what the plan's own Doc Delta section already
  states`. Two implementation details worth knowing when reading the shipped code, neither a doc
  claim: the activity-line prefix (`on:` / `you:` / `claude:`) is baked into the line's text, with
  no inner `.who` span as the mockup drew it; and the density buttons prevent the browser's
  `mousedown` focus steal so a focused card control survives a density click (REQ-15).
- Measured at validate (`test-specs.md`, Validate Attempt 1, repair 1): a `failed` session's
  activity line in turn-aware mode shows the **previous** reply (`lastActivity`, written only by a
  successful `Stop`), and is hidden when no reply preceded the failure — `turn_failed` never writes
  `lastActivity`, which is pre-plan behaviour the plan keeps. The lifecycle sentence should not
  imply the failure message reaches the activity line; the failure note carries that.
- `docs/features/rail/spec.md`'s `refs` still cite `kb:adr/rail-attention-sort-order` (superseded)
  for the order sentence this plan replaces; the replacement sentence cites
  `kb:adr/rail-attention-order-your-turn-before-active`, so the refs list should follow.
- The plan's three new E2E specs and `web/e2e/helpers/railcards.ts` are already registered on the
  rail feature's `e2e` globs (orchestrator commit `75e6737`); `make check-kb` is green.
- Review cycle 1 fix wave (`web-implementation.md` § Fix Attempt 1): the card title now declares
  `--fg` on every surface (decisions/read-idle-title-colour, consensus A;
  kb:adr/rail-card-title-foreground-token, proposed), so the Doc Delta's rail line "a read idle
  title is muted" ships true: measured base title `--fg`, read idle `--fg-muted`. Compact density's
  one-line title now ends in a real ellipsis (`display: block` on `.name` in compact), as the rail
  line already says. No spec sentence changes beyond the plan's Doc Delta; the design-system §5
  Rail card sentence names the title token (orchestrator commit `3dc3818`).
