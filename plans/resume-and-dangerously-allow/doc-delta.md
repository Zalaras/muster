# Doc delta — resume-and-dangerously-allow

Seeded from plan.md § Doc Delta (as approved), then amended by the orchestrator with every implementation-log `doc-delta:` line and every mid-run user decision. `plan.md` stays as approved.


**launch** — becomes true:
- The dialog's head carries New and Resume tabs; the Resume tab is described in `docs/features/past-sessions/spec.md`.
- Start in offers five modes; `bypass` sends `bypassPermissions`, shows a warning line, and turns
  Launch into a danger `Launch without checks` (kb:adr/launch-bypass-offered-with-danger-guardrails).
- A remembered bypass is never restored; the dialog checks auto (kb:adr/launch-bypass-never-restored-as-default).
- A bypass launch that has not bound says it is likely waiting on Claude Code's bypass warning,
  which Muster never answers (kb:fact/bypass-acceptance-blocks-startup).

**launch** — stops being true:
- "bypass and don't-ask are not offered (kb:adr/launch-bypass-and-dontask-unoffered)" — becomes
  "don't-ask is not offered".
- The mermaid "One launch, end to end" diagram moves to `docs/diagrams/` if the body exceeds 800
  words after the additions.

**past-sessions** (new spec, created by doc-reconcile now that its files exist: `go`/`web` globs
naming `internal/claudecode/launchtranscripts*.go`, `internal/server/launcherpast*.go`,
`web/src/features/launchresume*.ts`, `web/src/features/launchpastlist*.ts`,
`web/src/render/launchpast*.ts`; `e2e: [web/e2e/past-sessions.spec.ts]`; `protocol:
[pastsessions.list]`, removed from launch's list) — becomes true: the whole spec — the list, its source and limits, the
running-session guard, resume in the original mode, and the diagram above.

**actions** — becomes true:
- Resume is also refused when another alive session holds the same Claude session id.

**rail**, **focus**, **tiles** — becomes true:
- A card / the mainhead / a tile header shows a danger `bypass` chip while the session's last-known mode is bypass.

**lifecycle** — becomes true:
- `permissionMode` observed values include `bypassPermissions`.

`docs/protocol.md`: the Protocol Contract above.


## Amendments during the run

**From the implementation logs:**
- web-implementation.md `doc-delta:` line 42 (kept): if the launch spec's DOM prose quotes `#launch-target`'s old `Launch in <b>…</b><span class="branch">` shape, it now reads `.tlabel`/`.suffix`, reused by both tabs.
- web-implementation.md `doc-delta:` line 43 (**superseded, do not promote**): "`SessionModelInfo.displayName`'s nullability". The contract was amended; `displayName` stays a non-null string on the wire (kb:adr/launch-resume-display-name-falls-back-to-id). Review cycle 1 correctness Major 8.

**From user decisions** (plans/resume-and-dangerously-allow/decisions/), each with a proposed ADR:
- **past-sessions / launch:** a session resumed from the list has `model.displayName` equal to the model id until the status line confirms the name, as for any launch (kb:adr/launch-resume-display-name-falls-back-to-id). No sentence may say it is null.
- **past-sessions:** a resume passes the transcript's last recorded permission mode verbatim, including modes the launch form does not offer, such as `dontAsk`. `default` is used only when none is recorded (kb:adr/launch-resume-passes-any-recorded-mode).
- **past-sessions / actions:** an alive session spawned with `--resume X` holds X from the moment it is created until it binds or dies. `openSessionId`, `409 already_open` and the Resume action's `409 not_resumable` all count it; the hold is in memory and a daemon restart releases it (kb:adr/launch-resume-pending-resume-holds-id). The running-session guard reads "bound or pending a resume", never "bound" alone.
- **focus:** a resumed session with no recorded model shows `unknown` in the mainhead meta (kb:adr/launch-resume-null-model-reads-unknown).

**Registry (check-kb):** the three unowned E2E files must end up owned: `web/e2e/past-sessions.spec.ts` and `web/e2e/helpers/resume.ts` by the new `past-sessions` spec, and `web/e2e/bypass.spec.ts` by `launch`'s `e2e` list (plan Implementation Notes → Doc upkeep). `make check-kb` must go green.
