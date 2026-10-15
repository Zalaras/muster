# Doc Reconcile: claude-version-watch

**Verdict**: reconciled
**Pack**: kb: pack 10199 words (budget 30000)
**Features derived**: connection, issue (plan header: connection, issue)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| connection | Readout updates live; background check once serving; re-check on binary change (stat every 30 s, `--version` once per identity, 30 s bound); pushes `claudeCode` | `internal/server/claudeversion.go:Start,tick,claudeVersionTimeout`; `cmd/musterd/main.go:claudeVersionLookInterval`, `ClaudeVersion: {Poll}`; `internal/claudecode/modelcheck.go:ResolveBinaryIdentity`; `claudeCodeMessage` broadcast | added |
| connection | `hello.claudeCode` is the latest result; `unknown` covers not checked yet | `internal/server/ws.go:handleWS` (`s.claudeVersion.Current()`), `claudeversion.go:notCheckedClaudeCode` | added |
| connection | Logs "could not determine claude code version" once per unresolved stretch | `claudeversion.go:tick` (`f.unresolved`), `logClaudeCodeReport` | added |
| connection | refs names the ADR; protocol list names `ws.claude-code` | `docs/adr/connection-claude-version-watched-and-pushed.md`; anchor in `docs/protocol.md` | added |
| connection | Version classified once at startup | `internal/server/server.go` (startup `ClaudeCodeInfo` and `Config.ClaudeCode` removed) | deleted (no such sentence remained in the body; hello sentence reworded) |
| issue | Snapshot's Claude Code row carries the latest result at capture time | `internal/server/issuesnapshot.go:buildIssueSnapshot` (`f.claudeCode()`), `server.go` (`claudeVersion.Current`) | added |

Orchestrator-landed items verified: `docs/protocol.md` `ws.hello` wording and `ws.claude-code` section match the code.

## Contradictions
None

## For the orchestrator
- The claim touched no feature outside `**Features**`; no widening.
- Changed files `internal/server/claudeversion*.go` were already covered by the connection globs added in this plan.

## Checks
`make gen-kb && make check-kb`: regenerated docs/features/connection/INDEX.md; `kb: 591 records, 27 features, 0 problem(s)`; `kb: all checks pass`.
Word counts: connection/spec.md 734, issue/spec.md 367 (budget 800).
Commits: 9969bce0 (connection), 00c0137b (issue).
