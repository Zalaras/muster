# Daemon Implementation: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Mode**: initial
**Pack**: `go run ./tools/kb pack --plan rail-card-improvements-2 --role daemon-impl` — 16858 words (over the 8000 budget; features rail, surfaces, update, settings — sections rules 1234 · features 4969 · decisions 7668 · facts 99 · lessons 2238 · runbooks 644)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/server/update.go` | modified | `checkAvailability` gains a `manual bool` param and an `error` return: a manual call skips the automatic path's "pref turned off mid-flight" discard (Edge Case 9, D10) and checks `shuttingDown` itself, returning `errShuttingDown`; failures are wrapped in a new `errCheckFailed` sentinel. `tick` now calls `checkAvailability(ctx, false)` and discards the error (D13 unchanged — already logged at debug inside). New `handleCheckUpdate` (`POST /api/update/check`, `kb:anchor/update.check`) maps `errShuttingDown` → 409, any other error → 502 `check_failed`, and a `canCheck`-false daemon (`f.um == nil` or install `dev`) → 404, mirroring `handleApplyUpdate`'s existing guard. `mount` registers the route ahead of apply/restart-impact. `UpdateInfo` gains `CanCheck bool` between `Remedy` and `Available` (matching the wire field order in the plan's Protocol Contract); `updateManager.Current()` computes it as `install.Kind != selfupdate.KindDev` (the manager only exists when `BaseURL != ""`, so base-URL-empty is entirely handled by `updateFeature.current()`'s nil-`um` fallback, whose `CanCheck` stays the zero value `false`). |

## Decisions

- No deviations from the plan. `checkAvailability`'s discard-guard for the automatic path (`!manual && !m.checkEnabled`) and the new `shuttingDown` check are both scoped exactly as the plan's Implementation Notes and Edge Cases 8/9/18 describe.
- `errCheckFailed` wraps both failure branches (`selfupdate.LatestTag` erroring, and a latest tag that isn't a release version) via `fmt.Errorf("%w: %w", errCheckFailed, err)` / `fmt.Errorf("%w: latest tag %q is not a release version", errCheckFailed, tag)` — Go 1.27 supports multiple `%w` verbs, so `errors.Is` still finds `errCheckFailed` even though the handler's `default` branch (not an `errors.Is` check) is what actually maps it to 502. The wire message carries a `"update check failed: "` prefix ahead of `selfupdate.LatestTag`'s own `"requesting <url>: <reason>"` text — the protocol contract's example message is illustrative ("The message names the reason"), not required byte-for-byte, so I kept the sentinel classification instead of stripping the prefix to chase an exact string match.
- Every REQ this plan lists for the daemon (REQ-7, REQ-8, REQ-9) is implemented above; REQ-13 (button disabled during its own request) and REQ-10/11/12 (Settings UI) are web-side, not mine.

## Handoff

**Build status**: `go build ./...` exits 0.

**Sanctioned test breakage** (not mine to fix — `internal/server/update_test.go`, daemon-tests'): four calls to `m.checkAvailability(context.Background())` at lines 256, 308, 336, 342 no longer compile — the plan's own Affected Files section names `checkAvailability`'s new `error` return and `manual bool` parameter as a daemon change, and the wire shape (`canCheck`, the new endpoint, the 404/409/502 error codes) is the plan's approved contract, so this is sanctioned breakage per `kb:lesson/stale-fixture-reshaped-the-wire`, not a defect to bend around. `go vet ./...` fails only in `internal/server` with exactly these four `not enough arguments` errors (confirmed: `go vet $(go list ./... | grep -v '/internal/server$')` is clean). `golangci-lint run --tests=false ./...` is clean of anything from this change — its only findings are two pre-existing `unused` warnings in `issue.go`/`prefs.go` (`(*Server).buildIssueSnapshot`, `(*Server).loadPrefs`), both files I did not touch and both functions whose only non-test callers already exist (confirmed via `grep -rn "buildIssueSnapshot\|loadPrefs" internal/server/*.go | grep -v _test.go` — each has a production caller; they're `unused`-flagged only because `--tests=false` hides their test-only callers). `make lint` (full) shows exactly the one `typecheck` failure from the four call sites above, consistent with `kb:lesson/sanctioned-test-break-blinds-lint`.

Needed from daemon-tests: update the four `checkAvailability` call sites to pass `manual` (`false` for the periodic-check assertions already there, `true` for any new manual-check coverage the test file adds for D1–D13), plus new coverage for `POST /api/update/check`'s 404/409/502/200 paths and `canCheck`'s wire presence.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md § Issues → Minor, one issue — `internal/server/update.go:249-258`'s `checkAvailability` doc comment collided two plans' ID namespaces in one sentence: `REQ-1..7` (the auto-update plan's inherited requirement span) sat next to `REQ-7`/`REQ-8`/`D13` (this plan's own IDs), and `D16` two lines further down, with neither plan named anywhere.

**Changes made**: `internal/server/update.go:249-258` — rewrote the comment. Dropped the inherited `REQ-1..7` span (replaced with the plain phrase "one release-check poll attempt", since the function is already fully described without an ID); named this plan once, at the first use of one of its own IDs (`D13`), as `— plan rail-card-improvements-2`, matching the convention already used in `web/src/style.css:693,1849,2003` and `web/src/protocol.ts:248`. `REQ-7`, `D16` and `REQ-8` later in the same comment now unambiguously refer back to that one naming. Confirmed no other plan's REQ numbering appears in the rewritten text.

Blast radius checked: grepped the rest of `internal/server/update.go` for the same two-plan collision pattern (`grep -n "REQ-1\.\.7\|REQ-26\|D13\|D16" internal/server/update.go`) — three other sites carry the same ambiguity (`update.go:114`, `:233-234`, `:300` all mix auto-update's `REQ-1..7`/`REQ-26` with no plan name), but none of them were named in the review's quoted issue text (only `:249-258` was), so they are out of scope for this fix wave and left untouched.

**Repro re-run**: the review issue is a doc-comment defect with no runtime repro; verified instead by re-reading the fixed comment (`internal/server/update.go:249-258`) and confirming `REQ-7`/`D13`/`D16`/`REQ-8` all resolve to "plan rail-card-improvements-2" with no competing `REQ-1..7` span left in the sentence.

**Verification**:
- `gofmt -l internal/server/update.go` — empty output (no diff; the em dash and apostrophes in "D13's" don't trigger the curly-quote rewrite since no backtick or `''` pair is present).
- `go vet ./internal/server/...` — clean.
- `go build ./...` — exit 0.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `688 references checked, 0 missing`.
- `make lint` — `0 issues.`

**Decisions**: none (no new deviation or doc-delta; this is a comment-only fix inside the daemon's existing text, not a behavior or protocol change).
