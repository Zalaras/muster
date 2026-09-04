# Muster — UX flows

Design session 2026-08-16 (`next-steps.md` item 4). Settles SPEC §9 open question 2
(launch/worktree data layer) and fixes the dashboard's shape before M1/M2 UI work.

`SPEC.md` stays authoritative for *what* Muster does; this file is authoritative for
*how the interface behaves*. Where this file adds a decision, SPEC §11 gets a changelog
entry. Visual language is deliberately **not** settled here — see "Visual direction" at
the end.

## Decisions settled this session

| # | Decision | Choice |
|---|---|---|
| 1 | Directory memory | **Hybrid MRU + promotion** — every launch auto-remembers its directory; a directory becomes a configured repo only when it needs per-repo config |
| 2 | Worktrees in v1 | **Repo root only, schema ready** — launch into the checkout you picked; `worktree` table exists but no worktree UI until §4.2 |
| 3 | Primary layout | **Rail + focused pane** — attention-sorted rail on the left, one live terminal filling the rest |
| 4 | Launch form | **Directory + optional title + model + starting permission mode** — segmented Model/Start-in controls; Model gains a `fable` preset (2026-08-30, plan `new-session-dialog`) |

---

## 1. New-session flow

The only way sessions are created (§2.5 — Muster cannot adopt a session it did not
start).

### 1.1 The picker

One list, ordered `pinned DESC, last_launched_at DESC`. No "add repo" ceremony: a
directory earns its place by being used.

```
New session                                       ⌥⌘N
─────────────────────────────────────────────────────
Recent             │ / › Users › damian › code    ⌘↑
▸ muster   main 2m │   Projects (git)              ›
  mdroste… dev  1h │   spikes                      ›
  ledger…  main 2d │   scratch                     ›
─────────────────────────────────────────────────────
```

- **★** marks a *promoted* directory — one that carries per-repo config. In v1 nothing
  can be promoted yet (the config it would hold is §4.2's setup scripts and env globs),
  so the marker is designed-for and unused. Pinning is manual and cheap; add it in M1
  only if the MRU list gets long enough to annoy.
- Branch is shown when the directory is a git checkout, `—` otherwise. Claude Code runs
  anywhere; "repo" is the table's name, not a precondition.
- *(Rebuilt 2026-08-30, plan `new-session-dialog` — the macOS Open-panel idiom.)* The MRU
  list is a persistent **Recent** sidebar beside a browse pane: a **clickable breadcrumb**
  (every ancestor a button, the current directory the highlighted last segment, ⌘↑ goes up)
  over a **single child listing** (`GET /api/browse`, git checkouts marked `(git)`).
  **The listed directory *is* the selection** — descending into a child changes it; there is
  no `Browse…` unfold, no Up button and no "Use this folder" apply step. The footer always
  states `Launch in <path>`. Clicking a recent navigates the browse pane to it and restores
  that directory's last-used model and permission mode. *(The 2026-08-22 correction stands:
  browsing is daemon-backed because browsers deliberately never reveal a picked folder's
  absolute path.)*

### 1.2 The form

```
Title       (optional — Claude Code auto-generates)
Model       [ sonnet │ opus │ haiku │ fable │ other… ]
Start in    [ manual │ accept edits │ plan │ auto ]
            Launch in ~/code/Projects/muster · main      [ Launch ]  ⏎
```

- **Model** and **Start in** are segmented controls (native radios, design-system §5);
  Model's presets are `sonnet / opus / haiku / fable` plus `other…`, which reveals a
  free-text `Custom model` row. `Directory` is no longer a form row — the picker's listed
  directory is the selection, restated by the footer readout (2026-08-30, plan
  `new-session-dialog`).
- **Title** maps to `--name`. Leaving it blank is a first-class choice: Claude Code
  auto-generates a usable human title from session content (§2.1, verified), and Muster
  reads the live title from the status line's `session_name` rather than maintaining its
  own mapping.
