# Merge conflicts — literature and industry check against our spike claims (2026-09-07)

Purpose: test the claims in `S5`/`S8`/`S9` and `docs/design/worktree-conflicts.md` against
published data. Method: web search + reading 20 sources (peer-reviewed studies 2011–2026,
two 2026 AI-agent PR datasets, one LLM benchmark, two industry reports, tool docs). Where a
PDF would not parse I extracted its text locally and quote from it. Verdicts: **supports**,
**contradicts**, or **nuances** each claim.

## Baseline: how often do merges conflict at all?

| Study | Population | Textual conflict rate |
|---|---|---|
| Zimmermann 2007 (via Brun 2011) | 4 CVS projects | 23–47% of merges |
| Brun et al. FSE 2011 | 9 OSS systems, 550k versions; 5,355 merges of Git/Perl5/Voldemort | **17%** of merges textual; of the rest, **1% build-fail, 6% test-fail** |
| Kasi & Sarma ICSE 2013 | several projects | 7.6–19.3% |
| Ghiotto et al. TSE 2020 | 2,731 Java projects, 25,328 conflicting merges | **10–20%** of merges, some projects ~50% |
| Brindescu et al. EMSE 2020 | 143 OSS projects | "almost 1 in 5 merges" |
| Ji et al. ISSRE 2020 | 51,183 rebases, 82 Java repos | 24.3–26.2% of rebases; same likelihood as merges |
| AgenticFlict 2026 | 107k AI-agent PRs, 59k repos | **27.7%** at merge time (Copilot 15% … Codex 32%; Claude Code 25.9%) |
| Our data | muster / MDRostering / presidium real merges | — / 3% / 12% |

Our real-merge rates sit at the low end; our adjacent-pair reconstruction (14–27%) lands in
the literature's range. The AI-agent PR rate (27.7%) is at the top of the human range.

## Claim-by-claim

### 1. "Semantic conflicts (clean merge, broken build/tests) did not occur — 0 in 83 gated merges"

- **Contradicts (at scale): Brun 2011.** Of 5,355 merges, 1% failed the build and 6% failed
  tests despite merging cleanly; "33% of the 399 merges that the VCS reported as clean
  merges actually were a build or test conflict." Conflicts persisted 10 days on average
  (median 1.6).
- **Contradicts (at scale): Mergify "State of Merge Queues 2026"** (153k merges, 160 teams
  with real queues): a green PR lands in a failed batch **0.77%** of the time at 2–5
  engineers, 0.98% at 6–15, 2.49% at 16–40, **12.5% at 40+**. Private repos 5.1%, OSS 1.1%.
  (Their "break" includes anything that failed in the batch, i.e. flakes and infra too.)
- **Contradicts (at scale): Uber SubmitQueue, EuroSys 2019.** iOS mainline was green only
  52% of the time before the queue; ~40% chance of a problem with 16 concurrent changes.
- **Supports (rarity): Shen et al. 2021.** Compiling every automatically-merged scenario in
  7 large Java projects surfaced only 21 compile conflicts (≤2 per project in 5 of them)
  and 4 dynamic conflicts in total — they had to hand-mine unmergeable branches to reach a
  100-sample. **Da Silva/Borba 2024**: their semantic-conflict dataset is 28 curated pairs
  from 51 scenarios; no natural rate is claimed. **Microsoft Edge (ISSTA 2022)**: 379
  semantic conflicts, but in a divergent fork merging 25k upstream commits per quarter.
- **Verdict: our 0/83 is what small-team data looks like, and the literature says the rate
  is a function of concurrency and team size, from <1% to >10%.** Design consequence: the
  verify gate stays load-bearing; the *rate* to budget for is "<1% of lands for one
  person, rising steeply with concurrent landers", not zero.

### 2. "Filename overlap over-predicts conflict (precision 5–70%); merge-tree must drive the matrix"

- **Supports: Leßenich et al. ASE 2018** (21,488 scenarios, 163 projects): none of 7
  developer-suggested indicators — including *files changed by both branches* — correlates
  strongly with conflict count; a full regression explains 4% of variance. "Making these
  indicators useless as predictors."
- **Supports: Owhadi-Kareshk et al. ESEM 2019** (267k scenarios, 744 repos, 9 features):
  predicting *safe* merges F1 0.95–0.97; predicting *conflicting* merges F1 only 0.57–0.68.
  Overlap-type features are excellent negative evidence and poor positive evidence — exactly
  our 100% recall / 5–70% precision.
- **Nuances: Dias/Borba IST 2020 and Menezes et al. JSERD 2021** (182k scenarios): number of
  changed files, commits, developers and branch duration *do* raise conflict odds (Dias:
  4.4–6.1× when contributions touch the same MVC slice). So overlap is a real risk factor
  at the population level while still being a bad per-pair alarm.
