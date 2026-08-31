# Plan: issue-capture

**Created**: 2026-08-31
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: A masthead button that files a GitHub issue on `Zalaras/muster` carrying a strict-allowlist snapshot of muster state, previewed in full before it posts.

## Overview

Dogfooding muster produces friction faster than it produces the discipline to write it
down. This adds a one-click path from "that was annoying" to a filed GitHub issue with
the machine context already attached, so triage later has something to work from.
muster's job ends at creating the issue: Damian triages into `TODO.md` and closes via
commit references. There is no issue *reading*, no label automation, no status sync.

The whole feature turns on one constraint: **the payload is an allowlist, never a dump**.
`Zalaras/muster` may be open-sourced, and everything muster touches is downstream of
prompt text. So the snapshot is assembled by explicit field copy from a pinned list
(§"The allowlist"), hard-excludes six named classes of data, and — because a rule nobody
can see is a rule nobody trusts — the exact markdown body is rendered in the dialog before
posting. The preview is the leak check, and E2E asserts it is byte-identical to what the
daemon POSTs.

Two things the interview surfaced that the description's candidate list got wrong:
`session.title` refreshes from the status line's session name, which Claude Code
**auto-generates from the conversation** (`docs/protocol.md` §5.3 M3 semantics), and
`failure.message` is `LastAssistantMessage` verbatim (`internal/claudecode/interpret.go:86`
→ `internal/session/machine.go:67`). Both are prompt-derived and are hard-excluded.
Damian additionally ruled that anything identifying him or his projects stays out — repo
name, branch, worktree flag, absolute directory — and that account usage, though muster
displays it, never goes in an issue. Per-session context **does** go in, deliberately, so
long-context friction is diagnosable.

Auth is `gh auth token` at time of use — no storage, no OAuth flow, no config. No offline
fallback: a failure is shown in the dialog with the underlying code and message selectable
for copying, and nothing is written anywhere else.

## The allowlist

This is the complete payload. Anything not on this list is not in the snapshot. The
"personal?" column is the verification Damian asked for — every field is justified, not
assumed.

### Always present (dashboard scope and session scope)

| JSON path | Type | Source | Personal? |
|---|---|---|---|
| `capturedAt` | RFC3339 UTC string | daemon clock at capture | No — same class as a commit timestamp |
| `scope` | `"session"` \| `"dashboard"` | which capture this is | No |
| `musterd.version` | string | `cmd/musterd/main.go`'s `version` | No — build metadata |
| `claudeCode.pinned` | string | `claudecode.PinnedVersion` | No |
| `claudeCode.installed` | string \| null | `ClaudeCodeInfo.Installed` | No |
| `claudeCode.drift` | bool \| null | `ClaudeCodeInfo.Drift` | No |
| `host.os` | string | `runtime.GOOS` | No |
| `host.arch` | string | `runtime.GOARCH` | No — matters for the GoReleaser amd64/arm64 split |
| `dashboard.sessionsTotal` | int | `manager.List()` length | No — a count, no names or paths |
| `dashboard.sessionsAlive` | int | count of `Alive` | No |
| `dashboard.view` | `"focus"` \| `"tiles"` | `loadPrefs` | No — a UI pref, and the most likely context for UI friction |
| `dashboard.density` | `"2x2"` \| `"3x2"` | `loadPrefs` | No |
| `dashboard.railSort` | `"manual"` \| `"attention"` | `loadPrefs` | No |

### Present only when `scope == "session"` (the whole `session` object is absent otherwise)

