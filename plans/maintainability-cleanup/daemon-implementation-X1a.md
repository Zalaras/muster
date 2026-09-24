# Daemon Implementation: maintainability-cleanup — Unit X1a (plan-ID comment sweep, internal/session + internal/store)

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: kb: 425 records, 23 features, 0 problem(s) (`make check-kb`); pack command itself (`go run ./tools/kb pack --plan maintainability-cleanup --role daemon-impl`) returned only the `worktree-shares-git-config` lesson and the `release-signing` runbook — no plan-scoped protocol delta for this comment-only unit.

## Scope

Comments only, no code changes, in `internal/session/**` and `internal/store/**` (non-test `.go` files) plus their migrations. Per plan.md § "Defaults that bind the units": code comments cite no plan IDs (`REQ-n`, `Dn`, `Edge Case n`, review cycles, plan or milestone names).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/railorder.go` | comments | Rewrote INV-1/INV-2/INV-5/D8/D10/D11/REQ-3/REQ-14/plan-order-sidebar citations in words or as `kb:adr/rail-order-daemon-owned-per-session-fields` / `kb:anchor/sessions.pin` / `kb:anchor/sessions.order` |
| `internal/session/title.go` | comments | REQ-10/REQ-11/D8/plan rail-card-improvements → `kb:adr/rename-muster-owned-title-override-wins`, `kb:adr/rail-unread-inferred-from-live-terminal-client` |
| `internal/store/usage.go` | comments | m3-gauges/plan usage-model-bar/REQ-3/5/10 → `kb:ref/data-model`, `kb:adr/usage-model-window-polled-from-oauth-api`, or plain prose |
| `internal/session/apply.go` | comments | m4-hook-lifetime REQ-9/10/11/12, Edge Case 4/5/6a, review-cycle Critical 1 → `kb:adr/ingest-envelope-authoritative-binding`, `kb:fact/clear-mints-new-session-id`, `kb:adr/rail-unread-inferred-from-live-terminal-client`, `kb:adr/connection-whole-object-session-upserts`, `kb:adr/rename-muster-owned-title-override-wins` |
| `internal/session/reconcile.go` | comments | session-lifecycle REQ-1/2/8/9/10/17, D9/10/22/26, Edge Case 5-8, "R3", review cycle 2 Major → `kb:adr/lifecycle-reconcile-converges-with-the-socket`, `kb:adr/lifecycle-reconcile-before-first-snapshot`, `kb:adr/lifecycle-session-ids-monotonic-never-reused`, `kb:adr/lifecycle-resume-rebinds-existing-session` |
| `internal/store/session.go` | comments | m1-sessions/m3-gauges/m4-reconcile/plan order-sidebar/ui-text-and-focus/markdown-viewing/rail-card-improvements REQ-ns, INV-2 → `kb:ref/data-model`, `kb:adr/lifecycle-session-ids-monotonic-never-reused`, `kb:adr/usage-context-gauge-shows-tokens-and-compactions`, `kb:anchor/sessions.pane`, `kb:adr/rail-order-daemon-owned-per-session-fields`, `kb:adr/rename-muster-owned-title-override-wins`, `kb:spec/reader` (docs/features/reader/spec.md), `kb:adr/rail-unread-inferred-from-live-terminal-client` |
| `internal/session/machine.go` | comments | INV-A/INV-F/INV-P/INV-1/INV-6, REQ-9/12, review cycle 1/2 Critical 1/Major 1, Edge Case 2/5 → stated in prose (labels not defined in any kb record, so dropped rather than kept — see Decisions) plus `kb:fact/subagent-hooks-carry-agent-id`, `kb:fact/hook-delivery-best-effort`, `kb:fact/resume-keeps-session-identity`, `kb:adr/usage-context-gauge-shows-tokens-and-compactions`, `kb:adr/lifecycle-resume-rebinds-existing-session`, `kb:adr/lifecycle-liveness-from-pane-existence`, `kb:fact/permission-mode-presence-split` |
| `internal/session/manager_rail.go` | comments | REQ-1/3/4, D8/D10/INV-5 → `kb:adr/rail-order-daemon-owned-per-session-fields`, plain prose |
| `internal/store/repo.go` | comments | m1-sessions REQ-3/5 → `kb:ref/data-model`, `kb:anchor/repos.list`, plain prose |
| `internal/session/reader.go` | comments | REQ-8/16/17/18/26, D7/D15, INV-8 → `kb:adr/reader-plan-sticky-once-named`, `kb:spec/reader` (spec's own sentence: "a hook whose Claude session id the session has already left never moves the transcript or the plan") |
| `internal/store/store.go` | comments | session-lifecycle REQ-1, m1-sessions REQ-7/D9, plan issue-capture → `kb:adr/lifecycle-session-ids-monotonic-never-reused`, `kb:adr/issue-payload-allowlist-never-dump` |
| `internal/session/manager.go` | comments | REQ-1/2/5/6/7/8/9/11/12, Critical 1, review cycle 1 Major 3/cycle 2 Minor, Edge Case 7/12, c-adapters Minor 4, a-M1, plan Implementation Notes → `kb:anchor/sessions.pane`, `kb:adr/lifecycle-reconcile-converges-with-the-socket`, `kb:adr/actions-serialized-per-session`, `kb:adr/rail-unread-inferred-from-live-terminal-client`, `kb:anchor/ws.session-removed`, `kb:adr/actions-remove-allowed-on-live-session`, `kb:adr/lifecycle-session-ids-monotonic-never-reused`, `kb:adr/ingest-envelope-authoritative-binding`, plain prose |
| `internal/session/liveness.go` | comments | REQ-4/14/16, D16/D17, review cycle 1 Minor 1/2, review cycle 2 Minor 2, review Major 8, Edge Case 9, Implementation Notes → `kb:anchor/sessions.pane`, plain prose |
| `internal/session/actions.go` | comments | REQ-2/3/5/6/7/8/11/13/14/15, INV-1, Edge Case 5, review cycle 1 Minor 1, maintainability-cleanup review Minor 8 → `kb:anchor/sessions.end`, `kb:adr/lifecycle-liveness-from-pane-existence`, `kb:adr/actions-serialized-per-session`, `kb:adr/lifecycle-shutdown-leaves-sessions-running`, `kb:adr/surfaces-shell-dies-at-kill-shutdown-too`, `kb:adr/actions-remove-allowed-on-live-session`, `kb:adr/actions-kill-is-idempotent`, `kb:anchor/sessions.resume`, `kb:adr/lifecycle-resume-rebinds-existing-session` |
| `internal/session/session.go` | comments | plan m1-sessions, maintainability-cleanup review Major 6/c-Minor 11, m4-reconcile REQ-4, plan order-sidebar D17, ui-text-and-focus REQ-9/11 INV-2, markdown-viewing REQ-16/17, rail-card-improvements REQ-7/12, Edge Case 3 → `kb:anchor/sessions.pane`, `kb:adr/rail-order-daemon-owned-per-session-fields`, `kb:adr/rename-muster-owned-title-override-wins`, `kb:spec/reader`, `kb:adr/rail-unread-inferred-from-live-terminal-client`, plain prose |
| `internal/store/migrations/0005_usage_model.sql` | comments | "plan usage-model-bar" + `plans/usage-model-bar/plan.md` pointer → `kb:adr/usage-model-window-polled-from-oauth-api`, `kb:adr/usage-history-persisted-not-rendered`, `kb:ref/data-model` |
| `internal/store/migrations/0009_rail_cards.sql` | comments | "Plan rail-card-improvements" REQ-7/12 → `kb:adr/rail-unread-inferred-from-live-terminal-client` |
| `internal/store/migrations/0007_title_override.sql` | comments | "plan ui-text-and-focus" → `kb:adr/rename-muster-owned-title-override-wins` |
| `internal/store/migrations/0006_rail_order.sql` | comments | "plan order-sidebar" → `kb:adr/rail-order-daemon-owned-per-session-fields` |
| `internal/store/migrations/0008_reader.sql` | comments | "plan markdown-viewing" → `kb:spec/reader` |

`internal/session/CLAUDE.md` and `internal/store/CLAUDE.md` were checked and left untouched: their only regex hits were the literal word "plan" inside "a session's plan" (the reader feature's plan file), not a plan-ID citation — no word-budget edit needed.

## Decisions

- Every REQ the plan lists for this unit (X1's comment sweep over `internal/session` and `internal/store`) is covered above; no REQ deliberately skipped.
- `INV-A`/`INV-F`/`INV-P` (machine.go/machine_test.go) and the file-local `INV-1`/`INV-2`/`INV-5`/`INV-6` labels (used with **different meanings** in railorder_test.go, manager_rail_test.go and machine_test.go for the same numeral) are not defined under those letters/numbers in any kb record or SPEC — grepped `docs/adr/*.md docs/facts/*.md SPEC.md` for the literal strings `INV-A`, `INV-F`, `INV-P` and found no hits outside `internal/session/*_test.go`. Per the task's instruction ("keep the name only if the invariant is defined in a kb record or SPEC — otherwise state the invariant in words"), every occurrence in the touched non-test files was rewritten to state the invariant in prose rather than keeping the label. Test files (which do use these labels in assertion messages) were not touched, per the constraint against editing tests.
- `kb:spec/reader` was used as the citation for reader.go/session.go/store/session.go's "a straggler whose claudeSessionID no longer names the current binding must never move the transcript/plan" rule, quoting the reader spec's own sentence ("A hook whose Claude session id the session has already left never moves the transcript or the plan.") rather than inventing a new ADR slug.
- `ModelDisplayName`'s NULL-means-derive-from-Model rule (`internal/store/session.go`) has no dedicated ADR or fact record (`grep -rl "ModelDisplayName\|model_display_name" docs/adr docs/facts` → no hits), so its comment was rewritten in plain prose with no citation rather than inventing one.
- While rewriting the "Critical 1" paragraph in `machine.go`'s `applyBind` (the unconditional Attention/Failure reset on every bind), the adjacent stale citation to `docs/history/spikes/canary-fields.md` for "SessionStart(source:\"resume\") reuses the original session_id" was also replaced with the correct existing fact record `kb:fact/resume-keeps-session-identity`, since it was part of the same sentence being rewritten and the raw spike-file citation was superseded by that fact record.
- No `deviation:` — this unit is comment-only by design (plan.md § X1) and no code path required scope beyond `internal/session`/`internal/store`.
- No `doc-delta:` — no behavior changed, only comment text; nothing in the plan's Doc Delta concerns comment wording.

## Verification

- `git diff -U0 -- internal/session internal/store ':!*_test.go' | grep '^[-+]' | grep -v '^[-+]\s*//' | grep -v '^[-+][-+]'` printed only 6 lines, all of which are **inline trailing comments on an unchanged code line** (the code token before `//` is byte-identical between the `-`/`+` pair in every case — e.g. `return // straggler past a Stop...` → `return // straggler past a Stop...` with only the parenthetical dropped, `OnRemoved func(id int64) // broadcasts sessionRemoved (m4-reconcile REQ-6)...` → same code, comment reworded). The verification regex only excludes lines *starting* with `//`, so a trailing-comment edit on a code line necessarily prints; each was manually confirmed to carry no code change. Full output:
  ```
  -			return // straggler past a Stop — persist only, no transition (Edge Case 2)
  +			return // straggler past a Stop — persist only, no transition
  -		return // never resets the latch (REQ-9) — most events carry no permission_mode
  +		return // never resets the latch (kb:fact/permission-mode-presence-split) — most events carry no permission_mode
  -	OnRemoved       func(id int64) // broadcasts sessionRemoved (m4-reconcile REQ-6); may be nil in tests
  +	OnRemoved       func(id int64) // broadcasts sessionRemoved (kb:anchor/ws.session-removed); may be nil in tests
  -	Watcher         Watcher        // REQ-8; nil counts every session as unwatched
  +	Watcher         Watcher        // nil counts every session as unwatched
  -	UnknownSessions []string // muster-<n> tmux sessions on the socket with no row (REQ-2)
  +	UnknownSessions []string // muster-<n> tmux sessions on the socket with no row
  -	ModelDisplayName     *string // m3-gauges REQ-8/REQ-16; NULL = derive from Model (id)
  +	ModelDisplayName     *string // NULL = derive the display name from Model (the raw id)
  ```
