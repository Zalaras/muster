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

`make canary` is real since 2026-08-29 (plan `m4-canary`). `test/canary/harness_test.go`
drives the **installed** `claude` through the production chain — `WriteWrapperScripts` +
`MergeSettings` into a scratch repo's `.claude/settings.local.json`, from a data dir whose
path contains a space — and captures the wrapper's enveloped POSTs on an in-test server.
Four runs per invocation, ~40 s wall time:

| run | shape | cost | proves |
|---|---|---|---|
| A | headless `-p`, `$MUSTER_SESSION` set, one `echo hi` tool call | 1 haiku turn | SessionStart transport, hook field inventory, envelope on every event, quoting |
| B | same, no `$MUSTER_SESSION` | 1 haiku turn | an unmanaged session posts **nothing** |
| C | headless with an unauthenticated `CLAUDE_CONFIG_DIR` | 0 tokens | `StopFailure{authentication_failed}` replaces `Stop` |
| D | interactive in tmux on a scratch socket, "say hi" | 1 haiku turn | status-line fields, unknown-vs-zero (pre-response post), `version` |

`MUSTER_CANARY_OFFLINE=1 make canary` compiles the package and checks only the pin — no
tokens. The harness never touches `~/.claude/settings.json` (verify: `md5 -q` before and
after), lives under `/var/folders` (no parent `CLAUDE.md` leaks in), and tears its tmux
server and scratch dirs down in `TestMain`.

**Still manual** (skipped rows, reason `needsInteractiveDialog`): the plan-mode sequence,
`PermissionRequest`, `Notification`, `SubagentStop` — they need a permission dialog driven
by `send-keys`, too fragile for a gate; verify with `/interface-probe` when they matter.
Also manual: the R2 End → Resume same-`session_id` check (TODO M4).

A green canary is now **sufficient** for a pin bump as far as Muster's automated
dependence on Claude Code goes; the manual rows above are the residual.
