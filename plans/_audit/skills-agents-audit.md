# Skills & agents audit — 2026-09-06

Read-only audit of `.claude/agents/*.md` (8), `.claude/skills/*/SKILL.md` (17),
`orchestrate/scripts/{gates.sh,orch-state.py}` and `.claude/settings.json`, judged against the
outcomes in `plans/*/orchestration-state.json` (22 runs), `plans/*/review*.md` (31 review
cycles), `plans/*/decisions/`, the 4 `docs(retro)` commits and the 12 earlier
`docs(pipeline): encode the … retro` commits. The audit pass itself changed nothing; the edits Damian approved afterwards are listed in the final section.

Two harness facts the findings rest on (confirmed against code.claude.com/docs/en/sub-agents.md
and skills.md): custom subagents **do** receive the project `CLAUDE.md` alongside their agent
body, and a skill's `allowed-tools` **pre-approves** tools (no prompt) without restricting the
model to them. The agent-spawning tool in the current harness is named `Agent`; `Task` is its
former name.

## Run-level facts the findings cite

| Metric (22 runs) | Value |
|---|---|
| Approved on review cycle 1 | 8 (claude-status-fixes, embed-dashboard, m0, m4-hook-quoting, move-tiles, new-ui-design-colors, terminal-focus, tmux-installation) |
| Needed ≥2 review cycles | 14 |
| Review re-spawns recorded (`retry_counts.review`) | 18 — under-recorded: m4-reconcile has 4 cycle files and `review: 1`; usage-model-bar has 3 files and its header says cycle 2 |
| Review wall-clock where measured (5 runs) | 14m26s, 19m41s, 16m09s, 6m32s (delta re-review), 16m10s |
| e2e-specs authoring wall-clock (6 runs) | 8–12 min |
| Pre-review impl fix cycles (Step 4/5) | daemon-impl 4, web-impl 7 |
| Validate retries | 6 (issue-capture, m1, move-tiles ×2, new-session-dialog, ui-text-and-focus) |
| `failed_steps` populated | 0 of 22 |
| `status: blocked` ever reached | 0 of 22 |
| `/decide` debates run | 1 (order-sidebar, consensus at turn 4); judge has never run |
| Reviews that drove a real browser | 13 of 22 |

## 1. Component table