- **Start in** offers Claude Code's four tabbed modes with Claude Code's own labels
  (2026-09-03, plan `fix-auto-mode-select`, #12): `manual` is the wire's `default` (measured
  identical on 2.1.259), `accept edits` is `acceptEdits` (the radio formerly mis-labelled
  "auto-accept"), `plan`, and `auto` (`--permission-mode auto`). `bypassPermissions`/`dontAsk`
  are deliberately absent pending §4.4.
- **Model** and **Start in** default to whatever was used last, per directory. Rationale
  for asking at all: starting a research session directly in plan mode avoids a Shift+Tab
  dance, and it is the only moment Muster can honestly seed `permission_mode` — manual
  Shift+Tab changes fire no hook and no status-line update (§4.5), so a mode Muster never
  saw set is a mode it can never learn.
- **Permission-mode honesty rule:** the launch flag seeds the indicator, the first
  `UserPromptSubmit` carrying `permission_mode` corrects it, and the indicator is rendered
  as *last known*, never as authoritative.

### 1.3 What launch does

1. Upsert the `repo` row (path, name, `is_git`, `default_branch`, `last_launched_at++`).
2. Create the tmux window on the `muster` socket; **`tmux_target` is the session
   identity** (§7) — a `/clear` later mints a new Claude `session_id` in the same pane and
   must not look like a new session.
3. Set `LANG`/`LC_ALL` on the spawned process — a process spawned by a Go daemon inherits
   none, and the failure presents as a totally broken terminal bridge (TODO M2).
4. Ensure the directory's project-scoped `<dir>/.claude/settings.json` registers Muster's
   hooks, status line and `allowedHttpHookUrls`. Never `~/.claude/settings.json`; never
   `CLAUDE_CONFIG_DIR` (breaks subscription OAuth).
5. Insert the `session` row in state `Started` and show it in the rail immediately —
   before any hook arrives, because the first hook may be a long way off (§1.4).

### 1.4 First-launch trust prompt

On the first launch into a directory Claude Code has never seen, a workspace-trust prompt
**blocks startup**: no hooks fire, no status line renders (§2.5). The session looks merely
slow while emitting nothing.

Muster surfaces it; it does **not** auto-answer. That prompt is the only gate before
Claude Code can read, edit and execute in a folder, and answering it on the user's behalf
from a background daemon is a security decision, not a convenience.

Detection is by **absence and by Muster's own records** — never by reading the pane
(hard rule: state never comes from terminal output):

- If the directory has no prior `repo` row, a trust prompt is *expected*. The rail card
  says so from the moment it appears: `Started · first launch here — likely waiting on
  Claude Code's trust prompt`, with a **Focus pane** action.
- Otherwise, a session that has emitted no `SessionStart` within ~10 s shows
  `Started · no signal yet` with the same action. Honest about not knowing, rather than
  guessing.

Open, and a good `/interface-probe` candidate: whether Claude Code records per-directory
trust somewhere readable (`~/.claude.json`), which would turn the guess into a fact. Any
such knowledge lives in `internal/claudecode/`.

---

## 2. Launch/worktree data layer (resolves SPEC §9 Q2)

What the flow remembers, and nothing more:

**`repo`** — one row per directory ever launched into.
`id`, `path` (unique), `name` (basename), `is_git`, `default_branch` (nullable),
`last_launched_at`, `launch_count`, `pinned`, `created_at`. §4.2 later adds
`setup_script` and `env_globs`; a row with either is what "promoted" means.

**`worktree`** — exists per SPEC §7, **not written by the launch flow in v1**.
One thing v1 *does* do: **recognize** a worktree it was pointed at. If
`git rev-parse --git-common-dir` differs from `--git-dir`, the directory is a linked
worktree; record it so the rail can show `repo / branch` correctly. Damian already uses
worktrees by hand — v1 must display them truthfully even though it can't create them.

**`session`** — as SPEC §7, with `worktree_id` populated only by the recognition above,
otherwise NULL.

