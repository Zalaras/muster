# Debate: review-cycle-exhaustion-theme-storage

### Turn 1 — advocate-a (argument)

**Steelman of B (anticipated, since I open).** The review budget is 3 for a reason (`.claude/skills/orchestrate/SKILL.md:102`); exhaustion's procedure is "status blocked … report … ask" (`SKILL.md:340-345`). The defect predates the plan, the reviewer itself says the orchestrator "may route it to `/fix`" (`review.md:157`), and `/fix` is the track built for a one-line fix (`.claude/skills/fix/SKILL.md:1-3`).

**My case for A.**

1. *The developer's instruction answers exhaustion's question.* Exhaustion's step 4 asks the developer to pick (a) more cycles, (b) fix manually, (c) abort (`SKILL.md:345`). The developer is unreachable and said "would like the run completed" (brief:10); the standing memory says route every decision to the decider and "the run must reach completion with no AskUserQuestion". Option A *is* exhaustion's (a); B is not one of the three answers at all — it is the "ask" step with nobody to ask, which is exactly the blocking-overnight cost the memory names ("a blocking question overnight wastes the whole night").

2. *It is this plan's requirement failing, measured.* REQ-10 says unsaved text is "sent again on the next load or reconnect" (`plan.md:72-75`). Browser review measured it FAIL in the getter-throws state (`review.md:139`). The plan's Implementation Notes say "Wrap every read and write" (`plan.md:516-517`). And the seam the fix routes through, `safeLocalStorage()` (`web/src/storage.ts:101-103`), was added **by this plan** (`git log main..HEAD -S safeLocalStorage` → `32dc5d2b feat(session-notes)`; `main:web/src/storage.ts` has no `safeLocalStorage`). The plan built the guard and missed one caller (`web/src/theme.ts:49`, `= localStorage`). That is an unfinished plan item, not an unrelated bug.

3. *B does not avoid the work; it adds a stop and a second pipeline run.* `/fix` repeats research, "stop and tell the developer" (`fix/SKILL.md` §1), a plan, red test, green, comment pass, gates, review, Final Validation full sweep (§§4-8). A's cycle 4 is the same red/green/gates/delta-review on a branch already set up. The regression journey is already specified, and tagged `[e2e-specs]`, by note 3 (`review.md:165`).

4. *A's downside is bounded.* If cycle 4 fails, the run blocks at review — B's outcome, a few hours later, with the fix and its test already written. If B is chosen, the developer returns to a branch that cannot land without either accepting a measured REQ-10 failure or first running `/fix` and rebasing. `/land` stays theirs in both (brief:15), so A takes no authority away.

Judgement: A gives the developer the run they asked for.

### Turn 1 — advocate-b (argument)

**Steelman of A.** Exhaustion's step 4 offers (a) more cycles; the developer pre-answered "complete the run"; the guard the fix needs, `safeLocalStorage()`, was added by this plan and missed one caller; B only delays the same work and leaves the branch unlandable. I verified the guard claim: `git log main..HEAD -S safeLocalStorage` → `32dc5d2b`, and `main:web/src/storage.ts` has none. I also grant point 3: B costs more pipeline work in total.

**Where I disagree: the fix is neither one line nor bounded to the measured cell.**

1. *A second REQ-10 path breaks the same way (code reading, not measured).* `reader.ts:653` calls `forget(window.localStorage, id)` inside a `sessionRemoved` listener. `initReader` registers at `main.ts:72`, `initNotes` at `main.ts:95`, and `emit` has no isolation (`app.ts:129`). So with the getter throwing, removing a session throws before `notes.ts:315` `saver.forget(id)` runs — edge case 9, "any kept draft for the removed session is dropped" (`plan.md:342`) — and before `app.render()` in `actions.ts:141`. `reader.ts:157,214,216,221` read the getter unguarded as well. The one-line `writeThemeHint` fix repairs the measured cell and leaves this one; the reviewer's test (note 3) would not catch it.

2. *So the complete fix is app-wide.* Either the bus isolates throwing listeners (`app.ts:126-130` — a failure-semantics change for every listener in the dashboard) or theme and reader are both guarded. That is three features outside this plan's diff (theme, reader, the bus), chosen and verified with nobody awake. Precedent: the markdown-viewing review (cycle 4) found a pre-existing defect, "fixing only the reader's instance was deliberately declined as inconsistent", and it was fixed "once, for all of them" in its own plan (`docs/history/todo-done.md:484-490`).

3. *Blocked storage was never in this plan's acceptance.* "Wrap every read and write" sits under "**Hints (non-binding)**" (`plan.md:503,516-517`); no Edge Case names blocked storage (`plan.md:325-365`); REQ-10's mechanism is local storage itself (`plan.md:73`). In my reading, widening REQ-10 to that state is a requirement-scope change, and the amendments rule says "A requirement-scope change … → stop and ask" (`orchestrate/SKILL.md` § Rules, Plan amendments).