| JSON path | Type | Source | Personal? |
|---|---|---|---|
| `session.state` | string | `sess.State` | No — one of six daemon-defined tokens |
| `session.stateSince` | RFC3339 UTC | `sess.StateSince` | No |
| `session.alive` | bool | `sess.Alive` | No |
| `session.endedAt` | RFC3339 UTC \| null | `sess.EndedAt` | No |
| `session.attention.reason` | `"permission"` \| `"idle"` \| absent | `sess.Attention.Reason`; the object is absent when `Attention` is nil | No — enum |
| `session.attention.since` | RFC3339 UTC | `sess.Attention.Since` | No |
| `session.failure.error` | string \| absent | `sess.Failure.Error` — the **raw token only** | No — a Claude Code error token, displayed verbatim per honesty rule 4 |
| `session.model.id` | string \| null | `sess.Model.ID` | No — a Claude model id (or the launch dialog's custom-model string, which Damian types himself and can see in the preview) |
| `session.permissionMode.value` | string | `sess.PermissionMode` | No |
| `session.permissionMode.source` | `"seed"` \| `"hook"` | `sess.PermissionModeSource` | No |
| `session.context.usedPct` | number \| — | `sess.Context.UsedPct`; the whole `context` object is `null` when `sess.Context` is nil | Damian's explicit inclusion — needed to catch long-context issues |
| `session.context.totalInputTokens` | int | `sess.Context.TotalInputTokens` | As above |
| `session.context.windowSize` | int | `sess.Context.WindowSize` | As above |
| `session.compactions` | int | `sess.Compactions` | No |
| `session.tmuxTarget` | string | `sess.TmuxTarget` — e.g. `muster-7:@4` | No — derived from the muster session id; correlates the issue with daemon log lines |
| `session.createdAt` | RFC3339 UTC | `sess.CreatedAt` | No |
| `session.claudeSessionIdBound` | bool | `sess.ClaudeSessionID != ""` — **the boolean, never the id** | No — the id itself indexes a transcript, so only its presence is reported |
| `session.events.firstSeq` | int \| null | `MIN(seq)` over routed events | No |
| `session.events.lastSeq` | int \| null | `MAX(seq)` | No |
| `session.events.count` | int | `COUNT(*)` | No |
| `session.events.lastReceivedAt` | RFC3339 UTC \| null | `MAX(received_at)` | No |
| `session.events.recentTypes` | string[] | last 10 `event.type` values, oldest-first | No — Claude Code's own event vocabulary; see Implementation Notes → "Why `recentTypes` is not a boundary leak" |

### Hard exclusions — never in the snapshot, the markdown, or the POSTed body

1. **Prompt text** in any form.
2. **Hook payload bodies** (`event.payload`) — whole or in part.
3. **Raw status-line JSON**.
4. **Pane captures** (`sess.LastSnapshot`) — display source only, per the CLAUDE.md hard rule.
5. **Assistant-generated text**: `sess.LastActivity`, and `sess.Failure.Message` (which *is*
   `LastAssistantMessage` — `internal/claudecode/interpret.go:86`), and `sess.Title` (which
   refreshes from the status line's auto-generated session name — `docs/protocol.md` §5.3).
6. **Identifying data**: `sess.Directory`, `sess.Branch`, `sess.IsWorktree`, the repo name,
   `sess.ClaudeSessionID` (the value), and **all account usage** — `fiveHour`, `sevenDay`,
   `modelScoped`, `usageModel`. muster pulls usage to display it; it never files it.

## Requirements

### Must Have

- [ ] **REQ-1**: The masthead carries an `Issue` button, visible in both Focus and Tiles,
      that opens `#issue-dialog`. No keyboard shortcut (settled: button only).
- [ ] **REQ-2**: The dialog carries a Session `<select>` whose options are, in rail order,
      `— none (dashboard only) —` plus every session in the store at the moment the dialog
      opened. It defaults to `main.ts`'s `focusedId` when that session is in the list, else
      to `— none —`. The option list is **frozen for the duration of one dialog open**
      (Edge Case 1).
- [ ] **REQ-3**: `POST /api/issue/captures` takes a snapshot server-side and holds it,
      returning `captureId`, `capturedAt`, the `snapshot` object and `snapshotMarkdown`.
      `POST /api/issues` files the held capture — never a client-supplied payload.
- [ ] **REQ-4**: The snapshot contains exactly the keys pinned in §"The allowlist", built by
      explicit field copy into a dedicated struct. It is never produced by marshalling
      `sessionWire` (or any other whole-object shape) and removing keys.
- [ ] **REQ-5**: None of the six hard-exclusion classes appears in the snapshot, in
      `snapshotMarkdown`, or in the body POSTed to GitHub, in **any** reachable session state
      (INV-1).
- [ ] **REQ-6**: Title is a required single-line input (max 200 chars); the note is an
      optional textarea (max 8000 chars). Submit is disabled while the title is empty after
      trimming, while a capture is in flight or failed, and while a POST is in flight.
- [ ] **REQ-7**: `#issue-preview` shows the exact markdown body that will be posted, updating
      live as the note is typed and when the session selection changes. It is byte-identical
      to the `body` the daemon POSTs (INV-2).
- [ ] **REQ-8**: The daemon obtains a token by running `gh auth token`, then `POST`s to
      `{issueAPIURL}/repos/{issueRepo}/issues` with `Authorization: Bearer <token>`,
      `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. Nothing
      is stored; the token is re-read on every use.
- [ ] **REQ-9**: On success the dialog replaces the form with a success panel reading
      `Filed <owner>/<repo>#<number>` where the identifier is a link to the issue's
      `html_url`, plus a `Close` button. It does not auto-dismiss.
- [ ] **REQ-10**: On failure the dialog shows a one-line `role="alert"` summary plus a
      selectable `<pre>` carrying `<code> — <message>` verbatim, and stays open with the
      form intact so the user can retry. Nothing is written anywhere else — no queue, no
      retry, no local file (settled).
- [ ] **REQ-11**: The `gh` token never appears in a log line, an HTTP response body, or an
      error string, on any failure path (INV-3).
- [ ] **REQ-12**: Values that are unknown render the literal word `unknown` in the markdown
      table — never `0`, never an empty cell (design-system honesty rule 1). Applies to
      `context`, `model`, `claudeCode.installed`, and the `events` bounds.
- [ ] **REQ-13**: While the daemon is down (WS closed), the `Issue` button is disabled and an
      open `#issue-dialog` closes — the same `closeAll()` discipline `render/confirm.ts` uses.
- [ ] **REQ-14**: Three new flags: `-issue-repo` (default `Zalaras/muster`), `-issue-api-url`
      (default `https://api.github.com`; **empty disables the feature** — both endpoints 404
      `not_found`, mirroring §3.9), and `-issue-token-file` (default empty; when set, the
      bearer token is the trimmed contents of that file and `gh` is never executed).
- [ ] **REQ-15**: A capture is immutable and expires. It is posted exactly as previewed
      regardless of state changes in between (INV-4); at most 8 captures are held; each
      expires 15 minutes after `capturedAt`; an unknown or expired `captureId` is
      `409 capture_expired`.
- [ ] **REQ-16**: The daemon logs, at info, one line per filed issue carrying the issue
      number, the URL, the scope and the **lengths** of the title and note — never their
      text. Failures log at warn with the failing stage and the upstream status/message.
- [ ] **REQ-17**: The E2E harness passes `-issue-api-url` and `-issue-token-file`
      **unconditionally** for every scratch daemon — the same discipline
      `web/e2e/helpers/daemon.ts` already applies to `-usage-token-file` — so no test run can
      reach `api.github.com` or execute `gh`.

### Should Have

- [ ] **REQ-18**: The markdown body opens with a `## What happened` section carrying the note
      verbatim, then `## Snapshot` (table), then a `<details>` block with the raw snapshot
      JSON, then a one-line `<sub>` provenance footer naming the exclusions.
- [ ] **REQ-19**: An in-flight submit is guarded: the Submit button disables on click and
      re-enables only on a failure response, so a double-click cannot file two issues.

### Nice to Have

- [ ] **REQ-20**: The `capturedAt` timestamp is shown next to the preview heading, so a
      long-open dialog says how old its snapshot is (honesty rule 8).

## Protocol Contract

Delta against `docs/protocol.md`. **No WebSocket changes** — commands travel over HTTP and
a filed issue is not muster state, so nothing is broadcast. Two new `/api` endpoints,
becoming §3.12 and §3.13. No change to §5.3, §5.4 or the state machine.

### HTTP: POST /api/issue/captures

**Auth**: UI cookie (401 `unauthorized` without it).

**Request:**
```json
{ "sessionId": "integer|null — the muster session to snapshot; null or absent = dashboard scope" }
```

**Response 201:**
```json
{ "captureId":       "string — 32 hex chars, opaque; the handle POST /api/issues files",
  "capturedAt":      "RFC3339 UTC string — when the snapshot was taken",
  "snapshot":        "object — exactly the allowlisted fields (plan §The allowlist)",
  "snapshotMarkdown":"string — the rendered `## Snapshot` section plus the <details> JSON block plus the <sub> footer; no trailing newline" }
```

Taking a capture has no side effects on muster state and broadcasts nothing. The daemon
holds at most 8 captures; taking a 9th evicts the oldest by `capturedAt`.

**Errors:**
- `400 invalid_request` — body present but not JSON, or `sessionId` present and not an integer.
- `404 unknown_session` — `sessionId` names no session.
- `404 not_found` — issue capture is disabled (`-issue-api-url` empty).

### HTTP: POST /api/issues

**Auth**: UI cookie (401 `unauthorized` without it).

**Request:**
```json
{ "captureId": "string — required; from POST /api/issue/captures",
  "title":     "string — required; 1..200 chars after trimming",
  "note":      "string — optional; 0..8000 chars, CRLF normalised to LF by the daemon" }
```

**Response 201:**
```json
{ "number": "integer — the created issue's number",
  "url":    "string — the issue's html_url",
  "repo":   "string — owner/name the issue was filed on (echo of -issue-repo)" }
```

The body the daemon POSTs to GitHub is composed as: the note section
(`"## What happened\n\n" + trimmedNote + "\n\n"`, omitted entirely when the trimmed note is
empty) followed by the capture's `snapshotMarkdown`. No trailing newline. Filing consumes
the capture — a second `POST /api/issues` with the same `captureId` is `409 capture_expired`
(this is REQ-19's server-side half).

**Errors:**
- `400 invalid_request` — body not JSON; `captureId` missing; `title` missing, empty after
  trimming, or over 200 chars; `note` over 8000 chars.
- `404 not_found` — issue capture is disabled (`-issue-api-url` empty).
- `409 capture_expired` — `captureId` unknown, expired, or already consumed.
- `502 issue_auth_failed` — `gh` is not on `PATH`, `gh auth token` exited non-zero, or it
  printed an empty token. `message` carries `gh`'s trimmed stderr and names `gh auth login`.
- `502 issue_post_failed` — GitHub returned non-2xx, the request failed in transport, or
  GitHub returned 2xx with a body the daemon could not parse. `message` carries the HTTP
  status and GitHub's own `message` field when there is one; when the status was 2xx it says
  the issue may nonetheless have been created.

`502` rather than `500` is deliberate: this is the first endpoint in the API whose failure is
genuinely an upstream one, and it lets the UI say "GitHub refused" rather than "muster broke".

### `docs/protocol.md` §2 addition

Two new stable error codes join the §2 list: `capture_expired`, `issue_auth_failed`,
`issue_post_failed`.

## The issue body

Pinned exactly, because `e2e-specs` asserts against it without seeing the implementation.
Line endings are LF throughout, and the composed body has **no trailing newline**.

`body = noteSection + snapshotMarkdown`, where `noteSection` is `""` when the trimmed note
is empty and `"## What happened\n\n" + trimmedNote + "\n\n"` otherwise.

`snapshotMarkdown`, session scope, fully populated:

`````markdown
## Snapshot

| field | value |
| --- | --- |
| musterd | 0.3.1 |
| Claude Code | 2.1.251 installed · 2.1.246 pinned · drift |
| host | darwin/arm64 |
| dashboard | 4 sessions, 3 alive · view tiles 3x2 · rail manual |
| state | working since 2026-08-31T09:11:02Z |
| alive | true |
| attention | permission since 2026-08-31T09:14:50Z |
| failure | server_error |
| model | claude-opus-5 |
| permission mode | plan (last known, source hook) |
| context | 42% · 84211 / 200000 tokens |
| compactions | 2 |
| tmux | muster-7:@4 |
| session | created 2026-08-31T09:04:00Z · claude session bound |
| events | seq 1-47, 47 routed · last 2026-08-31T09:14:58Z |
| recent events | PreToolUse, PostToolUse, PreToolUse, Stop |

<details>
<summary>raw snapshot</summary>

````json
{
  "capturedAt": "2026-08-31T09:15:00Z",
  "scope": "session",
  ...
}
````

</details>

<sub>Filed from the Muster dashboard. Allowlisted snapshot only — no prompt text, hook payload bodies, status-line JSON, pane captures, directory paths, repository names or account usage.</sub>
`````

Row rules, all daemon-side:

- **Row order is exactly as above.** Rows are emitted in a fixed order, never map order.
- **Conditional rows.** `attention` appears only when `session.attention` is present;
  `failure` only when `session.failure` is present; an `ended` row (`| ended | <endedAt> |`)
  is inserted after `alive` only when `endedAt` is non-null.
- **Dashboard scope** omits every row from `state` downwards; the table is the first four
  rows only, and the `<details>` JSON has no `session` key.
- **`unknown` (REQ-12).** `| context | unknown |` when `session.context` is null;
  `| model | unknown |` when `session.model` is null; `2.1.246 pinned · installed unknown`
  when `claudeCode.installed` is null (and the `· drift` suffix is then absent, never
  `· no drift` guessed); `| events | none routed |` when `count` is 0, and
  `| recent events | none |` likewise.
- **Escaping (Edge Case 11).** Every *value* cell replaces `|` with `\|` and any newline with
  a space. Field-name cells and the header/separator rows are daemon constants.
- **The JSON fence is four backticks** so a three-backtick fence in the note cannot close it.
  The JSON is `encoding/json` with two-space indentation, so key order is struct order and
  the output is deterministic for tests.
- **The `<sub>` footer is a constant string**, byte-for-byte as above.

## Schema Changes

**No schema changes required.** Captures live in daemon memory (REQ-15) and are deliberately
not persisted — a snapshot that outlives the daemon that took it would describe a world that
no longer exists. Filed issues are not muster state; GitHub is the record.

One new read-only query is added to `internal/store` (no migration): the per-session event
summary behind `session.events` —
`SELECT MIN(seq), MAX(seq), COUNT(*), MAX(received_at) FROM event WHERE session_id = ?` plus
`SELECT type FROM event WHERE session_id = ? ORDER BY id DESC LIMIT 10`.

## UI Specifications

Design authority: `docs/design/design-system.md` §5 (Modal: `--panel` on a 72% scrim, 1px
`--line2` border, header rule, footer rule; confirm dialogs are 440px). `#issue-dialog` is
**560px** — wider than a confirm dialog because it hosts a preview pane, narrower than the
720px launch dialog. The preview pane scrolls internally; the dialog does not grow past
`80vh`.

### Views

- **Masthead** — gains an `Issue` button, placed after `#usage-refresh` and before
  `#claude-version`. Standard `.btn` (mono, 10.5px, 1px `--line2`, transparent ground) — not
  the filled-amber primary, which the launch button already owns.
- **`#issue-dialog`** (new `<dialog class="modal">`) — heading, then the form (Session,
  Title, What happened), then the preview pane, then the error region, then the footer.

### DOM

Added to `web/index.html`, after `#remove-dialog`:

```html
<dialog id="issue-dialog" class="modal issue" aria-labelledby="issue-dialog-title">
  <h2 id="issue-dialog-title">File an issue</h2>
  <div id="issue-body">
    <form id="issue-form">
      <label class="lab" for="issue-session-select">Session</label>
      <select id="issue-session-select" class="sel"></select>
      <label class="lab" for="issue-title-input">Title</label>
      <input id="issue-title-input" type="text" autocomplete="off" maxlength="200" required />
      <label class="lab" for="issue-note-input">What happened</label>
      <textarea id="issue-note-input" rows="5" maxlength="8000"></textarea>
    </form>
    <section class="preview" aria-labelledby="issue-preview-title">
      <h3 id="issue-preview-title">Payload preview</h3>
      <span id="issue-captured-at" class="meta"></span>
      <pre id="issue-preview" data-testid="issue-preview"></pre>
    </section>
  </div>
  <div id="issue-success" hidden>
    <p role="status">Filed <a id="issue-success-link" href="" target="_blank" rel="noreferrer noopener"></a></p>
  </div>
  <p id="issue-error" class="launch-error" role="alert" hidden></p>
  <pre id="issue-error-detail" hidden></pre>
  <div class="foot">
    <button type="button" id="issue-cancel-button" class="btn">Cancel</button>
    <button type="submit" form="issue-form" id="issue-submit-button" class="btn key">File issue</button>
    <button type="button" id="issue-close-button" class="btn key" hidden>Close</button>
  </div>
</dialog>
```

And in the masthead, between `#usage-model` and `#claude-version`:

```html
<button id="issue-button" class="btn" type="button" aria-label="File an issue" title="File an issue">Issue</button>
```

The error detail is a plain selectable `<pre>` rather than a Copy button on purpose: a
clipboard button needs a browser permission Playwright has to be told about, and selectable
text already satisfies "available to copy".

### User Flows

1. Damian hits friction and clicks `Issue` in the masthead.
2. The dialog opens. `render/issue.ts` populates the Session select from the store (frozen
   list, REQ-2), preselects `focusedId`, and immediately `POST`s `/api/issue/captures` for
   that selection. `#issue-preview` reads `fetching snapshot…` and Submit is disabled.
3. The capture lands. `#issue-preview` renders `noteSection("") + snapshotMarkdown` — i.e.
   just the snapshot, since the note is empty. `#issue-captured-at` reads
   `captured 09:15:00Z`.
4. He types a title (Submit enables) and a note (the preview re-renders on every input,
   locally — no request per keystroke).
5. Changing the Session select discards the held capture, takes a new one, and re-renders.
6. He clicks `File issue`. Submit disables. The daemon runs `gh auth token`, POSTs to GitHub,
   and returns `{number, url, repo}`.
7. `#issue-body` hides, `#issue-success` shows `Filed Zalaras/muster#14` with the number
   linked, `#issue-submit-button` and `#issue-cancel-button` hide, `#issue-close-button`
   shows. He clicks through to GitHub or closes.

Failure path at 6: `#issue-error` shows the one-line summary, `#issue-error-detail` shows
`issue_auth_failed — gh auth token: …`, the form stays as-is, Submit re-enables. The capture
is **not** consumed on failure, so retry works without re-capturing.

### States

- **No data yet** — the capture is in flight: `#issue-preview` reads `fetching snapshot…`,
  `#issue-captured-at` is empty, Submit disabled. Within a landed capture, any unknown value
  renders the word `unknown` in the table (REQ-12) — never a zero, never a blank cell.
- **Data** — as above.
- **Capture failed** — `#issue-preview` reads `snapshot unavailable`, the error region shows
  the code and message, Submit stays disabled. (This is also the `-issue-api-url`-empty case:
  `404 not_found`, message "issue capture is disabled on this daemon".)
- **Daemon down** — `#issue-button` takes `disabled`; an open `#issue-dialog` closes (REQ-13).
  On reconnect the button re-enables; the dialog does not reopen itself.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Masthead issue button | `button` | `File an issue` | `aria-label` overrides the visible text `Issue` |
| The dialog | `dialog` | `File an issue` | via `aria-labelledby="issue-dialog-title"`; distinct role from the button, so no locator collision |
| Session select | `combobox` | `Session` | native `<select>` + `<label for>` |
| Dashboard-scope option | `option` | `— none (dashboard only) —` | em dashes, U+2014, with single spaces as written |
| Title input | `textbox` | `Title` | native `<input type="text">` + `<label for>` |
| Note textarea | `textbox` | `What happened` | native `<textarea>` + `<label for>` |
| Preview pane | — | — | `<pre>`, no implicit role; locate via `[data-testid="issue-preview"]` |
| Preview heading | `heading` | `Payload preview` | `<h3>` |
| Submit | `button` | `File issue` | |
| Cancel | `button` | `Cancel` | `#remove-dialog`/`#end-dialog` also have a `Cancel`; scope the locator to `#issue-dialog` |
| Close (success) | `button` | `Close` | hidden until a successful post |
| Success line | `status` | `/^Filed \S+\/\S+#\d+$/` | `<p role="status">Filed <a>…</a></p>` — `textContent` is `Filed ` + the link text, one space, no separator |
| Success link | `link` | `/^\S+\/\S+#\d+$/` | text is `<owner>/<repo>#<number>` from the response's `repo` and `number`; `href` is `url` |
| Error summary | `alert` | `Could not file the issue.` / `Could not take a snapshot.` | one line, no code in it |
| Error detail | — | `/^\w+ — /` | `<pre>`, no role; locate via `#issue-error-detail`; content is `<code> — <message>` |

### Invariants

Named, because each must hold at all times and each needs asserting from **every** source
state, not the convenient one.

- **INV-1 — the allowlist holds everywhere.** The set of keys in `snapshot`, the strings in
  `snapshotMarkdown`, and the body POSTed to GitHub contain nothing from the six hard-exclusion
  classes. Assert from every reachable source configuration:
  - every `state` — `started`, `planning`, `working`, `needs_input`, `failed`, `idle`
    (`failed` matters most: it is the only state with a `Failure.Message`, and `needs_input`
    is the only one with an `Attention`);
  - `alive:true` and `alive:false` (a dead session carries a `LastSnapshot`);
  - `claudeSessionId` bound and unbound;
  - `Context` known and nil;
  - `Title` set and nil, `LastActivity` set and nil;
  - **with other sessions present**: a session-scoped capture taken while 3+ sessions exist
    must contain nothing from the bystanders — no other session's `tmuxTarget`, state or
    context, and the `dashboard` counts must be the only trace they leave.
- **INV-2 — preview equals payload.** The text content of `#issue-preview` at the moment
  Submit is clicked is byte-identical to the `body` field the daemon POSTs. Assert for: empty
  note; single-line note; multi-line note; a note containing backticks, a triple-backtick
  fence, a `|` character and a `</details>` string; dashboard scope and session scope.
- **INV-3 — the token never escapes.** No log line, no HTTP response body, and no error string
  contains the bearer token, on any of: `gh` missing, `gh auth token` non-zero, empty token,
  GitHub 401, GitHub 403, GitHub 404, GitHub 500, transport error, unparseable 2xx body.
- **INV-4 — captures are immutable.** The snapshot filed is the one previewed. Assert by
  taking a capture, driving the session through a state transition, then filing: the POSTed
  body must carry the pre-transition state.

### Carried-over measurements

**None.** This plan carries no value forward from `spikes/FINDINGS.md` or
`spikes/canary-fields.md` — it reads muster's own daemon state, not a Claude Code wire
format, and it makes no structural change to topology, lifecycle or ownership. The one
measured fact it *relies* on is `docs/protocol.md` §5.3's provenance for `title` and
`failure.message`, and that reliance is to **exclude** them, which no configuration change
can invalidate.

## Affected Files

### Daemon

- `internal/ghissue/ghissue.go` — **new**. The GitHub client: a `TokenReader` seam
  (`GhCLITokenReader` running `gh auth token`, `FileTokenReader` for tests — shaped exactly
  like `internal/claudecode/credentials.go`'s pair) and `CreateIssue(ctx, repo, title, body)`
  returning `(number, htmlURL, error)`. Knows nothing about muster sessions, the store, or
  Claude Code — it takes two strings and posts them.
- `internal/server/issue.go` — **new**. `handleCreateCapture` / `handleCreateIssue`, the
  bounded capture store, the allowlisted snapshot struct and its explicit-copy builder, and
  the markdown renderer. The session parameter of the snapshot builder is named `sess` (the
  D10 check depends on it).
- `internal/server/server.go` — `Config` gains `IssueRepo`, `IssueAPIURL`, `IssueTokenFile`;
  `Server` gains the capture store and the `ghissue` client; two routes registered.
- `internal/store/store.go` — the read-only event summary query (Schema Changes).
- `cmd/musterd/main.go` — the three flags of REQ-14 and their wiring.

### Web

- `web/index.html` — the masthead button and `#issue-dialog` markup above.
- `web/src/render/issue.ts` — **new**. Dialog wiring, the frozen session list, capture
  fetching, the note-section composer, live preview, success/error/daemon-down states. Must
  not know any snapshot field name — the preview is the daemon's string verbatim (W4 check).
- `web/src/api.ts` — `captureIssueSnapshot(sessionId)` and `fileIssue(req)` plus their
  response parsers, in the existing `ApiResult` style.
- `web/src/main.ts` — construct the issue dialog, feed it `focusedId` and the session list,
  disable the button and close the dialog on daemon-down.
- `web/src/style.css` — `.modal.issue` sizing, the preview pane, the error detail block.

### E2E (authored by e2e-specs)

- `web/e2e/issue-capture.spec.ts` — **new**.
- `web/e2e/helpers/ghapi.ts` — **new**. A fake GitHub Issues API on `node:http`, modelled on
  `web/e2e/helpers/usageapi.ts`: records every received request (path, headers, parsed body)
  and returns a configurable status/body.
- `web/e2e/helpers/daemon.ts` — pass `-issue-api-url` and `-issue-token-file`
  unconditionally (REQ-17), plus `-issue-repo`. The default `-issue-api-url` for a scratch
  daemon that did not configure one is a per-run **deny stub** returning
  `403 {"message":"e2e: no fake GitHub configured for this test"}` — loud and diagnosable,
  never the real host.

## Edge Cases

1. **A session is removed while the dialog is open.** The Session select's option list is
   frozen at open (REQ-2), so it does not change under the user. A capture already taken for
   that session still files — it is a snapshot of a moment that really happened. Selecting
   the now-removed session and taking a *fresh* capture returns `404 unknown_session`, which
   surfaces as the capture-failed state.
2. **The capture expires before Submit** (dialog left open >15 min): `409 capture_expired`.
   The UI shows "this snapshot expired — reopen the dialog to take a fresh one" and disables
   Submit until the session selection changes (which re-captures).
3. **The daemon restarts between capture and Submit.** Captures are in memory, so the handle
   is unknown: the same `409 capture_expired` path. In practice the WS drop fires first and
   REQ-13 closes the dialog.
4. **`gh` is not installed / not on `PATH`.** `exec.LookPath` fails → `502
   issue_auth_failed`, message naming `gh` and `gh auth login`.
5. **`gh auth token` exits non-zero or prints nothing.** Same code; message carries the
   trimmed stderr. Its stdout is never logged and never echoed into the response — that is
   where the token is.
6. **GitHub 401/403** (token lacks `repo` scope on a private repo, or secondary rate limit):
   `502 issue_post_failed` carrying the status and GitHub's `message`. No retry, by decision.
7. **GitHub 404** (repo not found, or the token cannot see it): same path. The message names
   the configured `-issue-repo` so a typo is visible.
8. **Transport failure / GitHub unreachable**: same path, `message` is the wrapped transport
   error. Asserted not to contain the token (INV-3).
9. **GitHub returns 2xx with a body the daemon cannot parse.** `502 issue_post_failed` whose
   message says the issue **may have been created** and to check the repo. Never reported as
   a clean failure — the request succeeded upstream.
10. **A note containing a triple-backtick fence.** The snapshot's JSON block uses a
    **four-backtick** fence so a note fence cannot close it. A note fence can still swallow
    the table below it in GitHub's renderer; that is accepted — the note is Damian's own text
    and the preview shows him exactly what he is about to post.
11. **A `|` in a table value** (a custom model string, or a raw `failure.error` token). Every
    value cell escapes `|` as `\|` and collapses any newline to a space. Header and separator
    rows are daemon-constant.
12. **Double-click on Submit.** The button disables on click (REQ-19) and, belt to braces,
    the capture is consumed server-side on success so a second POST is `409 capture_expired`.
13. **Escape (or Cancel) while a POST is in flight.** `<dialog>` closes natively. The daemon
    still files the issue and logs it at info; the UI never shows the link. Accepted for a
    single-user tool — the info log line carries the number and URL.
14. **`-issue-api-url` is empty** (feature disabled): both endpoints `404 not_found`. The
    button stays visible; the dialog explains. No `hello` change, mirroring how §3.9 handles
    a disabled usage poller.
15. **No sessions at all.** The select holds only `— none (dashboard only) —`; a
    dashboard-scope capture is taken and files normally, with the `session` object absent
    (not null) from the snapshot.
16. **A session before its first API response** (`Context` nil): the `context` key is `null`
    in the JSON and the table row reads `unknown` (REQ-12). Never `0%`.
17. **A session that never bound** (`ClaudeSessionID == ""`): `claudeSessionIdBound: false`
    and `events` reports `firstSeq: null`, `lastSeq: null`, `count: 0`, `recentTypes: []`.
18. **A dead session is selected.** Allowed and useful — the friction often *is* the death.
    `alive:false` and `endedAt` are in the snapshot; `LastSnapshot` is not.
19. **Two dashboard windows open.** Captures are keyed by opaque id, so the two never collide.
    Nothing is broadcast, so neither window learns about the other's issue.
20. **The title is whitespace only.** Client-side Submit stays disabled; the daemon rejects it
    `400 invalid_request` anyway, since the client is not the gate.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e.

### Daemon

- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: The marshalled snapshot's key set, at every level, is exactly the set pinned in
  §"The allowlist" — asserted by a unit test over a session populated in **every** field
  including all the excluded ones.
- **D5**: `internal/ghissue` depends on none of `internal/session`, `internal/store`,
  `internal/claudecode`, `internal/usage`.
- **D6**: `internal/server/issue.go` never reads `sess.Title`, `sess.Directory`, `sess.Branch`,
  `sess.IsWorktree`, `sess.LastActivity`, `sess.LastSnapshot` or `Failure.Message`.
- **D7**: The literal `api.github.com` appears nowhere under `internal/` — the flag default in
  `cmd/musterd/main.go` is its only definition, exactly as `-usage-api-url` is handled.
- **D8**: No standing Claude-Code-format leak: `hook_event_name` appears nowhere outside
  `internal/claudecode/`.
- **D9**: A unit test asserts the bearer token appears in no error string returned by
  `ghissue.CreateIssue` across all of INV-3's failure paths — the same defensive shape as
  `TestFetchUsage_ErrorMessagesNeverContainTheToken`.
- **D10**: A second `POST /api/issues` with an already-consumed `captureId` returns
  `409 capture_expired` and posts nothing upstream.
- **D11**: A capture taken before a state transition, filed after it, carries the
  pre-transition state (INV-4).
- **D12**: `POST /api/issue/captures` with 3+ sessions present, scoped to one of them,
  produces a snapshot containing no other session's `tmuxTarget`, state or context.

### Web

- **W1**: `make web-build` succeeds.
- **W2**: `make web-test` passes.
- **W3**: `render/issue.ts` references no snapshot field name — the preview is the daemon's
  `snapshotMarkdown` verbatim.
- **W4**: The note-section composer produces the empty string for a whitespace-only note, and
  `"## What happened\n\n<note>\n\n"` otherwise, with CRLF normalised to LF.
- **W5**: No `any` types in new web code.

### E2E

- **E1**: A session launched with sentinel strings in its title, directory and last-assistant
  message yields a preview, a capture response and a POSTed GitHub body in which **none of
  the sentinels appears** (INV-1).
- **E2**: The text of `#issue-preview` at Submit time is byte-identical to the `body` the fake
  GitHub server receives, for an empty note and for a note containing backticks, a fence, a
  pipe and a `</details>` (INV-2).
- **E3**: Filing succeeds against the fake GitHub server and the dialog shows
  `Filed <owner>/<repo>#<n>` with the number linked to the returned `html_url`.
- **E4**: A fake GitHub returning 403 leaves the dialog open with the form intact, shows the
  alert and the selectable detail carrying `issue_post_failed`, and re-enables Submit.
- **E5**: A dashboard-scope capture (`— none (dashboard only) —` selected) posts a body whose
  table has no session rows.
- **E6**: Killing the daemon disables `#issue-button` and closes an open `#issue-dialog`.
- **E7**: A session with no context yet renders `unknown` in the preview's context row, never
  `0%`.
- **E8**: The E2E harness cannot reach real GitHub — `api.github.com` appears nowhere under
  `web/e2e/`, and `daemon.ts` passes both issue seam flags unconditionally.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
D5 go list -deps ./internal/ghissue > /dev/null && ! go list -deps ./internal/ghissue | rg -q "Zalaras/muster/internal/(session|store|claudecode|usage)"
D6 ! rg -n 'sess\.(Title|Directory|Branch|IsWorktree|LastActivity|LastSnapshot)|Failure\.Message' internal/server/issue.go
D7 ! rg -n "api\.github\.com" internal/
D8 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
W3 ! rg -n "tmuxTarget|stateSince|compactions|claudeSessionIdBound|capturedAt|permissionMode" web/src/render/issue.ts
E1 make e2e
E8 ! rg -n "api\.github\.com" web/e2e/ && rg -q -- '-issue-api-url' web/e2e/helpers/daemon.ts && rg -q -- '-issue-token-file' web/e2e/helpers/daemon.ts
```

**Negative-grep scope notes** (the two extra authoring steps):

- **D6** greps one implementation file only; `_test.go` files are deliberately **out of
  scope**, because `internal/server/issue_test.go` must legitimately populate
  `sess.Title`/`sess.LastActivity` with sentinels to prove D4 and INV-1. The check depends on
  the snapshot builder's session parameter being named `sess` (Affected Files pins this), and
  on `issue.go` referring to excluded fields in comments by their **lowercase wire names**
  (`lastActivity`, `directory`) rather than their Go field names — a comment reading
  `// never sess.Title` would trip the check that comment is describing.
- **D7/E8** are literal-host checks. `internal/**` never names the host; `cmd/musterd/main.go`
  is excluded from D7 because it holds the flag default, which is the point. `web/e2e/**`
  never names it because every scratch daemon is pointed at a stub (REQ-17).
- **W3** greps one file. The preview is a daemon-supplied string, so `render/issue.ts` has no
  legitimate reason to name a snapshot field. Its `_test.ts` twin is out of scope for the same
  reason as D6 — a unit test may reasonably use a fixture markdown string containing them.
- **Dry run against this document**: every pattern above is scoped to `internal/`, `cmd/`,
  `web/src/render/issue.ts` or `web/e2e/`. None scans `plans/`, so nothing in this plan's own
  prose or snippets can trip a check. Verify with
  `rg -n "api\.github\.com|hook_event_name" plans/issue-capture/plan.md` before approving —
  matches there are expected and harmless.

### Reviewer-Verified

- **D4**: the snapshot's key set matches §"The allowlist" exactly (read the test, then read
  the allowlist — a test that asserts the wrong set passes just as green).
- **D9, D10, D11, D12**: present, and asserting what their prose says.
- **W4, W5**: read the composer and check for `any`.
- **E7**: the `unknown` rendering, confirmed in a browser.
- **R1 — the real post.** Launch a real session with
  `--model claude-haiku-4-5-20251001`, prompt it "say hi", file a real issue from the
  dashboard against `Zalaras/muster`, then:
  1. `gh issue list -R Zalaras/muster -L 3` — confirm it is there; paste the output into
     `plans/issue-capture/review.md`.
  2. `gh issue view <n> -R Zalaras/muster --json title,body` — paste the **full body** into
     review.md and read it against §"The allowlist": no prompt text, no assistant text, no
     directory, no repo name, no branch, no usage.
  3. `gh issue close <n> -R Zalaras/muster -c "pipeline verification (plan issue-capture)"`.
  4. Kill the haiku session — an orphan keeps burning subscription (CLAUDE.md hard rule).

  This is the only step in the plan that touches real GitHub and real subscription. It runs
  once, at the end, by `review-work`.

## Implementation Notes

**Why `recentTypes` is not a boundary leak.** `session.events.recentTypes` carries the last 10
values of the `event.type` column. That column is written by the ingest path as the hook's
event-name field verbatim and is otherwise treated as opaque — nothing outside
`internal/claudecode/` switches on it, and this feature does not either: it `SELECT`s a
column and joins the strings. The CLAUDE.md hard rule is about Claude-Code-format *knowledge*
living outside the adapter — a literal event name in a comparison, a payload key, a parsing
rule. Pass-through of an opaque stored value is not that, and the D8 check (no
`hook_event_name` outside `internal/claudecode/`) stays clean because no event name is written
in source. If review disagrees, the field is one line to drop and nothing else depends on it.

**Do not copy this plan's exclusion list into `issue.go` comments verbatim.** §"The
allowlist" writes the excluded fields in Go form (`sess.Title`, `Failure.Message`) because
that is what a reviewer needs to see. Check D6 greps exactly those strings in
`internal/server/issue.go`, so a doc comment there saying `// never reads sess.Title` fails
the gate it is describing. In that file, name excluded fields by their lowercase wire names
(`title`, `lastActivity`, `directory`) and link to this plan section instead.

**Assemble by copy, never by subtraction.** The snapshot struct is written out field by field
against §"The allowlist". Do not build it by marshalling `sessionWire` and deleting keys, and
do not embed `session.Session`: both make the allowlist a *diff* against a growing type, so
the next field added to `Session` silently joins the payload. Explicit copy makes the next
field's absence the default.

**One composer for the note section, two callers.** The daemon owns `snapshotMarkdown` — the
only place allowlisted data becomes text. The note section is composed on both sides (the
daemon at post time, `render/issue.ts` for the preview) because otherwise every keystroke is a
round trip. That is safe precisely because the note is the user's own typing, with no
allowlist dimension; and INV-2's E2E turns the duplication into a tested equality rather than
a hope. Pin the rule on both sides: normalise CRLF to LF, trim the whole string, and emit
either `""` or `"## What happened\n\n" + trimmed + "\n\n"`.

**Follow the `usage-model-bar` seam shapes.** `ghissue.TokenReader` mirrors
`claudecode.TokenReader` (`credentials.go`) — a `func(ctx) (string, error)` re-read on every
call, with a file-backed variant that makes it structurally impossible for a test to fall
through to the real thing. `-issue-api-url`'s empty-disables-everything behaviour mirrors
`UsageAPIURL`'s (`server.go:76-82`), for the same reason: a zero-value `Config` must never
reach a real host.

**Timeouts.** `gh auth token`: 5 s (`exec.CommandContext`, matching `versionCheckTimeout` in
`main.go`). The GitHub POST: 10 s. Both derive from the request context, so a client
disconnect kills them.

**Logging.** Info on success: `number`, `url`, `scope`, `titleLen`, `noteLen` — never the
title or note text, since Damian may paste anything into a free-text box and the daemon log is
not the place for it. Warn on failure: the stage (`token` / `post` / `decode`), the upstream
status when there is one, and GitHub's `message`. Never the token, never the request body,
never the `Authorization` header. This is a narrower reading of the "never log hook payloads"
hard rule applied to a new free-text surface.

**Doc upkeep (orchestrator's, not an impl agent's).** On completion:
- `SPEC.md` — a §11 changelog entry, and a §2.6 note that musterd runs `gh auth token` at time
  of use, never storing, logging, persisting or forwarding it (same shape as the existing
  Keychain paragraph).
- `TODO.md` — tick the issue-capture item, and add a Pre-v1/open-sourcing item: **revisit
  issue-capture auth before open-sourcing** (a `gh`-shelling daemon assumes a single trusted
  local user), alongside a note that the allowlist should be re-audited at that point.
- `docs/design/design-system.md` §5 — the masthead component line gains the `Issue` button.
- `docs/protocol.md` — the §3.12/§3.13 delta and the §2 error codes are merged by the planning
  session on approval, not by an agent.
