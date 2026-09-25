# Doc Reconcile: settings-update-failures

**Verdict**: reconciled
**Features derived**: update, connection (plan header: update, connection, surfaces — `surfaces` carries no doc claim per `decisions/features-scope-shellactivity-test`)

## Step 1 — feature set

`git diff main...HEAD --name-only -- cmd internal web/src web/e2e ':!*_test.go' ':!*.test.ts'`
lists 19 non-CLAUDE.md, non-style.css source files (plus 5 `CLAUDE.md`/`style.css` files that
`checkOwnership` doesn't gate, since it only checks `.go`/`.ts`). Every `.go`/`.ts` file maps to
`update` or `connection`'s existing frontmatter globs:

- `cmd/musterd/main.go` → connection (`cmd/musterd/**`)
- `internal/selfupdate/{apply,failure,install,release}.go` → update (`internal/selfupdate/**`)
- `internal/server/{server,ws}.go` → connection (`server*.go`, `ws*.go`)
- `internal/server/{update,updatemanager}.go` → update (`update*.go`)
- `web/src/{app,main,ws,wsapp}.ts`, `web/src/features/connection.ts`,
  `web/src/render/banner.ts` → connection
- `web/src/features/updaterestart.ts` → update (`update*.ts`)
- `web/e2e/update.spec.ts`, `web/e2e/helpers/update.ts` → update
- `web/e2e/resilience.spec.ts` → connection

No widening. `surfaces` was added mid-run for a test call-site only (already recorded); it
carries no doc claim, confirmed against `plans/settings-update-failures/doc-delta.md`'s final
line.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| update | Installer and unmanaged are re-derived at the start of every release check; dev/homebrew stay fixed from startup | `internal/selfupdate/install.go:Classify,Reclassify`; `internal/server/updatemanager.go:reclassify` (guards on `KindDev`/`KindHomebrew`, calls `reclassifyFn` otherwise) | added |
| update | An unmanaged remedy names the binary's path and the reason: an unwritable directory with the error, or the enclosing git checkout | `internal/selfupdate/install.go:unwritableRemedy,gitTreeRemedy` | added |
| update | "At startup the binary classifies its install… " (as a fixed-for-life fact) | — | deleted (replaced by the re-derivation sentence) |
| update | A failed apply leaves the old binary untouched and reports one sentence naming what failed and why; full error goes to the daemon log | `internal/selfupdate/failure.go:DescribeApplyFailure`; `internal/server/updatemanager.go:finishApplyFailed` (`m.log.Warn().Err(err)…` then `setApplyPhase`) | added |
| update | "…reports an error with a remedy sentence" | — | deleted (replaced) |
| update | Every window that saw the restart shows the banner as updating while the daemon is down, falls back to unreachable after 30 s, reloads on its first reconnect (even across a protocol-version change), confirms `Updated to v…` for 3 s when the daemon it reached runs that version | `web/src/features/updaterestart.ts:computeBannerOverride`, `RESTART_FALLBACK_MS`/`CONFIRMATION_MS`, `app.on("helloArrived", …)` (reloads unconditionally on the first hello while holding a record, before any mismatch gate) | added |
| connection | The daemon-down banner exception: after an update restart the banner reads as updating instead | `web/src/features/connection.ts:initConnection` `app.onRender` (`deps.restartBanner(...)` overrides `DAEMON_DOWN_TEXT`) | added |
| connection | nothing stops being true | — | no-op |
| surfaces | no doc claim (test call-site only) | `decisions/features-scope-shellactivity-test` | no-op |

`docs/protocol.md`'s `install`/`remedy`/`apply.error` semantics and the `update.check`
502/`update.apply` wording were already promoted at plan approval (commit `5e4425b`, "approved
plan and planning-session edits") — the `install` comment's "constant for the daemon's life" and
the `example.test` 502 sample are already gone, replaced with the re-derivation comment and the
`couldn't reach the release host (connection refused)` wording the delta specifies. I verified
this text against the same code above (`install.go`, `updatemanager.go`, `failure.go`) rather
than re-editing it; no discrepancy found, so no protocol.md change was needed this run.

## Contradictions

None.

## For the orchestrator

None.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 436 records, 23 features, 0 problem(s)
kb: all checks pass
```

Word counts (body, budget 800 per `internal/kb/budget.go`):
- `docs/features/update/spec.md`: 470 words
- `docs/features/connection/spec.md`: 495 words

## Git

- `810949a` — `docs(settings-update-failures): reconcile update spec with what shipped`
- `3f6e7fa` — `docs(settings-update-failures): reconcile connection spec with what shipped`
