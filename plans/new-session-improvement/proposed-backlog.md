# Proposed backlog — new-session-improvement

Proposals only: nothing here is filed in `TODO.md` unless the developer copies it there
(kb:adr/process-backlog-entries-are-the-users-to-file).

### Consider an any-owner rule for `features-scope.sh`
- [ ] **Consider an any-owner rule for `features-scope.sh`**: today a changed file fails the
  gate if *any* of its owning features is missing from the plan's `**Features**` header. So a
  plan that edits one handler inside a shared file (e.g. `internal/server/sessions.go`, owned by
  launch, actions, rail and rename) must name every co-owner, and each pack grows by about
  11 000 words. An any-owner rule would also need `doc-reconcile.md` Step 1 changed to match.
- **Source**: `decisions/features-scope/decision.md`, the dissent. Advocate-b: "The any-owner
  rule may still be worth proposing for later plans on its own merits, but that is not this run's
  decision."
- **Change requested**: no. The dissent says "may still be worth proposing", and no change was asked for.
- **Suggested section**: pipeline / tooling (a hint only)
- **Pre-existing**: yes. This branch does not touch `features-scope.sh` or `doc-reconcile.md`.

### Keep the rail's current marker on screen on every selection path
- [ ] **Keep the rail's current marker on screen on every selection path**: in an overflowing
  rail, a launch, the number chords ⌥⌘5–9 and ⌥⌘0 can all put the current marker on a card
  scrolled out of view. Nothing in `web/src` calls `scrollIntoView`. Candidate: the single
  "bring a session forward" owner scrolls the card into view (`block: "nearest"`) for every path.
- **Source**: review.md browser Minor 1 (cycle 1), and `decisions/launched-card-scroll/decision.md`, the dissent.
- **Change requested**: no. The debate's concession: "a visible marker on every selection path
  would be a new rule and goes beyond #41, so it is a backlog item for the developer, not this plan."
- **Suggested section**: rail (a hint only)
- **Pre-existing**: yes. The number chords already behave this way. This branch adds launch as one more path.

### Settle where a controller's DOM-free pure decision lives
- [ ] **Settle where a controller's DOM-free pure decision lives**: conventions § Composition
  roots bullet 3 and `web/src/render/CLAUDE.md` put pure logic in `sessions/`/`terminal/` and
  call `render/` "pure DOM builders". But `render/focusrestore.ts` (plan general-cleanup) and
  now `render/launchrestore.ts` are DOM-free decisions called by one controller, and they sit in
  `render/` to avoid a new `sessions/→api` dependency. Either the rule names this case, or the
  two modules move.
- **Source**: review.maintainability.md Note 1 (review cycle 2). The rule and the practice
  already disagreed before this plan, so the reviewer said it "needs a conventions edit, which
  I'd put in the backlog".
- **Change requested**: no (a `[note]`). The reviewer did not re-file it against this plan.
- **Suggested section**: web conventions (a hint only)
- **Pre-existing**: yes. `render/focusrestore.ts` predates this branch. This branch adds `render/launchrestore.ts`.

### Name a launched session's `model_not_found`
- [ ] **Name a launched session's `model_not_found`** — a model the installed Claude Code
    knows but the account cannot run passes the launch pre-check and fails its first turn with
    `StopFailure.error = "model_not_found"` (kb:fact/unknown-model-fails-first-turn); the card
    shows only the generic failure. Candidate: say "model unavailable" on the card and offer
    Resume with another model.
- **Source**: plan.md § Out of scope, first bullet ("copied verbatim into `TODO.md` only if the developer approves this wording").
- **Change requested**: not yet. The plan left filing it to the developer's approval of the wording, and that approval hasn't been given.
- **Suggested section**: launch / lifecycle (a hint only)
- **Pre-existing**: yes. The account-side gate predates this branch, which narrows it to catalogued-but-unavailable models.
