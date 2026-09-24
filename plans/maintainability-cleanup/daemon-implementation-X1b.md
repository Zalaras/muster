# Daemon Implementation: maintainability-cleanup — Unit X1b (plan-ID comment sweep, cmd/musterd + internal/termbridge + internal/tty + internal/webui)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: kb: 425 records, 23 features, 0 problem(s) (`make check-kb`, run before this unit's edits); pack command (`go run ./tools/kb pack --plan maintainability-cleanup --role daemon-impl`) returned only the `worktree-shares-git-config` lesson and the `release-signing` runbook — no plan-scoped protocol delta for this comment-only unit.

## Scope

Comments only, no code changes, in `cmd/musterd/**`, `internal/termbridge/**`, `internal/tty/**`, `internal/webui/**` (non-test `.go` files). Per plan.md § "Defaults that bind the units": code comments cite no plan IDs (`REQ-n`, `Dn`, `Edge Case n`, review cycles, plan or milestone names). Method follows `plans/maintainability-cleanup/daemon-implementation-X1a.md`: each hit resolved to a `kb:adr/…` citation (found via `go run ./tools/kb for <file>` and `docs/adr` greps), to plain prose stating the invariant, or deleted where it only restated the code.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `cmd/musterd/main.go` | comments | REQ-1/4/5/6/8/16/19/21/28, D4, R4, "Implementation Notes" citations across flag defaults, `resolveInstall`, `run`, `prepareStartup`, `logStartup`, `maybeOpenDashboard`, `keychainUser` → `kb:adr/usage-model-window-polled-from-oauth-api`, `kb:adr/theme-claude-theme-read-only-poll`, `kb:adr/update-check-runs-in-daemon-daily`, `kb:adr/update-install-kinds-decide-who-may-apply`, `kb:adr/connection-dashboard-auto-opens-on-terminal`, `kb:adr/update-restart-is-in-place-reexec-not-shutdown`, `kb:adr/surfaces-tmux-preflight-at-startup`, `kb:adr/usage-keychain-token-read-only`, or plain prose |
| `cmd/musterd/onexit.go` | comments | REQ-3/6/9/13, Edge Case 10/13, "review cycle 1 Minor 3", "Implementation Notes" → `kb:adr/lifecycle-shutdown-leaves-sessions-running`, `kb:adr/surfaces-shell-dies-at-kill-shutdown-too`, `kb:adr/connection-dashboard-auto-opens-on-terminal`, or plain prose |
| `cmd/musterd/open.go` | comments | REQ-6/8, Edge Case 8/9, "R4" → `kb:adr/connection-dashboard-auto-opens-on-terminal`, plain prose |
| `cmd/musterd/preflight.go` | comments | REQ-1/2/3/4/12/13/17, "D13/R1", "R2" → `kb:adr/surfaces-tmux-preflight-at-startup`, plain prose (README.md section name corrected from "Prerequisites" to its actual heading "Requirements" while touching this comment) |
| `cmd/musterd/tokens.go` | comments | REQ-2/3 → plain prose (no dedicated kb record for token-bootstrap/tokens.json mechanics; grepped `docs/adr docs/facts` for `ui_token\|ingest_token\|tokens.json`, no hits) |
| `cmd/musterd/update.go` | comments | REQ-19/22, "INV-7", "Implementation Notes" → `kb:adr/update-restart-is-in-place-reexec-not-shutdown`, `kb:adr/update-install-kinds-decide-who-may-apply`, plain prose |
| `cmd/musterd/webdist.go` | comments | plan embed-dashboard REQ-3/REQ-9, plan v1-cleanup REQ-9, Edge Case 2 → `kb:adr/connection-dashboard-embedded-in-binary`, `kb:adr/connection-missing-web-build-fails-fast`, plain prose |
| `cmd/musterd/claudeversion.go` | comments | INV-3 → `kb:adr/connection-installed-claude-classified-never-refused` |
| `internal/termbridge/termbridge.go` | comments | "review cycle 1 Major 3", REQ-6/12, plus non-regex-matched spike citations "FINDINGS §7"/"FINDINGS §7(d)" (same category — direct spike-file pointers rather than kb records) → `kb:adr/surfaces-shared-attach-single-pty`, plain prose |
| `internal/webui/webui.go` | comments | plan embed-dashboard REQ-1, REQ-4, REQ-3, "plan Implementation Notes" → `kb:adr/connection-dashboard-embedded-in-binary`, `kb:adr/connection-built-assets-ignored-with-gitkeep`, `kb:adr/connection-missing-web-build-fails-fast`, plain prose |
| `internal/tty/canonical.go` | comments | direct spike-file citation `spikes/S7-shell-surface-inputs.md` (same fact is already cited two lines above via `kb:adr/surfaces-shell-busy-from-tmux-process-state`) → dropped, no duplicate citation needed in the same doc comment |

No `cmd/musterd/CLAUDE.md` edit needed (grepped, no plan-ID hits); `internal/termbridge`, `internal/tty`, `internal/webui` have no `CLAUDE.md`.

