# Debate: compact-sessionstart-left-id

### Turn 1 — advocate-a (argument)

The review treats the backwards rebind as something this branch introduced. It is already on `main`. Option A keeps that behaviour and writes it down.

1. **This is how `main` behaves today.** On `main`, `interpretSessionStart` maps every source other than `clear` and `resume` to `KindBind`, `source:"compact"` included (`git show main:internal/claudecode/interpret.go:231-241`). `isBindKind` on `main` covers `KindBind`, `KindClearRebind` and `KindResumeBind` (`git show main:internal/session/apply.go:135-141`), so the monotonic guard has never seen any `SessionStart`. `applyBind` turns any id that differs from the bound one into a clear-rebind (`internal/session/machine.go:130-133`). So a reordered compact `SessionStart` carrying a left id already rebinds backwards on `main`. The branch moved that same decision from `applyBind` into `applyCompactionEnded` (`machine.go:279-282`). It did not create it. REQ-9 asks for exactly this: "Its binding effect is the ordinary bind's" (`plan.md:72`).

2. **The ADR was always enforced as "non-bind kinds only".** The guard sits inside `if enveloped && !isBindKind(...)` (`apply.go:31`), and its context is the clear pair's `SessionEnd` straggler (`docs/adr/ingest-monotonic-rebind.md`, Context). The protocol says `SessionStart` "remains the *normal* binder" (`docs/protocol.md:1070`). So the clash between rows 1659 and 1660 already existed on `main` for every `SessionStart`. Option A's qualifier documents what is true. It does not add an exemption.

3. **Option B creates the special case.** Under B, compact would be the only `SessionStart` source that checks `byClaude`, while startup and resume skip it. That is a second rule for one hook. In my reading it breaks "one owner per concept" (`docs/conventions.md:126-127`) more than A does: the bind decision for `SessionStart` would then depend on the source string.

4. **The input is very unlikely.** The `SessionStart(compact)` would have to be delivered after a `/clear`'s `SessionStart(clear)`. That needs the developer to type `/clear` within one delivery window after a compaction ends. To be honest about the cost: it is worse than a lost `SessionStart(clear)`. Later events for B would read as stragglers, because `byClaude[B]` already points at this session (`apply.go:43`), so the binding stays on A until the next `SessionStart`. That is the residual A accepts, and it has been on `main` since the guard landed.

A widening of the ADR guard to binders belongs in its own decision, applied to every `SessionStart` source, not in a compaction plan as a one-kind exception.

### Turn 2 — advocate-b (argument)

**Steelman.** The backwards rebind is `main`'s behaviour, not the branch's: on `main` every non-clear, non-resume `SessionStart` is `KindBind` and bypasses the guard. The ADR has only ever bound non-bind kinds. B would make `SessionStart`'s bind rule depend on its source string. Widening the guard belongs in its own decision.

I checked point 1 and it is correct (`git show main:internal/claudecode/interpret.go:231-241`, `main:internal/session/apply.go:135-141`). Three things still favour B.

1. **The source string already decides what a left id can mean, by measurement.** `startup` and `clear` never carry a left id: `/clear` mints a new one (`kb:fact/clear-mints-new-session-id`), so the guard would never fire for them. `resume` legitimately can carry one. The ADR names that case ("the pane genuinely returns to an earlier conversation via `--resume`", `docs/protocol.md:1074`), so resume must stay exempt. `compact` carries "the **same** `session_id`" as its own `PreCompact` (`kb:fact/compact-hook-sequence`, step 3). For compact, a left id can only be a reordered straggler, which is the input the ADR was written for. So B is not a second rule for one hook. Among the four sources, compact is the only one where a left id is both reachable and never legitimate. In my reading, A's qualifier on row 1660 is what adds the unjustified exemption, because it exempts compact by grouping it with resume.

2. **The branch reopened this code, so the one-owner finding falls on it.** The plan made compact its own kind with its own handler (`plan.md:161-164`, `machine.go:285-288`). `applyCompactionEnded` is now a second place that decides "different id → clear-rebind", next to `Apply`'s guarded branch (`apply.go:31-45`). The review asks that this decision live in one place for every enveloped kind (review.md:142). A leaves two homes and adds a protocol qualifier. B puts compaction ends back under the guarded branch, and `isBindKind` goes back to `main`'s three kinds. That also drops the extra bind-kind list entry at `apply.go:52` (Note 2).

3. **You conceded the cost, and it is larger than a card reset.** Once the session is wedged on A, every event from conversation B reads as a straggler until the next `SessionStart`. In the meantime:
   - `AliveByClaudeSessionID(B)` returns false (`manager.go:573-585`), so a resume-from-list of B passes the `already_open` check (`launcherpast.go:85`). That puts two alive rows on one conversation, which accepted `kb:adr/launch-resume-one-alive-row-per-claude-session` forbids.
   - If the pane dies, the Resume action resumes the pre-clear conversation A (`launcher.go:538`).

   In my judgement, a rare input that silently breaches an accepted ADR is worth a few lines.

### Turn 3 — advocate-a (concession)

I concede: B's point 1 removes my "special case" objection, and point 3 shows the residual I accepted breaks a second accepted ADR, not only this one.

Steelman of what convinced me: the measured facts fix what a left id can mean for each source. `startup` and `clear` never carry one (`kb:fact/clear-mints-new-session-id`). `resume` legitimately can (`docs/protocol.md:1074`). `compact` carries the same id as its `PreCompact` (`kb:fact/compact-hook-sequence`, step 3), so for compact a left id can only be the reordered straggler the ADR was written for. Putting compact under the guard therefore follows the ADR's own rule rather than adding a second rule.

I checked the cost claims and they hold:
- `AliveByClaudeSessionID` matches only on `ClaudeSessionID` or the pending-resume id (`internal/session/manager.go:573-585`). A session stuck on A therefore lets a resume of B pass the `already_open` check (`internal/server/launcherpast.go:85-86`). That breaches `kb:adr/launch-resume-one-alive-row-per-claude-session`.
- `Resume` builds its argv from `sess.ClaudeSessionID` (`internal/server/launcher.go:538`), so after the pane dies it would resume the pre-clear conversation.

My "already on `main`" point is true, but it does not answer the review's one-owner finding. The branch created `applyCompactionEnded` as a second home for the decision, and it does not answer the cost either.

Decision: Option B. A compact `SessionStart` on an id this session has already left routes and applies with no rebind. The decision stays in `Apply`'s guarded branch, and `isBindKind` returns to `main`'s three kinds. REQ-9 and the protocol rows get a matching qualifier.