4. *B is an exhaustion answer.* This debate is the decider the developer asked for; B is option (b), "fix manually", routed to the track built for it, with the developer choosing one-line vs bus isolation. The night is not wasted: three parts' work is reviewed and the open issue is exactly specified.

Judgement: B keeps an app-wide hardening decision out of a feature squash made unattended.

### Turn 2 — advocate-a (argument)

**Steelman of B.** The reviewer's one-line fix is incomplete: with the getter throwing, `reader.ts:653` `forget(window.localStorage, id)` throws inside `sessionRemoved` before `notes.ts:315` `saver.forget(id)` and before `actions.ts:141` `app.render()`. A complete fix therefore widens into theme, reader and possibly the bus's failure semantics — an app-wide choice nobody awake can make — and blocked storage was only ever a non-binding hint.

**Point 1 — conceded as fact.** I verified it: `main.ts:72` registers reader before `main.ts:95` notes; `app.ts:129` has no isolation; `notes.ts:315` is the forget. Note 3's test would not catch it. I drop my "one line" framing.

**Point 2 — the complete fix is enumerable and small, and needs no bus change.** `rg -n '\blocalStorage\b|\bsessionStorage\b' web/src` outside tests returns exactly six unguarded sites: `theme.ts:49` and `reader.ts:157,214,216,221,653` (the rest are `storage.ts`'s own accessors and a comment). Each becomes `safeLocalStorage()`, the helper this plan added. That is "fix once, for all of them" — the precedent you cite (`todo-done.md:484-490`) declined fixing *one* instance of a class, not fixing the whole class. The invariant is checkable: that `rg` returns only `storage.ts`. Bus isolation is the reviewer's alternative ("or", `review.md:157`), not a requirement; A takes the narrower branch and leaves the bus untouched, so no listener's failure semantics change. Scope widening into theme/reader is the auto-touch path the skill says "Never stop for" (`SKILL.md:427-430`).

**Point 3 — no requirement is amended, so the amendment rule is not reached.** REQ-10's text is unchanged; the review measured it failing (`review.md:139`), and the brief records as context that the defect "breaks this plan's REQ-10" (brief:14). The plan's own code already treats blocked storage as in scope: `notessave.test.ts:347` "a storage that refuses writes", `notesdrafts.test.ts:143` `throwingStorage()`, and review cycles measured both blocked variants (`review.md:137-138`). The scope was set by what the plan built and tested, not by me.

**Point 4 — granted:** B is a fair reading of (b).

**Where that leaves it.** A's cycle 4 is now: web-impl replaces six call sites; e2e-specs adds note 3's journey plus a remove-while-blocked assertion; gates; delta re-review. With the bus out of scope, the remaining open question is the one the developer already answered — finish the run.

### Turn 2 — advocate-b (concession)

**Steelman of A.** The complete fix is a closed, checkable set: six unguarded call sites (`theme.ts:49`, `reader.ts:157,214,216,221,653`), each swapped for this plan's own `safeLocalStorage()`, with no change to the bus. No requirement text is amended, because the review measured REQ-10 failing as written and the plan's own tests already treat throwing storage as in scope.

I verified it. `rg` over `web/src` outside tests finds exactly those six sites, plus `storage.ts`'s own accessors and a comment in `updaterestart.ts:2`. The inline head scripts in `index.html:18` and `doc.html:12` are already try/catch reads (`theme.ts` comment). `reader/memory.ts:52,56,67` go through `readJson`, `writeJson` and `removeItem`, which already tolerate throwing methods, so the guarded fallback storage cannot throw on these paths. `notessave.test.ts:347` ("a storage that refuses writes") and `notesdrafts.test.ts:143` (`throwingStorage()`) show the plan built for this state.

That removes the ground of my turn 1. Point 2's "app-wide failure-semantics change" applied only to the bus branch, which A drops. The markdown-viewing precedent declined fixing *one* instance of a class (`todo-done.md:488-489`), and A fixes the whole enumerated class. Point 3 fails because nothing is amended. What is left is the cost comparison I already granted: B does the same work later, with an extra stop, against the developer's instruction to finish the run.

I concede: the complete fix is the six enumerable `localStorage` call sites moved onto this plan's own `safeLocalStorage()` guard, with no bus change. It stays inside REQ-10 as written and a reader can check it, so a cycle 4 that finishes the run is what the developer asked for. B would only defer the same work.

For the fix-wave prompt (as agreed scope, not a new option): web-impl moves the six sites; e2e-specs adds note 3's journey plus the remove-while-blocked assertion.
