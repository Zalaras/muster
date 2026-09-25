# Debate: features-scope-shellactivity-test

### Turn 1 — advocate-a (argument)

A costs context; B costs correctness and the last review cycle.

1. **B reinstates a measured defect.** Cycle 2 maintainability Minor 1 (`review.md:318-330`) measured the patch as the only post-construction field write in the composition root (`rg` finds one line) against 20 logger-taking sibling constructors, citing `docs/conventions.md:94-95` (§ Composition roots) and `:120-122` (§ Design "Match the siblings"), and named the cost: a bare hub "drops the 'ws outbox drain did not finish' warning without a trace". Its "fix must make true" list explicitly includes updating `shellactivity_test.go:439` (`review.md:328-330`). Both B variants restore the rejected shape: the patch verbatim, or a zero-arg constructor that keeps the silent zero-value path and adds a second constructor for one test ("A second implementation of an existing idea is a defect", `conventions.md:117-119`). Fix Attempt 2's reason for the zero-arg shape was exactly this call site (`daemon-implementation.md:204`), and the review ruled it doesn't hold because the same wave broke `wshub_drain_test.go:154,175`.

2. **B spends the last cycle on a known outcome.** Cycle 3 is the last (`SKILL.md:308-312`). A reviewer who flagged this shape in cycle 2 re-reads it in cycle 3; a cycle 3 that ends with it re-flagged goes to `status blocked` and asks the developer anyway. B also needs two more spawns (impl and tests may not edit each other's files, `CLAUDE.md:56`).

3. **A's cost, measured.** `go run ./tools/kb pack --plan settings-update-failures --role <r> --features update,connection,surfaces` against the current header: review 19,848→25,868 words; review-maintainability 16,116→21,884; e2e-specs 12,737→19,512; doc-reconcile 13,218→18,986. That's about +6k words per remaining pack. The header chooses which records agents read; the Doc Delta chooses which claims change, and under A it names no surfaces change.

4. **Skipping this gate doesn't finish the run.** doc-reconcile Step 1 (`.claude/agents/doc-reconcile.md:41-44`) returns `blocked` for any changed file owned by a feature outside the header. The file is in the diff (fb2ae45), so the run can only finish if the header names surfaces or that line is reverted. Reverting the line means reverting the constructor (point 1).

5. **A serves the gate's purpose.** `features-scope.sh:9-12` exists so agents reading another feature's files have its records. A gives them those records. The changed line calls `newWSHub`, which lives in `ws.go`, a file owned by connection and already in the header. No surfaces behaviour moved.

I think one plan line and ~6k context words is cheaper than reopening a measured defect on the final cycle.

### Turn 2 — advocate-b (concession)

Steelman of A: both B variants put back a shape that the cycle 2 review measured and ruled against. That's either the one post-construction patch in `New`, or a silent zero-value constructor kept alive for one test. doc-reconcile Step 1 means the surfaces-owned line has to be named or reverted before the run can finish. And A's only cost is pack context, with no surfaces doc claim.

My strongest reply: a new Decisions reason. The review rejected Fix Attempt 2's reason because of an asymmetry: the same wave broke `wshub_drain_test.go:154,175`. That asymmetry is really an ownership boundary. `kb for internal/server/wshub_drain_test.go` returns connection, which is in the header, and `kb for internal/server/shellactivity_test.go` returns surfaces, which isn't. So "don't widen scope for one call site" is a reason the reviewer never weighed, and conventions § Design ("Match the siblings … or says in Decisions why it diverges") allows a divergence that has a reason.

That reason doesn't hold up against the review as written. `review.md:316-331` lists two harms that don't depend on the stated reason. The first is the composition-root rule: `New` holds no post-construction patch. The second is the cost of the zero-value default: a bare `newWSHub()` drops the drain warning without a trace. Ownership answers neither one. The "fix must make true" list also names `shellactivity_test.go:439` explicitly. So a cycle-3 reviewer would most likely re-raise the Minor, and on the last cycle that ends in `status blocked` (`SKILL.md:308-312`). The developer is asked anyway, a cycle later.

On A's cost, my measurement agrees with yours: each remaining pack grows by about 42–49 KB (review 147,374→190,873 bytes, e2e-specs 93,415→142,089). The records don't serve this change, because the line calls a connection-owned constructor. That's dilution and not harm, though: I have no measurement showing a reviewer does worse with it. The downstream uses of the header are harmless under A. Completion step 4 (`SKILL.md:501`) and `/land` step 6 both loop over surfaces' proposed ADRs, and `go run ./tools/kb ls --feature surfaces --status proposed` returns nothing.

I concede: every B variant brings back the defect that cycle 2 Minor 1 measured, and a scope-based Decisions reason doesn't answer it (the composition-root patch or the silent zero-value hub). doc-reconcile Step 1 means the line has to be named or reverted anyway, and A costs only extra pack context, with no doc claim and no ADR side effects. Widen **Features** to `update, connection, surfaces`.
