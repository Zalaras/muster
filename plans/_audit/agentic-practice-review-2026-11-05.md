# Agentic engineering review — Muster against the field (2026-11-05)

Requested by the developer: a thorough online review of agentic-engineering practice (knowledge
storage and retrieval, managing LLM output, orchestration, tooling, cost) cross-referenced against
this repo, broken down into what the repo needs help with, what tools exist, and what to change.
Constraints: one Claude subscription at the $200 tier, no API budget, everything local, macOS,
Claude Code only.

Method: the repo was read first (CLAUDE.md, kb.yaml, every skill and agent, the orchestrate
skill, conventions, TODO.md, lessons, facts, orchestration state of every run). Then six parallel
research threads fetched and read primary sources on 2026-11-05 (official Claude Code docs and
changelog, Anthropic engineering posts, arXiv papers, Thoughtworks Radar, practitioner posts,
framework READMEs). Condensed thread reports and the fetched pages are in the session scratchpad;
the sources are cited inline below. Nothing in the repo was changed except this file. No decision
is taken here: every change below is a proposal for the developer to rank.

---

## 1. Where the repo stands, measured

### Run cost over time (orchestration-state.json of every run)

| Period | Runs | Median wall-clock | Median review cycles |
|---|---|---|---|
| Aug 2026 (single reviewer) | 14 | 1.65 h | 1 |
| Sep 2026 | 27 | 2.3 h | 2 |
| Oct–Nov 2026 (three reviewers from 2026-09-22) | 32 | 3.95 h | 2 |

Cycle count correlates weakly with plan size: one-cycle plans range from 618 to 6,669 words,
four-cycle plans from 1,766 to 11,833. The step change coincides with the three-reviewer split
(`split=y` runs: median 2–3 cycles; `split=n` runs the same month: 1–2). The Minors-never-re-review
and delta-re-review rules landed 2026-11-04 and no run in the table used them yet.

### Knowledge and instruction volume

| Item | Measured |
|---|---|
| Markdown knowledge under `docs/`, `.claude/`, specs | ~334,000 words |
| ADRs / facts / lessons | 446 / 116 (58 with `guard: none`) / 75 |
| Pipeline docs (skills + agents + CLAUDE.md) | ~65,000 words (31,000 on 2026-09-01) |
| Orchestrate skill | 593 lines; plan-work 496; e2e-specs agent 355; review-work 280 |
| Root CLAUDE.md | 1,453 words, ~150 lines; all `.claude/rules/*.md` are path-scoped |
| kb packs (restart-latest-claude) | orchestrator 67k, review 86k, daemon-impl 58k, web-impl 54k, e2e-specs 57k words against a 30k budget that only warns |
| Agents restricting tools | 2 of 14 (comment-judge, triage-proposer); every reviewer inherits Edit/Write |
| Hooks in project settings | 1 (SubagentStop comment check) |
| Records per month (ADR/fact/lesson) | Aug 130/–/24, Sep 180/70/33, Oct 123/44/13, Nov 13/2/5 — slowing |

### What the repo does that the field does not (keep these)

- Measured Claude Code facts with a verified version range and a guard test, plus a canary suite
  against the real binary. No public setup found does this; it is what Böckeler's "harness
  coverage" asks for.
- A frozen daemon↔UI contract delta that lets two writers run in parallel in disjoint trees. Only
  cc-sdd's "boundary-first" design is comparable.
- A maintainability reviewer with the plan withheld, directly backed by Cognition's April 2026
  finding that review works best when coder and reviewer share no context.
- A browser reviewer that measures the running DOM rather than reading the diff.
- E2E written before code as an acceptance oracle; e2e-lint mechanising fixture rules; render
  fixtures generated from the daemon; machine-wide gate lock with a result ledger.
- Fresh `claude -p` process per `/fix` batch with one up-front stop for questions.
- Git hooks that bind commit types to release impact; `kb refs` and `kb scope` checks.
- A retro rule of net ≤0 lines per change (ahead of Thoughtworks' Nov 2026 "remove as well as add"),
  even though the measured outcome is still growth.

---

## 2. Five conclusions from the research

### 2.1 Prose rules are a lagging, degrading control; the repo is on the named anti-pattern

- Anthropic removed "over 80% of Claude Code's system prompt for models like Claude Opus 5 and Claude
  Fable 5 with no measurable loss on our coding evaluations", and says "we were overconstraining
  Claude Code, both through our system prompt and in our CLAUDE.md files and skills" (Shihipar,
  2026-07-24, https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/).
  The six shifts: rules → judgement, examples → interface design, upfront → progressive disclosure,
  repetition → tool descriptions, CLAUDE.md memory → auto-memory, simple specs → rich references
  (tests, HTML mockups, rubrics for verifier agents).
