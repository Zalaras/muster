# Agentic practice improvements — implementation brief

Written 2026-11-05 from an online review of agentic-engineering practice cross-referenced against
this repo. The research narrative, the local measurements and the full source list are in
`plans/_audit/agentic-practice-review-2026-11-05.md`; this file is the hand-off. Each item below
states the problem, why it matters (local evidence first, then external), the proposed solution,
what done looks like, and references. Nothing here is decided: the developer picks items and
their order, and each pick becomes its own plan and commit.

## How to use this file in a clean session

- Every item is **tooling and docs work** (CLAUDE.md § Workflow: "work that releases nothing is a
  plan and a commit"), unless it changes the daemon or dashboard, in which case it goes through
  `/plan-work` and `/orchestrate`. Items that change pipeline behaviour need an ADR in `docs/adr/`
  (`accepted` on `main`); re-measured Claude Code behaviour needs a fact record via `/interface-probe`.
- CLAUDE.md § Hard rules bind throughout. Two standing rulings from the developer also bind:
  size thresholds **warn, never refuse** (kb:adr/process-size-linters-warn-never-fail, extended by
  the developer to every budget); and a prose rule is retired only where its reader runs *after* the
  script that now enforces it — keep the sentence an agent needs before acting.
- After any edit under `docs/` or `.claude/`: `make gen-kb && make check-kb`; the pre-commit hook
  refuses a commit while `go tool kb check` fails. Cite records as `kb:<type>/<slug>`.
- Read the item's references before implementing; the external ones were fetched 2026-11-05 and
  may have moved. Installed Claude Code at the time of writing: 2.1.318, so every feature version
  named below is available.

## Status

| Item | Tier | Status |
|---|---|---|
| R1 Hard rules into hooks; reviewers read-only | 1 | proposed |
| R2 Review: one generator, filter critic, confidence, fingerprints, escalation | 1 | proposed |
| R3 kb pack as index + just-in-time reads; budget that bites | 1 | proposed |
| R4 Lesson sink rule for retros | 1 | proposed |
| R5 Cache and effort knobs; cost column | 1 | proposed |
| R6 Faster cycle gates | 1 | proposed |
| R7 Script the orchestrator | 2 | proposed |
| R8 Scale process to risk; epics of small plans | 2 | proposed |
| R9 Reviewer regression suite with plugin eval | 2 | proposed |
| R10 Layout, wire-shape and test-quality checks as gates | 2 | proposed |
| R11 FTS5 in kb find; qmd trial | 3 | proposed |
| R12 OTel cost dashboard | 3 | proposed |
| R13 Contract generated from one schema | 3 | proposed |
| R14 Per-agent step and context budgets | 3 | proposed |
| R15 Local code graph without model indexing — trial against a probe set | 3 | proposed |
| M1–M5 Facts to re-measure | — | proposed |

Update the Status column as items land (`done <date> <sha>`, `rejected <date>: <reason>`), the
same way `TODO.md` entries are ticked.

## Measured baseline (so progress is visible)

From `plans/*/orchestration-state.json`, `review*.md` counts and `go tool kb pack`, 2026-11-05:

| Measure | Value |
|---|---|
| Median run wall-clock, Aug / Sep / Oct–Nov 2026 | 1.65 h / 2.3 h / 3.95 h |
| Median review cycles, Aug / Sep / Oct–Nov | 1 / 2 / 2 (three reviewers from 2026-09-22) |
| Pipeline docs (skills + agents + CLAUDE.md) | ~65,000 words (31,000 on 2026-09-01) |
| kb pack, restart-latest-claude, review / orchestrator / daemon-impl / web-impl / e2e-specs | 85,831 / 67,459 / 57,780 / 53,957 / 57,494 words (budget 30,000, warns only) |
| Records | 446 ADRs, 116 facts (58 `guard: none`), 75 lessons |
| Agents restricting tools / hooks in project settings | 2 of 14 / 1 |
| Cold gates run / `go test` / `go test -race` / full E2E | 5–12 min / 94 s / 161 s / 5–7 min |

The Minors-never-re-review and delta-re-review rules (kb:adr/process-minors-verified-not-re-reviewed,
landed 2026-11-04) are not yet reflected in any run above; measure a few runs under them before
attributing an improvement to an item here.

---

## Tier 1 — cheap, reversible, high leverage

### R1. Move the hard rules into hooks and frontmatter; make reviewers read-only

**Problem.** Boundaries the pipeline depends on — impl agents never edit tests, test agents never
edit implementation, nobody runs `git stash` or `git config user.*`, reviewers never commit, only
the orchestrator edits the protocol — are prose in CLAUDE.md, `docs/conventions.md`,
`.claude/skills/orchestrate/worker-rules.md` and every agent file. One hook exists
(`.claude/settings.json`, SubagentStop comment check, fails open on a crash). Two of fourteen
agents restrict tools; the three reviewers and both judges inherit Edit and Write.

**Why.** Prose rules are context, not enforcement: Claude Code's own docs say "Claude treats
CLAUDE.md files as context, not enforced configuration" and "if you keep adding emphasis to a
CLAUDE.md line and Claude still misses it, that's a sign the line belongs in a hook". Compliance
with standing rules decays within a session (McMillan, arXiv 2605.10039: ~5.6% lower odds per
generated function) and after compaction (ConstraintRot, arXiv 2606.22528: violations 0%→30%).
A 4–14 h run compacts. Permission *deny rules* match text, so `git push` does not match
`git -C . push`; a hook reads the whole command. One repo that did this end to end removed its
rules directory by routing 19 rules to 2 hooks, 10 lints and 3 deletions (larch #6467).

**Proposed solution.**
1. A `PreToolUse` command hook on `Bash` that denies `git stash`, `git config user.`, `git push`,
   `git add -A`, `git reset --hard`, `git clean` in any spelling, returning `permissionDecision:
   "deny"` with a one-line reason the agent reads. Use the hook `if` filter to keep it cheap.
2. A `PreToolUse` hook on `Edit|Write` that reads `agent_type` from the payload and the path from
   `tool_input`, and denies: impl agents writing `_test.go`, `*.test.ts`, `web/e2e/`, `web/render/`;
   test agents writing anything outside their tier's globs; any agent but the orchestrator writing
   `docs/protocol.md` or `plans/<plan>/plan.md`. Ownership globs come from the feature specs'
   frontmatter via `go tool kb owners`, not a second list.
3. `onFailure: "block"` on the existing SubagentStop hook (2.1.295+) so a crashing check blocks.
4. In the three reviewer definitions and `judge.md`, `comment-judge.md`: `disallowedTools: [Edit,
   Write, NotebookEdit]`; add `maxTurns` to every agent (see R14 for the number).
5. Then delete the prose each hook replaces, but only where the reader runs after the hook
   would fire; keep the sentence that tells an agent what it owns before it starts.
6. A bug-fix-specific variant from Anthropic's SDLC playbook: during a `/fix` batch, a hook
   blocks edits to test files once the failing test is committed, so the fix cannot pass by
   weakening the assertion (today a prose rule plus e2e-lint).
7. Record the decision as an ADR (process: boundaries enforced by hooks, prose names them).

**Done when.** A probe agent (Haiku, trivial prompt) attempting each denied action is refused with
the reason, pasted into the plan log; the SubagentStop hook blocks on a deliberately failing check;
`make check-kb` green; the word count of the files edited is reported before and after.

**References.** https://code.claude.com/docs/en/hooks (PreToolUse decision control, `if`, `once`,
`onFailure`, `agent_type`); https://code.claude.com/docs/en/sub-agents (frontmatter
`disallowedTools`, `maxTurns`); https://code.claude.com/docs/en/permissions (deny rules match text);
https://code.claude.com/docs/en/best-practices ("belongs in a hook");
https://github.com/zhupanov/larch/issues/6467; arXiv 2605.10039; arXiv 2606.22528;
https://www.thoughtworks.com/radar/techniques/agent-instruction-bloat;
https://claude.com/resources/articles/the-ai-native-sdlc-playbook (hooks for protected paths, a
hook blocking test edits during a bug fix, a "report only, do not fix" verifier subagent;
Aug 2026, operational but unmeasured); `.claude/settings.json`;
`.claude/skills/orchestrate/scripts/subagent-stop-hook.sh`; CLAUDE.md § Hard rules.

