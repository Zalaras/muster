# Plan: Effort

**Created**: 2026-10-15
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: effort-launch.spec.ts daemon (asserts recents/remembered per-directory effort, daemon-global); effort-header.spec.ts daemon (restarts the daemon for the warning-survives-restart criterion and asserts the daemon-down state)
**Features**: launch, focus, card-location, past-sessions, actions, ingest
**Touches**: usage, lifecycle, connection, rail, tiles, canary
**Description**: Choose effort at launch, show the running effort in the Focus header, warn on a launch mismatch, and resume at the last effort (closes #68)

## Overview

The launch dialog's New form gains an Effort row (`default low medium high xhigh max`) under
Model, remembered per directory like Model and Start in. A level is passed to Claude Code as
`--effort <level>`; `default` passes no flag. Closes `TODO.md` § Issues "Add effort to launch
options" ([#68](https://github.com/Zalaras/muster/issues/68)).

The daemon reads the session's running effort from the status line's `effort.level` on every
routed post (no hook carries it — kb:fact/effort-changes-mid-session) and puts it on the Session
object as a tri-state: not yet reported, a level, or reported-with-no-effort. The Focus header
renders it after the model in brackets: `Opus 5.5 (…)` before a new session's first report,
`Opus 5.5 (high)`, or `Haiku 4.5` with no brackets. When a launch chose a level and the session's
first report shows a different level or none, the daemon records a launch-mismatch warning on the
session row; the dashboard shows it as a yellow strip under that session's Focus header, in a new
`--warn` token family, and tints the bracketed effort the same until Dismiss clears it through a
new endpoint. Living on the row, it survives reloads, other windows and daemon restarts.

Both resume paths bring a session back at its past effort: the Resume button passes the row's
last-known level, a Resume-tab resume passes the transcript's last recorded level
(kb:fact/resume-does-not-restore-effort), and the header shows that level from the moment of the
resume — `(…)` is only for a new session with no information yet (developer, 2026-10-15). The
canary's static tier gains a presence check for the `--effort` flag string.

## Requirements

### Must Have
- [ ] REQ-1: The New form shows an Effort radiogroup of `default | low | medium | high | xhigh | max` under Model and above Start in, built like Model and Start in.
- [ ] REQ-2: Launching with a level spawns `claude … --effort <level>`; launching with `default` spawns no `--effort`.
- [ ] REQ-3: `POST /api/sessions` accepts an optional `effort`; an invalid value is refused `400 invalid_request` with nothing written.
- [ ] REQ-4: Every launch records its effort (null for `default`) as the repo row's `lastEffort`; `GET /api/repos` returns it. A Recent click and the dialog opening on a directory restore it (`default` when null); a value the developer picked before the repos arrive is kept.
- [ ] REQ-5: The daemon adopts the status line's effort from every routed status post: `{"level": <level>}` when the key is present, `{"level": null}` when absent; a change is one `sessionUpsert`, an unchanged value none. It persists on the session row.
- [ ] REQ-6: The Focus header's model reads `<model> (…)` while `effort` is null and the session is alive, `<model> (<level>)` when a level is reported, and `<model>` alone when the reported level is null or the session is dead and never reported.
- [ ] REQ-7: The first effort report after a launch that carried a level sets `effortWarning` iff the reported level differs from the requested one (a null level differs). It is never set by a later post, a resume, a `/clear`, or a `default` launch.
- [ ] REQ-8: While `effortWarning` is non-null the Focus header shows a warning strip under the mainhead naming the requested and the actual level, and the bracketed effort is tinted `--warn`.
- [ ] REQ-9: `DELETE /api/sessions/{id}/effort-warning` clears that session's warning only, persists, and broadcasts a `sessionUpsert`; the strip and the tint go in every connected dashboard.
- [ ] REQ-10: The Resume button passes `--effort <effort.level>` when the row's last-known level is non-null, and none otherwise; the resumed row keeps its `effort` unchanged until the next report.
- [ ] REQ-11: A Resume-tab resume passes `--effort <level>` when the transcript's last assistant line recorded one, and none otherwise; the new row's `effort` is seeded `{"level": <level>}` when recorded, else null.
- [ ] REQ-12: A new `--warn` / `--warn-bg` / `--warn-line` / `--warn-fg` token family exists in every theme block, outside amber's hue band, and passes `make contrast`.
- [ ] REQ-13: The live pane refits when the strip appears or is dismissed, so the terminal is never clipped under it and the size note states the new geometry.

### Should Have
- [ ] REQ-14: The canary's static tier asserts the installed bundle carries the `--effort` flag string.

### Nice to Have
- (none)

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md` regenerates).

### WS daemon→UI: the Session object (`kb:anchor/ws.session`) gains two required keys

```jsonc
{
  "effort": { "level": "high" },    // required key. object | null.
                                    //   null = no status post has reported since this session was LAUNCHED
                                    //     (a Resume-tab resume with no recorded effort also starts null);
                                    //   { "level": string } = the status line's effort.level on the latest routed post that changed it,
                                    //     verbatim (observed "low" | "medium" | "high" | "xhigh" | "max" — an open string);
                                    //   { "level": null } = the latest routed post carried no effort key: the model has no effort setting
                                    //     (kb:fact/status-line-effort-key), never "unknown".
                                    //   Set by every routed status post (a change is one sessionUpsert); kept by Stop, liveness death,
                                    //   /clear, a Resume-button resume and a daemon restart; seeded by a Resume-tab resume. Display-only.
  "effortWarning": {                // required key. object | null — the launch-mismatch warning.
    "requested": "max",             //   string — the level the launch passed as --effort
    "actual": "high",               //   string | null — the level the first report showed; null = no effort setting
    "model": "Opus 4.5"             //   string | null — model.displayName after that first post was applied; null when the session had no model
  }                                 //   INV-E1: non-null ⇒ requested ≠ actual. Set only by the first effort report after a launch
                                    //   that carried effort; cleared only by kb:anchor/sessions.effort-warning-dismiss (or Remove).
                                    //   Untouched by later posts, /clear, Stop, both resumes, reconcile and a daemon restart.
}
```

`kb:anchor/ws.session`'s value-semantics list: status posts now change title/model/context/
Claude's directory **and `effort`/`effortWarning`**, still only when a value actually changed, and
still never `state`/`stateSince`/`attention`/`failure`/`alive`/`permissionMode`/`compactions`.

### HTTP: POST /api/sessions (`kb:anchor/sessions.create`) — new optional field
**Auth**: UI cookie, unchanged.
**Request (launch form):**
```jsonc
{ "effort": "high" }   // optional, "low" | "medium" | "high" | "xhigh" | "max" | null; absent or null = Claude Code decides (no --effort).
                       // A level is passed as `--effort <level>` (kb:fact/effort-flag-values) and is recorded as the repo row's lastEffort
                       // (null for absent/null); the session's effort starts null and the first status post is checked against it
                       // (effortWarning above).
```
Checked after `permissionMode` and before the model pre-check. **Errors** (added):
- 400 `invalid_request` — `effort` neither null nor one of the five:
  `{"error": {"code": "invalid_request", "message": "effort must be one of low, medium, high, xhigh, max"}}`

**Resume-from-list form:** `effort` must be absent or null. The combination rule's message becomes
`{"error": {"code": "invalid_request", "message": "resumeSessionId cannot be combined with title, model, permissionMode or effort"}}`.
It spawns `claude --resume <id> --permission-mode <mode> [--effort <level>]`, `<level>` being the
transcript's last `assistant` line's top-level `effort`, verbatim, when present
(kb:fact/resume-does-not-restore-effort); the row's `effort` is seeded `{"level": <level>}`, or null
when none is recorded. `effortWarning` starts null; no check is pending. The repo row's
`lastEffort` is left as it was (a new repo row gets null), as `lastModel`/`lastPermissionMode` are.

### HTTP: POST /api/sessions/{id}/resume (`kb:anchor/sessions.resume`) — argv gains effort
The spawned argv becomes `claude --model <model.id> --resume <claudeSessionId> [--name <titleOverride>] [--permission-mode <latched>] [--effort <effort.level>]`,
`--effort` present iff the row's `effort` is non-null and its `level` is non-null. `effort` and
`effortWarning` are unchanged by the resume, and no check becomes pending. No new errors.

### HTTP: GET /api/repos (`kb:anchor/repos.list`) — each row gains
```jsonc
{ "lastEffort": "high" }   // string | null — the effort of the last launch here; null before any and after a launch with default
```

### HTTP: DELETE /api/sessions/{id}/effort-warning (new, `kb:anchor/sessions.effort-warning-dismiss`)
**Auth**: UI cookie (401 `unauthorized` without it).
**Request:** no body.
**Response 204:** no body. Clears the session's `effortWarning`, persists it, and broadcasts one
`sessionUpsert`; a session whose warning is already null gets `204` and no broadcast. No other
session is touched.
**Errors:**
- 404 `unknown_session`: `{"error": {"code": "unknown_session", "message": "unknown session id"}}` (*Amended* in review cycle 1 by user decision, kb:adr/focus-effort-dismiss-404-uses-shared-body: the shared body every route serves)

## Schema Changes

Migration `0016_effort.sql` (*Amended*: renumbered from 0015 when `cache-timing` landed `0015_cache_keepalive.sql` on main first), forward-only, `ALTER TABLE … ADD COLUMN` like 0014:

- `session.effort_known INTEGER NOT NULL DEFAULT 0` — 1 once a level-or-none has been reported or seeded (wire `effort` non-null).
- `session.effort_level TEXT` — the level; NULL with `effort_known = 1` is `{"level": null}`.
- `session.effort_requested TEXT` — the level a launch passed while its first report is pending; NULL when none is pending.
- `session.effort_warning_requested TEXT`, `session.effort_warning_actual TEXT`, `session.effort_warning_model TEXT` — the warning; `effort_warning_requested` non-null iff the warning is set.
- `repo.last_effort TEXT` — the per-directory launch default.

Existing rows backfill `effort_known = 0` (wire `effort` null; dead ones render no brackets) and
no warning. Column names are the implementer's to refine; the wire is the contract.

## UI Specifications

Design: option A of `plans/effort/mockups/opt-a-segmented.html` (chosen 2026-10-15) is the
reference render, except the clamped-warning sentence (below). Binding:
`docs/design/design-system.md` §1 (tokens — new family added to every theme block), §3 (state
colour is meaning: `--warn` is not a state colour and amber is never "warning"), §5 (segmented
control; ghost `.btn.sm`), §6 (honesty).

### Views
- **Launch dialog, New tab** — an Effort `<fieldset class="seg">` with legend `Effort`, a
  `role="radiogroup" aria-label="Effort"` track of six radios named `effort`: `default` (value
  `""`), `low`, `medium`, `high`, `xhigh`, `max`. It sits after the Model row's `#model-error` and
  custom-model input, before Start in. The Resume tab gains nothing.
- **Focus mainhead** — the `.model` span holds the display name followed by a child `.eff` span
  whose text is ` (<level>)` or ` (…)` (leading space inside `.eff`, as the mockup has it), absent
  when there are no brackets. `.eff.warn` takes `--warn` colour while the session's warning is set.
  The model-never-truncates rule (kb:adr/focus-model-never-truncates-name-blocks-give-way) covers
  the brackets: `.model` including `.eff` never truncates.
- **Warning strip** — a full-width `role="status"` element directly under the mainhead and above
  the main slot, in the Focus view only: an `aria-hidden` `⚠` glyph, the sentence, and a ghost
  `Dismiss` button pushed right. Text wraps; the Dismiss button stays in view at every width.
  - Clamped (`actual` non-null): `Asked for <b>{requested}</b> — {model} started at <b>{actual}</b>.`
  - No effort (`actual` null): `Asked for <b>{requested}</b> — {model} has no effort setting, so it started without one.`
  - `{model}` is `effortWarning.model`, or `the model` when null. The clamped wording replaces the
    mockup's "runs at most …", which is false for a model that offers a higher level than the one
    it clamped to (Sonnet 4.6: `xhigh` → `high`, `max` kept — kb:fact/effort-levels-per-model).

### User Flows
1. Open the dialog on a directory last launched with `high` → Effort shows `high`; pick `max`, Launch → the session spawns with `--effort max`; its header reads `<model> (…)` until the first status post.
2. The first post reports `high` → header `<model> (high)` tinted `--warn`, strip "Asked for max — Opus 4.5 started at high."; press Dismiss → strip gone, tint gone, in every window.
3. `/effort low` in the session → the next post makes the header `(low)`, no strip.
4. Stop, then Resume → the header keeps `(low)` and the spawn carries `--effort low`.
5. Resume tab → pick a past session whose last turn ran at `medium` → the spawn carries `--effort medium`; the header reads `(medium)` at once.

### States
- No data yet: a new alive session reads `<model> (…)`; a dead session never reported reads `<model>`. A null model still reads `unknown` (kb:adr/launch-resume-null-model-reads-unknown), followed by the same brackets rule.
- Data: `<model> (<level>)`, or `<model>` for a model without effort.
- Daemon down: the header keeps the last-known effort and the strip stays; a Dismiss that fails leaves the strip and reports the failure in the mainhead's existing action-error line.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Effort row | `radiogroup` | `Effort` | `aria-label="Effort"` mandated, as Model / Start in |
| Effort default | `radio` | `default` | value `""`; checked for a directory with no `lastEffort` |
| Effort level | `radio` | `low` \| `medium` \| `high` \| `xhigh` \| `max` | in that order |
| Mainhead model readout | — | `/^.+ \((…\|low\|medium\|high\|xhigh\|max)\)$/` or the bare model name | `.model` span; textContent `Opus 5.5 (high)` (the space lives inside `.eff`) |
| Effort in the header | — | ` (high)` / ` (…)` | `.eff` child of `.model`; class `warn` while the warning shows |
| Warning strip | `status` | text matches `/^Asked for (low\|medium\|high\|xhigh\|max) — .+ (started at (low\|medium\|high\|xhigh\|max)\.\|has no effort setting, so it started without one\.)$/` | `role="status"` mandated; textContent excludes the `aria-hidden` glyph only from the accessible name, so locate by role and match the sentence with `toContainText` |
| Dismiss | `button` | `Dismiss` | inside the strip; scope the locator to it |

#### Invariants

- **INV-E1** — `effortWarning` non-null ⇒ `effortWarning.requested ≠ effortWarning.actual`.
- **INV-E2** — `effortWarning` changes from null to non-null only on the first effort report after a launch that carried `effort`. Asserted from every source state: no report yet, reported, warning set, warning dismissed, after a Resume-button resume, after a Resume-tab resume, after `/clear` rebind, after a daemon restart with a check pending and with none pending, and with other sessions present (a bystander's report or dismissal never sets or clears another's warning).
- **INV-E3** — `effortWarning` changes from non-null to null only by the dismiss endpoint (or the row's removal).
- **INV-E4** — `effort` becomes null only at a launch (and starts null on a Resume-tab resume with nothing recorded); no status post, resume button, `/clear` or restart sets it to null.
- **INV-E5** — a status post never changes `state`, `stateSince`, `attention`, `failure`, `alive`, `permissionMode` or `compactions` (the existing INV-1, now reached by the effort path too).
- **INV-E6** — the strip, when shown, never covers the terminal: the pane's geometry is re-fitted whenever the strip appears or goes.

Walked against the code: `Manager.ApplyStatus` (`internal/session/apply.go:146-193`) is the only
status path; its broadcast decision (apply.go:181) must account for the new fields, or a changed
effort persists without a broadcast. Rebind/`/clear` (`internal/session/apply.go`), Resume
(`internal/server/launcher.go:483`), Resume-from-list (`internal/server/launcherpast.go:59`) and
reconcile write whole rows via `sessionToRow` (`internal/session/row.go:178`) — a field omitted
there is silently reset, which would break INV-E3/E4 on any of those paths.

#### Carried-over measurements

- `kb:fact/status-line-effort-key` (2.1.286, re-checked 2.1.300 by `kb:fact/effort-levels-per-model`): "absent key = no effort setting" is applied as the `{"level": null}` reading. Still valid because the 2.1.300 probe saw the key on every effort-capable post and never on Haiku/Sonnet 4.5 posts.
- `kb:fact/effort-levels-per-model` — measured on the **first** post with no prompt sent; the warning check reads exactly that post. Still valid for an interactive launch through Muster because the flag and the model are the same; a developer's saved `maxEffortLevel` can also cause a mismatch, which the warning reports truthfully.
- `kb:fact/resume-does-not-restore-effort` — measured with `--resume` and no `--model`; the Resume button also passes `--model <id>`. Still valid because `--effort` is clamped per model as on any launch, and the next status post shows what applied.

## Affected Files

### Daemon (daemon-impl)
- `internal/claudecode/status.go` — REQ-5: the status-line payload's top-level `effort.level` is read and reported as present-with-level or absent on every interpreted post.
- `internal/claudecode/launch.go` — REQ-2, REQ-10, REQ-11: the argv builder adds `--effort <level>` when given; the set of valid launch levels lives here beside the permission modes.
- `internal/claudecode/launchtranscripts.go` — REQ-11: the transcript scan records the last `assistant` line's top-level `effort`.
- `internal/session/status.go`, `internal/session/apply.go` — REQ-5, REQ-7: adopt effort from a status update; run the pending launch check on the first report; broadcast when either changed.
- `internal/session/session.go`, `internal/session/row.go` — REQ-5, REQ-7: the session carries effort, the pending requested level and the warning across row round-trips.
- new under `internal/session/effort*.go` — REQ-9: clearing a session's warning (persist + broadcast only when it was set).
- `internal/store/session.go`, `internal/store/repo.go`, new `internal/store/migrations/0016_effort.sql` — REQ-4, REQ-5, REQ-7: the columns in § Schema Changes; `UpsertRepo` writes `last_effort`, `TouchRepo` leaves it.
- `internal/server/launcher.go`, `internal/server/launchcreate.go`, `internal/server/launcherpast.go` — REQ-2, REQ-3, REQ-10, REQ-11: decode/validate `effort`, the combination message, pass effort to the argv on launch and both resumes, seed effort on a Resume-tab resume, start a pending check on a launch with a level.
- `internal/server/sessionwire.go` — REQ-5, REQ-7: the two new Session keys.
- `internal/server/repos.go` — REQ-4: `lastEffort`.
- new under `internal/server/effort*.go` — REQ-9: the dismiss route's handler; registered in `internal/server/server.go` in one line.

### Web (web-impl)
- `web/index.html` — REQ-1, REQ-6, REQ-8: the Effort fieldset; the `.eff` slot and the warning-strip template under the mainhead.
- `web/src/features/launch.ts`, `web/src/features/launchrestore.ts` — REQ-1, REQ-4: select/restore/touched-tracking of effort; the request carries `effort` only for a level.
- `web/src/api/launch.ts` — REQ-3, REQ-4: `effort` on the launch request; `lastEffort` parsed on `Repo`.
- `web/src/api/sessions.ts` — REQ-9: the dismiss call.
- `web/src/protocol/session.ts` — REQ-5, REQ-7: decode `effort` and `effortWarning` (required keys).
- `web/src/sessions/card.ts` — REQ-6, REQ-8: the mainhead view-model's effort text, warn flag and strip sentence.
- `web/src/render/mainhead.ts` — REQ-6, REQ-8: render `.eff`, its `warn` class, and the strip.
- new under `web/src/features/effort*.ts` — REQ-9, REQ-13: the strip's Dismiss controller and the refit on show/hide; registered in `web/src/main.ts` in one line.
- `web/src/style.css` — REQ-8, REQ-12: the `--warn*` tokens in all three theme blocks; `.eff.warn` and the strip's rules.
- `web/scripts/contrast-pairs.json`, `web/scripts/contrast.mjs` — REQ-12: the warn pairs (strip text on `--warn-bg`, `--warn` on the header ground) and a hue band for `--warn` disjoint from amber's.

### Existing tests this breaks
- daemon-tests: `internal/store/migrate_test.go:39,43,60` — migration count and max version 14 → 15.
- daemon-tests: `internal/server/sessionwire_test.go:216` — the Session object's key list gains `effort`, `effortWarning`.
- daemon-tests: tests asserting `validateResumeRequest`'s combination message (`internal/server/launcherpast.go:26`) — the message gains `effort`.
- daemon-tests: `internal/claudecode/claudecodetest/claudecodetest.go` — the shared Session fixture builder, if it enumerates wire keys.
- web-tests: `web/src/sessions/testfixtures.ts` and every `*.test.ts` building a raw Session (`web/src/protocol/session.test.ts`, `web/src/protocol/messages.test.ts`, `web/src/ws.test.ts`, `web/src/api/sessions.test.ts`, `web/src/api/launch.test.ts`) — the two new required keys (kb:lesson/wire-shape-change-owns-its-fixtures).
- web-tests: `web/src/render/mainhead.test.ts`, `web/src/sessions/card.test.ts` — `.model` text now carries brackets for a session with effort.
- e2e-specs: `web/e2e/helpers/session.ts`, `web/e2e/helpers/payloads.ts` — raw Session shapes gain the keys; `web/e2e/focus-header.spec.ts` assertions on the exact model text, if any match a session that reports effort.

## Edge Cases

1. No report yet (trust prompt blocks startup): header `(…)`, no warning → E5
2. Session ends before any report: header has no brackets → E6
3. Lost status post: the header stays stale until the next post corrects it; nothing else is affected → untested: loss is indistinguishable from no post; the next-post correction is E7
4. Daemon down: header and strip keep their last-known state → E13
5. `/effort` before the first report: that report is the one checked; a mismatch warns → D6 (same rule as any first report)
6. Model without effort, launched with a level: warning "has no effort setting", header no brackets → E9
7. Clamped level: warning names requested and actual → E8
8. `default` launch whose first report is any level: no warning → E10
9. Matching launch: no warning → E10 (shared with edge case 8)
10. Resume button on a session with a warning: the warning stays, no re-check → D9
11. Resume button on a session with a pending check that never reported (ended during the trust prompt): the check is cancelled; no warning on its later first report → D9 (shared with edge case 10)
12. Resume-tab resume with no recorded effort: no `--effort`, `effort` null → D12
13. `/clear` rebind (new `session_id`, same pane): effort and warning untouched; the check, if pending, stays pending for the next post → D10
14. Straggler status post from before a `/clear` arriving after the rebind: it is applied like any post (status posts carry no turn identity); a pending check reads it → untested: a straggler post and a fresh post carry the same effort for the same session; no distinguishing behaviour exists
15. Daemon restart with a check pending: the first post after the restart is still checked → D11
16. Daemon restart with a warning set: it survives → E11
17. Two sessions, both warned; dismiss one → the other stays → E12
18. Dismiss of an already-dismissed warning (second window raced): `204`, no broadcast → D13
19. Unknown `effort` value in the request (`auto`, `ultracode`, `HIGH`): `400 invalid_request` → D3
20. Status line reports a level outside the five: shown verbatim, compared verbatim → D5
21. Pane geometry when the strip shows and goes → E14

## Acceptance Criteria

### Daemon
- **D1**: `make test` passes.
- **D2**: `make lint` passes.
- **D3**: `POST /api/sessions` with `effort` outside the five levels and null returns `400 invalid_request` with the message in the Protocol Contract, and writes no repo, settings, tmux or session row.
- **D4**: A launch with `effort: "max"` assembles an argv carrying `--effort max`; absent or null `effort` assembles none.
- **D5**: A routed status post with `effort.level` sets the session's effort to that level verbatim; a post without the key sets `{"level": null}`; an unchanged value broadcasts nothing.
- **D6**: The first report after a launch with a level sets `effortWarning` iff the reported level differs (including null), with `model` the display name after that post.
- **D7**: The INV-E1..E5 table: every input (status post with level, without key, same level; dismiss; Resume button; Resume-tab resume; `/clear` rebind; daemon restart) from every starting state (no report, reported, check pending, warning set, warning dismissed), with a bystander session present, leaves the invariants holding — a unit table in `internal/session`.
- **D8**: `GET /api/repos` returns `lastEffort` equal to the last launch's effort here, null after a `default` launch, and unchanged by a Resume-tab resume.
- **D9**: The Resume button's argv carries `--effort <level>` iff the row's effort level is non-null; after it, `effort` and `effortWarning` are unchanged and no check is pending.
- **D10**: A `/clear` rebind leaves `effort`, `effortWarning` and a pending check unchanged.
- **D11**: A pending check and a set warning both survive a store round-trip (the restart path).
- **D12**: A Resume-tab resume of a transcript whose last assistant line carries `"effort": "medium"` spawns `--effort medium` and seeds `effort` `{"level": "medium"}`; one with no effort recorded spawns none and seeds null.
- **D13**: `DELETE /api/sessions/{id}/effort-warning` returns `204`, clears and broadcasts once; on a null warning it returns `204` without a broadcast; an unknown id returns `404 unknown_session`.
- **D14**: The canary's static tier fails when the installed bundle lacks the `--effort` flag string.

### Web
- **W1**: `make web-test` passes.
- **W2**: `make web-build` passes.
- **W3**: `make web-lint` passes.
- **W4**: `make contrast` passes with the `--warn` family in every theme block.
- **W5**: The mainhead view-model yields `(…)` for an alive session with null effort, no brackets for a dead one with null effort or any session with a null level, and ` (<level>)` otherwise — a unit test.
- **W6**: The strip sentence is composed for the clamped and the no-effort cases, with `the model` when `effortWarning.model` is null — a unit test.
- **W7**: `effortWarning` and `effort` decode with every allowed shape and reject a malformed one — a unit test.

### E2E
- **E1**: `make e2e` passes.
- **E2**: The New form shows the Effort radiogroup with the six radios in order; `default` is checked for a directory with no remembered effort.
- **E3**: Launching with `high` spawns a pane whose start command carries `--effort high`; launching with `default` carries no `--effort`.
- **E4**: After a launch with `xhigh`, reopening the dialog on that directory and clicking it in Recent both check `xhigh`.
- **E5**: A launched session with no status post yet shows `<model> (…)` in the Focus header.
- **E6**: A session that ends without a status post shows its model with no brackets.
- **E7**: A status post with `effort.level` `low` after one with `high` changes the header to `(low)` within the default expect timeout, with no strip.
- **E8**: A launch with `max` whose first post reports `high` shows the strip `Asked for max — <model> started at high.` and a `warn`-tinted `.eff`.
- **E9**: A launch with `high` whose first post carries no `effort` shows the strip ending `has no effort setting, so it started without one.` and the model with no brackets.
- **E10**: A matching launch and a `default` launch show no strip after their first post.
- **E11**: An undismissed strip survives a page reload, appears in a second page on the same daemon, and survives a daemon restart.
- **E12**: With two warned sessions, Dismiss on one removes its strip and tint, in both pages; the other session's strip remains.
- **E13**: With the daemon killed, the header keeps its effort and the strip stays.
- **E14**: The size note's row count drops when the strip appears and returns when it is dismissed.
- **E15**: The Resume button on a session whose last post reported `medium` spawns a pane carrying `--effort medium`, and the header reads `(medium)` before any new post.
- **E16**: A Resume-tab resume of a fixture transcript whose last assistant line records `low` spawns a pane carrying `--effort low`, and the header reads `(low)` before any post.
- **E17**: A Resume-button resume of a warned session shows no new warning after its first post, and the existing one stays until dismissed.

### Automated Checks

```checks
D1 make test
D2 make lint
D15 go build ./...
W1 make web-test
W2 make web-build
W3 make web-lint
W4 make contrast
E1 make e2e
K1 make check-kb
```

### Reviewer-Verified

- **R1**: The status-line `effort` key is read only in `internal/claudecode/` (the `effort` JSON name also appears legitimately in the wire and request structs, so this is a read, not a grep).
- **R2**: No E2E test launches a real `claude`; the effort-capable half rests on `kb:fact/effort-levels-per-model` and `kb:fact/status-line-effort-key`.
- **R3**: The strip and the tint match `opt-a-segmented.html` in all three themes, with the clamped sentence as reworded here.
- **R4**: `.model` (with `.eff`) never truncates at any header width (kb:adr/focus-model-never-truncates-name-blocks-give-way); the strip's Dismiss stays in view from 316px to full width.
- **R5**: no `any` types in new web code.

## Doc Delta

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

## Out of scope

- Greying out levels a model doesn't offer before launch — would mean reading Claude Code's private model-catalog cache.
- Effort on rail cards, tiles or Resume-tab rows.
- Changing effort from Muster after launch (`/effort` in Claude Code stays the way).
- Warning for an in-session `/effort`/`/model` change or a resume that comes back different.
- Offering `auto` or `ultracode`.

## Implementation Notes

**Hints (non-binding):**
- `applyStatusUpdate` (`internal/session/status.go:19-54`) adopts each field only when present and different; the broadcast decision at `internal/session/apply.go:181` compares pointers, so a changed effort needs a fresh pointer and a term there.
- `BuildArgv` (`internal/claudecode/launch.go:36-71`) appends each flag only when non-empty; `--effort` fits after `--permission-mode`.
- `validateLaunchRequest` (`internal/server/launcher.go:185-198`) has a load-bearing check order; effort goes after permissionMode.
- The transcript scan's `transcriptLine` (`internal/claudecode/launchtranscripts.go:168-178`) decodes `message.model` from assistant lines; `effort` is a top-level key on the same line.
- `launchrestore.ts`'s `Touched {model, mode}` and `initialRestore` are the pattern for "a value picked before the repos arrive is kept".
- `web/e2e/helpers/cache-warmth.ts:68-83` already adds keys to a status payload by casting `body.payload`; the pane-start-command argv oracle is `web/e2e/helpers/daemon.ts:1082`.
- `test/canary/static_test.go:78-90` already presence-checks `effort:{level:`; the `--effort` string joins it.
- No existing endpoint dismisses a notice; `unread`'s clear (`internal/session/manager_rail.go:162-169`) is the persist-and-broadcast-only-when-set shape.

**Doc upkeep (orchestrator):**
- `docs/design/design-system.md` §1/§3 as in the Doc Delta.
- `kb:diagram/store-schema` gains the 0016 columns (*Amended*: renumbered after cache-timing's 0015) (§ Schema Changes) in the same commit as the migration.
- `kb:fact/effort-flag-values` gains `guard:` the canary static test that checks `--effort`.
- Tick and move `TODO.md`'s "Add effort to launch options" block at completion.

Decisions this plan makes (proposed ADRs): `kb:adr/session-effort-tri-state-from-status-line`,
`kb:adr/launch-effort-default-sends-no-flag`, `kb:adr/focus-effort-mismatch-warning-persisted-per-session`,
`kb:adr/launch-resume-passes-past-effort`, `kb:adr/theme-warn-tokens-not-amber`. Facts handled:
`kb:fact/status-line-effort-key`, `kb:fact/effort-levels-per-model`, `kb:fact/effort-flag-values`,
`kb:fact/effort-changes-mid-session`, `kb:fact/effort-default-saved-per-model`,
`kb:fact/resume-does-not-restore-effort`.
