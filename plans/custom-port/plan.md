# Plan: Custom Port

**Created**: 2026-10-23
**Status**: completed
**Work Type**: daemon
**E2E Scope**: harness-only
**Fixture plan**: none (no new spec; the harness's daemon argv switches `-addr` to `-port`)
**Render fixtures**: none
**Features**: connection
**Touches**: update
**Closes**: #107
**Description**: Replace `-addr` with `-port N|default`, remember a chosen port per macOS profile after a y/N prompt, so two profiles on one Mac each run their own musterd.

## Overview

Every musterd binds `127.0.0.1:8765` (`cmd/musterd/main.go:142`, flag `-addr`). Loopback is
machine-wide, so with two macOS profiles the second profile's daemon fails to bind
(#107, port half only). The data dir, tmux socket and hook scripts are already per profile.

This plan replaces `-addr` with an explicit `-port` (the host is always `127.0.0.1`, by design)
and lets a profile remember its port. Port resolution is: the `-port` flag, else the port saved for
this profile, else 8765. When `-port` names a port other than the one this profile would use
anyway, the daemon binds it and then — only on a real terminal — asks once whether to save it
(default No). `-port default` means 8765; saving it clears the saved port. A busy port fails startup
as today; there is no automatic fallback to a free port.

Changing an existing profile's port is safe for sessions and repos: hook and status-line wrapper
scripts are rewritten with the bound port on every start, `settings.local.json` points at script
paths (not ports), and legacy `http` entries are recognised port-agnostically
(`isMusterIngestURL`). What does not carry over is browser-origin state: open tabs and pop-outs on
the old port go dead, bookmarks break, and `localStorage` (note drafts `muster.note-draft.*`, theme
hint `muster.theme-hint`) stays with the old origin until the port goes back. Accepted, not fixed.

## Requirements

### Must Have
- [ ] REQ-1: `-addr` is removed; `-port` takes an integer 0–65535 or the word `default` (= 8765). Any other value exits non-zero before the tmux preflight, naming the flag and the bad value.
- [ ] REQ-2: The bound port is the `-port` value when given, else this profile's saved port, else 8765. The host is always `127.0.0.1`.
- [ ] REQ-3: The saved port lives in this profile's data dir (so `-data-dir` scopes it) and survives restarts and updates.
- [ ] REQ-4: After a successful bind, the daemon asks `Save port N for future starts? [y/N]` on stderr iff all hold: `-port` was given; its resolved port differs from what REQ-2 would pick without the flag; the port is not 0; stdin is a real terminal; this is not an update re-exec (`MUSTER_RESTARTED`).
- [ ] REQ-5: Answer `y`/`yes` (any case) saves the port; anything else, an empty line or EOF saves nothing — the port is used for this run only.
- [ ] REQ-6: Saving `-port default` removes the saved port, so later starts use 8765.
- [ ] REQ-7: The daemon serves (dashboard, ingest) while the prompt waits; a running session's hooks are never held up by an unanswered prompt.
- [ ] REQ-8: A bind failure exits non-zero as today (no fallback port, nothing saved).

### Should Have
- [ ] REQ-9: The bind-failure message names the port and suggests `-port N`.

## Protocol Contract

No protocol changes.

## Schema Changes

No schema change required by the plan. Whether the saved port is a kv row or a file in the data dir is the implementer's choice; if it is a kv row, it needs no migration (the kv table exists).

## UI Specifications

No dashboard change. The only user-facing surface is the terminal prompt (REQ-4) and the
bind-failure message (REQ-9), both on stderr.

## Affected Files

### Daemon (daemon-impl)
- `cmd/musterd/main.go` — REQ-1, REQ-2, REQ-8, REQ-9: `-port` replaces `-addr`; the listen address is resolved from flag/saved/default; bind error names the port and the remedy.
- new under `cmd/musterd/port*.go` — REQ-2–REQ-7: port resolution, flag validation, the save prompt and persistence.
- `cmd/musterd/CLAUDE.md` (hand-written part) — the startup order gains "port resolve → bind → save prompt".

### Web (web-impl)
- `web/e2e/helpers/daemon.ts:750` — scratch daemon argv uses `-port`, `<n>` (harness, no behaviour change).

### Existing tests this breaks
- daemon-tests: `cmd/musterd/main_test.go:153`, `cmd/musterd/open_test.go:77`, `cmd/musterd/onexit_test.go:185`, `cmd/musterd/preflight_test.go:122` — pass `-addr`; switch to `-port 0` / `-port <n>` (`preflight_test.go`'s `freeAddr` returns host:port; it needs the port only).
- e2e-specs: `web/e2e/update.spec.ts:671` — comment names `-addr`; wording only.

## Edge Cases

1. `-port` absent, nothing saved → 8765, no prompt. → D2
2. `-port` absent, port saved → saved port, no prompt. → D3
3. `-port N` where N equals the saved port (or 8765 with nothing saved) → no prompt. → D5
4. `-port default` with a saved port → binds 8765, prompts; yes clears the saved port. → D6
5. `-port default` with nothing saved → binds 8765, no prompt. → D5 (shared with edge case 3)
6. `-port 0` (tests) → ephemeral port, never prompted, never saved. → D7
7. Non-terminal stdin (E2E, scripts, launchd) → one-off, no prompt. → D8
8. Update re-exec keeps `os.Args`, so a one-off `-port` survives the update and the restarted daemon does not re-ask. → D9
9. Saved port is busy (another profile, another app) → exit non-zero, message names the port and `-port`. → D10
10. Bad value (`-port abc`, `-port 70000`, `-port -1`) → exit non-zero before preflight. → D1
11. EOF / empty line / `n` at the prompt → nothing saved. → D11
12. A session's hook fires while the prompt waits → it is accepted (200). → D12
13. Unreadable or corrupt saved value → exit non-zero naming it and the `-port default` remedy. → D13
14. Profile moves to a new port: running sessions' hooks reach the new port after start (scripts rewritten). → untested: existing behaviour, already covered by the wrapper-script tests (`kb:adr/ingest-wrapper-scripts-replaced-atomically`).
15. Browser state on the old origin (open tabs, note drafts, theme hint) does not follow the port. → untested: accepted consequence, documented here.

## Acceptance Criteria

### Daemon
- **D1**: An invalid `-port` value exits non-zero before the tmux preflight runs.
- **D2**: With no flag and nothing saved, the daemon binds 8765.
- **D3**: With no flag and a saved port, the daemon binds the saved port.
- **D4**: With `-port N`, the daemon binds N regardless of the saved port.
- **D5**: The prompt is not shown when the flag's port equals the port the daemon would pick without the flag.
- **D6**: Answering yes to the prompt after `-port default` leaves no saved port.
- **D7**: `-port 0` never prompts and never saves.
- **D8**: Non-terminal stdin never prompts and never saves.
- **D9**: A restarted daemon (`MUSTER_RESTARTED=1`) never prompts.
- **D10**: A bind failure exits non-zero with a message naming the port and `-port`.
- **D11**: Only `y`/`yes` (case-insensitive) saves; empty, EOF and any other answer save nothing.
- **D12**: An ingest POST answers 200 while the save prompt is still waiting.
- **D13**: An unreadable saved port exits non-zero naming `-port default`.
- **D14**: A saved port is read back by the next start in the same data dir.

### E2E
- **E1**: The existing E2E suite passes with the harness on `-port` (harness-only; no new spec).

### Automated Checks

`D15` (no `-addr` flag left in `cmd/` or the E2E harness) covers test files too: no test needs the string.

```checks
D0 go build ./...
D1 make test
D2 make lint
D15 ! rg -n -- '"-addr"' cmd/ web/e2e/
W1 make web-build
E1 make e2e
K1 make check-kb
```

### Reviewer-Verified

- **V1**: The prompt text reads exactly `Save port N for future starts? [y/N]` with N the bound port.
- **V2**: Startup still opens the browser on the new port's tokenised URL when on a terminal.

## Doc Delta

**connection** — becomes true:
- `docs/features/connection/spec.md` § Transport and auth: the daemon binds `127.0.0.1` on the port from `-port`, else the profile's saved port, else 8765; on a terminal it offers to save a flag-given port, and `-port default` clears it.

**connection** — stops being true:
- `docs/features/connection/spec.md` § Transport and auth: "The daemon binds `127.0.0.1` on one port (`-addr`)" — replaced by the sentence above. The spec is at 821 words; the replacement must not grow it (trim elsewhere in the section if needed).

## Out of scope

- Updating another profile's install (the second half of #107) — an install-directory choice on the developer's side, not a Muster defect; #107 closes with this plan.
- Automatic free-port fallback when the port is busy — declined (needs a single-instance lock).
- Migrating browser `localStorage` across ports — accepted loss.

## Implementation Notes

**Hints (non-binding):**
- `cmd/musterd/onexit.go:150` `askKillPrompt` and `isTerminal` (`onexit.go:137`) are the existing y/N-on-stderr prompt over stdin; copy that shape.
- `run()` already knows `restarted` (`main.go:286`) for the browser-open skip; the prompt uses the same condition.
- The listener is bound in `prepareServing` (`main.go:372`); the prompt must come after the HTTP server starts serving (REQ-7), not inside `prepareServing`.
- Go's `flag` accepts `--port` and `-port` alike.

**Doc upkeep (orchestrator):**
- `.claude/skills/dev-loop/SKILL.md` lines 21, 46, 56 mention `-addr`/`8765`; update to `-port`.
- `TODO.md` #107 is done by this plan: tick it and move it to `docs/history/todo-done.md`.

**Decisions (ADRs, `proposed`):**
- `connection-port-flag-replaces-addr` — `-port N|default` replaces `-addr`; host fixed at loopback.
- `connection-port-saved-per-profile-on-prompt` — a flag-given port is saved per data dir only after a terminal y/N prompt (default No); flag > saved > 8765; a busy port fails, no fallback.