### R2. Restructure review: one generator, a filter-only critic, confidence scores, fingerprints, escalation

**Problem.** Every cycle spawns three Opus reviewers in parallel
(kb:adr/process-review-split-three-reviewers-computed-verdict). Median cycles went from 1 to 2 the
month the split landed; a cycle costs 1–1.5 h; later cycles are mostly Minors, bookkeeping and
"new findings on unchanged code". There is no confidence score, no dedupe across reviewers or
cycles, and the same depth applies to a 600-word plan and a protocol change. The developer has
ruled out a hard cycle cap.

**Why.** AI reviewers are low-precision and noisy by construction: Claude Code's `/code-review`
measured at precision 7.2% / recall 28.9% on an expert-labelled benchmark (OpenCodeReview, arXiv
2608.09290); the best LLM judge gives the same verdict in all three runs only 61.3% of the time and
majority-of-three beats any single run (Rating Roulette, EMNLP 2025); a *second* same-session
review pass scores worse than the first (Cross-Context Review, arXiv 2603.12123). Three parallel
*generators* multiply findings: three reviewer agents cost 2.65× one with 4 of 7 findings
duplicated (Rulestack). What raised precision in the literature was system design, not model:
deterministic dispatch, bounded reading, and a reflector that sees only the diff and may only
delete findings the diff contradicts (OpenCodeReview). Anthropic's official `code-review` plugin
scores every finding 0–100 and drops those under 80, and its product "scales with the PR… trivial
ones get a lightweight pass". Every mature pipeline bounds the loop by escalation rather than
repetition: Superpowers re-dispatches a fresh implementer at round 4; Compound Engineering's repair
budget "can finish with leftovers". Anthropic's own account of Claude Code's review (Osmani, Lunt,
Wang, 2026-10-15) is the closest measured precedent: several agents hunt in parallel, "a separate
group votes on each finding, and only findings with enough agreement are posted"; style and cleanup
findings are dropped; survivors are tagged Important, Nit or Pre-existing; each repo picks Quick,
Standard or Deep; convergence rules are a round cap of three, diff-only re-review after the first
pass, and no repeated findings. Their internal before/after: PRs with substantive comments 16% →
54%; pass after one review-and-fix round 65% → 78%; five or more rounds 8.9% → 1.5%; mean rounds to
pass 2.08 → 1.32; and 59% of repeatedly flagged code predated the reviewer's first pass. No sample
sizes or methods are given, so treat them as directional, but every lever below appears in that list.

**Proposed solution.**
1. **Cycle 1 reviewer set by work type**: one Opus correctness pass (`review-work`) always; the
   plan-withheld maintainability lens only when the diff touches `internal/` or `web/src/` shape
   (new module, new type, new seam) — otherwise fold it into the correctness pass as a second
   section of the same brief; `review-browser` only for web and full-stack plans (as now).
2. **Filter-only critic**: after the parts are written and before `merge-review`, one Sonnet
   subagent receives the branch diff and the findings list and nothing else (no pack, no plan, no
   transcripts). It may only delete a finding the diff directly contradicts, must return the rest
   verbatim, and fails open on any parse error. `orch-state.py merge-review` reads its output.
3. **Confidence**: every finding carries `confidence: 0–100`; `review-scale.md` defines the
   anchors; a Major under 80 or a Minor under 60 is recorded in `proposed-backlog.md` with the
   reviewer's text and never routed. The threshold is a warning value the developer can move.
4. **Fingerprints**: each finding gets `id: <file>:<symbol>:<four-word-claim>`. On cycle ≥2 the
   single delta reviewer is given the prior part file and must classify each prior id
   `resolved | unresolved | moot` before adding anything; a new finding on a file untouched since
   the previous cycle must carry pasted reproduction (command and output) or becomes a proposal.
5. **Escalation, not a cap**: at the start of cycle 3, instead of another fix wave by the same
   agent, spawn a fresh implementer for that track with the review file and the fix log as its
   only history. If cycle 3 still returns `needs-changes`, the existing Review Cycle Exhaustion
   path stands. (Anthropic caps at three rounds; the developer has ruled a hard cap out, so
   escalation is the substitute.)
5a. **Contesting a finding needs evidence**: a fix-wave agent may answer a finding with
   `counter` or `refute` only by naming the concrete harm or pasting the measurement that
   contradicts it (Liza's Accept/Counter/Refute/Escalate protocol); otherwise it fixes. The
   orchestrator records contested findings in the cycle summary.
6. ADR for the review shape; update `review-scale.md`, the three reviewer definitions and
   `orchestrate/SKILL.md` Step 6; the merge script computes the verdict exactly as now.

**Done when.** Two feature runs under the new shape report cycles, reviewer dispatches per cycle and
the critic's deletions per cycle in the completion summary; `review.md` carries ids and confidence;
`merge-review` rejects a part without them.

**References.** https://arxiv.org/html/2608.09290v1 (OpenCodeReview);
https://aclanthology.org/2025.findings-emnlp.1361.pdf (Rating Roulette);
https://arxiv.org/html/2603.12123v2 (Cross-Context Review); https://arxiv.org/html/2607.06065v1
(SWE-Review: reproduction predicts accuracy); https://arxiv.org/abs/2608.18167 (Adversarial Review:
required disagreement); https://www.anthropic.com/engineering/harness-design-long-running-apps;
https://github.com/anthropics/claude-plugins-official (code-review: 0–100, drop <80);
https://claude.com/blog/code-review (scales with the PR);
https://dev.to/rulestack/what-a-claude-code-subagent-actually-costs-measuring-the-436k-token-fixed-overhead-46g6;
https://github.com/obra/superpowers (round cap, fresh implementer, Minors never in loop);
https://cognition.com/blog/multi-agents-working (clean-context reviewer);
https://claude.dev/blog/solving-code-review-at-anthropic/ (vote filter, tags, diff-only re-review,
no repeats, measured before/after); https://github.com/alibaba/open-code-review (the OpenCodeReview
paper's code: one subagent per file with six bounded tools capped at 30 iterations; the reflector
"can remove comments but cannot generate new ones" and keeps all comments if its output does not
parse; a "Delegation Mode" lets the host coding agent run the review on its own login — its docs
pages returned 404 on 2026-11-05, so unverified); https://github.com/liza-mas/liza (reviewer
verdict protocol, heavier quorum on upstream artifacts; 418 stars, thin measurement — borrow the
protocol, not the runtime); `.claude/skills/orchestrate/review-scale.md`;
`.claude/skills/orchestrate/scripts/orch-state.py`; kb:adr/process-minors-verified-not-re-reviewed.

