# S10 — Does "rebase whenever the base moves" reduce conflicts? Replay on presidium-services (2026-09-07)

**Question (Damian's).** Teams are told to pull the base branch often. Muster could detect
that the base moved and tell the session to rebase. Does event-based rebasing make conflicts
disappear, shrink, or just multiply?

**Method (`rebase-replay.py`).** Population: the 44 real merges on `develop` whose parents
conflict under `merge-tree` (merged work only, per the correction that presidium's open
branches are abandoned). For each, the branch is modelled as its squashed diff sitting on
the merge base, then rebased onto every first-parent `develop` commit between the base and
the merge's first parent, in order — the finest-grained "rebase on every base change"
policy. At each step `merge-tree --merge-base=<prev> <new develop> <branch>`: clean ⇒ the
branch now sits on the new base; conflict ⇒ an **event** is recorded (files, hunks with
`<<<<<<<` markers, conflicted lines). To keep walking past an event the conflicted files
are "resolved" two ways, bracketing the truth: **theirs** (branch drops its change in that
file — lower bound on later events) and **real** (take the real merge commit's version —
tends to re-conflict on later steps, upper bound). The *first* event and the final one-shot
conflict are measured before any approximation, so those comparisons are exact.

## Results

44 merges: 33 involve code, 11 are `VERSION`-only. Median branch life 11 days, median 12
`develop` commits landed during it.

| | one-shot merge (what happened) | rebase on every base change |
|---|---|---|
| Conflict episodes (33 code merges) | 33 | **median 1–4 per branch, mean 2.1–7.5, max 18–49** (lower–upper bound) |
| Total conflict hunks | 226 | **525–1,321 (2.3×–5.8×)** |
| Hunks per episode | 6.8 | 7.6 (lower) / 5.3 (upper) — **about the same size** |
| First episode arrives | at merge | **at 23% of the branch's life** on average |
| First episode vs final size (30 code merges with events) | — | smaller 15, equal 7, **bigger 8** |
| Conflicts that vanish entirely | — | **3 of 44** (`middleware.go` ×2, `.travis.yml`) — 3-way merge is path-dependent |
| `VERSION`-only merges (11) | 11 episodes | 12–38 episodes: it re-conflicts on every bump |

Episodes scale with branch life: code branches living ≤7 days averaged 1.9 episodes,
7–30 days 5.4, >30 days 12.6 (upper-bound policy).

## Reading — honest version

1. **Rebasing on every base change does not reduce conflict. It multiplies the number of
   times someone resolves one.** The same contested region conflicts again each time
   `develop` touches it; each episode is about as large as the single conflict the
   one-shot merge would have had. Total resolved volume is 2–6× higher. This agrees with Ji
   et al. 2020 (rebases conflict at the same rate as merges) and explains *why* the folklore
   feels right anyway: each individual episode is small and fresh.
2. **What it does buy is earliness**: the first collision surfaces about a quarter of the
   way into the branch's life, while the author still has the context. In half the cases
   that first episode is smaller than the eventual conflict; in a quarter it is bigger.
3. **Three conflicts genuinely disappear** under incremental rebasing (intermediate states
   that later changed back). Real, but 7%.
4. `rerere` does not help here: successive `develop` commits produce *different* conflicts
   in the same region, not the same one (consistent with S3's finding).
5. **`VERSION`-style files are the pathological case**: a bot-bumped file conflicts on
   every single base move. Under an auto-rebase policy it would nag on every release.

## Consequence for Muster's policy (replaces "tell the session to rebase when base moves")

- **Rebase automatically while it is free.** When the daemon's `merge-tree` says the
  rebased result is clean, the session is idle and its tree is clean, rebase the worktree
  (S3's abort-safe machinery) and tell the session afterwards. Zero human cost, keeps the
  branch current, and 73–88% of base moves fall in this class (S9: 328/372 merges clean).
- **Stop at the first predicted conflict and surface it — do not keep forcing rebases.**
  The owner gains the early warning (point 2) and decides *when* to pay: now while the
  context is warm, or once at land time. Every extra forced rebase after that is another
  resolution of roughly the same size for no reduction in the final one.
- **Exclude bot-owned files from both the warning and the auto-rebase** (`VERSION`,
  lockfiles, generated code) — per-repo hot-file policy; regenerate or `merge=ours`.
- Cadence-based rules (daily pulls) are neither necessary nor helpful once this signal
  exists; they were a proxy for "notice early", which the radar does directly.

## Caveats

Textual conflicts only; one repo, 44 merges; branch modelled as a squashed diff (its own
commit timing ignored); the continuation past the first event is bracketed by two crude
resolution policies rather than a real one; 3-way merge path dependence means the
"disappears" count is an artefact of git as much as of workflow. Not measured: whether
earlier, smaller resolutions are *less error-prone* (Brindescu's 26× would suggest fewer
manual resolutions is the safer direction, which favours one-shot-at-land for code and
auto-rebase-while-clean for everything else).

Artifacts: `~/.muster-spikes/s9-presidium/replay-{real,theirs}.tsv`.