Consequence: when §4.2 lands, the launch form grows one field
(`main checkout · existing worktree · new worktree`) and the picker gains a setup-script
editor. No table is repainted, no identity changes.

Deliberately not decided now: how worktrees are named on creation, and the setup-script
format. Both belong to §4.2 and neither constrains M1.

---

## 3. The dashboard

The dashboard has **two peer views**, switched from the masthead and remembered across
reloads: **Focus** (§3.1) and **Tiles** (§3.7). Neither is a mode you get stuck in and
neither is a lesser surface — Focus answers *who needs me*, Tiles answers *show me several
at once*. Everything in §3.2–§3.6 applies to both.

### 3.1 Shape — Focus

```
┌────────────────────────────────────────────────────────┐
│ MUSTER  [Focus|Tiles]   5h ▓▓▓▓▓░░ 61%  7d ▓▓░░ 23%    │  masthead: account-level
├──────────────┬─────────────────────────────────────────┤
│ attention    │                                         │
│ rail         │   focused session — one live pane       │
│ (snapshots)  │                                         │
└──────────────┴─────────────────────────────────────────┘
```

- **Masthead** carries what is true of the whole account: 5-hour and 7-day bars, current
  model, session count, and the daemon-health indicator. Always visible — the success
  criterion (§1) is *awareness*, and awareness you have to navigate to isn't awareness.
- **Rail** is the session list of §2.1, sorted by who needs you.
- **Main** is exactly one live terminal. Clicking a rail card swaps which session is live,
  and puts the cursor in the pane.

### 3.2 Why exactly one live pane

Not an aesthetic choice — it falls out of the measured sizing matrix (§2.4, §9 Q5). A
session's geometry must be ≤ the smallest grid currently rendering it live, because a
wider grid degrades gracefully while a narrower one **silently loses content**. A live
narrow thumbnail beside a live wide pane would corrupt the wide one.

So: rail cards render a **static last-known snapshot**, never a second live client. The
focused pane owns the session's geometry, drives both `pty.Setsize` and
`tmux resize-window` (never `resize-pane` — it exits 0 and no-ops on single-pane
windows), and debounces resizes ~100 ms.

### 3.3 Rail card

Everything §2.1 requires, plus the context signal from §2.2:

```
│ ●  flaky-e2e-hunt              11:48 │   title · state · time in state
│    muster / feat-e2e                 │   repo / branch (or worktree)
│    ctx 42%  84k          ⟳2          │   pct + absolute tokens + compactions
```

- **Absolute tokens sit beside the percentage** because `context_window_size` varies by
  model — 20% of a 1M window is five times 20% of a 200k one, so the bare percentage is a
  weak "time to restart" signal.
- **⟳n is the compaction counter** from `PreCompact`. After `/compact` the gauge reads 0%,
  which otherwise looks like a brand-new session with a summary silently loaded.
- **Before a session's first API response**, `rate_limits` is an absent key and the
  context fields are `null`. That renders as `ctx —  unknown`, never as an empty gauge at
  0%. Same rule in the masthead bars.

### 3.4 States and ordering

Six states (§2.1). There is deliberately no "Done": Claude Code knows a turn ended, not
that a task is complete.

*Amended 2026-08-30 (plan `order-sidebar`)*: the needs-input-first ordering below is the
rail's **attention** sort mode. The default mode is **manual**: sessions sit in the order they
were opened, drag-to-reorder by card, a pin control lifts a session into a pinned block at the
top, and no state change ever moves a card. The mode is a rail-head toggle persisted as
`prefs.railSort`; the Tiles strip follows the same order.