- Claude Code docs: "every line in it takes a little of Claude's attention on every task"; "Claude
  treats CLAUDE.md files as context, not enforced configuration"; target under 200 lines; "If you keep
  adding emphasis to a CLAUDE.md line and Claude still misses it, that's a sign the line belongs in a
  hook"; "If you ever find yourself at forty [hooks], most are probably preferences"
  (https://code.claude.com/docs/en/best-practices, /memory).
- HANDBOOK.md (COLM 2026, arXiv 2607.25398): under a 20–124-page SOP the best model passes 36.2% of
  tasks and agents "report compliance they did not achieve". ConstraintRot (arXiv 2606.22528): rule
  violations rise from 0% to 30% after compaction (59% for some models); pinning restores 0%.
  Constraint Saturation (arXiv 2608.12426, 15 models): "reliable instruction following breaks down
  beyond 5–6 simultaneous constraints". IFScale (arXiv 2507.11538): ~68% at 500 instructions, with
  bias to earlier ones. Horthy's practical budget: ~150–200 instructions total before "the steps that
  made the workflow valuable are the ones silently skipped".
- ETH Zurich (arXiv 2602.11988 v3): context files give no task-success gain at +20% cost; instructions
  are followed, repository overviews are not helpful. McMillan (arXiv 2605.10039, 1,650 Claude Code
  sessions): file size, position, splitting and contradictions make no detectable difference, but
  compliance decays within a session (~5.6% lower odds per generated function). Together: structure
  of the files matters less than keeping the *count* of live constraints small and enforcing the
  zero-exception ones outside the model.
- Zhang et al, "Useful Memories Become Faulty" (arXiv 2605.12978): LLM-consolidated lesson banks
  rise then fall below the no-memory baseline; keep raw episodes, gate consolidation.
- Thoughtworks Radar marks "agent instruction bloat" Caution (Apr and Nov 2026): "convert any
  instructions you can into deterministic hooks or checks … delete those [the model] no longer needs;
  progression testing, rather than regression testing".
- A real migration: zhupanov/larch#6467 deleted `.claude/rules/` entirely, routing 19 rules to 2
  hooks, 10 lints/tests, 3 deletions, 3 lints-to-be, 1 judgement: "A rule only injects text. It never
  gates a tool call."

### 2.2 Context should be an index plus just-in-time reads, not an 85,000-word pack

- Anthropic: "find the smallest possible set of high-signal tokens"; agents should hold "lightweight
  identifiers (file paths, stored queries…)" and load at runtime; Claude Code's own model is CLAUDE.md
  up front plus grep just-in-time (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
  Agent Skills formalise three-level disclosure (name+description → body → linked files).
- Chroma "Context Rot" (18 models): performance degrades with input length even on trivial tasks;
  distractors compound; focused ~300-token prompts beat full ~113k prompts on every model family.
  HumanLayer: keep utilisation at 40–60%. Breunig: tool loadouts over ~30 degrade selection;
  sharded prompts lose 39% on average.
- SWE-Review (arXiv 2607.06065): Opus reached 81.8% review decision accuracy reading 1.3 files and
  148k tokens, where distilled reviewers burned 2.1–2.4M tokens for 69–72%. Anthropic's plugin-eval
  doc: a judge's answer "differs more the longer the text it has to read".
- Anthropic's own sub-agent brief is "an objective, an output format, guidance on the tools and
  sources to use, and clear task boundaries" (https://www.anthropic.com/engineering/multi-agent-research-system).

### 2.3 Fan-out multiplies tokens and does not buy speed; dispatch count is the lever

- Anthropic: agents use ~4× chat tokens, multi-agent ~15×; "most coding tasks involve fewer truly
  parallelizable tasks than research". Cognition (Apr 2026): "writes stay single-threaded and the
  additional agents contribute intelligence rather than actions"; a clean-context review loop catches
  ~2 bugs per PR, 58% severe.
- Systima (2026-07-22, proxy-metered): Claude Code subagents used 2.6×–5.9× the input tokens of
  sequential work and "were not faster on any task we timed"; Haiku-pinned subagents used 37% fewer
  metered tokens in a matched pair (https://systima.ai/blog/subagent-tax). Rulestack (corrected
  2026-08-24): ~54k cache-creation tokens cold start per subagent; break-even ≈30–50k tokens of
  reading on the same model, ≈10k on a cheaper one; three reviewer agents cost 2.65× one and 4 of 7
  findings were duplicates. anthropics/claude-code#106025: lead + 35 subagents = 2.41B tokens, 98%
  cache reads, 71% of subagent tokens after each agent's 80th step, ~80% of a Max 20x week.
  Wessam (2026-07-18): merging researcher+planner and reviewer+auditor (5→3 dispatches per unit) was
  "the largest lever by a wide margin"; a 21 KB orchestrator preamble is re-paid every tick.
- Reviewer quality is low-precision and noisy by nature: OpenCodeReview (arXiv 2608.09290) measured
  Claude Code `/code-review` v2.1.169 + Opus 4.6 at precision 7.23% / recall 28.9% on AACR-Bench
  (5,980 comments for 1,505 real issues); their fix was deterministic dispatch, bounded tools and a
  filter-only reflector that sees only the diff. Rating Roulette (EMNLP 2025): the best judge gives
  the same verdict in all three runs only 61.3% of the time; majority of three beats any single run;
  more runs change nothing. Cross-Context Review (arXiv 2603.12123): a *second* same-session review
  pass scores worse than the first (F1 21.7 vs 27.1); fresh session 28.6. Anthropic's harness post
  (Mar 2026): "Out of the box, Claude is a poor QA agent… talk[s] itself into deciding they weren't a
  big deal"; they calibrated the evaluator from logs and, on Opus 4.6, cut it to one end-of-run pass.
  Anthropic's official `code-review` plugin scores every finding 0–100 and drops those under 80; its
  product "scales with the PR… trivial ones get a lightweight pass".
- Every mature pipeline bounds the loop: Superpowers (5 rounds, fresh implementer on a stronger
  model at round 4, Minors never in the loop, one fixer per final review), Compound Engineering
  (repair budget that "can finish with leftovers"), cc-sdd (auto-debug on repeated rejection), Spec
  Kit (`partial|failed`). The developer has ruled out a hard cap; escalation is the compatible move.

### 2.4 Control flow belongs in code, verdicts in schemas, boundaries in hooks

- Claude Code Workflows: "a workflow moves the plan into code" — `agent()` with a JSON schema,
  `pipeline()`/`parallel()`, a journal with run-id resume, cache-shared sibling agents, pauses on usage
  limit and resumes after reset (v2.1.271+); concurrency `min(16, CPUs-2)`; same-session resume only;
  no mid-run user input (https://code.claude.com/docs/en/workflows). 12-factor agents: "own your
  control flow". ccpm: "deterministic ops run as bash scripts… no LLM token cost". The repo's own
  `scripts/sweep.py` already is this shape for `/fix`.
- Hooks: 32 events; PreToolUse `permissionDecision` deny with a reason the agent reads;
  `onFailure: "block"` (2.1.295) so a crashing check fails closed; `TaskCompleted` exit 2 = not
  completed; SubagentStop exit 2 hands the reason back as the agent's next instruction; agent-type
  hooks (experimental) can Read/Grep before deciding; hook events carry `agent_type`. Permission deny
  rules match text (`git push` does not match `git -C . push`), so a Bash hook reading the full command
  is the stronger control. Agent frontmatter: `disallowedTools`, `maxTurns`, `memory`,
  `experimental.cacheTtl`, `autoCompactWindow`, `isolation` (https://code.claude.com/docs/en/hooks, /sub-agents).
- Headless: `--json-schema` returns validated JSON (5 retries, `MAX_STRUCTURED_OUTPUT_RETRIES`);
  `--max-turns`; `--max-budget-usd` (estimate, subagent spend included; stops background work);
  `CLAUDE_CODE_RETRY_WATCHDOG=1` with `_MAX_USAGE_LIMIT_WAIT_MS` waits out a near reset and fails fast
  on a far one (https://code.claude.com/docs/en/headless, /cli-reference, /env-vars).

### 2.5 The subscription and the cache changed under the pipeline

- The $200 tier is now **Ultra** (renamed from Max 20x on 2026-10-30): 10× Pro weekly usage, a
  weekly cap across all models plus a separate Fable weekly cap, and **no five-hour limit for
  verified accounts** (Settings > Usage shows no "Current session" bar when verified). Everything
  shares one pool (claude.ai, Code, subagents, routines, `-p`); "cached portions count less against
  your limits than new content" with the weighting unpublished (support.claude.com articles 17728952,
  11049741, 11145838, 11647753, 9797557). Usage credits bill at API rates and drop the main cache
  TTL to 5 min; fast mode is credits-only.
- Cache: main conversation 1 h on subscription within plan usage; subagents, workflows, forks and
  compaction 5 min **unless** `subagentPromptCacheTtl: "1h"` / `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`
  (v2.1.242/243+) or agent `experimental.cacheTtl` (2.1.248+). Changing effort no longer breaks the
  cache on the 5.5-generation models (https://code.claude.com/docs/en/prompt-caching).
- Effort defaults are `medium` on Opus/Sonnet/Haiku 5.5 and `high` on Opus 5/Sonnet 5/Fable; thinking
  tokens bill as output. Explore inherits the main model (capped at Opus) since 2.1.198; a project
  `.claude/agents/Explore.md` with `model: haiku` overrides it. `CLAUDE_CODE_SUBAGENT_EFFORT` (2.1.316).
- `/usage` (CLI since 2.1.149) attributes recent usage by skill, subagent type, plugin, MCP and loop,
  flags anything over 10% and offers one-line fixes. OTel `api_request` events carry `agent_id` /
  `parent_agent_id` (2.1.310+) and cache writes split 5m/1h; one `grafana/otel-lgtm` container is a
  complete local sink. `claude plugin eval` (2.1.269) runs real model calls on the plan.

---

## 3. What the repo needs help with (ranked)

| # | Problem | Evidence (local) | Evidence (field) |
|---|---|---|---|
| P1 | Instruction and pack growth: every retro adds a rule; packs run 2–3× budget; 65k words of pipeline prose | 31k→65k words in two months; 86k-word reviewer pack; 75 lessons; 58 facts with no guard | §2.1, §2.2 |
| P2 | Review loop: three Opus generators per cycle, no filter or confidence threshold, same depth for every plan, reviewer drift yields "new findings on unchanged code", no regression test of reviewer prompts | median cycles 1→2 after the split; a cycle ≈1–1.5 h; later cycles mostly Minors and bookkeeping | §2.3 |
| P3 | Dispatch count and subagent economics: 8–12 agent runs per feature; separate unit-test agents; 5-min subagent cache across 5–7-min foreground gates; no model pin on Explore | daemon-tests 75 min on retry; e2e-validate 32 min; test agents on Sonnet high | §2.3, §2.5 |
| P4 | Boundaries enforced by prose that hooks and frontmatter could enforce; a 600-line prose orchestrator re-paid every turn | 1 hook; 2 of 14 agents restrict tools; reviewers can Edit/Write | §2.4 |
| P5 | No per-step cost measurement and no weekly budget guard; two runs contend | wall-clock only; `/retro --audit` last ran 2026-09-25 | §2.5 |
| P6 | Gates are serial and whole-suite per cycle | cold 5–12 min; `go test` 94 s plain / 161 s race; full e2e 5–7 min | thread E |
| P7 | Facts the current docs contradict and need re-measuring | see §6 | thread A, E |

---

## 4. Tools available

### Built into Claude Code (2.1.318 installed; all versions below are ≤ installed)

| Tool | Use here |
|---|---|
| PreToolUse hooks with `permissionDecision`, `if`, `once`, `onFailure: block` | Deny `git stash`, `git config user.*`, `git push` by command text; deny test-file writes to impl agents and the reverse by `agent_type`; fail closed |
| `disallowedTools`, `maxTurns`, `autoCompactWindow`, `experimental.cacheTtl` in agent frontmatter | Reviewers read-only; bound runaway agents (#106025's 192-step median); 1 h cache for long steps |
| `subagentPromptCacheTtl: 1h` (settings) | One prefix re-write saved per gate per agent |
| `.claude/agents/Explore.md` with `model: haiku`; `CLAUDE_CODE_SUBAGENT_MODEL(_FORCE)` for batches | Cheaper search and mechanical steps |
| `--json-schema`, Workflow `agent(schema)` | Schema-validated verdicts instead of free-text files |
| `--max-budget-usd`, `--max-turns`, `CLAUDE_CODE_RETRY_WATCHDOG*` | Per-batch ceilings and limit-aware waiting in `sweep.py` |
| Workflow tool (`pipeline`, `parallel`, journal, resume) | Candidate for the reviewer fan-out and merge, then the whole run |
| `claude plugin eval`, `/skill-doctor`, `/doctor prompt-audit` | Reviewer/planner regression suite; prune unused skills; audit stale/contradictory prose |
| `/usage`, OTel `agent_id` events, `-p` JSON `total_cost_usd` | Per-step cost table, weekly attribution |
| `TaskCompleted` / `SubagentStop` exit 2, Stop block cap | "Completion claimed before verdict" becomes impossible silently |
| Official plugins: `code-review` (fresh-context, 0–100 scored), `hookify` (hooks from observed mistakes), `ralph-loop`, `session-report` | Reference shapes to copy, not necessarily to install |

### Third-party, free, local

| Tool | Licence / state | Fit | Why |
|---|---|---|---|
| ccusage 20.x (`session --json --by-agent`, `blocks --active`) | MIT, active | High | Per-run token roll-up from transcripts; `--live` removed in v18 |
| grafana/otel-lgtm (one container) | free | High | Per-agent cost dashboard from Claude's own OTel |
| Playwright `--only-changed=main`, `--last-failed`, `toHaveScreenshot` | shipped (1.64) | High | Fix-wave e2e from minutes to under one; layout claims become pixel assertions (Chrome-only helps) |
| Stryker (`--incremental`, Vitest runner); gremlins (Go) | Apache / MIT, gremlins last push 2026-06 | High (warning gate) | Agent-written suites hit 100% line coverage but 78–99% mutation score (Supercov, vendor) |
| rapid (Go) / fast-check (TS) | mature | Medium | Property tests for state machine, reconcile, JSON merge |
| invopop/jsonschema or tygo + json-schema-to-typescript | MIT | Medium | Daemon↔UI contract as a compiled schema; validate fixtures and WS frames in `make check` |
| SQLite FTS5 in `kb find` | public domain | High | BM25 over 334k words at zero model cost before any embeddings |
| tobi/qmd (local GGUF hybrid search, MCP) | MIT, 30.9k★ | Medium | Only credible free semantic option; unproven against `rg` on prose |
| Beads `bd rules audit` / `compact` | MIT | Medium | Near-duplicate and contradiction pass over rules; replacing TODO.md is not recommended |
| Probity 1.10 (ex tdd-guard) | MIT | Medium | `forbidContentPattern`, `requireCommand` as PreToolUse rules if hand-written hooks grow |
| claude-monitor 4.0 | MIT | Low–Medium | Its SQLite warehouse survives Claude's 30-day transcript cleanup |
| claude-nightshift | MIT, tiny | Pattern only | Weekly threshold + spread-the-remaining-budget maths for `sweep.py` |
| Superpowers `diagnosing-superpowers`; compound-engineering's "would the system catch this next time?" | MIT | Pattern only | A transcript-reading skill for retros; the lesson-sink question |

### Not worth it here

mem0 / Letta / Zep (need an LLM in the loop; LoCoMo numbers vendor-disputed); Repomix/code2prompt
(dump everything); prek/lefthook/act (two hand-written hooks and a Makefile already are the CI);
claude-flow, gastown, 100-agent marketplaces (the kitchen sink the Anthropic post warns against);
Serena/ast-grep (Claude Code's LSP tool overlaps; structural search rarely needed on this codebase).

---

## 5. Recommended changes, by leverage

Each item states what to do, what it costs the subscription, and the expected effect. Tier 1 items
are a day or two each and reversible; Tier 2 are structural; Tier 3 are optional.

### Tier 1 — cheap, high leverage

**R1. Move hard rules into hooks and frontmatter; make reviewers read-only.**
A `PreToolUse` Bash hook denying `git stash`, `git config user.*`, `git push` and `git add -A` by
command text with a one-line reason; an Edit/Write hook that checks the path against the agent's
ownership (`agent_type` in the payload: impl agents may not touch `_test.go`/`*.test.ts`, test
agents may not touch implementation, nobody but the orchestrator touches `docs/protocol.md`);
`onFailure: block` on the existing SubagentStop check; `disallowedTools: [Edit, Write]` and a
`maxTurns` on the three reviewers and the judges. Then delete the prose sentences those hooks
replace (the retire-only-post-gate rule applies: keep a sentence a reader needs before acting).
Cost: none. Effect: a class of Critical findings and fix waves disappears; packs shrink.

**R2. Restructure review into generator → filter → score, and escalate instead of cycling.**
Cycle 1: one Opus correctness+maintainability pass with two explicit lenses (plan-aware, then
plan-withheld by a second prompt in a fresh agent only when `web/src` or `internal/` shape changed),
plus browser review only for web plans. A filter-only Sonnet critic sees the diff and the findings
and may only delete what the diff contradicts (OpenCodeReview's reflector). Every finding carries
`confidence 0–100`; under a threshold (80 in Anthropic's plugin) it is recorded in
`proposed-backlog.md`, never routed. Findings get fingerprints (`file:symbol:claim`); cycle ≥2 is one
reviewer classifying prior fingerprints resolved/unresolved, and any new finding on an untouched
file needs pasted reproduction or becomes a proposal. At cycle 3, instead of a cap, spawn a fresh
implementer with the review file (Superpowers' escalation). Cost: fewer Opus dispatches per cycle
(three → one or two). Effect: by Rulestack's and Wessam's numbers, roughly a third to a half of
review tokens per cycle and fewer cycles driven by duplicates and drift.

**R3. Turn `kb pack` into an index plus just-in-time reads, and make the budget bite.**
Inline only the spec, the contract slice and the ADRs/facts/lessons whose `files:` globs match the
plan's Affected Files; list the rest one line each (`id — summary — words`) for `kb show`; fit to the
30k budget by priority order (feature spec > contract > touched-file records > role lessons > rest)
rather than warning. Run `/doctor prompt-audit` over `.claude/` and every CLAUDE.md and apply its
cuts; run `/skill-doctor`. Cost: none. Effect: reviewer context 86k → ≤30k words; faster, cheaper,
and by Chroma/SWE-Review more accurate.

**R4. A lesson sink rule for retros.**
A retro finding goes to exactly one of: a hook or `kb check`/lint rule (zero-exception); a fact with
a guard test (measured behaviour); or stays an episode in `docs/lessons/` with `roles: []` so no pack
carries it. Prose only when a control/treatment check (two fresh Haiku agents, with and without the
sentence, Ball's method) shows it changes behaviour. Add a `check-kb` rule: a lesson that names a
guard leaves every pack. Cost: one Haiku probe per proposed rule. Effect: stops pack growth at the
source; the field's consistent answer to the "next run hits a new one" pattern.

**R5. Cost and cache knobs.**
`subagentPromptCacheTtl: "1h"` in project settings; `.claude/agents/Explore.md` pinned to Haiku;
`effort` per agent now that it is cache-safe (reviewers high, impl medium, doc-reconcile and
triage-proposer low); stagger parallel spawns so the second starts after the first's prefix is
cached; in `sweep.py` set `CLAUDE_CODE_RETRY_WATCHDOG=1` with a max usage-limit wait and refuse to
start a batch above an N% weekly reading from the status line the daemon already ingests; record
`rate_limits.seven_day.used_percentage` at every `orch-state.py start/finish` so the timings table
gains a Δweekly% column; run `/usage` weekly and act on rows over 10%. Cost: none. Effect: one full
prefix re-write saved per gate per agent; no mid-sprint lockouts; a cost column retros can use.

**R6. Faster cycle gates.**
Affected-package Go tests for cycle gates (`git diff --name-only main...` → `go list -deps -test`
closure; full suite and race at Final Validation only); Playwright `--only-changed=main` plus
`--last-failed` in wave gates with the existing `SPECS=` scoping; a `check-fast` target running the
independent `check` members under `make -j` with Playwright still under the gate lock; a
`PostToolUse` formatter hook (gofmt / Biome) so no fix wave is spent on formatting. Cost: none.
Effect: cold gate 5–12 min → roughly 3–5; fix-wave e2e minutes → under one.

### Tier 2 — structural

**R7. Script the orchestrator; keep prose only in role briefs.**
Generalise `scripts/sweep.py` into a step graph that spawns each step as a fresh `claude -p` with a
one-page brief, the pack index and the plan path, reads a `--json-schema` verdict, and writes
`orchestration-state.json` as its journal; the main session only launches and reads. Or trial the
Workflow tool on the reviewer fan-out first (`parallel()` of reviewers → merge in code), since it
gives journaling, resume, cache-shared siblings and usage-limit pausing for free, at the cost of
same-session resume and no mid-run questions. Cost: implementation time; tokens drop because the
593-line skill leaves the orchestrator's context. Effect: removes "orchestrator skipped or
misordered a step" incidents, which HANDBOOK.md and ConstraintRot predict for any long prose
procedure that spans compactions.

**R8. Scale process to risk; split big plans into epics.**
A `**Tier**` field on the plan (set by `/plan-work` from touched surfaces: protocol change, new UI
surface, daemon-only, docs) picks the reviewer set, the cycle budget and whether separate unit-test
agents run at all; small tiers have the impl agent write its own unit/render tests and the single
reviewer judge them (Superpowers, cc-sdd), keeping only e2e-specs independent. Plans over ~800
words become an epic branch `plan/<epic>` with ordered child plans that each run the pipeline and
land on the epic branch, one squash to main. Cost: none per run; fewer dispatches. Effect: the
one-cycle, sub-hour profile the repo already shows for small plans becomes the norm; children with
disjoint files can run concurrently under the existing lock.

**R9. A reviewer regression suite with `claude plugin eval`.**
Package the agents as a plugin (`.claude-plugin/plugin.json` beside `.claude/agents`); 20–30 cases
built from lessons: a scratch worktree with one planted defect (weakened assertion, wire-shape
drift, layout claim without measurement) and a mirror case with no defect that must approve;
graders: regex on the structured verdict plus a baseline grader; `--runs 3 --model <pinned> --json`,
run only on commits that touch agent files or pack rules. Cost: ~75 reviewer invocations per full
run, billed to the plan; use replay mocks and `--max-cost-usd`. Effect: the first answer to "does
the reviewer still catch X after this edit", and the data for the Sonnet-screen question (pass^3 per
case) instead of guessing.

**R10. Move classes of findings from reviewers into gates.**
Render tier: `toHaveScreenshot` per fixture with timers masked and a project `maxDiffPixels`,
Chrome-only so one snapshot set. Wire shape: JSON Schema generated from the Go types, compiled to
TypeBox/zod, validating every generated fixture and every E2E WebSocket frame in `make check`. Test
quality: Stryker `--incremental` on changed `web/` files and gremlins on changed Go packages as a
`WARN` gate listing survivors for the test agents. Property tests for the state machine and
reconcile. Cost: none per run. Effect: deterministic graders catch what the Opus reviewers now find
in cycle 2–3.

### Tier 3 — optional

R11 FTS5 in `kb find`, then a `qmd` trial against a 20-probe "which record governs X" set.
R12 OTel → otel-lgtm dashboard for per-agent cost, once R5's Δweekly% column proves insufficient.
R13 Generate `contract.md` and `web/src/protocol.ts` from one schema so the contract is compiled, not read.
R14 Per-agent step/context budgets (`maxTurns` ≈100, `autoCompactWindow`) with restart-from-summary,
per #106025's finding that 71% of subagent tokens were spent after step 80.

---

## 6. Facts the current docs contradict — re-measure before relying on either

| Repo fact / lesson | What the docs now say | Action |
|---|---|---|
| `main-cache-ttl-selected-per-model-off-binary` (5-min Haiku days) | TTL is per *request type*: main 1 h on subscription within plan usage, 5 min on usage credits or over limits; nothing per model | Check the 5-min days against Settings > Usage history; re-measure |
| `subagent-cache-ttl-5m` | Confirmed, but `subagentPromptCacheTtl`/`experimental.cacheTtl` override it since 2.1.242/248 | Extend the fact; adopt R5 |
| `rate-limits-wire-shape` (both buckets, guard `TestStatusLineFields`) | A verified Ultra account has no five-hour limit; the bucket may vanish or go stale | Probe on the developer's account; the dashboard's usage bars depend on it |
| `subagent-never-woken-by-harness` → gates in the foreground | 2.1.318: "background subagents move a shell command to the background after 3 minutes… so the prompt cache doesn't expire" | Probe before the next `/claude-code-upgrade`; a 5–7-min gate inside a background agent is now backgrounded by Claude Code itself |
| `claude-haiku-4-5-20251001` pinned in 22 code/config files | Haiku 5.5 is the default Haiku on the API since 2.1.293; 4.5 not stated as retired | Decide deliberately; a pin change changes what the canary measures |
| `--bare` launch probe and canary (12 code sites) | Bare mode never reads OAuth or the keychain | Consistent with the zero-token model-catalog pre-check design (`model-catalog-precheck-zero-token`); confirm the unauthenticated sweep is the only `--bare` user |
| `print-mode-background-wait-ceiling` | Matches the headless doc exactly | None |
| Agent-frontmatter hooks | Project agent hooks run only after the workspace-trust dialog; `-p` does not count | Never rely on agent-level hooks in `/fix` batches; settings hooks still run |

---

## 7. Gaps — looked for, not found

- Any study tying plan or spec size to review cycles (PR-size studies measure humans and conflict).
- Any published measurement of instruction drift for long prose orchestrator skills; HANDBOOK.md and
  ConstraintRot are proxies.
- A tool that measures whether a given CLAUDE.md rule ever fired or was cited; rule expiry in public use.
- A benchmark of local embeddings vs ripgrep on a markdown knowledge base; qmd ships none.
- Per-feature wall-clock for any comparable solo pipeline on one subscription; on the available
  evidence (Anthropic's review ≈20 min scaling with PR size; #101695 treating 2.5 h for a layout
  change as a bug; Superpowers "a couple hours at a time") 4–14 h per feature is an outlier.
- Official weighting of cached vs uncached tokens in the weekly meter; official separate Opus/Sonnet
  buckets today; any official difference in metering between interactive, `-p`, Workflow and teammate
  sessions (all say shared).
- Official terms on promptfoo-style reuse of the Claude Code OAuth token outside the CLI
  (`claude plugin eval` is the sanctioned path).
- Finding-fingerprint or cross-run dedupe mechanisms in commercial reviewers (only incremental scope).

---

## 8. Sources (primary, fetched 2026-11-05)

Anthropic / Claude Code: claude.dev "new rules of context engineering for Claude 5" (Jul 2026);
code.claude.com docs: best-practices, memory, hooks, sub-agents, skills, workflows, headless,
cli-reference, env-vars, permissions, prompt-caching, model-config, costs, monitoring-usage,
plugin-evals, routines, fast-mode, code-review; CHANGELOG.md; anthropic.com/engineering: building
effective agents, multi-agent research system, effective context engineering, agent skills,
demystifying evals (Jan 2026), harness design for long-running apps (Mar 2026), building a C
compiler; claude.com/blog/code-review (Oct 2026); support.claude.com 17728952, 11049741, 11145838,
11647753, 9797557, 12429409, 17007452.
Papers: arXiv 2607.25398 (HANDBOOK.md), 2606.22528 (ConstraintRot), 2608.12426 (Constraint
Saturation), 2507.11538 (IFScale), 2602.11988 (ETH context files), 2601.20404 (Lulla), 2605.10039
(McMillan), 2606.20512 (Shepard & Albrecht), 2605.12978 (Useful Memories Become Faulty), 2608.09290
(OpenCodeReview), 2608.18167 (Adversarial Review), 2502.20747 (Stanford determinism), Rating
Roulette (EMNLP Findings 2025), 2603.12123 (Cross-Context Review), 2607.06065 (SWE-Review),
2608.00267 (LoopsBench), 2601.19494 (AACR-Bench), 2610.34487 (agentic PBT); Chroma context rot.
Industry: Cognition (Jun 2025, Apr 2026), HumanLayer ACE-FCA and 12-factor agents, Manus context
engineering, Breunig (Jun 2025), Thoughtworks Radar blips (instruction bloat, SDD, swarms, beads,
OpenSpec, overnight builds, self-improving harness), Böckeler harness engineering and TDD-in-loop,
Cursor scaling agents and semsearch, METR Feb 2026 update, DORA 2026 via InfoQ, Linux Foundation
survey via The Register, Systima subagent tax, Rulestack subagent cost, Wessam dispatch analysis,
claude-code issues #106025 and #101695, larch #6467, Supercov mutation study, Entelligence benchmark.
Practitioners: Cherny (howborisusesclaudecode.com), Hashimoto (Feb 2026), Ronacher (2025–2026),
Osmani (Jan/Apr/May 2026), Willison (agentic-engineering patterns), Ball (Amp docs, Oct 2026 talk),
Beck (Apr 2026), Yegge (yegge.ai Aug 2026; Medium blocked), Horthy (Mar 2026 talk via secondary),
Steinberger (Pragmatic Engineer Jan 2026), Pocock (skills README, Apr 2026 talk notes), Vincent
(Superpowers), Klaassen (compound engineering), Karunaratne (Jul 2025), Orosz (2026 survey).
Frameworks read: Superpowers, compound-engineering-plugin, cc-sdd, Spec Kit, OpenSpec, Kiro,
Conductor, ccpm, gastown, beads, Symphony, claude-plugins-official, claude-flow, BMAD, Vibe Kanban,
Crystal, claude-squad, Devin playbooks, mattpocock/skills, ECC, wshobson/agents, SuperClaude,
ccusage, claude-monitor, claude-nightshift, Probity, qmd, Serena, ast-grep, Aider repo map, Repomix.