- Hit count before: `rg -n 'REQ-[0-9]|INV-[0-9]|\bD[0-9]{1,2}\b|Edge Case|review cycle|\b(Major|Minor|Critical) [0-9]|m[0-9]-[a-z]|Implementation Notes|plan [a-z-]+' internal/session internal/store -g '!*_test.go'` → **179**.
- Hit count after: same command → **13**, all confirmed false positives (the literal word "plan" inside "a session's plan"/"the plan derived from it", matching the `plan [a-z-]+` pattern's `plan and`, `plan file`, `plan another`, etc. — not a plan-ID citation). Two are in `internal/session/CLAUDE.md`/`internal/store/CLAUDE.md` (same false-positive: "session's plan and"), left untouched per instructions (only touch CLAUDE.md if it carries a plan-ID citation).
- `gofmt -l internal/session internal/store` → no output (clean).
- `go build ./...` → exit 0, no output.
- `make lint` → `golangci-lint run` / `0 issues.`
- `make check-kb` → `kb: 425 records, 23 features, 0 problem(s)` / `kb: all checks pass` (every new `kb:` citation resolves).
- `make refs` → `dead-refs: 3050 references checked, 0 missing`.
- `go test -race -count=1 ./internal/session/... ./internal/store/...` → both `ok` (65.4s, 20.1s).

## Handoff

**Build status**: `go build ./...` exits 0.
No test files needed changes — none.
