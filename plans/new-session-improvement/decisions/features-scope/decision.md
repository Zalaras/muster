# Decision: features-scope

**Outcome**: A. Widen `**Features**` to `launch, focus, tiles, surfaces, connection, actions, rail, rename`, recorded as a plan amendment in the completion summary.
**Reached by**: consensus (advocate-b conceded in turn 1)
**Decisive argument**: Option B, as the brief stated it, could not turn the gate green. Advocate-a
put it this way in turn 1: "five files whose only owner is `connection`: `internal/server/server.go`,
`web/src/api.ts`, `web/src/api.test.ts`, `web/src/main.ts`, `web/e2e/helpers/daemon.ts`… Under
B's any-owner rule with header `launch, focus, tiles, surfaces`, those five still fail." A working
version of B would have to add `connection` anyway. Connection owns
`kb:adr/connection-installed-claude-classified-never-refused`, the accepted decision this plan's
model refusal must be reconciled against, and today's packs leave it out (`internal/kb/pack.go:188`).
B would also need a second edit to pipeline doctrine (`.claude/agents/doc-reconcile.md` Step 1).
That leaves B saving only pack words, and the pack budget only warns.
**Dissent to honour**: From advocate-b's concession: "The any-owner rule may still be worth
proposing for later plans on its own merits, but that is not this run's decision." Advocate-a
granted that the records actions, rail and rename add are of low value for `sessions.go`.
**Landed in**: plans/new-session-improvement/plan.md (`**Features**` header plus an *Amended*
note), docs/adr/process-features-scope-answered-by-widening-header.md,
plans/new-session-improvement/proposed-backlog.md