| Component | Type | Lines / words | Runs on | Verdict | Reason |
|---|---|---|---|---|---|
| `agents/daemon-impl.md` | agent | 142 / 2200 | Sonnet | trim | Works (0 review Criticals since 08-27; 4 pre-review fix cycles in 22 runs). 416-word git block duplicated across 5 agents; hard-rules block duplicates `CLAUDE.md` (subagents load it); `docs/protocol.md … if it exists yet` stale. |
| `agents/daemon-tests.md` | agent | 118 / 1494 | Sonnet | trim | Caught 2 real impl bugs pre-review (claude-status-fixes INV-F, order-sidebar `applyPin`), both fixed next attempt. Git block dup; "What NOT to test" duplicates `docs/conventions.md` §Testing. |
| `agents/web-impl.md` | agent | 143 / 2837 | Sonnet | trim | Most-tagged agent in reviews (m1 17, m2 13, m4-reconcile 21 across 4 cycles). Its two review Criticals since 08-30 (new-session-dialog c2 unguarded `fetch`, ui-text-and-focus c1 REQ-15 cancel) were both behaviours the plan gave no criterion — F2, not a tier problem. Settled Patterns duplicates `conventions.md` §TypeScript nearly verbatim; Design System block duplicates `review-work.md` §6a and `design-system.md`; git block dup. |
| `agents/web-tests.md` | agent | 111 / 1256 | Sonnet | trim | One judgement miss (fix-auto-mode-select declined coverage) → rule 09-03, no recurrence in 4 runs. Git block dup. |
| `agents/e2e-specs.md` | agent | 242 / 4595 | Sonnet | trim | Longest agent, 18 plan-name anecdotes, 15 "lesson/measured". Rules are earning: `[e2e-specs]` review Criticals fell from 3 (m0) to 0–1 per run; validate caught 2 impl bugs (move-tiles, ui-text-and-focus). harness-only explained twice (l.57, l.239); three "arrives with M0" lines stale. |
| `agents/review-work.md` | agent | 239 / 2913 | Opus | trim | Justified tier: 13/22 reviews produced browser-measured repros impl agents needed. Spends Opus time inventorying `[orchestrator]` doc upkeep in 11/22 runs (Finding 1). `npm run e2e` at l.35 lacks the rebuild the rest of the pipeline mandates (reviews in practice ran `make e2e` 44× vs `npm run e2e` 7×). Stale "once it exists"/"if tests exist". |
| `agents/debater.md` | agent | 83 / 711 | Opus | keep | 1 run, reached consensus in 4 turns, outcome landed (`cmd-n-ordering`). |
| `agents/judge.md` | agent | 64 / 490 | Opus | keep | 0 runs; no cost, no evidence against. |
| `skills/orchestrate` | skill (inline) | 543 / 7090 | session (Opus/Fable) | rewrite (targeted) | 222-line Agent Invocation section; prompt templates restate agent definitions, contradicting its own l.99–101; JSON example (l.402–423) and baseline list (l.469–481) duplicate the scripts; Error Handling + `fail` dead (0/22); "only approved completes" is prose-only (Finding 5); `Task` name; no `AskUserQuestion` grant. |
| `skills/orchestrate/scripts/gates.sh` | script | 148 | — | keep | Dedupe, rg-vacuous-pass guard, `--no-e2e` SKIP registration all correct; run by reviews and completion. |
| `skills/orchestrate/scripts/orch-state.py` | script | 179 | — | keep + 2 additions | `status completed` accepts any verdict; `fail` unused; no archive command (5 filename schemes for old cycles in practice). |
| `skills/plan-work` | skill (inline) | 354 / 3749 | session | trim + mechanise | Planner-shape defects caused 4 of the last 6 second review cycles (Finding 2). Invariants sentence edited 3× (08-22, 09-04, 09-06) and the class still leaked. l.130 says no design system exists (it has since 08-16; 16/22 plans cite it anyway). 20 plan-name anecdotes. |
| `skills/spec` | skill (inline) | 130 / 872 | session | keep | Nothing stale; one-question-at-a-time matches Damian's stated preference. |
| `skills/decide` | skill (inline) | 135 / 878 | session | keep | 1 use, worked. Grants `SendMessage` it never uses (l.80 "do not message either agent") and `Task` while its body says `Agent` (l.67). |
| `skills/land` | skill (inline) | 174 / 1423 | session | keep | Every claim carries a measurement; grants exactly what it uses; refuse-don't-warn preflight. |
| `skills/triage` | skill (inline) | 195 / 1665 | session | keep | One stale ref: l.63 `Makefile:73` (that line is `core.hooksPath`; the slug is at `Makefile:82`). |
| `skills/retro` | skill (inline) | 88 / 914 | session | keep | Honoured its own ≤0 mandate (Finding 9). Lacks `Write` although step 2 may create a `<dir>/CLAUDE.md`. |
| `skills/work-status` | skill (inline) | 84 / 556 | session | keep | Accurate against state-file shape. |
| `skills/dev-loop` | skill (inline) | 71 / 518 | session | fix stale | l.67 "until reconcile exists" (shipped 08-27); l.56–58 shutdown paragraph predates the `-on-exit` policy (SPEC changelog 2026-08-27). |
| `skills/interface-probe` | skill (inline) | 180 / 1227 | session | keep | l.14 "verified against 2.1.233" while the pin is 2.1.246 (`docs/claude-code-pin.md:3`) and l.107 already describes 2.1.259 behaviour. |
| 6 wrappers (`skills/{daemon-impl,web-impl,daemon-tests,web-tests,e2e-specs,review-work}`) | skill (inline) | 10 each | **session model, not the pinned one** | rewrite or delete | Body is "Read the agent file and follow it" — nothing spawns the agent, so `model: sonnet`/`opus` is never consulted, modes (fix/validate) cannot be passed, and the review wrapper pre-approves `Write, Edit`. `/orchestrate` never uses them (it spawns by `subagent_type`). |
| `.claude/settings.json` | config | 38 | — | fix | Pre-approves `Bash(git stash:*)` (l.26) while every agent file bans stash and two incidents (usage-model-bar, file-drop-fix) were stashes. |

## 2. Findings, ranked by expected impact on run cost and fix-wave count

### F1. Doc upkeep runs after review, so the Opus reviewer inventories it as Majors in half the runs

**Evidence.** `[orchestrator]` Majors whose content is "doc upkeep still pending": embed-dashboard 2,
file-drop-fix 2, issue-capture 1, m4-hook-lifetime 1, m4-reconcile 2/2/2/1 (the *same two items*,
"R4 doc upkeep still incomplete; R2 still owed", rode all four cycles), move-tiles 2,
order-sidebar 1, shortcut-fixes 1, tmux-installation 1, usage-model-bar 3 — 11 of 22 runs. The
orchestrate skill schedules the backstop *after* Final Validation (`orchestrate/SKILL.md:500`) and
only *permits* drafting earlier (l.500–505). The reviewer is told to check `TODO.md`/`SPEC.md`
(`review-work.md:220`) and writes a paragraph per item. These never block approval, so the cost is
pure Opus reading/writing time plus a completion-step re-derivation.

