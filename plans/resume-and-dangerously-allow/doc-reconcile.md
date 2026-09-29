# Doc Reconcile: resume-and-dangerously-allow

**Verdict**: reconciled
**Features derived**: launch, past-sessions (new), actions, rail, focus, tiles, lifecycle (plan header: launch, lifecycle, actions, rail, focus, tiles, connection, rename, ingest)

`past-sessions` is a new feature, not a mapping outside the header: before this run its files
(`internal/claudecode/launchtranscripts*.go`, `internal/server/launcherpast*.go`,
`web/src/features/launchresume*.ts`/`launchpastlist*.ts`, `web/src/render/launchpast*.ts`) were
already covered by `launch`'s broad globs (`internal/server/launcher*.go`,
`web/src/features/launch*.ts`); only its three E2E files were unowned. Creating the spec the
Doc Delta names — and pointing its own `go`/`web`/`e2e`/`protocol` frontmatter at those files —
is what the Registry amendment asked for, and it is what turned `check-kb`'s three
"owned by no feature" failures green. `connection` and `rename` in the plan header were untouched
by this plan's diff; no claim for them was staged.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Dialog head carries New and Resume tabs; Resume is `kb:spec/past-sessions` | `web/src/features/launchresume.ts:activate/deactivate` (tab aria-selected/hidden toggles) | added |
| launch | Start in offers five modes; bypass sends `bypassPermissions`, shows a warning line, turns Launch into danger `Launch without checks` | `web/src/protocol/session.ts:PERMISSION_MODES` (5 values incl. `bypassPermissions`); `web/src/sessions/permission.ts:launchPrimaryFace`/`isBypassMode`; `web/src/features/launch.ts:357` (`bypassWarning.hidden`) | added |
| launch | A remembered bypass is never restored; the dialog checks auto | `web/src/sessions/permission.ts:permissionModeToCheck` (`isBypassMode(stored) → "auto"`) | added |
| launch | A bypass launch that has not bound says it is likely waiting on Claude Code's bypass warning, never answered by Muster | `web/src/sessions/card.ts:firstLaunchNote` (guarded on `state === "started" && claudeSessionId === null`); `kb:fact/bypass-acceptance-blocks-startup` | added |
| launch | "bypass and don't-ask are not offered" → "don't-ask is not offered" | same `PERMISSION_MODES` (bypass now included); `kb:adr/launch-bypass-and-dontask-unoffered` still the only record for don't-ask | edited |
| launch | "One launch, end to end" diagram moved out (spec exceeded 800 words after the additions, even after trimming) | word count measured at 797/800 post-move | moved to `kb:diagram/one-launch-end-to-end` |
| past-sessions | The whole spec: list/source/limits, running-session guard, resume in original mode, diagram | `internal/claudecode/launchtranscripts.go:PastSessions/scanTranscript`; `internal/server/launcherpast.go:listPastSessions/truncatePastPrompt`; `internal/server/launcherpast.go:launchResume`; `internal/session/manager.go:AliveByClaudeSessionID` | added (new spec) |
| actions | Resume is also refused when another alive session holds the same Claude session id (bound, or itself mid-resume; in-memory only, released on restart) | `internal/server/launcher.go:466-467` (`Resume`'s `AliveByClaudeSessionID` check); `internal/session/manager.go:509-520` (`pendingResumeClaudeSessionID`, no store column — `internal/session/writeorder.go:246-251` marks it in-memory-only) | added |
| rail | A card shows a danger `bypass` chip while the session's last-known mode is bypass | `web/src/sessions/card.ts:bypassChip`; `web/src/render/sessions.ts:117` | added |
| focus | The mainhead shows the same chip; a resumed session with no recorded model reads `unknown` | `web/src/render/mainhead.ts:89`; `web/src/sessions/card.ts:bypassChip`; `kb:adr/launch-resume-null-model-reads-unknown` (existing null-model rendering) | added |
| tiles | A tile header shows the same chip | `web/src/render/tiles.ts:97` | added |
| lifecycle | `permissionMode` observed values include `bypassPermissions` | `kb:fact/bypass-permission-mode-on-wire`; `docs/protocol.md:1012` | added |
| launch/web-impl doc-delta line 43 | superseded — not promoted | `docs/protocol.md:131` (`model` is `{id, displayName}` **or null** — `displayName` itself is never null) | excluded, as directed |

## Contradictions

None.

## For the orchestrator

None. `docs/protocol.md` was already fully amended by the implementation waves (verified: the
`sessions.create`/`sessions.resume`/`pastsessions.list` anchors already say "bound to, or pending
a resume of"; `dontAsk` is already named as accepted-but-unoffered; `bypassPermissions` is already
in the wire enum and the `state.transitions` example) — no further protocol.md edit was needed
this run.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 464 records, 24 features, 0 problem(s)
kb: all checks pass
```

Word counts (body, mermaid fences excluded, budget 800):
- `docs/features/launch/spec.md`: 797
- `docs/features/past-sessions/spec.md`: 435
- `docs/features/actions/spec.md`: 437
- `docs/features/rail/spec.md`: 607
- `docs/features/focus/spec.md`: 221
- `docs/features/tiles/spec.md`: 265
- `docs/features/lifecycle/spec.md`: 735

Git: six commits, one per feature (past-sessions bundled with launch — they share
`docs/INDEX.md` and the diagram move that past-sessions' extraction forced):
`84f436b` (past-sessions + launch), `c727f89` (actions), `cc498b8` (rail), `f93a599` (focus),
`4c472be` (tiles), `06b2432` (lifecycle). Working tree clean; `gates-…` not re-run (out of
scope for this step).
