# Claude Code versions

**Verified range: <!-- versions:range -->2.1.246–2.1.269<!-- /versions:range --> —
declared in `internal/claudecode/observed_versions.txt` and asserted by `make canary`.**

Versions `make canary` has gone green on (one row per green run outside the range, appended
by `go run ./tools/versions bump`; this table is generated — edit the record, not the table):

<!-- versions:table -->
| version | verified on | run |
| --- | --- | --- |
| 2.1.246 | 2026-08-29 | m4-canary |
| 2.1.267 | 2026-09-10 | canary-full-coverage |
| 2.1.269 | 2026-09-12 | make canary |
<!-- /versions:table -->

## Why a range, not a pin

Muster reads Claude Code's hook payloads and status-line JSON. Neither is a documented,
stable interface: field names, delivery semantics and even *which transport works* have
already been observed to differ from the documentation. The step-1 spikes measured all of
it against 2.1.233 — see `spikes/FINDINGS.md` and `docs/history/spikes/canary-fields.md` — and every one
of those measurements is an assumption baked into the daemon.

Earlier this was a single pinned version, equality-checked at startup. That produced a
manual bump ritual that fell behind reality on its own terms: an installed Claude Code
went green on `make canary` while the pin still named an older version, and the daemon's
own drift warning had nothing useful to tell the one person running it — "drift from
pinned 2.1.246" means nothing to anyone who didn't set the pin (#6).

The declaration now matches what Muster actually knows: a **floor** (the oldest version
`make canary` has gone green on) and a **verified ceiling** (the newest). A version inside
that range — including one nobody has literally run, sitting between two observed rows —
is `verified` by inference, not by having been individually driven through the canary.
Muster still builds no version-gated adapters and no change-point table: every shape in
`docs/history/spikes/canary-fields.md` has held from 2.1.233 through 2.1.267, and every recorded delta
has been an addition. The range exists to make the declaration honest, not to gate
behaviour on it.

## Why auto-update is NOT disabled

There is exactly one `claude` binary on this machine (`~/.local/bin/claude`), used for all
of Damian's work, not just Muster's managed sessions. Freezing it would mean giving up
Claude Code updates everywhere in exchange for Muster's convenience.

So the decision (2026-08-16, reaffirmed 2026-09-10) is **detect and classify, don't
freeze**:

- `musterd` calls `claudecode.CheckVersion()` at startup and classifies the installed
  version as `unknown | below | verified | above` against the observed range. `below` and
  `above` log a warning; `verified` logs info; none of the four ever stops the daemon
  starting or serving (INV-3).
- `make canary` asserts the same classification, and — from M4 — that the payload fields
  still exist.
- A green, non-offline `make canary` run **automatically extends the range**: see "The
  green ritual" below.

For the record, if a hard freeze is ever wanted: there is **no dedicated settings key**.
The only mechanism is the environment variable, set in the `env` block of
`~/.claude/settings.json`:

```json
{ "env": { "DISABLE_AUTOUPDATER": "1" } }
```

`autoUpdatesChannel` (`"stable"` / `"latest"`) selects a channel but cannot disable updates.

## The green ritual

`make canary` (non-offline) ends with `go run ./tools/versions bump`, which runs
automatically after a green `go test`:

- Installed version **inside** the verified range (including the ceiling itself, when
  `MUSTER_CANARY_FORCE` is unset — see "Skipping on an unchanged install" below) — prints
  that nothing needs recording, exits 0, edits nothing.
- Installed version **outside** the range (`below` or `above`) — appends
  `<installed> <today> make canary` to `internal/claudecode/observed_versions.txt`, runs
  `go run ./tools/versions gen` to regenerate every fragment in `README.md` and this file,
  prints a `git diff --stat` summary and a commit hint, and exits 0. **The tree is left uncommitted** — review the diff, then:

  ```sh
  git commit -am "fix(versions): record Claude Code <installed> as verified by make canary"
  ```

  A `fix` commit cuts a patch release (docs/conventions.md §Commits), so anyone already on
  `<installed>` stops seeing the warning as soon as the release ships. The record and the
  fragments `gen` rewrites are the **only** files a bump touches: `internal/claudecode`'s unit
  tests recompute the ceiling from the rows rather than restating it, so no test needs a hand
  edit (it did until 2026-09-12, and the ritual never said so).
