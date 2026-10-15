# Doc Delta: effort

Seeded from `plans/effort/plan.md` § Doc Delta, amended by the orchestrator with the implementation logs' `doc-delta:` lines and review cycle 1's decisions.

**launch** — becomes true:
- Effort is a segmented control of `default`, `low`, `medium`, `high`, `xhigh` and `max`; a level is passed to `--effort`, and `default` passes none, so Claude Code's own default applies (kb:fact/effort-levels-per-model, kb:fact/effort-default-saved-per-model).
- Model, Effort and Start in default to the directory's last-used values; clicking a Recent restores its last model, effort and mode.
- A launched level the session's first status-line report contradicts — clamped by the model or absent — raises the launch-mismatch warning `kb:spec/focus` shows.

**launch** — stops being true:
- "Model and Start in default to the directory's last-used values" (replaced above).
- "restoring its last model and mode" (replaced above).
- In § What launch does: "Verdicts are cached against the resolved `claude` binary's path, size and modification time, so an update re-checks." and "Unrecognised means stderr carries either the pre-2.1.299 or 2.1.299+ unknown-model sentence, whatever the version (kb:adr/launch-model-check-matches-either-catalog-sentence)." — both already stated by `kb:anchor/models.check` and the sequence diagram below; cut to keep the body under 800 words.

**focus** — becomes true:
- The meta line ends with the model followed by its effort in brackets: `(…)` until a new session's first status-line report, no brackets when the model has no effort or a dead session never reported one; a resumed session shows the level it resumed at.
- A session launched at a level it did not come up at shows a warning strip under the mainhead, in the warning tokens, naming the requested and actual level, and tints the effort the same; Dismiss clears both for that session only, and until then the warning survives reloads, other windows and daemon restarts.

**focus** — stops being true:
- "and the model" as the meta line's last item (replaced above).

**card-location** — becomes true:
- The session's effort is the status line's `effort.level` from each post, `{"level": null}` when the key is absent; no hook carries it, so a missed post leaves it stale until the next (kb:fact/effort-changes-mid-session).

**card-location** — stops being true:
- nothing

**past-sessions** — becomes true:
- Resuming a row runs `claude --resume <id> --permission-mode <mode>`, plus `--effort <level>` when the transcript's last assistant line recorded one, and the row starts showing that level (kb:fact/resume-does-not-restore-effort).

**past-sessions** — stops being true:
- The argv sentence naming only `--permission-mode` (replaced above).

**actions** — becomes true:
- Resume passes the session's last-known effort as `--effort`, and none when it never reported one; the header keeps that level until the next report (kb:fact/resume-does-not-restore-effort).

**actions** — stops being true:
- nothing

Outside the feature specs: `docs/design/design-system.md` §1's token table gains the `--warn` /
`--warn-bg` / `--warn-line` / `--warn-fg` row (launch-mismatch warning; not a state colour, never
amber), and §3's rules say a warning uses `--warn`, never `--amber`.

## Amendments from the run

**focus** — becomes true (web-implementation.md doc-delta, review cycle 1 code Major 2b):
- A dead session that never reported an effort shows no brackets, but the header keeps the width of ` (…)` reserved invisibly, so Stop and Resume never move it.

**actions** — becomes true (daemon-implementation.md doc-delta, review cycle 1 code Major 2a):
- A Resume-button resume also cancels a still-pending first-report check, so a session that ended before its first report raises no later mismatch warning. A daemon restart keeps a pending check.

**ingest** — becomes true (review cycle 1 code Minor 1; promoted from Touches to Features):
- The Signals table's status-line row carries effort: "Context, model, effort, title, account usage | the status-line payload, posted by the status-line script" — effort is read from `effort.level` on every routed post (kb:fact/effort-changes-mid-session).

**ingest** — stops being true:
- "Context, model, title, account usage" as the status-line row's signals (replaced above).

**protocol** — by user decision (kb:adr/focus-effort-dismiss-404-uses-shared-body):
- `DELETE /api/sessions/{id}/effort-warning`'s 404 body is the shared `{"error": {"code": "unknown_session", "message": "unknown session id"}}`, like every other session route. (Already edited in `docs/protocol.md` by the orchestrator; verify, do not re-add.)
- Superseded: daemon-implementation.md's Fix Attempt 1 doc-delta that only this route serves `no session with that id` — no longer true.

**Outside the feature specs** (done by the orchestrator in review cycle 1, verify only): `docs/design/design-system.md` §1 `--warn` row, §3 warning rule, §5 effort-mismatch strip paragraph (Dismiss a ghost `.btn.sm` in `--warn-fg` on `--warn-line`, never disabled; held ` (…)` width).

**Directory guides** (web-implementation.md doc-delta, line 45): `web/src/features/CLAUDE.md` names `effort.ts` (done by the orchestrator); `web/src/render/CLAUDE.md` should name `effortstrip.ts` if it lists its modules by feature — verify. `internal/server/CLAUDE.md`'s Owns line names `effort.go` (done, review cycle 2 note).

**Superseded log lines:** daemon-implementation.md line 80 (Fix Attempt 1) is withdrawn by line 100 (Fix Attempt 2): every route, the effort-warning dismiss included, serves `unknown session id`.