### R3. Turn `kb pack` into an index plus just-in-time reads, and make the budget bite

**Problem.** Packs run at 1.8–2.9× the 30,000-word budget (review 85,831; orchestrator 67,459) and
the budget only warns (kb:adr/knowledge-pack-sections-scoped-by-role). Every record a role *might*
need is inlined: whole feature sections, every accepted ADR of every touched feature, every lesson
for the role, conventions slices.

**Why.** Anthropic's guidance is "the smallest possible set of high-signal tokens", holding
"lightweight identifiers (file paths, stored queries…)" and loading at runtime; Claude Code's own
model is CLAUDE.md up front plus grep just-in-time; Agent Skills formalise three-level disclosure
(name and description, then body, then linked files). Long input degrades even trivial tasks and
distractors compound (Chroma context rot, 18 models); context files that are repo overviews give
no task-success gain at +20% cost (ETH Zurich, arXiv 2602.11988); a judge's answer "differs more
the longer the text it has to read" (Anthropic plugin-eval docs); the best reviewer in SWE-Review
read 1.3 files. Anthropic's July 2026 post: "A common myth is that you want to make these a
central repository for every known practice that you might run into… consider having a tree of
files that can be loaded at the right time."

**Proposed solution.** In the `kb` module (`github.com/Zalaras/kb`, bump the tool pin) and
`kb.yaml`:
1. Pack inline, in priority order: the feature spec(s); the contract slice; ADRs, facts and
   lessons whose `files:` globs match the plan's Affected Files; the role's conventions sections.
2. Everything else becomes one index line each: `kb:<type>/<slug> — <summary> (<n> words)`, with
   the instruction to run `go tool kb show <id>` when needed.
3. Fit the inline set to `budgets.pack_words` by cutting from the lowest priority upward; print
   what was demoted to the index. The budget remains a warning threshold the developer sets; the
   fitting is what changes.
4. Run `/doctor prompt-audit` over `.claude/` and every CLAUDE.md and apply the cuts it proposes
   that survive the retire-only-post-gate rule; run `/skill-doctor` and remove or merge unused
   skills.
5. Audit the always-loaded files (root CLAUDE.md, nested CLAUDE.md trailers, generated
   `.claude/rules/*.md`) against the question in the docs: "Could it find this by reading the code?
   Would it actually go and look? If both are yes, leave it out."

**Done when.** `go tool kb pack` for every role of the last completed plan prints ≤ budget inline
words plus an index; one feature run completes with agents reading records through `kb show`
(their logs name which); reviewer precision is no worse by the R9 suite if it exists, else by the
run's cycle count.

**References.** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents;
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills;
https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/;
https://research.trychroma.com/context-rot; https://arxiv.org/abs/2602.11988;
https://code.claude.com/docs/en/plugin-evals; https://code.claude.com/docs/en/best-practices;
https://code.claude.com/docs/en/memory (`/doctor prompt-audit`, 2.1.283+); `kb.yaml` § pack;
`docs/features/knowledge/spec.md`; Aider's budget-fitted repo map as the design precedent:
https://github.com/Aider-AI/aider.

### R4. A lesson sink rule for retros

**Problem.** `/retro` proposes "the smallest pipeline-doc change (net ≤0 lines)" per incident. The
net rule is ahead of the field, yet pipeline docs doubled in two months and lessons reached 75;
the pipeline-duration analysis of 2026-11-04 found "retros add a rule per incident; the next run
hits a new one". 58 of 116 facts have `guard: none`.

**Why.** Rule count, not file structure, is what degrades compliance (Constraint Saturation, arXiv
2608.12426: "breaks down beyond 5–6 simultaneous constraints"; IFScale: earlier-instruction bias;
McMillan: structure null). LLM-consolidated lesson banks rise then fall below no-memory, while
keeping raw episodes stays competitive (arXiv 2605.12978). Böckeler names the failure mode: "an
agent that encodes rules but never finds out whether they worked". Practitioners who keep
instruction files small test each change (Ball: blind control/treatment agents, 1/3 → 3/3;
Ronacher: run it three times and judge variance) and delete what stops being used. Every's retro
question is "Would the system catch this automatically next time?"

**Proposed solution.**
1. In `.claude/skills/retro/SKILL.md` § 2, replace the proposal table with a sink rule: a finding
   becomes exactly one of (a) a hook, lint, `kb check` rule or gate line; (b) a fact record with a
   `guard` test (measured behaviour); (c) an episode — a lesson record with `roles: []`, so no pack
   carries it; (d) prose, only when a control/treatment probe shows the sentence changes behaviour
   (two fresh Haiku agents, same trivial task, with and without the line; paste both outputs).
2. A `kb check` rule (in the module, configured in `kb.yaml`): a lesson whose body names a guard
   (`guard:` field, mirroring facts) is excluded from every pack; a fact with `guard: none` older
   than N days is a WARN line, never a failure.
3. One pass over the existing 75 lessons applying the sink rule; report the counts per sink and
   the pack size before and after.
4. Rerun `/retro --audit` (last run 2026-09-25) and keep its review-cycle trend step.

**Done when.** The retro skill's § 2 is the sink rule; `kb check` prints the guarded-lesson and
unguarded-fact counts; the lessons pass is committed with its before/after pack sizes.

**References.** https://arxiv.org/abs/2608.12426; https://arxiv.org/abs/2507.11538;
https://arxiv.org/abs/2605.10039; https://arxiv.org/abs/2605.12978;
https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html;
https://ampcode.com/docs/using-amp/thorsten; https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/;
https://github.com/EveryInc/compound-engineering-plugin;
https://www.thoughtworks.com/radar/techniques/agent-instruction-bloat ("progression testing");
`.claude/skills/retro/SKILL.md`; `docs/lessons/`; `docs/facts/`.

### R5. Cache and effort knobs; a cost column

**Problem.** Subagents run on the 5-minute cache TTL (kb:fact/subagent-cache-ttl-5m) while test
agents hold 5–7-minute foreground gates, so each gate costs a full prefix re-write. Effort is set
per agent but was chosen when changing it broke the cache. Runs record wall-clock only.

