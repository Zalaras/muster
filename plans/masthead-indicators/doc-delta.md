# Doc delta: masthead-indicators

Seeded from plan.md § Doc Delta, then amended by the orchestrator from the implementation logs and review cycle 1.


**usage** (`docs/features/usage/spec.md`) — becomes true:
- The masthead shows a five-hour bar and a seven-day bar, each with a used percentage and its reset time: `(HH:MM)` when it falls today, `(HH:MM Ddd)` otherwise, with the full date on hover.
- The masthead shows no model; the model shows per session only (kb:adr/usage-masthead-shows-no-model). The status line's model is still recorded in usage history.
- The masthead holds one row at a 14" laptop width: nothing in it wraps and the bars narrow below 1840px (kb:adr/usage-masthead-narrow-width-shrinks-bars).

**usage** — stops being true:
- "The masthead shows the current model, a five-hour bar and a seven-day bar…" (the "current model" part).
- "The model shown is the freshest sample's (kb:adr/usage-masthead-model-from-freshest-sample)."
- "…and the model name truncates with its full name on hover (kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model)."

**connection** (`docs/features/connection/spec.md`) — becomes true:
- The status readout is a health dot with the state's word for screen readers and its detail on hover: yellow while connecting before the first hello and during the dashboard's own update restart, green when connected, red once the connection is lost; its colour agrees with the banner, except that a socket lost during the ≤ 3 s post-update confirmation is red beside the neutral banner (kb:adr/connection-health-dot, kb:adr/connection-dot-red-during-update-confirmation).

**connection** — stops being true:
- "A status readout reads connecting until the first hello, then connected; a socket lost after a hello reads reconnecting…" as visible text (reworded to the dot; the banner clause stays).

**protocol** (`docs/protocol.md`, `kb:anchor/ws.usage`) — merged at approval from the Protocol Contract above.


## Amendments from the run

- **connection** — the "colour always agrees with the banner" claim above is superseded: the dot agrees with the banner except that a socket lost during the ≤ 3 s post-update `Updated to v…` confirmation reads red beside the neutral banner (kb:adr/connection-dot-red-during-update-confirmation, user decision, review cycle 1).
- **connection** — the dot's colours are three dedicated tokens, `--health-ok`, `--health-pending`, `--health-down` (kb:adr/connection-health-dot-hues-kept).
- **protocol** (`docs/protocol.md`, `kb:anchor/ws.usage`, ~line 1342) — a model-only change sends a `usage` message identical to the previous one **apart from `sampledAt`**, which the daemon re-stamps for every recorded sample (review cycle 1 correctness Major 1; plan Protocol Contract amended).
- **usage** — reset hover text is the full local date and time, e.g. `Resets Tue, Oct 13, 15:59` (web-impl log).
- design-system §1/§5 doc-deltas from web-implementation.md were applied by the orchestrator (00831eb5); not doc-reconcile's.
