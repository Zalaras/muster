# Retirement candidates — 2026-09-11

Sentences in `.claude/` whose class a script now enforces, found while tightening the rulebook
(pipeline-scaling cleanup, Track 2 B). **Nothing here has been removed.** Each row is a
proposal for Damian to pick by number; `/retro --audit` regenerates this list on demand.
Line numbers are as of commit `1a72e86`.

| # | Where | Sentence (abridged) | Covering check | Proposal |
|---|---|---|---|---|
| 1 | `.claude/skills/orchestrate/SKILL.md:526` | "Verify the review.md file on disk contains `**Verdict**: approved` — do NOT rely on memory" | `orch-state.py status completed` and `done --next completed` refuse unless review.md says approved (audit F5, 2026-09-06); line 556 already says so | remove line 526 (the script is the check; ~20 words) |
| 2 | `.claude/skills/plan-work/SKILL.md:245–254` | the three-rule "Negative grep checks need one authoring decision and two dry-runs" block | `plan-lint.sh` checks 5 and 7 (prose negative-grep, banned string in plan text, pre-existing hits listed) | shrink to rule 1 (test-file scope is a human decision) plus one line "plan-lint runs the dry-runs; put every hit it lists under Affected Files" (~120 words) |
| 3 | `.claude/skills/plan-work/SKILL.md:241` | "*no `<string>` survives in `<dir>`* is a negative grep and belongs in the block (`plan-lint.sh` flags it in prose)" | `plan-lint.sh` check 5 | keep as one clause; drop the explanation before it (~25 words) |
| 4 | `.claude/skills/plan-work/SKILL.md:121` | "`plan-lint.sh` flags an unenveloped example" plus the sentence explaining the envelope | `plan-lint.sh` check 6 | keep the envelope requirement (it tells the planner what to write); drop "never a flat `{"code": …}` sketch" (~10 words) |
| 5 | `.claude/agents/review-work.md:58` | "Look for `test.skip` / `test.fixme` in the diff" | `gates.sh` baseline `e2e-honest` (`! rg 'test\.(skip|fixme|only)\(' web/e2e`) | remove the skip/fixme clause; keep "assertions replaced by container-level `toBeVisible()`" and the fixture-drift clause, which no script sees (~8 words) |
| 6 | `.claude/agents/e2e-specs.md:159` | the `test.skip` / `test.fixme` / `test.fail` items in the "never" list | `e2e-honest` catches skip/fixme/only; not `test.fail`, not commenting a test out, not scope narrowing | shrink to "`test.fail`, commenting a test out, or narrowing a test's scope" — the mechanised three drop (~6 words) |
| 7 | `CLAUDE.md:84–88` | the four-line `git config user.*` hard rule with the 2026-09-10 incident | `.githooks/pre-commit` refuses to commit while a repo-local override exists (conventions.md:160) | shrink to two lines: the rule and "`-c user.name=… -c user.email=…` per command; the pre-commit hook refuses a repo-local override" — CLAUDE.md is the most expensive file (~35 words) |
| 8 | `.claude/skills/triage/SKILL.md:160–162` | "refuses if `TODO.md` was already dirty, if anything but `TODO.md` is staged, or if …" | `internal/triage/apply.go` (dirty check, staged-set assertion, hooks check) and `.githooks/commit-msg` | keep — this describes program behaviour the operator needs to recognise, not a rule an agent must remember. Listed so the audit does not re-raise it. |

Not candidates (checked): `e2e-specs.md:42` (harness rules — `e2e-lint.sh` enforces, but the
paragraph is what tells the agent which fixture to use); `web-impl.md:58` (already a pointer at
`make contrast`, audit F10); `daemon-impl.md:142` evidence-for-absences (`dead-refs.py` sees
path references only, not symbols or wording).

Anecdote load after B: 82 plan-name mentions (81 before). Every anecdote is now a clause —
plan name plus measurement — but none was dropped, because dropping one is a retirement
decision. The audit's item 4 ("ten longest anecdotes as shrink proposals") is the next cut.