- Record file already has **uncommitted changes** when `bump` runs — refuses, exits
  non-zero, naming the reason; nothing is edited (a green run never overwrites work in
  progress on the one file it writes to).

`MUSTER_CANARY_OFFLINE=1` never bumps (it prints its own no-op line) and never touches the
record, regardless of the installed version.

## The red ritual

A red `make canary` is a real interface change. There is no version-gated adapter
machinery to extend — because there has never yet been a change point to hang one off — so
the first one is added by hand:

1. **Diagnose.** Read the fact record the failing assertion guards (`go run ./tools/kb ls
   --type fact`, `docs/facts/`); it names the field or behaviour that changed.
2. **Branch the fix inside `internal/claudecode`.** Key the new behaviour off the
   classified installed version (`claudecode.Classify`/`CheckVersion`), keeping the old
   path for versions below the change point — the adapter boundary exists precisely so a
   Claude Code change is a one-package repair (docs/conventions.md "Boundary"). If a fix
   wants to leak outward into `cmd/musterd` or `internal/server`, that is a signal the
   boundary is being violated, not that the boundary is wrong.
3. **Extend the canary** to assert both the old and the new shape, so a future regression
   in either direction is caught.
4. **Record the change point** in `docs/facts/`: close the old fact's `verified` range and
   retire it, and write the new shape as a new fact citing it, rather than silently
   overwriting what the record used to say — the facts' job is to describe reality across
   the whole verified range, not just the latest version.
5. **Re-run `make canary`.** Green now bumps per "The green ritual" above.

Rolling back instead (`claude update <version>`) to keep working at your own pace is always
available — `claude update` accepts `stable`, `latest`, or a specific version.

## Skipping on an unchanged install

`test/canary/harness_test.go`'s `TestMain` compares the installed version against
`Verified()` (the ceiling) before running anything. If they're equal and
`MUSTER_CANARY_FORCE` is unset, the harness and live tiers skip with a printed reason —
zero tokens, no Keychain read — since nothing about the installed Claude Code has changed
since the last green run; the static tier and the classification test still run.

**Force a full run anyway** with `MUSTER_CANARY_FORCE=1 make canary` — the convention for a
plan review that needs canary evidence even when the installed version hasn't moved, since
a change inside `internal/claudecode` itself is not exercised by an unforced canary on an
unchanged install. `MUSTER_CANARY_OFFLINE=1` always wins over `MUSTER_CANARY_FORCE=1`: no
session, no Keychain, no bump, regardless of either flag or the installed version.

## Inferred versions are honest, not verified

A version strictly between two rows in `internal/claudecode/observed_versions.txt` — say
2.1.255, when the record holds 2.1.246 and 2.1.267 — classifies as `verified` without ever
having been individually run through `make canary`. That is a deliberate inference, not an
oversight: Claude Code's interface has shown no change points across the whole recorded
range, so treating every in-between version as covered is the honest description of what
Muster actually knows, and is stated as such in the masthead and in `docs/history/spikes/canary-fields.md`
rather than implied silently.

## Current state of the canary

`make canary` is real since 2026-08-29 (plan `m4-canary`), brought to full interface
coverage on 2026-09-10 (plan `canary-full-coverage`), and extended to the verified range on
2026-09-10 (plan `version-claude-interface`). `test/canary/harness_test.go` drives the
**installed** `claude` through the production chain — `WriteWrapperScripts` +
`MergeSettings` into a scratch repo's `.claude/settings.local.json`, from a data dir whose
path contains a space — and captures the wrapper's enveloped POSTs on an in-test server.
Three tiers: a harness that launches real sessions, a static tier that scans the installed
binary, and a live tier that calls the real Keychain and usage API. ~2.5–3 min wall time:

