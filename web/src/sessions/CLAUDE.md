# web/src/sessions — pure session logic, no DOM

**Owns**: the in-memory session store and every derivation the views display: card view-model, context gauge maths, time formatters, rail sort and manual-order drop maths, sticky Tiles membership, rename commit semantics. No DOM, no socket, no fetch; `web/src/render/` draws the results and `web/src/features/` calls in. **Features**: lifecycle, rail, rename, usage.

**Invariants** (violations are review-Critical):
- Every module is Vitest-testable with no DOM; a function that needs an element belongs in `render/`.
- The store replaces on snapshot and upserts whole objects by id; the client never merges fields (kb:adr/connection-whole-object-session-upserts).
- Display order is decided here, never by the daemon: `sort.ts` holds the one priority table (kb:adr/rail-user-owned-manual-order-default).
- Unknown context derives no percentage and no track; the wire triple is all-null or all-non-null (kb:adr/usage-unknown-renders-word-not-track).
- Tiles membership and order are per-window client state, never a prefs field (kb:adr/tiles-order-ephemeral-per-window, kb:adr/tiles-sticky-live-membership).
- A session's identity is its Muster id; the Claude `session_id` changes on `/clear` (kb:adr/lifecycle-session-identity-is-tmux-target).

**Exemplar**: `card.ts` + `card.test.ts` — one view-model type, one derive function, table-driven tests; copy this shape for a new derivation.

**Gotchas**:
- Formatters clamp elapsed time to zero; a render tick can race `stateSince`.
- `railorder.ts` assumes the pinned-then-unpinned two-block shape from `sort.ts`; a drop across the boundary decides pin state (kb:adr/rail-whole-card-drag-drop-decides-pin).
- `rename.ts` compares the trimmed input against the daemon's precedence-resolved `title`; `titleOverride` only decides what empty means (kb:adr/rename-muster-owned-title-override-wins).

<!-- kb:trailer -->
<!-- kb:hash 0d79a35b92a27ed7 -->
- **lifecycle** — The session state machine, liveness, reconcile on start, shutdown policy, resume to idle. → `docs/features/lifecycle/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 18 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
