# internal/server — HTTP/WS handlers, one feature type per file

**Owns**: cookie-authed UI endpoints, `/ws` fanout, the ingest routes and the wire mapping from domain types to protocol JSON; `groups.go` holds the rail-group endpoints and the `groups` snapshot key and message, and `sessions.go` the batch End and Remove beside the single ones. Composition root is `server.go`: `New` builds each feature with `register(s, newXFeature(...))` and `routes()` mounts them; logic never lands there. **Features**: actions, connection, drop, ingest, issue, launch, lifecycle, rail, reader, rename, settings, surfaces, theme, update, usage, views.

**Invariants** (violations are review-Critical):
- A handler is a method on its feature type, mounted via `mount(mux, guard)`, never on `*Server` (kb:adr/process-composition-roots-registration-only) — except `/healthz`, `GET /auth`, `GET /api/state` and `GET /ws`: they predate any feature (auth) or need every registered feature's `contribute` (`currentSnapshot`), which only the root can loop, so they stay core routes in `routes()`.
- Ingest enqueues and returns 200 immediately; parsing and state happen in the single worker (kb:adr/ingest-seq-assigned-at-ingest). A full queue drops and counts, never blocks.
- Raw hook and status posts never bind or rebind a session; only the envelope does (kb:adr/ingest-envelope-authoritative-binding).
- Wire shapes follow `docs/protocol.md`; a route comment cites its anchor as `kb:anchor/<area>.<name>`.
- No Claude-Code-format knowledge; call `internal/claudecode`. Hook payloads are never logged.
- Reconcile completes before the first snapshot is served (kb:adr/lifecycle-reconcile-before-first-snapshot).

**Exemplar**: `usage.go` + `usagewire.go` + `usagepoll.go` — feature struct, wire mapping, background poller; copy this shape for a new feature.

**Gotchas**:
- `Config` sub-structs are zero-value safe: `Poll <= 0`, an empty API URL or an empty update base URL disables that feature, and tests build `Config{}`.
- Status posts arrive in near-identical pairs; dedup is by value downstream (kb:fact/status-posts-arrive-in-pairs).
- Accepting two wire shapes for one field hides a contract error (kb:lesson/two-wire-shapes-accepted-hides-disagreement).
- A fixture reshaped to stay green changes the wire (kb:lesson/stale-fixture-reshaped-the-wire).

<!-- kb:trailer -->
<!-- kb:hash 1ba13dba63f59172 -->
- **actions** — Stop, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **card-location** — The card's launch directory, its branch kept fresh by the repo poll, where Claude works when elsewhere, and the bind's model name. → `docs/features/card-location/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- **groups** — Rail groups: sections, header summary and popover, select mode, filter, group create, rename, ungroup and delete, persistence. → `docs/features/groups/INDEX.md`
- **ingest** — Hook and status-line ingest endpoints, the envelope that binds an event to a Muster session, seq assigned at ingest. → `docs/features/ingest/INDEX.md`
- **issue** — Issue capture and GitHub issue creation from the dashboard. → `docs/features/issue/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **lifecycle** — The session state machine, liveness, reconcile on start, shutdown policy, resume to idle. → `docs/features/lifecycle/INDEX.md`
- **past-sessions** — The launch dialog's Resume tab — a directory's Claude Code sessions listed from transcripts, the running-session guard, resume in the original mode. → `docs/features/past-sessions/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **reader** — The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out. → `docs/features/reader/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **settings** — Settings dialog and the prefs it edits. → `docs/features/settings/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- **theme** — Muster theme preference and the Claude theme family poll. → `docs/features/theme/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- **views** — Focus and Tiles switch, density preference, view containers. → `docs/features/views/INDEX.md`
- 80 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
