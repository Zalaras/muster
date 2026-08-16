# Claude Code version pin and upgrade ritual

**Pinned version: `2.1.233`** — declared in `internal/claudecode/version.go` as
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

`make canary` today asserts only that the installed version matches the pin — that
assertion is real and runs against the live binary. The field assertions in
`test/canary/canary_test.go` are present but skipped: they need the M4 harness (a scratch
repo, a capture server, a session driven through a full turn). They are kept in executable
form so the list cannot silently drift from `spikes/canary-fields.md`.

Until M4, treat a green canary as **necessary but not sufficient** before trusting a new
Claude Code version.