| State | Source | Rail treatment |
|---|---|---|
| `Needs-Input` | `Notification` (`permission_prompt` / `idle_prompt`) | Loudest. Timer counts up and escalates. |
| `Failed` | `StopFailure` with typed `error` | Loud, but static — it stopped, it isn't waiting. |
| `Planning` | `permission_mode: plan`, latched forward from the last hook that carried it | Distinct from Working; it's the state you may want to interrupt. |
| `Working` | mid-turn | Calm. Motion only, no color demand. |
| `Started` | `SessionStart`, or Muster's own launch record | Calm, with the trust-prompt caveat of §1.4. |
| `Idle` | `Stop` | Quietest. Shows last activity, not "done". |

Sort order: **Needs-Input (longest-blocked first) → Failed (most recent first) → Planning
→ Working → Started → Idle (longest-idle first)**. Blocked-longest-at-top is the
spec-level rule (§2.1); the rest keeps the rail stable enough to build muscle memory.

`StopFailure` **replaces** `Stop` — never both (H2 probe). But a killed session emits
*neither*, only `SessionEnd`, and sometimes not even that. So the rail must tolerate a
session that never closes its turn: tmux pane liveness is the authority, hooks are
enrichment.

Do not build UI that assumes `StopFailure.error` maps 1:1 from API errors — an injected
400 surfaced as `"unknown"`. Show the raw value and a human line; don't switch on an
enum you don't control.

### 3.5 Degraded and honest states

These are designed, not afterthoughts — three of the four are *guaranteed* to happen.

- **Daemon down.** Every managed pane fills with inline hook-error lines. The masthead
  turns into a full-width banner explaining that the noise in the panes is Muster's
  absence, not the session's failure.
- **Usage unknown.** Absent `rate_limits` (pre-first-response, or API-key auth) renders
  the word *unknown*, not a 0% bar.
- **Session vanished.** Pane dead but session known → the card offers
  `claude --resume <session-id>`; `SessionStart` fires with `source: "resume"` and the
  same `session_id`, so the daemon re-binds deterministically (H2 probe).
- **Hook loss.** Delivery is best-effort, at-most-once, unordered, with no replay. The
  rail shows last-known state with its age; a stale timer is the honest signal that
  Muster may have missed something.

---

### 3.7 Shape — Tiles

```
┌────────────────────────────────────────────────────────┐
│ MUSTER  [Focus|Tiles]   5h ▓▓▓▓▓░░ 61%  7d ▓▓░░ 23%    │  same masthead
├───────────────────────────┬────────────────────────────┤
│ flaky-e2e-hunt      11:48 │ auth-jwt-rotation    04:12 │  live tiles,
│  (live, owns geometry)    │  (live, owns geometry)     │  top N by attention
├───────────────────────────┼────────────────────────────┤
│ payments-refactor   02:31 │ spec-research        00:47 │
│  (live)                   │  (live)                    │
├───────────────┬───────────┴────┬───────────────────────┤
│ db-migration  │ docs-pass      │ readme-tidy           │  snapshot strip:
│ FAILED  6m    │ STARTED  00:08 │ IDLE  34m             │  the rail, on its side
└───────────────┴────────────────┴───────────────────────┘
```

- **Live tiles are the top N by attention** at view entry and when the grid grows; §3.4
  order fills the slots then. After that the grid is **slot-stable**: a promoted session
  takes the demoted tile's slot, a departed tile's slot closes and the rest shift left,
  and no state change ever moves a tile. Only the user reorders — **drag a tile by its
  header** onto another tile to insert it there (the others shift). Order is per-window
  and not persisted, like membership. (Amended 2026-08-29, plan `move-tiles`; before that
  the grid re-sorted itself by §3.4 on every change.) Everything else is a snapshot card
  in the strip, in the rail's order (§3.4 — manual or attention, minus the live tiles;
  amended 2026-08-30, plan `order-sidebar`); clicking one promotes that session into the grid.
- **Density is a control** (2×2 / 3×2). A denser grid means narrower tiles, so each tile
  states its real geometry (72×26 at 2×2, 48×26 at 3×2). Narrow is safe; *inconsistent* is
  not (§3.2).
- The strip is not a downgrade — it carries the same title, state, timer and reason lines a
  rail card does. It just doesn't get a terminal.