| run | shape | cost | proves |
|---|---|---|---|
| A | headless `-p`, `$MUSTER_SESSION` set, one `echo hi` tool call | 1 haiku turn | SessionStart transport, hook field inventory, envelope on every event, quoting |
| B | same, no `$MUSTER_SESSION` | 1 haiku turn | an unmanaged session posts **nothing** |
| C ×4 | headless with an unauthenticated `CLAUDE_CONFIG_DIR`, one run per launch permission mode (no flag, `plan`, `acceptEdits`, `auto`) | 0 tokens | `StopFailure{authentication_failed}` replaces `Stop`; `UserPromptSubmit.permission_mode` reflects each launch flag (`auto` on haiku may report `auto` or `default` — both accepted, logged) |
| D | interactive in tmux on a scratch socket, launched via `BuildArgv` with `Title: "Muster Canary"` and plan-mode permission, "say hi", then a bounded wait for the post-`Stop` `Notification{idle_prompt}` | 1 haiku turn | status-line fields, unknown-vs-zero (pre-response post), `version`, `session_title`/`session_name` flowing through the flag, the idle-prompt Notification field inventory |
| E | a second tmux session on the same scratch socket, resuming run D's session via `BuildArgv` with `ResumeSessionID` (byte-for-byte what `internal/server`'s Resume builds), then a prompt that calls `ExitPlanMode`, waited on through `PermissionRequest` and the following `Notification{permission_prompt}`, killed **without answering the dialog** | 1 haiku turn | `SessionStart.source == "resume"` with `session_id`/`transcript_path` matching D (closes the R2 check); `PreToolUse → PermissionRequest` ordering and field inventory; the `permission_prompt` Notification sharing `PermissionRequest`'s `prompt_id` |

**Static tier** (`test/canary/static_test.go`, `TestInstalledBinaryCarriesInterfaceStrings`):
resolves the `claude` on `PATH` through `EvalSymlinks` to the Mach-O bundle and scans it in
bounded overlapping chunks for the interface strings Muster depends on but cannot drive by
launching a session — every `claudecode.LaunchEnv()` key (today
`CLAUDE_CODE_SCROLL_SPEED`, read from the map so the assertion follows production rather
than spelling the variable), the theme enum members, the usage endpoint path and beta
header, the credential JSON key, the Keychain mechanism, and the `permission-mode` flag
name. It runs under `MUSTER_CANARY_OFFLINE=1` (no session, no network) and reports misses
by name and resolved path. A string surviving in the binary does not prove its semantics
are unchanged — it catches rename or removal, the silent-degrade failure class
`CLAUDE_CODE_SCROLL_SPEED` was named for.

**Live tier** (`test/canary/live_test.go`, gated on the same `MUSTER_CANARY_OFFLINE` skip):
runs the production Keychain reader for the current OS user and **fails** (never skips) on
`ErrNoCredentials`; calls the production `FetchUsage` and performs one raw
`GET /api/oauth/usage` with the real token, asserting response shape only; parses the real
`~/.claude.json` through `ReadThemeFamily`. Read-only, and the token/response body are never
printed — failure messages name keys only. A 401/403 or a parse failure fails the run rather
than skipping, since a skip would pass silently on the one machine this gate exists for.

`MUSTER_CANARY_OFFLINE=1 make canary` compiles the package and checks the classification
plus the static tier — no tokens, no network, no Keychain read. The harness never touches
`~/.claude/settings.json` (verify: `md5 -q` before and after), lives under `/var/folders`
(no parent `CLAUDE.md` leaks in), and tears both tmux sessions and the scratch socket's
server down in `TestMain`.

**Still manual** (a named `/interface-probe` ritual, not a gated assertion): step 3 of the
plan-mode sequence, `PostToolUse{ExitPlanMode, permission_mode: "acceptEdits"}` — it needs
the permission dialog actually answered via `send-keys`, too fragile for a gate; `agent_id`
on subagent-originated hooks — a subagent costs ≥ 2 turns and Muster's only dependency on it
is that field; and the `fable` model alias — verified by static inspection by hand.
`SubagentStop` itself is not a residual: `interpret.go` treats it as `KindInert` and Muster
reads nothing from it.

If run E's `PermissionRequest` wait times out (haiku answered the `ExitPlanMode` prompt with
text instead of calling the tool) or the live tier's usage call returns a 5xx, treat it as
accepted gate flakiness of the same class as run A's `echo hi` failing to call a tool:
**rerun once before reading it as drift.**

A green canary is now **sufficient** to extend the verified range as far as Muster's
automated dependence on Claude Code goes; the three rituals above are the residual. For a
plan review that needs canary evidence, the convention is a full, forced `make canary` run
saved verbatim to `plans/<plan-name>/canary-run.log`
(`MUSTER_CANARY_FORCE=1 make canary 2>&1 | tee plans/<plan-name>/canary-run.log`), run once
per review cycle rather than delegated to a subagent or added to a checks block, since each
real run burns four haiku turns.