**Change** (`orchestrate/SKILL.md` l.500–505, net −4 lines):

```
-Do this after Final Validation passes and before marking the pipeline completed. You may
-**draft** these edits earlier (during a review cycle, in your own `docs(<plan-name>)` commit —
-the file set is disjoint from every agent's) but **never write the verdict before it exists**:
-no "approved", no "review cycle N", no ✅ tick, until `review.md` on disk says `approved`. Leave
-those words out of the draft and add them at completion. ui-text-and-focus: "approved review
-cycle 1" written during cycle 1 became a Minor in both reviews and a five-place fix.
+Do this **while the Step 3 testers run** — the file set is disjoint from every agent's — commit
+it as `docs(<plan-name>): doc upkeep`, and re-verify it at Completion. Never write the verdict
+before it exists: no "approved", no "review cycle N", no ✅ tick until `review.md` says `approved`.
```

and `review-work.md` §2, after l.71 (net +1, replaces the per-item prose):

```
+Doc upkeep (`TODO.md` tick, `SPEC.md` changelog, `docs/protocol.md`, `spikes/`) was done before you
+were spawned: report it as one row of `## Acceptance Checks` (`DOC pass|FAIL — <what is missing>`),
+never as a Major. A *false* user-facing statement stays a Major per §8.
```

### F2. Planner-shape defects are now the main cause of second review cycles — mechanise them

**Evidence.** Second-cycle root causes in the last six runs: ui-text-and-focus (edge case 18 had no
`E*` → cycle-1 Critical, whole second cycle), shortcut-fixes ("no X survives in dir" filed as prose
→ two files never assigned), plain-terminal-session (REQ-12 failure surfacing not treated as an
invariant → cycle-1 Major 1), file-drop-fix Major 4 (plan's unenveloped error examples copied into
`docs/protocol.md`). Each cost one Opus review (14–20 min) plus the fix waves. The retro response
each time was another sentence in `plan-work/SKILL.md`: the invariants paragraph was added 08-22
(`48769e6`), sharpened 09-04 (`42b21f0`) and sharpened again 09-06 (`664962c`), and §8/§9 carry
four such anecdotes. `retro/SKILL.md:45` already says a rule broken twice is a script candidate.

**Change.** Add `orchestrate/scripts/plan-lint.sh` (below, ~55 lines), run by `/plan-work` at
approval and by `/orchestrate` pre-flight step 2; then cut the four anecdote passages from
`plan-work/SKILL.md` (l.188 late-arrival example 3 lines → 1; l.191 edge-case→criterion paragraph
6 lines → 2; l.203 shortcut-fixes clause; l.101 file-drop-fix clause) — net −11 prose lines.

```bash
#!/usr/bin/env bash
# plan-lint.sh <plan> — mechanical checks on plans/<plan>/plan.md that each cost a review cycle once.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"; cd "$ROOT" || exit 2
P="plans/${1:?usage: plan-lint.sh <plan>}/plan.md"; [[ -f "$P" ]] || { echo "no $P" >&2; exit 2; }
fail=0; note() { echo "FAIL  $1"; fail=1; }

# 1. Required headers
for h in Status 'Work Type' 'E2E Scope'; do
  grep -qE "^\*\*$h\*\*: *\S" "$P" || note "missing header **$h**"
done

# 2. Every numbered edge case names a criterion or says untested (ui-text-and-focus edge case 18)
awk '/^## Edge Cases/{f=1;next} /^## /{f=0} f && /^[0-9]+\./' "$P" | while IFS= read -r l; do
  echo "$l" | grep -qE '→ *((E|W|D)[0-9]+|untested:)' || note "edge case lacks → E<n>|W<n>|D<n>|untested: — ${l:0:80}"
done

# 3. Every criterion ID an edge case cites exists in Acceptance Criteria
ids=$(awk '/^## Acceptance Criteria/{f=1} f' "$P" | grep -oE '\*\*(E|W|D)[0-9]+\*\*|^(E|W|D)[0-9]+ ' | tr -d '* ' | sort -u)
for ref in $(awk '/^## Edge Cases/{f=1;next} /^## /{f=0} f' "$P" | grep -oE '→ *(E|W|D)[0-9]+' | grep -oE '(E|W|D)[0-9]+' | sort -u); do
  grep -qx "$ref" <<<"$ids" || note "edge case cites $ref but no such criterion exists"
done

