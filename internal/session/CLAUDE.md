# internal/session — state machine and session registry

**Owns**: the six displayed states, transitions from neutral `claudecode.StateInput`, the in-memory registry (`Manager`), liveness polling, reconcile on start, rail order, rail groups and titles. Persistence goes through `internal/store`; tmux through the `PaneChecker`, `TmuxSessions` and `PaneSnapshotter` interfaces defined here. **Features**: lifecycle, rail, reader, rename.

**Invariants** (violations are review-Critical):
- A session is identified by its tmux target; the Claude session_id is a mutable attribute (kb:adr/lifecycle-session-identity-is-tmux-target, kb:fact/clear-mints-new-session-id).
- Alive is decided by pane existence alone; SessionEnd is a hint (kb:adr/lifecycle-liveness-from-pane-existence, kb:adr/lifecycle-alive-flag-not-a-state).
- No Claude Code payload key or event name appears here; `machine.go` switches on `Kind`, never on strings.
- An enveloped event never rebinds backwards; stragglers past a Stop persist without transitioning (kb:adr/ingest-monotonic-rebind, kb:adr/lifecycle-prompt-ordering-guards).
- Attention is non-nil iff `needs_input`; Failure is non-nil iff `failed`. Every transitioning path clears both.
- `ClaudeDir` and `ClaudeLocation` (where Claude is working) are display-only: only the repo poll's derivation reads `ClaudeDir`; the shell, reader, drop, resume and past-session matching use `Directory` (kb:adr/lifecycle-card-shows-launch-directory-marks-claude-elsewhere).
- The rail's pinned-before-unpinned invariant holds per section (`railorder.go`'s `rebuild`); `railPos` stays unique across all sessions. `Session.GroupID` is display-only, like `Pinned`: only the group methods, `SetOrder` with a group and `CreateSession` write it.
- Group state (`groups.go`, `groupops.go`, `grouplaunch.go`) is guarded by `groupsMu`, always taken before `mu` and never held across a per-session lock; `grouplayout.go` is the pure section algebra (kb:adr/rail-groups-daemon-rows-whole-list-broadcast).
- Resume keeps the row and title and rebinds the pane (kb:adr/lifecycle-resume-rebinds-existing-session).
- Reconcile logs unknown Muster-shaped tmux sessions and never adopts them; it kills every shell (kb:adr/lifecycle-reconcile-before-first-snapshot, kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile).

**Exemplar**: `machine.go` — `applyInput` and its per-`Kind` helpers; a new transition is a new case, with invariant tests crossing every source state.

**Gotchas**:
- A failed turn emits StopFailure instead of Stop; kill -9 emits nothing and SessionEnd's reason is ambiguous (kb:fact/stopfailure-replaces-stop, kb:fact/sessionend-reason-ambiguous).
- Shift+Tab mode changes are invisible; the mode latches from hook fields only (kb:fact/shift-tab-mode-cycle-fires-no-hook).
- Subagent-marked events on a closed prompt transition without reopening it (kb:adr/lifecycle-subagent-marked-events-not-stragglers).
- Per-transition tests miss invariants; name each invariant and cross it from every source state (kb:lesson/invariant-missed-by-per-transition-tests).

<!-- kb:trailer -->
<!-- kb:hash 8d57fbcc1622559a -->
- **card-location** — The card's launch directory, its branch kept fresh by the repo poll, where Claude works when elsewhere, and the bind's model name. → `docs/features/card-location/INDEX.md`
- **lifecycle** — The session state machine, liveness, reconcile on start, shutdown policy, resume to idle. → `docs/features/lifecycle/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **reader** — The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out. → `docs/features/reader/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- 61 records name files in this directory: `go tool kb for <path>` lists them for one file.
<!-- /kb:trailer -->