**Why.** The developer is on a Team plan with a weekly cap (the Ultra rename does not apply; the
limits are shared across every surface and subagent, with cached tokens counting "less" by an
unpublished weighting). A subagent's cold start is ~54k cache-creation tokens and re-writes of
40–57k tokens follow every cache miss (Rulestack, Systima). `subagentPromptCacheTtl: "1h"` exists
since 2.1.242/243 and agent-level `experimental.cacheTtl` since 2.1.248; effort changes no longer
break the cache on the 5.5 models; `CLAUDE_CODE_RETRY_WATCHDOG` lets an unattended batch wait out
a near reset and fail fast on a far one; `/usage` attributes the last period by subagent type and
flags anything over 10%. **Model pinning is deliberately not in this item** — the developer's
ruling (2026-11-07): Haiku is cheaper but exploration quality is the asymmetric risk; a missed
finding costs a review cycle, and Anthropic itself moved the built-in Explore agent off Haiku in
2.1.198. Haiku stays for closed, mechanical steps only (`triage-proposer`, `comment-judge`), which
already run at low effort. Exploration gets *targeted* (R3's index, `kb for`, `kb owners`), not
cheaper; a pin is reconsidered only with R9/R15 probe data behind it. **First probe data
(2026-11-07, `plans/_audit/exploration-probe-2026-11-07/`):** on ten "does this helper already
exist?" cases taken from real reuse-before-add findings, three passes each, Haiku found 28/30
(8/10 in every pass) and Opus 26/30 (7/10), with the same three hard cases missed by both, near-equal
token volumes (the ~140k-token cached prefix dominates) and ~30× lower list cost for Haiku. That
supports Haiku for *targeted lookups*; it says nothing yet about open-ended exploration or about
reasoning over what was found. The developer decides whether to pin on that basis.

**Proposed solution.**
1. `.claude/settings.json`: `"subagentPromptCacheTtl": "1h"` (confirm it is honoured on the
   developer's plan: the docs say it is ignored while on usage credits).
2. Per-agent `effort`: reviewers and judges `high`, impl `medium`, `doc-reconcile`,
   `triage-proposer`, `comment-judge` `low`; record the before/after in the plan log.
3. `orchestrate/SKILL.md`: when spawning a parallel pair, start the second after the first's
   first response so the shared prefix is cached once (the "cache race" Systima measured).
4. `scripts/sweep.py`: set `CLAUDE_CODE_RETRY_WATCHDOG=1` and
   `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` so an overnight batch waits for a near
   reset instead of dying. No usage threshold: the developer ruled it out (a threshold cannot know
   the work ahead, and the plan has always had a weekly cap).
5. `orch-state.py start/finish`: record `rate_limits.seven_day.used_percentage` per step so
   `timings` gains a Δweekly% column; the completion summary and `/retro` read it.
6. A weekly ritual line in `docs/runbooks/`: run `/usage` and act on rows over 10%; run
   `npx ccusage@latest session --json --by-agent` for the last run and paste the per-agent table
   into the retro.

**Done when.** One run's timings table shows Δweekly% per step; the cache setting is observed to
hold across a gate in a transcript.

**References.** https://code.claude.com/docs/en/prompt-caching; https://code.claude.com/docs/en/sub-agents
(model precedence, Explore, `experimental.cacheTtl`); https://code.claude.com/docs/en/model-config;
https://code.claude.com/docs/en/env-vars; https://code.claude.com/docs/en/costs (`/usage`);
https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan;
https://support.claude.com/en/articles/11647753-weekly-usage-limits;
https://support.claude.com/en/articles/9797557 ("cached portions count less");
https://systima.ai/blog/subagent-tax;
https://dev.to/rulestack/what-a-claude-code-subagent-actually-costs-measuring-the-436k-token-fixed-overhead-46g6;
https://github.com/ryoppippi/ccusage; https://github.com/SciScend/claude-nightshift (threshold pattern);
kb:fact/subagent-cache-ttl-5m; kb:fact/rate-limits-wire-shape; `scripts/sweep.py`.

### R6. Faster cycle gates

**Problem.** A cold gates run is 5–12 min; `make check` members run serially; cycle gates run the
whole Go suite (94 s plain, 161 s race) and the scoped E2E every wave; a fix wave is sometimes
spent on formatting.

**Why.** The field's advice is computational sensors on every change and inferential ones sparingly
(Böckeler), and Anthropic's C-compiler run needed a deterministic fast tier because "Claude can't
tell time". Playwright ships `--only-changed[=ref]` and `--last-failed`; Go's `go list -deps -test`
gives the affected-package closure; the Makefile already notes serial ordering matters only around
E2E; golangci-lint caches; a PostToolUse formatter hook is the single most-cited hook in
practitioner setups (Cherny).

**Proposed solution.**
1. `gates.sh --wave 1|2`: Go tests only for packages whose `go list -deps -test` closure includes a
   changed file (`git diff --name-only main...`), falling back to `./...` on any error; full suite
   and race stay at Final Validation (kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion
   already does this for E2E).
2. Wave 3 and cycle gates: `npx playwright test --only-changed=main --last-failed` combined with
   the existing `SPECS=` scoping; the full sweep stays at `--full-e2e`.
3. A parallel `make` target for the independent `check` members (lint, web-lint, web-test,
   contrast, e2e-lint, render-lint, check-versions, check-kb) with Playwright still under
   `bin/gatelock`; `make check` keeps its current serial meaning.
4. `PostToolUse` hook on `Edit|Write`: `gofmt -w` for `.go`, Biome format for `web/src` files,
   exit 0 always.
5. Set `GOLANGCI_LINT_CACHE` to a stable path in the Makefile so worktrees share the cache.

**Done when.** Measured before/after of a cold cycle gate and a fix-wave gate pasted into the plan
log; no gate semantics changed at Final Validation.

**References.** https://playwright.dev/docs/test-cli (`--only-changed`, `--last-failed`);
https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html;
https://www.anthropic.com/engineering/building-c-compiler; https://code.claude.com/docs/en/hooks
(PostToolUse); https://howborisusesclaudecode.com/ (format hook); `Makefile`;
`.claude/skills/orchestrate/scripts/gates.sh`; `tools/gatelock`.

---

## Tier 2 — structural

### R7. Script the orchestrator; keep prose only in role briefs

**Problem.** `/orchestrate` is a 593-line prose procedure held in the main session's context for
4–14 h across compactions; `/plan-work` is 496 lines. The state file is written through
`orch-state.py`, but the control flow (what to spawn when, which verdict routes where) is prose
that the orchestrator re-reads and sometimes misapplies (lessons: orchestrator-work-spawned-as-agent,
decision-made-inside-a-fix-wave, handoff-commit-defects).

**Why.** Long standing procedures lose steps: HANDBOOK.md (COLM 2026, arXiv 2607.25398) measures
36.2% task success under a 20–124-page SOP with agents "reporting compliance they did not
achieve"; ConstraintRot shows 30% rule loss after compaction. The field moved control flow into
code: Claude Code Workflows ("a workflow moves the plan into code", journal, run-id resume,
cache-shared siblings, pauses on usage limit since 2.1.271); 12-factor agents ("own your control
flow"); ccpm ("deterministic ops run as bash scripts… no LLM token cost"); Anthropic's C-compiler
run used a bash loop with no orchestrator agent. This repo's `scripts/sweep.py` already is that
shape for `/fix`.

**Proposed solution.** Two routes; pick by trial.
- **Route A, script.** Generalise `scripts/sweep.py` into a step graph: each step a fresh
  `claude -p` with a one-page brief, the pack index (R3) and the plan path; verdicts read with
  `--json-schema`; `orchestration-state.json` becomes the journal the script writes; the main
  session only launches, watches and reads the summary. Fix waves, gates and the reviewer set are
  code paths. `/orchestrate` shrinks to "run the script, read its summary, handle `blocked`".
- **Route B, Workflow tool.** Trial on the reviewer fan-out only: a saved workflow script that runs
  the reviewers with `parallel()` and `agent(..., {schema})`, merges in code, and returns the
  verdict; then extend to fix waves with `pipeline()`. Limits to check first: same-session resume
  only, no mid-run user input (decision items must surface as `blocked`), concurrency
  `min(16, CPUs-2)`, and whether a Workflow runs inside a `claude -p` batch in a worktree (undocumented).
- Either route: verdict schemas with required evidence fields (see R9/R10); the decision items and
  the `decide` skill stay in the main session.

**Done when.** One feature run completes end to end through the script or workflow with the same
artifacts in `plans/<plan>/`; the orchestrate skill's line count and the orchestrator's context at
completion (`/context`) are reported before and after.

**References.** https://code.claude.com/docs/en/workflows; https://code.claude.com/docs/en/headless
(`--json-schema`, exit codes); https://github.com/humanlayer/12-factor-agents;
https://github.com/automazeio/ccpm; https://www.anthropic.com/engineering/building-c-compiler;
https://arxiv.org/abs/2607.25398; https://arxiv.org/abs/2606.22528;
https://github.com/openai/symphony (tracker as truth, state reconciled on restart);
`scripts/sweep.py`; `.claude/skills/orchestrate/SKILL.md`;
`.claude/skills/orchestrate/scripts/orch-state.py`; kb:adr/process-fix-sweep-fresh-process-per-batch.

### R8. Scale process to risk; epics of small plans

**Problem.** Every plan pays the same depth: separate e2e, impl, unit-test and render-test agents,
three reviewers, doc-reconcile, full sweep. Separate unit-test agents cost 75 min on one retry; a
7.7 h run spent 88 and 112 min in the two implementers. Plan size is weakly tied to cycles but
strongly to wall-clock; the developer wants to revisit plan size (TODO.md § Tooling and docs).

**Why.** Anthropic's review product scales reviewers to the PR; claude-code#101695 treats 2.5 h of
agent time for a UI-only change as a bug ("scale process to risk"); nobody else separates
unit-test authoring from implementation (Superpowers and cc-sdd have the implementer write tests
and a reviewer judge them), while the evidence for *independent verification* is about the
acceptance oracle, which here is e2e-specs. Merging roles that share context cut dispatches 5→3
and was "the largest lever by a wide margin" in one measured orchestrator (Wessam). HumanLayer:
review the plan, not the code, and keep plans short enough to read; Horthy later replaced an
eight-page plan with a two-page "structure outline". Gas Town lands an epic's children on one
integration branch with a single merge to main.

**Proposed solution.**
1. `/plan-work` sets a `**Tier**` header from touched surfaces: `protocol` (contract delta),
   `surface` (new UI surface or Testable UI table), `internal` (daemon-only or web-only, no new
   surface), `docs`. `/orchestrate` and the R7 script read it:
   - `docs` / `internal`: impl agent writes its own unit and render tests (the plan's D*/W*/R*
     criteria become its acceptance list); e2e-specs stays independent; one reviewer; browser
     review only for `surface`/`protocol`.
   - `surface`: as above plus render-tests and browser review.
   - `protocol`: the full current set.
2. Plans over about 800 words become an **epic**: `plans/<epic>/plan.md` lists ordered child plans
   with their Affected Files; `make worktree NAME=<epic>` opens `plan/<epic>`; each child runs the
   pipeline in its own tree branched from the epic branch and lands on it with the existing squash
   rules; `/land <epic>` is the one merge to `main`. Children with disjoint Affected Files may run
   concurrently under the gate lock.
3. ADRs: tiered process; epic branches.

**Done when.** The tier header is required by `plan-lint.sh`; one `internal` plan completes with
a single reviewer and no separate test agents, and its wall-clock and cycle count are reported
beside a comparable earlier run; one epic lands through its branch.

**References.** https://claude.com/blog/code-review; https://github.com/anthropics/claude-code/issues/101695;
https://dev.to/__declspec/your-multi-agent-pipeline-isnt-slow-because-of-the-model-dfa;
https://github.com/obra/superpowers; https://github.com/gotalab/cc-sdd;
https://github.com/humanlayer/advanced-context-engineering-for-coding-agents;
https://www.youtube.com/watch?v=YwZR6tc7qYg (Horthy, Mar 2026); https://github.com/steveyegge/gastown
(integration branches); `.claude/skills/plan-work/SKILL.md`;
`.claude/skills/orchestrate/scripts/plan-lint.sh`; kb:adr/process-plan-fixes-boundaries-not-shape;
`TODO.md` § Tooling and docs ("Revisit plan size").

### R9. A reviewer regression suite with `claude plugin eval`

**Problem.** Nothing tests the pipeline's own prompts. Editing a reviewer or planner definition, or
a pack rule, has no regression check; whether a Sonnet pre-screen would lose recall is guessed.

**Why.** Anthropic's eval guidance: "20–50 simple tasks drawn from real failures is a great
start", regression evals "should have a nearly 100% pass rate", grade the outcome not the path,
build balanced sets, pin the model; Claude Code itself started with narrow evals. `claude plugin
eval` (2.1.269+) runs cases against a plugin's skills and agents with regex, file-exists, llm and
baseline graders, three runs per case, JSON report and exit codes, and bills the plan ("counted
against your plan's usage"). Reviewer non-determinism (R2) is exactly what a three-run eval
measures.

**Proposed solution.**
1. Add `.claude-plugin/plugin.json` so the existing `.claude/agents` and skills are a plugin
   (no move of files).
2. 20–30 cases under an `evals/` directory, each a scratch worktree built by a script with one
   planted defect drawn from a lesson (a weakened assertion, a wire-shape drift, a layout claim
   with no measurement, a comment that should be stripped) and its mirror with no defect that must
   return `approved`.
3. Graders: regex on the structured verdict for the expected finding id (R2 fingerprints) and a
   baseline grader against the golden verdict; `--runs 3 --model <pinned> --json
   --max-cost-usd <n>`; replay mocks for repeat runs.
4. Run it only on commits that touch `.claude/agents`, `.claude/skills` or `kb.yaml`; a drop
   below threshold is a failed retro proposal.
5. Use the same suite to answer "does a Sonnet pre-screen lose recall" with pass^3 per case
   before changing reviewer models.

**Done when.** `claude plugin eval . --json` passes on the current agents; one deliberate
regression (delete a reviewer rule) fails it; the cost of a full run is recorded.

**References.** https://code.claude.com/docs/en/plugin-evals;
https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents;
https://aclanthology.org/2025.findings-emnlp.1361.pdf; `docs/lessons/`.

### R10. Layout, wire-shape and test-quality checks as gates

**Problem.** Classes of defect the Opus reviewers find in cycles 2–3 are mechanical: a layout
claim nobody measured (lessons: layout-claims-are-measurements-not-sentences,
scroll-fix-measured-at-one-offset), a wire shape that drifted between a daemon fixture and the UI
(stale-fixture-reshaped-the-wire, two-wire-shapes-accepted-hides-disagreement), tests that pass but
assert nothing (validate-repair-weakened-the-assertion), a fix that closed one cause of two.

**Why.** Deterministic graders run every cycle for free; Anthropic's eval guidance prefers them
where possible, and Böckeler's computational sensors run on every change. Agent-written suites hit
100% line coverage with mutation scores of 78–99% (Supercov, vendor; survivors 37% condition
flips, 20% comparison operators). Playwright screenshot assertions are stable per browser and
platform and the dashboard targets Chrome only. JSON Schema can be generated from the Go types
and compiled to TypeScript validators, so fixtures and frames are checked by code.

**Proposed solution.**
1. Render tier: `toHaveScreenshot` per fixture with timers and clocks masked via `stylePath` and a
   project `maxDiffPixels`; snapshots live beside the render specs; a size WARN if the snapshot
   set grows past a threshold.
2. Wire shape: generate JSON Schema from the daemon's protocol structs (`invopop/jsonschema` or
   `tygo` for types), compile to TypeBox or zod, validate every file under `web/render/fixtures/`
   and every E2E WebSocket frame in `make check`; a schema change is a protocol change and follows
   the existing contract rules.
3. Test quality, warning gate only: Stryker `--incremental` over changed `web/src` files and
   gremlins over changed Go packages in Final Validation, listing survivors; the test agents' briefs
   gain one line: "Only change tests. If a mutant cannot change behaviour, say why and skip it."
4. Property tests (`rapid` for Go, `fast-check` for TS) for the state machine, reconcile and the
   settings JSON merge.
5. A test-authoring gate in the three test agents' briefs and the correctness reviewer's, taken
   from openclaw's `test-audit` skill (57 lines): before adding a test answer "Protected observable
   behavior, invariant, or independent contract?", "Credible regression that makes it fail?", "Why
   existing proof misses it?", and "Export, flag, wrapper, injection hook with no production caller
   needed? Move proof to real boundary instead."; junk patterns to reject — self-comparisons, source
   greps, call-shape assertions, mocks that supply the asserted value, expected values computed
   from the code under test; one owner regression per bug, never one per layer; a failing baseline
   test is a possible product bug, not a deletion candidate; report kept contracts and test-versus-
   production LOC, never deletion counts. This replaces, not adds to, the equivalent prose in the
   agent files; keep it to the questions and the list.

**Done when.** Each check runs in `make check` or Final Validation with measured duration; one
planted defect of each class fails the gate; the reviewer definitions drop the prose asking for the
same check.

**References.** https://playwright.dev/docs/test-snapshots; https://supercov.com/blog/mutation-testing-ai-generated-tests;
https://stryker-mutator.io/docs/stryker-js/incremental/; https://github.com/go-gremlins/gremlins;
https://github.com/flyingmutant/rapid; https://github.com/dubzzz/fast-check;
https://github.com/invopop/jsonschema; https://github.com/gzuidhof/tygo;
https://github.com/bcherny/json-schema-to-typescript;
https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents;
https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md;
kb:adr/process-test-levels-journey-property-logic; kb:adr/process-render-fixtures-generated-from-daemon;
`docs/protocol.md`; `web/render/`.

---

## Tier 3 — optional

### R11. BM25 in `kb find`; a qmd trial

**Problem.** `kb find` and `rg` are the only search over ~334,000 words of records; a planner or
reviewer asking "which record governs X" relies on naming.
**Why.** SQLite FTS5 gives ranked full-text search at zero model cost; the only credible free
semantic option is tobi/qmd (MIT, local GGUF hybrid search with an MCP server), and no benchmark
shows embeddings beat grep on a markdown corpus — Cursor measured +12.5% from embeddings on code
in 2025 and then dropped them for local grep in 2026, and Entire's open-source memory tool (Entire
Brain) removed semantic retrieval on 2026-10-12 after its own 1,748-run eval found BM25 matched
embedders with 18–28% fewer agent tokens (self-run).
**Proposed solution.** Add an FTS5 index to the kb module behind `kb find`; build a 20-probe set
of "which record governs X" questions with known answers; only then trial qmd against the same
probes and keep it only if it wins.
**References.** https://github.com/tobi/qmd; https://cursor.com/blog/semsearch;
https://cursor.com/docs/context/codebase-indexing; https://www.sqlite.org/fts5.html;
https://github.com/entireio/entire-brain (BM25-only, typed facts store; MIT; watch, do not adopt —
hosted forge is the lock-in, store migrations are one-way).

### R12. OTel cost dashboard

**Problem.** Per-agent cost is reconstructed from task notifications and transcripts.
**Why.** Claude Code's OTel `api_request` events carry `agent_id` / `parent_agent_id` (2.1.310+)
and cache writes split by TTL; one `grafana/otel-lgtm` container is a complete local sink.
**Proposed solution.** A runbook: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, OTLP to the container,
`OTEL_LOG_TOOL_DETAILS=1`, a saved dashboard grouping by agent and plan; env set in the shell or
user settings (repo settings cannot enable telemetry). Do after R5 shows the Δweekly% column is
not enough.
**References.** https://code.claude.com/docs/en/monitoring-usage; https://github.com/grafana/docker-otel-lgtm;
kb:fact/otel-usage-metrics-shape.

### R13. Contract generated from one schema

**Problem.** `docs/protocol.md` is prose with anchors; `web/src/protocol.ts` mirrors it by hand;
`contract.md` is generated from the prose.
**Why.** Anthropic's July 2026 guidance prefers "files that are in code" as references; schema
generators for Go↔TS are mature (R10 references).
**Proposed solution.** Once R10's schema exists, generate `web/src/protocol.ts` and the contract
slices from it and keep `docs/protocol.md` for semantics only. This changes the daemon↔UI protocol
tooling, so it needs its own ADR and a `/plan-work` plan.
**References.** R10; kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids.

### R14. Per-agent step and context budgets

**Problem.** No agent has `maxTurns`; one measured build found 71% of subagent tokens spent after
each agent's 80th step (claude-code#106025).
**Why.** Fresh context beats a long tail: LoopsBench (arXiv 2608.00267) shows explicit state
tracking plus restarts cut regressions; the issue asks for exactly these limits.
**Proposed solution.** `maxTurns` per agent from the timings data (start at the 90th percentile
of observed turns), `autoCompactWindow` where supported, and a fix-mode re-spawn that starts from
the log rather than resuming; report any agent that hit its cap in the completion summary.
**References.** https://github.com/anthropics/claude-code/issues/106025; https://arxiv.org/html/2608.00267v1;
https://code.claude.com/docs/en/sub-agents.

---

### R15. A local code graph without model indexing — trial against a probe set

**Problem.** Agents answer "what reaches X" and "what does changing Y affect" by grepping and
reading, which is where the implementers' and reviewers' reading tokens go (SWE-Review's best
reviewer read 1.3 files; #106025's agents spent 71% of tokens after step 80). The repo already
maps files to features and records (`go tool kb for`, `kb scope`, `kb owners`) but has no call,
import or symbol graph an agent can query.

**Why.** A deterministic graph built by parsing (tree-sitter, `go list -deps`, the TypeScript
compiler's module graph) costs no model tokens to build, is exact, and can be regenerated in a
hook on every commit; the category is distinct from "knowledge graph" products whose doc edges
are inferred by a model pass. The measured value is on structural questions over code: Aider's
repo map (tree-sitter tags ranked by PageRank and fitted to a token budget) is the one design with
a long track record; Shepard & Albrecht (arXiv 2606.20512) found guidance helps agents reach the
right file rather than write better patches, which is the gain a graph can offer. For prose
(the 334k-word record store) a graph adds nothing over BM25 and `kb for`, so this item is about
`internal/` and `web/src` only. No source read on 2026-11-05 shows a graph beating ripgrep plus
an LSP on a mid-sized Go+TS repo, so the trial decides.

**Proposed solution.**
1. Write a 20-probe set of structural questions with known answers from this repo ("which
   handlers reach `internal/store`", "what does a change to the session envelope type touch in
   `web/src`", "which E2E specs exercise the launch route"), and the token cost of answering each
   today with ripgrep and Claude Code's LSP tool (a Haiku agent, pasted usage).
2. Candidates, all offline and model-free at build time: Graphify's code-only mode
   (`GRAPHIFY_BACKEND=none`, no hooks installed, no cloud); Entire Graph (tree-sitter, MIT, no
   network); an Aider-style repo map generated by a script into the pack index (R3) and fitted to
   a budget; the LSP tool alone with `go list -deps` and a TypeScript import graph (`madge` or
   `tsc --listFiles`) exposed as two `make` targets.
3. Run the probes through each; keep a candidate only if it wins on correctness and tokens, and
   only in a form that regenerates from a git hook and emits a file the pack index can cite. Never
   install a tool's own always-on CLAUDE.md directive or pre-search hook beside the generated
   path-scoped rules (both Graphify's README and R3 say one primary query path).

**Done when.** The probe set and its results are committed under `plans/_audit/`; the winner, if
any, is a `make` target plus one line in the pack index; otherwise the item is closed with the
numbers.

**References.** https://github.com/Aider-AI/aider (repo map design); https://github.com/entireio/entire-graph;
https://github.com/Graphify-Labs/graphify (code-only mode); https://arxiv.org/abs/2606.20512;
https://code.claude.com/docs/en/tools-reference (LSP tool); `kb.yaml` § ownership and scope;
`docs/diagrams/daemon-components.md` and `docs/diagrams/web-components.md` (the hand-kept graph a
generated one would be checked against).

## M. Facts the current docs contradict — re-measure before relying on either

Each needs `/interface-probe` (or the canary) and a fact record edit; never trust the doc alone.

| # | Repo record | What the docs now say | What to measure |
|---|---|---|---|
| M1 | kb:fact/main-cache-ttl-selected-per-model-off-binary, kb:fact/haiku-main-cache-ttl-5m-on-2-1-299 | TTL is per request type: main conversation 1 h on a subscription within plan usage, 5 min on usage credits or over limits; nothing per model (https://code.claude.com/docs/en/prompt-caching) | Whether the 5-minute days coincide with credits or limit state in Settings > Usage; the regime on the current binary |
| M2 | kb:fact/subagent-cache-ttl-5m | Confirmed, but overridable since 2.1.242/248 | That `subagentPromptCacheTtl: 1h` is honoured on this plan (R5) |
| M3 | kb:fact/rate-limits-wire-shape (guard `TestStatusLineFields`) | The developer is on a Team plan, not Ultra, so the Ultra "no five-hour limit" change does not apply directly; Team limits are documented separately | Confirm on the Team-plan limits page whether both buckets still exist for this seat type; re-measure only if that page changed |
| M4 | kb:lesson/subagent-never-woken-by-harness (gates in the foreground) | 2.1.318: background subagents move a shell command to the background after 3 minutes so the cache does not expire (changelog) | Whether a 5–7-minute foreground gate inside a background agent is now backgrounded by Claude Code, and what the agent sees when it is |
| M5 | `claude-haiku-4-5-20251001` pinned in 22 code and config files | Haiku 5.5 is the default Haiku on the API since 2.1.293; 4.5 not stated as retired | A deliberate decision: the pin changes what the canary measures (kb:adr/canary-drives-installed-claude-through-production-chain) |

Checked and consistent: kb:fact/print-mode-background-wait-ceiling matches the headless doc; the
`--bare` launch probe is the zero-token model-catalog pre-check by design
(kb:fact/model-catalog-precheck-zero-token), and bare mode never reading OAuth is what makes it
zero-token. Agent-frontmatter hooks run only after the workspace-trust dialog, which a `claude -p`
batch never shows — never rely on them in `/fix` batches; settings hooks still run.

## Not recommended (looked at, rejected for this repo)

mem0, Letta, Zep/Graphiti (need an LLM in the loop; vendor-disputed benchmarks); Repomix and
code2prompt (dump everything); prek, lefthook, act (two hand-written hooks and a Makefile already
are the CI); claude-flow, gastown, 100-agent marketplaces (the kitchen sink Anthropic's July 2026
post warns against; Yegge spends 20–25% of his time on harness upkeep across 13 subscriptions);
Beads as a TODO.md replacement (the dependency graph is good, the Dolt backend buys nothing for one
developer); Serena and ast-grep (Claude Code's LSP tool overlaps); Graphify as shipped (its 80%
token claim is for a paid cloud product with no independent test, its markdown edges are inferred
by a model pass, and its strict hook can deny Read/Grep on indexed files, which would fight the
generated path-scoped rules — its offline code-only mode is one of R15's trial candidates);
Augment Code (a paid team platform,
$20–100/month plus a 40% fee on model usage, benchmarks compare its own harness to Claude Code and
isolate nothing about retrieval); Ponytail (a 52-line "write less code" skill with SessionStart
hooks; vendor benchmark −53% lines/−26% cost on 39 tasks × 5 runs with an Opus judge for 21 of
them; a JetBrains test reported a median −15% code and −10.3% cost over 80 paired tasks, read only
from a search snippet because the page refused fetches; redundant with the maintainability
reviewer, complexity ceilings and comment pass, and its `shortcut:` comment convention would clash
with the comment pass); Liza and Kiro Crew as runtimes (large dependencies with thin measurement;
Kiro's 1,000-PR week was 3 engineers plus 500 contributors on 30–50 sessions across 6–10 machines,
with no quality, cost or time-per-PR figures).

## Addendum 2026-11-05 — developer-supplied links, assessed

Each was fetched and read the same day; verdicts are sceptical by instruction.

| Link | What it is | Verdict | Effect on this brief |
|---|---|---|---|
| https://claude.dev/blog/solving-code-review-at-anthropic/ | Anthropic, 2026-10-15: how Claude Code's own PRs are reviewed | Relevant and the best measured precedent for R2; numbers are directional (no sample sizes) | R2 gains the vote filter, Important/Nit/Pre-existing tags, diff-only re-review, no repeated findings, and the before/after figures |
| https://github.com/alibaba/open-code-review | Apache-2.0 CLI behind the OpenCodeReview paper (49.5k stars) | Relevant as a design reference; precision 33.9% vs 7.2% is self-reported; "Delegation Mode" may run on a Claude login but its docs 404 | R2 references; adoptable ideas (bounded tools, 30-iteration cap, filter-only reflector that keeps everything on parse failure) without the tool |
| https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md | A 57-line test-quality skill in a multi-channel agent platform | Relevant; well shaped (short, links deeper references); rules-heavy and repo-specific | R10 step 5: the four-question authoring gate and junk list for the test agents |
| https://claude.com/resources/articles/the-ai-native-sdlc-playbook | Anthropic, Aug 2026, enterprise SDLC playbook | Operational rather than marketing, but unmeasured; mostly org governance | R1 references (hook blocking test edits during a bug fix; report-only verifier); nothing else new |
| https://entire.com/ (#continuous-memory) | Hosted git forge plus two MIT local tools (Entire Graph, Entire Brain) | Watch, do not adopt: local BM25 memory with typed facts, self-run benchmarks, one-way store migrations, hosted lock-in | R11 evidence that a serious memory tool dropped embeddings for BM25 |
| https://github.com/liza-mas/liza | Apache-2.0 Go supervisor over agent CLIs with a YAML blackboard (418 stars) | Thin measurement; not a dependency to take | R2 step 5a (Accept/Counter/Refute/Escalate); its "heavier quorum on upstream artifacts" idea is already how `/spec` and `/plan-work` gate |
| https://blog.bytebytego.com/p/an-ex-meta-l8s-agentic-engineering | Kun Chen guest post, 2026-06-23, first-hand, self-reported, promotes own tools | Consistent with the brief (fresh-context reviewer, E2E evidence, escalate product decisions); no new evidence; its "68% of changes had bugs" has no sample or definition | None |
| https://kiro.dev/blog/software-factory-1000-prs/ | AWS/Kiro, 2026-09-18, 1,000 PRs in a week with Kiro Crew | Vendor post; throughput of a team and a fleet; no quality, cost or time-per-PR figures | None beyond its "use labels as queues before building an orchestrator" and host-enforced permissions, both already in R1/R7 |
| https://www.augmentcode.com/ | Paid team platform with a hosted context engine | Not usable from a Claude subscription; benchmarks are harness-vs-harness | Not recommended list |
| Ponytail (https://github.com/DietrichGebert/ponytail) | MIT "write less code" skill, 184k stars | Vendor −53% lines; independent JetBrains figure (from a search snippet, page blocked) −15% median; redundant here and conflicts with the comment pass | Not recommended list |
| https://github.com/TechTideOhio/binnacle (read 2026-11-07) | "TideOS Eval Kit": a Rust CLI that wraps 15 separate eval binaries (trajectory checks, judge calibration, CI gating) into one JSON envelope; MIT; 17 stars, 6 commits | Early-stage and thin (no benchmark, dataset or docs behind its "sub-second" and "mathematically bounded" claims); not a code graph, tracker or memory layer; would add a Rust toolchain to a Go+TS repo | None. The sanctioned, subscription-billed route for prompt regression tests stays `claude plugin eval` (R9) |
| Graphify (https://github.com/Graphify-Labs/graphify) | Apache-2.0/MIT code-and-docs knowledge graph skill, 142k stars | Token claims are for the paid cloud product with no independent test; AST edges on Go/TS are the only measured value and overlap LSP; strict hook conflicts with generated rules | As shipped: not recommended. The category (deterministic, model-free code graphs: Graphify offline mode, Entire Graph, an Aider-style repo map, LSP + import graphs) is R15, decided by a 20-probe trial |

## Source index

Anthropic and Claude Code: https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/ ·
https://www.anthropic.com/research/building-effective-agents ·
https://www.anthropic.com/engineering/multi-agent-research-system ·
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents ·
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills ·
https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents ·
https://www.anthropic.com/engineering/harness-design-long-running-apps ·
https://www.anthropic.com/engineering/building-c-compiler · https://claude.com/blog/code-review ·
https://code.claude.com/docs/en/{best-practices,memory,hooks,sub-agents,skills,workflows,headless,cli-reference,env-vars,permissions,prompt-caching,model-config,costs,monitoring-usage,plugin-evals} ·
https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md ·
https://github.com/anthropics/claude-plugins-official ·
support.claude.com articles 17728952, 11049741, 11145838, 11647753, 9797557, 12429409.

Research: arXiv 2607.25398 (HANDBOOK.md) · 2606.22528 (ConstraintRot) · 2608.12426 (Constraint
Saturation) · 2507.11538 (IFScale) · 2602.11988 (ETH context files) · 2605.10039 (McMillan) ·
2605.12978 (Useful Memories Become Faulty) · 2608.09290 (OpenCodeReview) · 2608.18167
(Adversarial Review) · 2502.20747 (Stanford determinism) · Rating Roulette, EMNLP Findings 2025 ·
2603.12123 (Cross-Context Review) · 2607.06065 (SWE-Review) · 2608.00267 (LoopsBench) ·
https://research.trychroma.com/context-rot.

Industry and practitioners: https://cognition.ai/blog/dont-build-multi-agents ·
https://cognition.com/blog/multi-agents-working ·
https://github.com/humanlayer/advanced-context-engineering-for-coding-agents ·
https://github.com/humanlayer/12-factor-agents ·
https://www.thoughtworks.com/radar/techniques/agent-instruction-bloat ·
https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html ·
https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html ·
https://systima.ai/blog/subagent-tax ·
https://dev.to/rulestack/what-a-claude-code-subagent-actually-costs-measuring-the-436k-token-fixed-overhead-46g6 ·
https://dev.to/__declspec/your-multi-agent-pipeline-isnt-slow-because-of-the-model-dfa ·
https://github.com/anthropics/claude-code/issues/106025 ·
https://github.com/anthropics/claude-code/issues/101695 ·
https://github.com/zhupanov/larch/issues/6467 · https://howborisusesclaudecode.com/ ·
https://mitchellh.com/writing/my-ai-adoption-journey ·
https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/ ·
https://ampcode.com/docs/using-amp/thorsten · https://github.com/obra/superpowers ·
https://github.com/EveryInc/compound-engineering-plugin · https://github.com/gotalab/cc-sdd ·
https://github.com/automazeio/ccpm · https://github.com/openai/symphony ·
https://github.com/steveyegge/gastown · https://github.com/steveyegge/beads.

Tools: https://github.com/ryoppippi/ccusage · https://github.com/SciScend/claude-nightshift ·
https://github.com/grafana/docker-otel-lgtm · https://playwright.dev/docs/test-cli ·
https://playwright.dev/docs/test-snapshots · https://stryker-mutator.io/docs/stryker-js/incremental/ ·
https://github.com/go-gremlins/gremlins · https://github.com/flyingmutant/rapid ·
https://github.com/dubzzz/fast-check · https://github.com/invopop/jsonschema ·
https://github.com/gzuidhof/tygo · https://github.com/bcherny/json-schema-to-typescript ·
https://github.com/tobi/qmd · https://github.com/nizos/probity · https://github.com/Aider-AI/aider ·
https://supercov.com/blog/mutation-testing-ai-generated-tests.