# 4. A ```checks block exists and every line is <ID> <command> (shortcut-fixes)
if ! grep -q '^```checks' "$P"; then note "no \`\`\`checks block"; else
  awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0} f' "$P" | grep -vE '^\s*(#|$)' | while IFS= read -r l; do
    [[ "$l" =~ ^[A-Z]+[0-9]+\ .+ ]] || note "malformed checks line: $l"
  done
fi

# 5. Prose criteria that are really negative greps belong in the block (shortcut-fixes)
awk '/^## Acceptance Criteria/{f=1} /^```checks/{f=0} f' "$P" | grep -nE '\bno\b.*\b(survives?|remains?|appears?|left) in\b' \
  | while IFS= read -r l; do note "negative-grep criterion written as prose: ${l:0:100}"; done

# 6. Protocol error examples must be enveloped (file-drop-fix Major 4)
awk '/^## Protocol Contract/{f=1;next} /^## /{f=0} f' "$P" | grep -nE '"code": *"' | grep -vE '"error"' \
  | while IFS= read -r l; do note "error example without the {\"error\":{…}} envelope: ${l:0:100}"; done

# 7. Negative-grep checks dry-run clean against the plan itself (m0-skeleton)
awk '/^```checks[[:space:]]*$/{f=1;next} f&&/^```/{f=0} f' "$P" | grep -E '^[A-Z]+[0-9]+ +! *rg ' | while IFS= read -r l; do
  pat=$(echo "$l" | grep -oE '(-e )?"[^"]+"' | head -1 | tr -d '"' | sed 's/^-e //')
  [[ -n "$pat" ]] && grep -qE -- "$pat" "$P" && note "plan text contains its own banned string '$pat' (${l%% *})"
done

(( fail )) && exit 1; echo "plan-lint: $P clean"; exit 0
```

### F3. One 416-word git paragraph is pasted into five agents (2,080 words, ~6% of all `.claude` text)

**Evidence.** `daemon-impl.md:91,93`, `web-impl.md:91,93`, `daemon-tests.md:78,80`,
`web-tests.md:71,73`, `e2e-specs.md:171,173` — byte-identical apart from the commit type, each
carrying three anecdotes (usage-model-bar stash, file-drop-fix stash-to-look, tmux-installation
uncommitted tests). The rules matter (two real stash incidents) and belong in the agent's own
system prompt, but the anecdotes do not: no stash or uncommitted-work incident appears in any
review or retro after 09-03. Word count is what Sonnet pays for on every spawn.

**Change** — replace both paragraphs in each of the five files with this one (≈130 words, net
−1 line and ≈ −290 words per file; `feat(`/`fix(` for impl agents, `test(` for test agents):

```
- **Git.** Work on the `plan/<plan-name>` branch the orchestrator created. At the end of your step
  commit your own files — `git add` only files you changed, named individually (never `-A`/`-u`),
  including your `plans/<plan-name>/` log — as `feat(<plan-name>): <imperative summary>` (fix
  mode: `fix(<plan-name>): <summary> (review cycle <N>)` with the cycle number your prompt states,
  or `(pre-review fix)` when it says no review has run), one sentence plus the harness trailers.
  Commit even when your gate is red for a defect you may not fix, naming it in the body as
  `gate red: <what fails, whose defect>` — uncommitted work beside other agents' is the hazard, not
  a red commit. Never `git stash` (not even to look: use `git diff` / `git show HEAD:<path>`),
  `checkout -- <path>`, `reset`, `clean` or `rebase`. Never push; never commit on `main`.
```

### F4. The six thin wrappers run the agent body inline on the session model, bypassing the pin

**Evidence.** Each wrapper body is `Read the agent instructions at .claude/agents/<x>.md and follow
them exactly.` — a Read, not a spawn. Only the `Agent` tool reads agent frontmatter, so
`/daemon-impl foo` runs Sonnet-tuned instructions on Opus/Fable, and `/review-work foo` runs the
review inline with `Write, Edit` pre-approved (`skills/review-work/SKILL.md:5`). The wrappers also
cannot express a mode: `argument-hint: "<plan-name>"` only, so `/e2e-specs` can never run
`validate` or `fix`, and `/daemon-impl` never fix mode. Nothing in the pipeline uses them —
`orchestrate/SKILL.md:87–97` spawns by `subagent_type` — and `CLAUDE.md`'s workflow list does not
name them. Their descriptions differ from the agents' (`"Implements Go daemon changes…"` vs
`"Daemon implementation agent for Go code. Use when…"`) but the two are read by different
selectors (Skill tool vs Agent tool), so the drift breaks nothing today.

**Change (preferred, net 0 lines each):** make the wrapper a spawn so the pin, boundaries and
mode all hold —

```
---
name: review-work
description: "Reviews all of a plan's implementation and test changes against the plan and Muster's hard rules."
argument-hint: "<plan-name> [cycle N]"
allowed-tools: Agent, Read
---

Spawn the `review-work` agent (`Agent` tool, `subagent_type: "review-work"`) with the prompt:
`Execute the review task for plan: $ARGUMENTS. Project root: <cwd>.` Do not follow the agent file
inline — its model and boundaries are pinned in `.claude/agents/review-work.md`.
```

(same shape for the other five, with `[mode]` in the argument hint for e2e-specs/impl agents).
**Alternative (net −60 lines):** delete the six directories; the agents remain invocable by name via
the Agent tool.

### F5. "Only `approved` completes it" and the review-cycle count are prose-only

**Evidence.** `orch-state.py:149–156` (`status completed`) and `:136–142` (`done review --next
completed`) accept any state of `review.md`; the rule lives only in `orchestrate/SKILL.md:305`,
`:519–520`, `:532–536` (three restatements). The cycle count — the single number a retro needs — is
wrong in 2 of 5 multi-cycle runs checked (m4-reconcile: 4 cycle files, `retry_counts.review: 1`;
usage-model-bar: 3 files, header "cycle 2"). The Error Handling rule "append a `.failed.<N>`
suffix" (`:543`) produced five naming schemes in practice (`review-cycle-1.md`,
`review.cycle-1.md`, `review.cycle1.md`, `review.failed.1.md`, `daemon-tests.md.failed.1`), and
`fail`/`failed_steps` were never used (0 of 22). Resume prose contradicts the script: `:443` says
reset the blocked step's retry count to 0, `:381` and the script's `reopen` keep it unless
`--reset-retries`.

**Change** — `orch-state.py`, inside `main()` (net +12 script lines):

```python
        elif a.cmd == "status":
            if a.arg not in ("in-progress", "blocked", "completed"):
                sys.exit("status must be in-progress|blocked|completed")
            if a.arg == "completed" and not approved(path.parent):
                sys.exit("review.md does not say '**Verdict**: approved' — not completed")
        ...
        elif a.cmd == "archive":          # replaces the prose '.failed.<N>' rule
            src = path.parent / a.arg
            n = s["retry_counts"].get("review", 0) + 1 if a.arg == "review.md" else \
                s["retry_counts"].get(a.arg.split(".")[0].replace("test-specs", "e2e-validate"), 0) + 1
            dst = src.with_name(f"{src.stem}.cycle{n}{src.suffix}")
            src.rename(dst); print(f"archived {src.name} -> {dst.name}")

def approved(plan_dir):
    r = plan_dir / "review.md"
    return r.exists() and "**Verdict**: approved" in r.read_text()
```

and in the `done` branch: `if a.next == "completed" and not approved(path.parent): sys.exit(...)`;
add `"archive"` to the `choices` list and exclude it from the `a.arg not in STEPS` check.
Delete the `fail` command and `failed_steps` (script −4, and `orchestrate/SKILL.md` −1 at `:379`
area). Then in `orchestrate/SKILL.md`: delete `:305` and `:532–536` (the script now refuses; −7),
replace Error Handling (`:538–543`, 6 lines) with one line
`- A step that reports no output file, or an unusable verdict, is re-spawned once; archive the old file first: python3 $S <plan> archive <file>.`,
and fix `:443` to `keep its retry count unless the user grants a fresh budget (--reset-retries)`.
Net ≈ −12 prose lines.

### F6. `orchestrate/SKILL.md` restates the agent definitions it tells itself not to restate

**Evidence.** `:99–101`: "Each subagent already carries its full instructions… Keep prompts lean".
Yet the Step 5 prompt (`:229–247`, 18 lines) restates `e2e-specs.md` §Validate 1 and 5 (rebuild
order, sweep, may-not-weaken); Fix Prompt Rule 5 (`:115–123`) restates impl Fix Mode rule 5
verbatim; the rebuild-order lore appears in four places (`web-impl.md:80`, `e2e-specs.md:80–83`,
`orchestrate:237–238`, `orchestrate:347`). The State Tracking JSON example (`:402–423`, 22 lines) is
already stale (lacks `step_attempts`, `closes_issues`) because the script prints the real shape;
the Final Validation baseline list (`:467–481`, 15 lines) duplicates `gates.sh:107–113`. None of
these duplicates prevented anything: the incidents they cite (m3-gauges stale binary, m1
one-path fix) predate the agent-file rules that now carry them.

**Change.** Step 5 prompt → 6 lines (mode, attempt N of 2, spec paths, "your definition's Validate
Mode applies: rebuild, run, sweep"); Fix Prompt Rule 5 → one line ("Your definition's Fix Mode
rules 5–7 apply; name the cycle"); delete `:402–423` and `:467–481` (point at `python3 $S <plan> show`
and `gates.sh` header). Net ≈ −48 lines.

### F7. Stale references (each verified by grep)

| File:line | Says | Reality | Fix |
|---|---|---|---|
| `plan-work/SKILL.md:130` | "Design system: none exists yet (arrives with … next-steps item 4)" | `docs/design/design-system.md` since `c2c129e` 2026-08-16; review-work §6a and web-impl enforce it; 16/22 plans cite it anyway | Replace with "Reference `docs/design/design-system.md` §… and the mockup that is the authority for every Testable UI text pattern." (−2) |
| `daemon-impl.md:17`, `web-impl.md:17`, `review-work.md:24` | `docs/protocol.md` "if it exists yet / once it exists" | 1,137 lines, updated 2026-09-05 | delete the parentheticals |
| `review-work.md:30` | "(if tests exist)" | 26 spec files | delete |
| `review-work.md:35` | `npm run e2e` | rest of pipeline mandates `make e2e` (rebuilds first); reviews used `make e2e` 44× vs 7× | `make e2e` from the project root |
| `e2e-specs.md:27,36,91` | "arrives with M0", "once the harness drives real panes", "from M0" | harness shipped 08-22; tmux driven since m2 | delete the three clauses (−0, shorter lines) |
| `dev-loop/SKILL.md:56–67` | shutdown never touches tmux; "until reconcile exists" | SPEC changelog 2026-08-27: `-on-exit` policy (`ask` default), reconcile shipped | rewrite the Stopping section around `-on-exit` (−3) |
| `triage/SKILL.md:63` | slug lives at `Makefile:73` | `:73` is `core.hooksPath`; slug at `Makefile:82` and `go.mod:1` | fix the ref |
| `interface-probe/SKILL.md:14` | "verified against 2.1.233" | pin 2.1.246 (`docs/claude-code-pin.md:3`); l.107 already documents 2.1.259 | "verified against 2.1.233–2.1.259; re-verify per docs/claude-code-pin.md on a bump" |
| `orchestrate/SKILL.md:5,8,72,87`, `decide/SKILL.md:5` | `Task` tool | tool is `Agent` (decide `:67` already says so) | rename |
| `orchestrate/SKILL.md:28` | "plans before 2026-08-25 lack E2E Scope — infer" | every such plan is `completed`; only a re-run would hit it | delete (−1) |

### F8. Tool grants

| Skill | Missing (would prompt) | Unused / wrong |
|---|---|---|
| orchestrate | `AskUserQuestion` (used at `:282`, 1a) | `Task` → `Agent` |
| decide | — | `SendMessage` (skill itself never sends, `:80`); `Task` → `Agent` |
| retro | `Write` (step 2 may create `<dir>/CLAUDE.md`, `:73–74`) | — |
| review-work wrapper | — | `Write, Edit` pre-approved for an inline review (moot under F4) |
| spec, plan-work, land, triage, work-status, dev-loop, interface-probe | none | none |
| `.claude/settings.json:26` | — | `Bash(git stash:*)` pre-approved; every agent bans stash and both stash incidents ran unprompted. Remove the line so a stash prompts. |

### F9. Retro discipline: the skill fixed the growth, but one lesson is being re-encoded instead of mechanised

**Evidence.** Line counts per commit: `orchestrate/SKILL.md` 393 → 545 over 12 ad-hoc
`docs(pipeline)` retros (08-16 → 09-03), then 545 → 545 → 545 → 543 under `/retro`. The three run
retros netted +1 (`42b21f0`: 7/6), 0 (`f5b76dd`: 2/2), 0 (`664962c`: 11/11); `b2a4d8b` (+91)
authored the skill itself. `plan-work` 353 → 354 → 354 → 354. Growth has stopped. But `42b21f0`
(09-04) sharpened the invariants paragraph and the next run, plain-terminal-session (09-05), leaked
the same class (REQ-12) to review; `664962c` (09-06) sharpened the same paragraph a third time.
`retro/SKILL.md:45` — "A rule broken twice is a script candidate" — is the rule the retro itself did
not apply. F2 is the mechanisation.

### F10. Recurring defect classes and whether the upstream fix held

| Class | Runs it hit | Rule added | Held? |
|---|---|---|---|
| Render-tick rebuild / focus drop | m2 C2 (08-23), m4-reconcile c1 M5 + c2 M1, move-tiles (validate), usage-model-bar C1 + c2 M1 (08-30), ui-text-and-focus (09-03, validate) | `web-impl.md:34` + `e2e-specs.md:159` (08-30) | Yes — the 09-03 instance was caught at validate (Sonnet, 16 min) instead of review (Opus). No review Critical of this class since. |
| Half-fix ("category not example") | m1 c2 C1, m4-reconcile c2 M1, usage-model-bar c2 M1 | impl Fix Mode 5–7 (08-22, 08-27) + orchestrate Fix Prompt Rule 5 | Yes — no "not fixed" finding after 08-30. Duplicate in orchestrate can go (F6). |
| Design-token violations | m0 M2, m1 M1–3 | `make contrast` gate (09-02) | Yes — zero token Majors since; the 13-line prose block in `web-impl.md:37–49` can shrink to a pointer at the gate. |
| Invariant not asserted from every source state | m1 c1 C1, claude-status-fixes (caught by daemon-tests), plain-terminal-session c1 M1 | `daemon-tests.md:35`, `plan-work` invariants ×3 | Partly — the tester rule works (claude-status-fixes); the planner prose does not (F2). |
| Doc upkeep pending at review | 11 runs | none — structural | No (F1). |
| Coverage declined by a test agent | fix-auto-mode-select | `*-tests.md` 09-03 | Yes in 4 runs since. |
| Vacuous / unfalsifiable assertion | file-drop-fix c1 M3 | `e2e-specs.md:128` (09-03) | Yes in 3 runs since; mechanisable as `! rg 'test\.(skip|fixme|only)' web/e2e` in `gates.sh` (+1 line). |

## 3. Model-tier recommendations

**No retier of any pipeline agent.** The evidence points the other way on each candidate:

- **web-impl stays Sonnet.** It is the most-tagged agent historically, but every class that made it
  so has been moved to a cheaper catch (F10): pre-review web-impl fix cycles cost 3–19 min (timings
  tables) against 14–20 min per Opus review cycle. The two `[web-impl]` review Criticals since
  08-30 (new-session-dialog cycle 2: an unguarded `fetch` for the `network` failure mode REQ-13
  named but no test covered; ui-text-and-focus cycle 1: edge case 18 with no `E*`) were behaviours
  the plan never pinned — a bigger impl model does not close a gap the plan left open (F2). Moving
  web-impl to Opus would spend Opus on every run to save Sonnet retries the pipeline is designed
  to absorb.
- **daemon-impl / daemon-tests / web-tests stay Sonnet.** 4 daemon fix cycles in 22 runs; both
  `implementation-bug` escalations by daemon-tests were correct and fixed next attempt; no
  `[daemon-impl]` review Critical since m1 (08-22).
- **e2e-specs stays Sonnet.** Its judgement failures (locator.press workaround, vacuous absence
  assertion, harness-only re-report) each occurred once and each has a rule; validate caught two
  impl bugs before review. Authoring is 8–12 min per run. What it needs is fewer words, not a
  bigger model.
- **review-work stays Opus.** 13/22 reviews produced browser-measured repros, and the repro is what
  fix agents are told to re-run. The waste is F1 (doc-upkeep inventory), fixed upstream.
- **debater/judge stay Opus.** One debate in 22 runs; cost is negligible.
- **The wrappers are the one real tier bug** (F4): they run Sonnet-tuned agent bodies on the
  session model. Fix the spawn or delete them.

## 4. Looked at, nothing wrong

- **Boundary statements.** Every agent file states the boundaries that apply to it: impl agents
  "may NOT edit test files" with the one import exception (`daemon-impl.md:83–88`,
  `web-impl.md:84–87`); test agents "may NOT modify any implementation code" (`daemon-tests.md:73`,
  `web-tests.md:66`); e2e-specs may not touch `web/src/`, `cmd/`, `internal/` or the Playwright
  config (`e2e-specs.md:109,168`); all four state the protocol-contract rule; review-work commits
  only `review.md` (`review-work.md:231`); the effects-need-measurement rule is in both impl files
  (`daemon-impl.md:144`, `web-impl.md:143`).
- **Boundaries in practice.** No review in 31 cycles flags a boundary breach. Two logs show agents
  declining out-of-lane edits and handing off instead (`plans/move-tiles/web-implementation.md:27`,
  `plans/file-drop-fix/web-tests.md:86`). Git history cannot confirm further — plan branches are
  squash-merged and deleted, so per-agent commits are gone.
- **`gates.sh`.** Dedupe by exact command, the `rg` vacuous-pass abort, `--no-e2e` registering a
  SKIP so an `E1 make e2e` check does not run anyway, per-command logs, non-zero exit on any
  failure — all as the SKILL.md describes.
- **`orch-state.py` timings/attempts.** `start`/`finish`/`done`/`retry` bookkeeping matches the
  prose; the `-41m21s` fallback case is documented and the `step_attempts` fix holds in the 3 runs
  that have it.
- **Testable UI Elements contract.** Validate-mode repairs are dominated by plan-delta sweeps of
  pre-existing specs (order-sidebar 6/6, new-ui-design-colors 3/4) and the agent's own fixture-title
  substring collisions (ui-text-and-focus 6/6), not by role/name misses against the table.
- **Wrapper ↔ agent description agreement.** Compatible; read by different selectors.
- **`land`, `spec`, `work-status`, `decide` procedure, `debater`, `judge`.** Claims are measured
  where they can be, grants match use (except decide's `SendMessage`), and the one debate reached
  consensus and landed its outcome.
- **Evidence rule uptake.** Recent impl logs paste `rg` counts, `ls -l`, and re-run reviewer repros
  (plain-terminal-session `web-implementation.md` Fix Attempts 1–2), as the 08-22 rule asks.
- **Authoring live-run rule (`bfab30f`, 09-02).** Honoured in 5 of 6 runs since (markers present
  in every `test-specs.md` except shortcut-fixes).
- **web-impl smoke-run rule (`33c6faf`, 09-03).** Honoured in all 3 runs since.

## Net line delta if every change above is applied

Prose: F1 −3, F2 −11, F3 −5 (and ≈ −1,450 words), F4 0 (or −60 if deleted), F5 −12, F6 −48,
F7 −6, F8 0 → about **−85 prose lines** across `.claude/`. Scripts: F2 +55 (`plan-lint.sh`),
F5 +12 / −4 (`orch-state.py`).

## Applied 2026-09-06 (Damian approved 1, 2, 3, 5, 6, 7, 10; 4, 8, 9 held)

| Finding | What changed |
|---|---|
| F1 | `orchestrate/SKILL.md` Doc-Upkeep Backstop now runs while the Step 3 testers run (committed `docs(<plan>): doc upkeep`) and is re-verified at Completion; `review-work.md` §2 reports doc upkeep as one `DOC` row of Acceptance Checks, never a Major. |
| F2 | New `orchestrate/scripts/plan-lint.sh` (7 checks; clean on plain-terminal-session, fails shortcut-fixes on all 8 unpinned edge cases and claude-status-fixes on its self-quoted D4 pattern). Wired into `/plan-work` approval and `/orchestrate` pre-flight step 2. Four anecdote passages in `plan-work` §5/§8/§9 replaced by one-line rules pointing at the lint. |
| F3 | The two git paragraphs in the five worker agents replaced by one ≈130-word paragraph each (−1,450 words). |
| F5 | `orch-state.py`: `status completed` and `done --next completed` refuse unless `review.md` says `**Verdict**: approved`; new `archive <file>` renames to `<stem>.cycle<N><ext>`; `fail`/`failed_steps` removed. `orchestrate/SKILL.md`: the three prose restatements collapsed to one line, Error Handling to one line, resume text matches `reopen`. `retro/SKILL.md` comments updated. Verified on a scratch state: refusal without approval, acceptance with it, archive → `review.cycle2.md`. |
| F6 | Step 5 prompt 18 → 6 lines; Fix Prompt Rule 5 → one line; JSON example and baseline listing → pointers at the scripts; wave-3 rebuild rule shortened. |
| F7 | All ten stale references fixed (design system line in plan-work, "if it exists yet" ×3, "if tests exist", `npm run e2e` → `make e2e` with the rebuild reason, three M0 clauses in e2e-specs, dev-loop Stopping rewritten around `-on-exit`, triage `Makefile:82`, interface-probe version note, `Task` → `Agent` in orchestrate and decide, pre-2026-08-25 clause deleted). |
| F10 | `web-impl.md` token bullet now points at `make contrast`; `gates.sh` baseline gains `e2e-honest`: `! rg -n 'test\.(skip|fixme|only)\(' web/e2e` (passes on the current tree; regex verified to bite on `test.skip(`). |

Measured: `.claude/agents/*.md` + `.claude/skills/*/SKILL.md` 3,156 → 3,080 lines, 35,622 → 33,478 words.
Scripts: `plan-lint.sh` +75, `orch-state.py` 179 → 197, `gates.sh` 148 → 149.

| F4 | The six wrappers now spawn their agent (`allowed-tools: Agent, Read`, `[mode]`/`[cycle N]` in the argument hint) instead of following the agent file inline; the model pin and boundaries hold on manual runs. Correction to the report: orchestrated runs always honoured the pin — only hand-typed `/daemon-impl`-style invocations bypassed it. |
| F8 | `orchestrate` grants `AskUserQuestion`. `.claude/settings.json`: `Bash(git stash:*)` moved from `allow` to a `deny` rule — a blocked call, no prompt, so the pipeline keeps running and an agent that reaches for stash gets a refusal it must work around. `SendMessage` in decide and `Write` in retro left as they are. |

| F9 | `retro/SKILL.md` step 2: a broken rule's edit count is measured with `git log -S` first; two or more prior edits forbid a third rewording — mechanise or drop. Net 0 lines. |
