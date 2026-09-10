# Claude Code version pin and upgrade ritual

**Pinned version: `2.1.246`** (bumped from 2.1.233 on 2026-08-29 after a green `make canary`) — declared in `internal/claudecode/version.go` as
`PinnedVersion`, and asserted by `make canary`.

## Why there is a pin at all

Muster reads Claude Code's hook payloads and status-line JSON. Neither is a documented,
stable interface: field names, delivery semantics and even *which transport works* have
already been observed to differ from the documentation. The step-1 spikes measured all of
it against 2.1.233 — see `spikes/FINDINGS.md` and `spikes/canary-fields.md` — and every one
of those measurements is an assumption baked into the daemon.

SPEC §8 accepts the consequence explicitly: *"when they break, the answer is 'fix Muster
that week.'"* The pin exists so that breakage is **noticed deliberately** rather than
discovered as mysterious dashboard behaviour.

## Why auto-update is NOT disabled

There is exactly one `claude` binary on this machine (`~/.local/bin/claude`), used for all
of Damian's work, not just Muster's managed sessions. Freezing it would mean giving up
Claude Code updates everywhere in exchange for Muster's convenience.

So the decision (2026-08-16) is **detect drift, don't freeze**:

- `musterd` calls `claudecode.CheckPin()` at startup and logs a warning when the installed
  version differs from `PinnedVersion`. Drift is a warning, never fatal — an unexpected
  update must be visible without stopping work.
- `make canary` asserts the same thing, and (from M4) that the payload fields still exist.

For the record, if a hard freeze is ever wanted: there is **no dedicated settings key**.
The only mechanism is the environment variable, set in the `env` block of
`~/.claude/settings.json`:

```json
{ "env": { "DISABLE_AUTOUPDATER": "1" } }
```

`autoUpdatesChannel` (`"stable"` / `"latest"`) selects a channel but cannot disable updates.

## The upgrade ritual

When `musterd` warns about drift, or you deliberately want a newer Claude Code:

1. **Run the canary against the new version.**
   ```sh
   make canary
   ```
2. **If it is green** — bump `PinnedVersion` in `internal/claudecode/version.go`, update the
   version table in `README.md` and the header of `spikes/canary-fields.md`, and commit with
   the canary output referenced in the message.
3. **If it is red** — you have a real interface change. Either:
   - roll back and keep working: `claude update 2.1.233`, then fix the adapter against the
     new behaviour at your own pace; or
   - fix `internal/claudecode/` first, then bump the pin.

   Every fix belongs in `internal/claudecode/` — that boundary exists precisely so a Claude
   Code change is a one-package repair. If a fix wants to leak outward, that is a signal the
   adapter boundary is being violated, not that the boundary is wrong.
4. **Record what changed** in `spikes/canary-fields.md`, so the inventory keeps describing
   reality rather than 2.1.233 forever.

`claude update [target]` accepts `stable`, `latest`, or a specific version, which is what
makes step 3's rollback cheap.

## Current state of the canary

`make canary` is real since 2026-08-29 (plan `m4-canary`), brought to full interface
coverage on 2026-09-10 (plan `canary-full-coverage`). `test/canary/harness_test.go` drives
the **installed** `claude` through the production chain — `WriteWrapperScripts` +
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

`MUSTER_CANARY_OFFLINE=1 make canary` compiles the package and checks the pin plus the
static tier — no tokens, no network, no Keychain read. The harness never touches
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

A green canary is now **sufficient** for a pin bump as far as Muster's automated dependence
on Claude Code goes; the three rituals above are the residual. For a plan review that needs
canary evidence, the convention is a full `make canary` run saved verbatim to
`plans/<plan-name>/canary-run.log` (`make canary 2>&1 | tee plans/<plan-name>/canary-run.log`),
run once per review cycle rather than delegated to a subagent or added to a checks block,
since each real run burns four haiku turns.
