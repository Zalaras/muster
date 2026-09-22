# S6 — Adversarial resolver probe (measured 2026-09-07, Haiku 4.5 both arms)

**Question.** The 2026-09-01 probe scored 100% with and without plan context, but on a pair
that was semantically disjoint. Does task context beat diff-only when the right answer is
*not* recoverable from either diff? This decides whether feeding session context to a
resolver is worth the never-log-prompt-text plumbing.

**Rig.** `s6-resolver/make-pairs.sh` builds three tiny Go modules, each with `main` (A
already squash-landed) and branch `B` that conflicts with it; ground truth = `go vet && go
test`. Two clean-room copies per pair: **ctx** keeps `TASK-A.md`/`TASK-B.md` and real
commit messages and the prompt points at them; **diff** strips both (`filter-branch`,
messages → "work") and the prompt says only "rebase and resolve so verify passes". Each arm
is one fresh headless `claude -p` (`acceptEdits`, tools Bash/Read/Edit/Write). Same model
in both arms. Verify passes alone on `main` and on `B` for every pair (checked).

| Pair | Conflict shape | Correct answer needs |
|---|---|---|
| p1 | A changes the sort rule (length, then name) and adds a region; B inserts a region under the old rule | re-sort B's insert under A's rule, keep both regions |
| p2 | A renames `Fetch(string)`→`Load(int)`; B adds two call sites to the old name in the same hunk | port B's call sites to the new signature |
| p3 | A deletes the `Legacy` flag and its path; B adds a `Verbose` flag that refines the legacy path, plus a test that Verbose leaves modern alone | drop the legacy branch, keep `Verbose` (its test still means something), keep the test |

## Results (6 runs, 0 rebases left in progress, all 6 pass verify)

| Pair | Arm | Verify | Intent |
|---|---|---|---|
| p1 | ctx | PASS | A's rule + both regions — correct |
| p1 | diff | PASS | correct |
| p2 | ctx | PASS | `Load(1), Load(2), Load(3)` — correct |
| p2 | diff | PASS | correct |
| p3 | ctx | PASS | legacy gone, `Verbose` kept, `TestVerboseIgnoredWhenModern` kept — correct |
| p3 | **diff** | PASS | legacy gone, **`Verbose` deleted, B's test renamed to `TestModernMode` and its Verbose assertion removed** — B's intent lost; the prompt said "do not delete tests" and it complied by rewriting one instead. Extra commit "Update test to match simplified Mode implementation". |

Score: ctx 3/3, diff 2/3. The one miss is exactly the shape the question predicted — a
conflict where the diff alone says "main deleted this, B re-added it" and only the task
("add a Verbose flag") says the *flag* should survive the deletion of the *path*.

## Reading

- **Task context helped where the diff was ambiguous, and cost nothing where it wasn't.**
  With n = 3 pairs at Haiku, this is directional, not conclusive; a follow-up should use
  ~10 pairs and Sonnet/Opus in both arms before the number goes in SPEC.
- **Verify is not a sufficient gate for a resolver.** p3/diff passed vet+test having
  removed a test's meaning. Stack v2's rule — a resolver may touch only conflict hunks and
  may emit only content present in a parent — would have caught this: the test rename is
  outside the conflict hunk. Enforce it mechanically (diff the resolution against the
  union of both parents' hunks), not by prompt.
- **A resolver that changes tests must be flagged**, same as S4's verify-script finding:
  files that define the gate (tests, verify command, CI config) get a stricter rule.
- Context sourcing for the product: commit messages plus a per-branch task line (session
  title / first prompt summary) reproduce what `TASK-*.md` did here. Transcript paths
  handed to a spawned resolver session would be richer but were not needed for 3/3.