- **Verdict: supported.** Tier-1 overlap = "safe to ignore" signal only; tier-2
  `merge-tree` (80–150 ms/pair measured) is the alarm.

### 3. "Staleness, not concurrency, dominates the live matrix"

- **Supports: Menezes 2021** — branch duration positively associated with conflicts;
  attributes of the *integrated* branch matter more than the receiving branch's.
- **Supports (practice): Ji 2020** — rebasing conflicts as often as merging (24–26%), so
  "rebase early" only helps if it is *often*, which is the nudge's point.
- **Nuances: Leßenich 2018** — commit-count activity of branches did not predict conflicts.
  Our staleness metric is *behind* (target moved), which they did not test directly.
- **Verdict: supported, with a gap** — no study isolates "commits behind target" the way S9
  does (median 717 vs 45). Worth stating as our own measured contribution.

### 4. "Hot files are mechanical: VERSION, lockfiles, generated code, config"

- **Supports: Dias 2020** — "a significant part of the conflicts occur in configuration
  files, especially Gemfile.lock … could be automatically resolved by discarding local
  changes and rebuilding". **Vale et al. 2022** — yarn.lock/package.json and minified files
  regenerated after merge among the longest-to-resolve scenarios. **npm docs** — since
  npm 5.7 `npm install` auto-resolves package-lock conflicts; `npm-merge-driver` teaches
  git to do it.
- **Contradicts (for agents): AI Agent PR study 2026** — of conflicted files in co-active
  agent PR pairs, 84.4% are source, 3.9% manifest/lockfile, 4.0% config/CI, 2.6% docs.
- **Verdict: supported for human history; agent-authored work conflicts in source.** The
  per-repo hot-file table is still the cheapest defuse, but it will not carry an agent
  fleet.

### 5. "Two concurrent, current branches almost never collide (6/120, 0 hand-written)"

- **Contradicts: AI Agent PR study 2026** (33,596 PRs, 2,807 repos; 3-way `merge-tree` of
  co-active PR heads, windows k=0–7 days): **19.8%** of same-agent pairs and **41.7%** of
  cross-agent pairs conflict; 42% structural (add/add, modify/delete). Agents "do not have
  even the most basic level of horizontal awareness." They did **not** filter for
  currency-with-base, so this is comparable to our *unfiltered* 53% (171/325), not our 5%.
- **Contradicts: Uber** — 40% at 16 concurrent changes on a monorepo.
- **Verdict: our 5% is a small-N, human, current-branches number.** With agents the
  collision rate is 2–8× higher and lands in source code. That *raises* the radar's value
  for Muster's actual use case (several agents on one repo) above what the three human
  repos suggest.

### 6. "LLM resolver: task context helps; verify is not a sufficient gate; enforce a parent-content, hunk-scope rule"

- **Supports: Merge-Bench 2026** (7,938 hunks, 1,439 repos, 11 languages): best model
  <60% correct (Gemini 2.5 Pro 54.7% exact / 62.5% normalized; Claude Opus 4 44.4%); the
  prompt instructs models to leave the conflict when intent is ambiguous; several models
  leave 40–86% unresolved. They **reject tests as a correctness oracle** because models
  "satisfy tests rather than produce correct code" — our p3/diff resolver rewrote a test.
  Context effects were not evaluated, so S6 (3/3 vs 2/3) is untested ground, n=3.
- **Supports: Ghiotto 2020** — 87% of conflicting chunks are resolvable from the chunk's
  own content (50% take v1, 25% v2, 3% concatenate, 9% interleave, 13% new code); 94% of
  chunks ≤50 lines. A "content present in a parent or a mechanical composition" rule
  covers ~87% by construction and flags the 13% that need new code.
- **Supports: Brindescu 2020** — conflict-touched code is 2× as likely to be buggy, **26×**
  when resolved manually; 75% of resolutions required reasoning about program logic.
  Resolution must re-enter gates and review.
- **Related: Microsoft Gmerge (ISSTA 2022)** — 64.6% accuracy on Edge semantic conflicts
  with GPT-3; the industrial precedent for LLM resolution being useful but not trusted.

### 7. "Gates rot; flakes make a queue cry wolf; retry + compare against target HEAD"

- **Supports: Google Testing Blog 2016** — 1.5% of test runs flaky, ~16% of tests exhibit
  flakiness, and **84% of pass→fail transitions in post-submit CI are flakes**, not
  regressions. Our S5 (16/25 spurious reds) and S8/S9 (all reds toolchain drift) are the
  same phenomenon at small scale.
- **Supports: Mergify 2026** — failed batches are bisected; ~5.8 PRs per failed batch in
  private repos, so the culprit search is a first-class queue feature.

### 8. "No tool ships live cross-worktree overlap warnings" (2026-09-01 survey)