## Decisions

- Every REQ the plan lists for this unit (X1's comment sweep over `cmd/musterd`, `internal/termbridge`, `internal/tty`, `internal/webui`) is covered above; no REQ deliberately skipped.
- Beyond the team-lead's regex list, `internal/termbridge/termbridge.go` and `internal/tty/canonical.go` also carried direct pointers to `spikes/FINDINGS.md §7`/`§7(d)` and `spikes/S7-shell-surface-inputs.md` — the same category of stale citation X1a treated when it replaced `docs/history/spikes/canary-fields.md` with a fact record mid-rewrite. Verified each still holds against the settled ADR before swapping: `sed -n '408,580p' spikes/FINDINGS.md` confirmed §7(d) is the Setsize-then-resize-window sizing decision, which `docs/adr/surfaces-shared-attach-single-pty.md` (already in this file's kb pack) states as its own summary; the EIO-as-clean-EOF detail in the same section has no dedicated kb record, so it was rewritten in plain prose with no citation rather than inventing one.
- `cmd/musterd/preflight.go`'s two comments claimed README.md has a "Prerequisites" section; `grep -n "Prerequisites\|brew install tmux\|brew upgrade tmux" README.md` showed the actual heading is `## Requirements` (line 96). Corrected the section name in both comments while rewriting them — a false doc-location citation is exactly what `dead-refs.py` and the Comments-gate care about, and leaving "Prerequisites" would have shipped a comment that was already wrong before this sweep touched it.
- `ModelDisplayName`-style "no kb record exists" cases for this unit: `cmd/musterd/tokens.go`'s REQ-2/REQ-3 citations (tokens.json bootstrap/mode 0600) had no matching ADR or fact — `grep -rl "ui_token\|ingest_token\|tokens.json" docs/adr docs/facts` returned no hits — so both were rewritten in plain prose with no citation.
- No `deviation:` — this unit is comment-only by design (plan.md § X1) and no code path required scope beyond the four assigned directories.
- No `doc-delta:` — no behavior changed, only comment text; nothing in the plan's Doc Delta concerns comment wording. (The README.md section-name fix above corrects a comment's own citation, not README.md itself, which already reads "Requirements" and was never wrong.)

## Verification

- `git diff -U0 -- cmd/musterd internal/termbridge internal/tty internal/webui ':!*_test.go' | grep '^[-+]' | grep -v '^[-+]\s*//' | grep -v '^[-+][-+]'` → **no output**: every changed line in this unit is a full-line comment (`^\s*//`), no trailing-comment-on-code-line edits occurred, and no code changed.
- Hit count before (team-lead's pattern, scoped to `*.go` non-test files — the earlier unscoped run had picked up `internal/webui/assets/*.js.map` build artifacts, which are not Go source and were excluded): `rg -n 'REQ-[0-9]|INV-[0-9]|\bD[0-9]{1,2}\b|Edge Case|review cycle|\b(Major|Minor|Critical) [0-9]|m[0-9]-[a-z]|Implementation Notes|plan [a-z-]+' cmd/musterd internal/termbridge internal/tty internal/webui -g '*.go' -g '!*_test.go'` → **60**. Plus `rg -n '\b[a-e]-[CMm][0-9]+\b' … -g '*.go' -g '!*_test.go'` → **0**.
- Hit count after: both commands → **0** each.
- `rg -n 'FINDINGS' cmd/musterd internal/termbridge internal/tty internal/webui -g '*.go' -g '!*_test.go'` → **0** (the two non-regex-matched spike citations noted in Decisions are also gone).
- `gofmt -l cmd/musterd internal/termbridge internal/tty internal/webui` → no output (clean).
- `go build ./...` → exit 0, no output.
- `make lint` → `golangci-lint run` / `0 issues.`
- `make check-kb` → **3 problem(s)**, all pre-existing and outside this unit's scope: `docs/adr/drop-reorder-drag-mime-custom-type.md`/`docs/adr/tiles-drag-reorder-header-handle-insert-shift.md` reference `web/src/render/tiledrag.ts` (deleted) and `web/src/render/CLAUDE.md` is stale — `git status --short web/src/render/` confirms these come from the concurrent web agent's in-flight changes (`D web/src/render/tiledrag.ts`, `M` on five sibling files), not from anything touched here.
- `make refs` → `dead-refs: 3044 references checked, 0 missing` (the only output lines are pre-existing gitignored-path notices, e.g. `.claude/settings.local.json`, unrelated to this unit).
- `go test -race -count=1 ./cmd/musterd/... ./internal/termbridge/... ./internal/tty/... ./internal/webui/...` → all four `ok` (58.9s, 2.7s, 3.0s, 3.3s).
- `go test -count=1 ./cmd/...` → `ok` (53.1s), as the team-lead's brief additionally asked for.

## Handoff

**Build status**: `go build ./...` exits 0.
No test files needed changes — none.