- **New session lives in the density toolbar** (the rail's button is hidden with the rail);
  it opens the §1 modal exactly as the rail button and ⌥⌘N do. A session launched while in
  Tiles is promoted into the grid the way a strip-card click is — you asked for it here, so
  it gets a tile, even if that demotes the lowest-priority one. (Added 2026-08-30.)

### 3.8 Switching views

- Masthead segmented control, or **⌘\\**. `⌥⌘1–9` keeps meaning in both views: focus session
  *n*, which in Tiles promotes it into the grid. *n* counts the rail's displayed order (§3.4:
  manual by default, attention when selected) — not the attention rank on its own
  (2026-08-30, plan `order-sidebar`, decision `cmd-n-ordering`). `⌥⌘0` jumps to the single
  highest-attention live session, ignoring the rail's order and the pinned block entirely
  (plan `shortcut-fixes`, discharging the `cmd-n-ordering` dissent).
- **The choice persists** across reloads and daemon restarts. A dashboard that silently
  changes layout under you is worse than either layout.
- Switching **moves geometry ownership, never duplicates it** — the same law as §3.2. Going
  Focus → Tiles hands each affected session's geometry from the pane to its tile and back
  again on return, which means a view change genuinely resizes tmux windows: debounce
  (~100 ms), drive both `pty.Setsize` and `tmux resize-window`, and touch only the sessions
  whose live surface actually changed. Sessions that are snapshots in both views are never
  resized.

## 4. Not designed here

- Plan-approval UI (§4.1), worktree manager UI (§4.2), start-from-PR (§4.3),
  permissions editor (§4.4) — all v1.x, all deliberately absent from the mockups so the
  v1 surface stays legible.
- Keyboard model beyond ⌥⌘1–9/⌥⌘0 focus and ⌥⌘N new session.
- The mockup's "attention ribbon" (60-min state timeline) and lead-session chat panel:
  the chat panel is cut outright (§3); the ribbon is a maybe, and appears in exactly one
  of the three visual directions so it can be judged rather than assumed.

## 5. Visual direction — settled

**Direction A, "instrument", chosen 2026-08-16.** The rules it becomes are in
`docs/design/design-system.md`, which is now what `review-work` checks UI against.

In `docs/design/mockups/`:

| | File | Status |
|---|---|---|
| **A** | `a-instrument.html` | **Chosen.** Control desk: dark, dense, mono metadata, hairline rules, tabular numerics, state as a coloured rail stripe. A's **Focus** view. |
| **A** | `d-tiled.html` | A's **Tiles** view — the same direction, not a separate one. Both views ship as A; only the build order differs (Focus in M1, Tiles with the PTY bridge in M2). |
| B | `b-editorial.html` | Rejected. Warm light, typographic, terminal as the only dark surface. |
| C | `c-terminal.html` | Rejected. Monospace throughout, chrome receding into the TUI. |

Two sub-decisions taken with the pick:

- **Typefaces: system stacks only.** No web fonts, no CDN, no vendored binaries — the
  dashboard is localhost-only and the dep tree is deliberately small. Display separates from
  body by weight and tracking, not family.
- **Attention ribbon: deferred post-v1.** It needs a rolling state-history query and a
  timeline renderer for a signal the rail's time-in-state largely already carries. The
  `event` table already stores what it would need, so it costs no schema change later. It
  survives in `a-instrument.html` behind the "Ribbon (deferred)" toggle.

All four render the same fixture: seven sessions across the six states, one usage-unknown
session, one failed session with a non-enum error, the daemon-down banner and the
new-session form. `d-tiled.html` adds the workspace-trust prompt as it actually appears in
a pane — the surface where you answer it.

None of them show cost — cut by design (§3).

Both views are specified in §3: Focus in §3.1, Tiles in §3.7, switching in §3.8. The
masthead, state colours, attention ordering and degraded states are identical across them
by rule — switching views should never make you re-learn anything.