- **Now false: Clash (clash.sh, 2026)** — pairwise `git merge-tree` across all worktrees
  (dirty + committed), watch mode, JSON matrix, and a Claude Code `PreToolUse` hook that
  **blocks** a Write/Edit that would conflict. Detection only; no stale-vs-colliding
  distinction; no resolution. Clash chose the *control* half we rejected; our S4/S9 data
  (stale ≠ colliding; owner handoff works) is the argument for signals-not-blocks.

## What this changes in the design note

1. Replace "budget zero for semantic conflicts" with **"<1% of lands for a solo user,
   scaling with concurrent landers (Mergify 0.77%→12.5%)"**; the gate is mandatory, the
   *cost model* is per-land verify time, not resolver effort.
2. Radar tier 1 (overlap) is a **negative** signal only; document Leßenich/Owhadi-Kareshk.
3. Agent fleets conflict 2–8× more than the human histories we measured, and in source
   code — the radar and owner-handoff are more valuable for Muster's real workload than
   S8/S9 imply. Cite the 2026 agent-PR studies.
4. Prior art: Clash. Position Muster as stale/colliding matrix + handoff + queue, not a
   write-blocker.
5. Resolver rule quantified: Ghiotto's 87% chunk-local resolutions is the coverage of the
   "parent content only" rule; the 13% "new code" remainder is the human/owner rung.
6. Add Brindescu's 26× to the rationale for re-review after resolution.

## Sources

- Brun, Holmes, Ernst, Notkin — Proactive Detection of Collaboration Conflicts, FSE 2011: https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-fse2011.pdf
- Ghiotto, Murta, Barros, van der Hoek — On the Nature of Merge Conflicts, TSE 2020: https://ieeexplore.ieee.org/document/8468085/ (summary: https://neverworkintheory.org/2021/08/12/on-the-nature-of-merge-conflicts.html)
- Leßenich, Siegmund, Apel, Kästner, Hunsen — Indicators for Merge Conflicts in the Wild, ASE 2018: https://link.springer.com/article/10.1007/s10515-017-0227-0
- Owhadi-Kareshk, Nadi, Rubin — Predicting Merge Conflicts, ESEM 2019: https://arxiv.org/abs/1907.06274
- Dias, Borba, Barreto — Understanding predictive factors for merge conflicts, IST 2020: https://pauloborba.cin.ufpe.br/publication/2020understanding_predictive_factors_for_merge_conflicts/
- Menezes et al. — Attributes that may raise the occurrence of merge conflicts, JSERD 2021: https://journals-sol.sbc.org.br/index.php/jserd/article/view/1911
- Brindescu, Codoban, Shmarkatiuk, Dig — Merge conflicts and their effect on software quality, EMSE 2020: https://link.springer.com/article/10.1007/s10664-019-09735-4
- Ji, Chen, Yi, Mao — Merge Conflicts and Resolutions in Git Rebases, ISSRE 2020: https://ieeexplore.ieee.org/document/9251051/
- Shen, Fan, et al. — Automatic Detection and Resolution of Software Merge Conflicts: Are We There Yet? 2021: https://arxiv.org/abs/2102.11307
- Vale, Hunsen, Figueiredo, Apel — Challenges of Resolving Merge Conflicts: Mining and Survey, TSE 2022: https://www.se.cs.uni-saarland.de/publications/docs/VHF+22.pdf
- Da Silva, Borba, et al. — Detecting Semantic Conflicts with Unit Tests, JSS 2024: https://arxiv.org/abs/2310.02395
- Zhang et al. (Microsoft) — Pre-trained LMs to Resolve Textual and Semantic Merge Conflicts, ISSTA 2022: https://www.microsoft.com/en-us/research/publication/using-pre-trained-language-models-to-resolve-textual-and-semantic-merge-conflicts-experience-paper/
- Merge-Bench, ICPR 2026: https://arxiv.org/abs/2605.25890
- AI Agent Pull Requests on GitHub: Frequency, Structure, and Merge Conflict Rates, 2026: https://arxiv.org/abs/2607.04697
- AgenticFlict dataset, 2026: https://arxiv.org/abs/2604.03551
- Mergify — State of Merge Queues 2026: https://mergify.com/reports/state-of-merge-queues-2026
- Ananthanarayanan et al. (Uber) — Keeping Master Green at Scale, EuroSys 2019: https://dl.acm.org/doi/10.1145/3302424.3303970 (summary: https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/)
- Google Testing Blog — Flaky Tests at Google and How We Mitigate Them, 2016: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- npm docs — package-locks and conflict resolution: https://docs.npmjs.com/cli/v6/configuring-npm/package-locks/
- Clash — conflict detection across worktrees: https://github.com/clash-sh/clash
- McKee, Nelson, Sarma, Dig — Software Practitioner Perspectives on Merge Conflicts, ICSME 2017: http://dig.cs.illinois.edu/papers/McKee-ICSME'17.pdf
