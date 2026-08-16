# S1 — Status line & usage: findings

Spike instance **2** · port **8782** · tmux socket `ccc-spike-2` · repo
`ccc-spike/instances/2/repo` · capture `ccc-spike/capture-2.jsonl` (note: the capture
server resolved its output path relative to its cwd, so the file is at the `ccc-spike/`
root, not in `captures/`).

- `claude --version` at start: **2.1.233 (Claude Code)**
- `claude --version` at end: **2.1.233 (Claude Code)** — no drift during the spike.
- `~/.claude/settings.json` md5 at end: `20a641769314c762f0390de5495a9e31` — unchanged.
- Account as reported by the TUI banner: **Claude Team · spandigital** (not Pro/Max — see Q1).
- Isolation used: project-scoped `.claude/settings.json` in the scratch repo.
  `CLAUDE_CONFIG_DIR` was **not** set (the line was stripped from `env.sh`), per the
  known OAuth breakage.

Sessions driven (all in the one scratch repo, so all share the same project settings):

| # | `session_name` | model | purpose |
|---|---|---|---|
| A | `ccc-spike-title-A` → `ccc-renamed-B` | Haiku 4.5 | Q2/Q3/Q4/Q5, `/compact` |
| C | `ccc-sonnet-C` | Sonnet 5 | Q1 model dependence |
| D | `ccc-refresh-D` | Haiku 4.5 | Q3 `refreshInterval` semantics |

37 real status-line payloads captured (plus one synthetic `{"probe":"hello"}` curl used to
smoke-test the server; excluded from all counts below).

---

## Q1 — Does `rate_limits` ever appear?

**Verdict: CONFIRMED — YES. `rate_limits` populates fully, and SPEC §2.3 is buildable.**

### Method

Ran three sessions across two models. After every status-line fire, checked whether the
`rate_limits` key was present, and whether it was empty or populated. Explicitly separated
the three states the brief asked about: *absent key* / *present but empty* / *present and
populated*.

### Observed

At session start, before any API response, the key is **entirely absent** (not empty). From
session A's very first fire:

```json
{"context_window":{"context_window_size":200000,"current_usage":null,
  "remaining_percentage":null,"total_input_tokens":0,"total_output_tokens":0,
  "used_percentage":null},
 "cost":{...},"cwd":"...","exceeds_200k_tokens":false,"fast_mode":false,
 "model":{"display_name":"Haiku 4.5","id":"claude-haiku-4-5-20251001"},
 "output_style":{"name":"default"},"session_id":"019b2e5f-...",
 "session_name":"ccc-spike-title-A","thinking":{"enabled":true},
 "transcript_path":"...","version":"2.1.233","workspace":{...}}
```

After the first completed API response of the session (`say hi`, Haiku, `2026-08-16T13:04:39.146Z`):

```json
"rate_limits": {
  "five_hour": {"resets_at": 1786897200, "used_percentage": 14.000000000000002},
  "seven_day": {"resets_at": 1787061600, "used_percentage": 28.000000000000004}
}
```

On Sonnet 5 (`2026-08-16T13:12:18.174Z`), the same two buckets, no extra per-model bucket:

```json
"rate_limits": {
  "five_hour": {"resets_at": 1786897200, "used_percentage": 20},
  "seven_day": {"resets_at": 1787061600, "used_percentage": 28.999999999999996}
}
```

Across all 37 payloads: `rate_limits` present in **33**, absent in **4**. The 4 absences are
exactly the pre-first-response fires — one for session C, one for session D, two for session A.
**A "present but empty" `rate_limits` was never observed.** The transition is absent → fully
populated, in one step, at the first API response.

Other confirmed properties:

- **Model-independent.** Populated identically on Haiku 4.5 and Sonnet 5. The model does not
  gate it. Test on the account default was not needed once both an explicit small and an
  explicit large model behaved the same.
- **Account-wide, not per-session.** `five_hour.used_percentage` read 14 → 19 over session A's
  lifetime and then 20 on session C's first response — one global counter observed through
  different sessions. This is the right shape for SPEC §2.3's account-level bars.
- **It populates on a Team plan**, not only Pro/Max. The doc claim that this is
  Pro/Max-subscription-only is at minimum incomplete.
- `resets_at` is a **Unix epoch seconds integer**, not an ISO-8601 string:
  `1786897200` = `2026-08-16T16:20:00Z`, `1787061600` = `2026-08-18T14:00:00Z`. Both decode to
  sensible future boundaries.
- `used_percentage` is a **float on a 0–100 scale**, carrying binary floating-point noise
  (`28.000000000000004`). It sometimes serialises as a bare int (`20`), so the parser must
  accept both int and float.

### SPEC impact

- §2.3 stands. The data source exists.
- **Correction — key name.** SPEC says "weekly rate-limit bar". The wire key is **`seven_day`**,
  not `weekly`. Use `seven_day`.
- **Correction — `resets_at` type.** SPEC's `usage_sample` schema (§7) has
  `five_hour_resets_at` / `seven_day_resets_at`; these must be parsed as **epoch seconds**.
- **Correction — the "empty until first API response" limitation in §2.3 is worded wrong.**
  The key is *absent*, never *empty*. Code that does `payload.rate_limits.five_hour` will
  panic/throw rather than read a zero. Treat a missing key as the unknown state.
- **Correction — the "absent entirely on API-key auth" claim is untested here** (this account is
  subscription/Team). UNVERIFIED.
- The float noise means the UI must round before display, and §7's stored samples should keep
  the float rather than truncating to int if the weekly history is to be meaningful.

---

## Q2 — Does `context_window.used_percentage` ever become a number?

**Verdict: CONFIRMED — yes, at the first API response of the session.**

### Method

Started a session, sampled the null baseline, then ran turns and file reads, tracking
`used_percentage`, `current_usage`, `remaining_percentage`, `total_input_tokens`.

### Observed

The null → number transition is the **same event as Q1's**: the first completed API response.
Session A, consecutive fires:

```
13:03:48.702  used%=None  in=0      cur=None   rem=None     <- session start, pre-response
13:04:38.696  used%=19    in=38885  cur={...}  rem=81       <- first API response
```

Populated shape:

```json
"context_window": {
  "context_window_size": 200000,
  "current_usage": {"cache_creation_input_tokens": 15557, "cache_read_input_tokens": 23318,
                    "input_tokens": 10, "output_tokens": 96},
  "remaining_percentage": 81, "total_input_tokens": 38885,
  "total_output_tokens": 96, "used_percentage": 19
}
```

- `used_percentage` is an **integer on a 0–100 scale** (not 0–1, and unlike `rate_limits` not a
  float). `remaining_percentage` is `100 - used_percentage` in every sample.
- The value is `round(total_input_tokens / context_window_size * 100)`, confirmed against three
  distinct samples: 38885/200000 = 19.44 → **19**; 39189/200000 = 19.59 → **20**;
  52537/1000000 = 5.25 → **5**. It tracks the **raw window**, not an auto-compact threshold.
- `current_usage` is the per-request breakdown of the most recent response, not a running total.
  `total_input_tokens` is the running total and is the field the gauge should be derived from.

**`context_window_size` is model-dependent and must not be hardcoded.** Haiku 4.5 reported
`200000`; Sonnet 5 reported **`1000000`**. A gauge that assumes 200k would read 5× high on Sonnet.

**`/compact` resets the gauge to a hard zero.** Immediately after `/compact` completed
(`13:10:47.875Z`), on a session that had been at 20%:

```json
"context_window": {"context_window_size":200000,
  "current_usage":{"cache_creation_input_tokens":0,"cache_read_input_tokens":0,
                   "input_tokens":0,"output_tokens":0},
  "remaining_percentage":100,"total_input_tokens":0,"total_output_tokens":0,
  "used_percentage":0}
```

Note the shape difference that matters for rendering: post-compact, `current_usage` is a
**zero-filled object** and `used_percentage` is the integer **0**. Pre-first-response,
`current_usage` is **null** and `used_percentage` is **null**. These two states look similar in
a UI but are semantically opposite ("genuinely empty" vs "not known yet"), and the payload does
distinguish them cleanly.

`exceeds_200k_tokens` stayed `false` throughout; behaviour above 200k is **UNVERIFIED** — I
could not cheaply drive context that high (Haiku's Read tool deduplicated/truncated repeated
reads of the 672KB `bigfile.txt`, and context never exceeded 20%). Whether it flips at 200k on a
1M-window model, or means something narrower, is unknown.

### SPEC impact

- §2.2 stands; `context_window.used_percentage` is a real per-session gauge.
- **Correction:** the gauge must divide by the payload's own `context_window_size`, or read
  `used_percentage` directly — but §2.2's threshold colouring should be aware that a 1M-window
  Sonnet session at 20% holds 5× the tokens of a 200k Haiku session at 20%. A percentage alone
  is a weaker "time to restart a session" signal than the spec assumes; consider showing
  absolute `total_input_tokens` alongside it.
- **New, for §2.2:** after `/compact` the gauge reads 0%, which will look like a brand-new
  session even though a summary is still loaded. If §2.2's purpose is "know when a fresh session
  is needed", a compaction counter is a more honest companion signal — Muster already sees
  `PreCompact` on the hook side.
- Distinguishing "unknown" (null) from "zero" is required and is possible. This directly answers
  the §9 Q9 requirement for honest unknown rendering.

---

## Q3 — Invocation cadence

**Verdict: CONFIRMED event-driven, with no idle polling. `refreshInterval` semantics: UNVERIFIED.**

### Method

Timestamp deltas across all 37 captures, correlated with what I did to the session. Ran the rig
at `refreshInterval: 1000`, then at `5000`, comparing gap series for identical workloads.

### Observed — what fires

| Trigger | Fires | Evidence |
|---|---|---|
| Session start (post trust-prompt) | 1 | first fire of each of A, C, D |
| Completed turn | 2–5 | session A `say hi` → 2 fires 0.450s apart |
| Streaming assistant output | several | `output_tokens` 3 → 3 → 3 → 650 across 4 fires |
| Permission-mode change (Shift+Tab) | exactly 1 each | 3 presses at 3s intervals → 3 fires at `+3.022s`, `+3.026s` |
| `/compact` completion | exactly 1 | `13:10:47.875Z`, 104s after the previous fire |
| Plain typing into the prompt | **0** | 10 chars typed then 12 backspaces: count stayed at 13 |
| Idle at the prompt | **0** | 40s idle: count stayed at 33. Also 83s, 52s and 104s idle gaps elsewhere, all zero fires |
| `/rename` | **0** | see Q4 |

Minimum observed inter-arrival: **0.313s**, in a burst of 0.313 / 0.322 / 0.318s during
streaming. That is consistent with the ~300ms debounce the brief asked about.

### Observed — `refreshInterval`

The rig set `refreshInterval: 1000`; I re-tested at `5000`. Neither value produced any idle
polling — 40s idle at 5000 gave zero fires, matching 1000. So **`refreshInterval` is not a
wall-clock poll of the status-line command**, at either value.

Nor did it act as a floor on event-driven fires: with `1000` set I measured 0.318s gaps, and
with `5000` set I measured a 0.52s gap on an equivalent streaming turn — both far below the
configured value. A 20-second background `sleep` at `refreshInterval: 5000` produced no
intermediate fires at all (gap series `…, 1.882, 19.802`), so it does not poll during a
long-running tool either.

I could not construct a workload where changing `refreshInterval` changed observed behaviour.
**Its unit and effect are UNVERIFIED**; on the evidence it is inert for this purpose. I did not
spend further time on it (time-box).

### SPEC impact

- §7's `usage_sample` write rate is **bounded by activity, not by a timer**. A fully idle
  dashboard of 6 sessions generates **zero** status-line POSTs. This is much cheaper than a
  polling design would be — good news for the daemon.
- Peak rate is roughly **3 POSTs/second per active session** during streaming. With 6 sessions
  all streaming that is ~18/s. The daemon must debounce before writing to SQLite — writing every
  POST as a `usage_sample` row would be wasteful, since consecutive fires during one turn carry
  identical `rate_limits` and near-identical context numbers.
- **Do not rely on `refreshInterval` to control sample rate.** Muster must do its own throttling
  (e.g. persist a `usage_sample` at most once per N seconds per session, plus always on change
  of `rate_limits`).
- **Consequence for staleness:** because nothing fires while idle, a session parked at the
  prompt for an hour keeps reporting its last-known `rate_limits`. The account-level bars in
  §2.3 will silently go stale. Muster should timestamp each sample and let the UI age it out, or
  take the freshest sample across *all* sessions (they share one account counter, per Q1).

---

## Q4 — Title source: is the status line viable?

**Verdict: CONFIRMED viable, with one caveat — the status line does not fire on `/rename`.**

### Method

Launched with `claude --name "ccc-spike-title-A"`, checked for `session_name`. Then ran
`/rename ccc-renamed-B` and watched subsequent fires.

### Observed

`session_name` **is present in the status-line payload** and was present in **37/37** captured
payloads, including the very first pre-API-response fire at session start:

```
13:03:48.702  name='ccc-spike-title-A'   <- session start, before any API response
```

Sessions C and D likewise carried their `--name` values (`ccc-sonnet-C`, `ccc-refresh-D`) from
their first fire. A name set by `--name` was **never** overwritten by an auto-generated title.

**Without `--name` the behaviour differs in a way that matters.** Cross-checked against the other
spikes' captures rather than re-driving it: the `session_name` **key is absent entirely** at
session start — not null, absent — and only later appears holding an **auto-generated title
derived from session content**. From `captures/capture-3.jsonl`, session `d3724e95`:

```
13:03:40.243  key_present=False                                rate_limits=False  used%=None
13:04:08.785  key_present=False                                rate_limits=True   used%=19
13:05:31.668  key_present=True  'Run echo hello bash command'  rate_limits=True   used%=19
```

Same pattern in `captures/s3/capture-4-q4.jsonl` (`'Add verbose flag to main.go'`). In
`captures/capture-1.jsonl` five short-lived sessions never got a title at all.

Two consequences. First, the auto-title arrives **later than `rate_limits`** — it is not tied to
the first API response, and here it lagged session start by nearly two minutes. A no-`--name`
session therefore has a window of indeterminate length with **no title at all**, and Muster would
have to render something in the meantime. Second, auto-titles are themselves overridable:
in `capture-4-q4.jsonl` the auto-generated `'Add verbose flag to main.go'` was later replaced by
`'add-verbose-flag'`.

`/rename` **does propagate**, but not promptly:

```
13:06:20.006  name='ccc-spike-title-A'   <- fires during/around the /rename
13:06:21.023  name='ccc-spike-title-A'
13:07:13.301  name='ccc-renamed-B'       <- next fire, triggered by an unrelated Shift+Tab
```

The TUI showed `ccc-renamed-B` immediately, but the status line kept reporting the old name
until the next fire caused by something else (a permission-mode change ~52s later). `/rename`
itself does not trigger a status-line invocation.

### SPEC impact

- §2.1 is **not** in doubt as far as the status line is concerned: `session_name` is a real,
  reliable field and the status line is a viable title source. Combined with the hook side
  (another agent's finding), Muster has at least one and possibly two sources.
- **Caveat to design around:** a title changed by `/rename` will not reach Muster until the session
  next does something. On an otherwise idle session that could be indefinite. If §2.1's titles
  must update live, the status line alone is insufficient — Muster needs the hook side, or must
  accept lag.
- **Untested:** whether `session_name` is present when the session is launched *without*
  `--name` and never renamed. Instance 1's baseline suggests it is absent in that case, which
  would mean Muster must handle a missing title. Since §2.5 has Muster launching every session itself,
  Muster can simply always pass `--name` and sidestep this. Recommend it.

---

## Q5 — Confirmed absences and undocumented fields

**Verdict: CONFIRMED — `permission_mode` is genuinely never present.**

### Method

Cycled Shift+Tab through the full mode ring, verifying from the TUI footer that the mode
actually changed, and checked every resulting payload.

### Observed

The ring cycled genuinely: `manual mode on` → `accept edits on` → `plan mode on` → `manual mode
on` → `accept edits on`. Each press produced exactly one status-line fire. Across all 37
payloads, `permission_mode` appears **0 times**, including in payloads captured while plan mode
was active. Diffing a payload from before the mode changes against one from after, the *only*
difference was `cost.total_duration_ms` (142502 → 148550).

Undocumented / notable fields observed beyond the instance-1 baseline:

- **`prompt_id`** (string, UUID) — appears only after the first API response (33/37, exactly the
  same 4 absences as `rate_limits`). Changes per user turn. Useful as a turn identity key.
- **`effort`** → `{"level": "high"}` — **model-conditional**. Present on Sonnet 5 (2/2 fires),
  entirely absent on Haiku 4.5 (0/35). The payload's key set is therefore **not stable across
  models**, which matters for the canary's assertions.
- `fast_mode` (bool), `thinking.enabled` (bool), `output_style.name` (string),
  `exceeds_200k_tokens` (bool) — all present in 37/37, all stable at their defaults here.
- `cost.total_lines_added` / `total_lines_removed` stayed 0; **UNVERIFIED** whether they populate
  on an edit (no edits were made).

### SPEC impact

- **§7's "Planning state | permission mode from hook/status-line payload (`plan`)" is wrong on
  the status-line half.** The status line carries no permission mode. The `Planning` state in
  §2.1 must come from the hook side alone. If the hooks don't carry it either, `Planning` is not
  derivable and §2.1's state list needs revising.
- The canary E2E (§9) must assert the key set **per model**, or treat `effort` as optional.
  Asserting a single fixed key set will produce false failures the moment the model changes.

---

## Complete field inventory

From 37 real payloads across 3 sessions and 2 models. "seen" is out of 37.

| field | seen | nulls | type(s) | notes |
|---|---:|---:|---|---|
| `context_window.context_window_size` | 37 | 0 | int | **model-dependent**: 200000 Haiku, 1000000 Sonnet 5 |
| `context_window.current_usage` | 37 | 4 | object \| **null** | null pre-first-response; zero-filled object post-`/compact` |
| `context_window.current_usage.cache_creation_input_tokens` | 33 | 0 | int | |
| `context_window.current_usage.cache_read_input_tokens` | 33 | 0 | int | |
| `context_window.current_usage.input_tokens` | 33 | 0 | int | |
| `context_window.current_usage.output_tokens` | 33 | 0 | int | |
| `context_window.remaining_percentage` | 37 | 4 | int \| **null** | `100 - used_percentage` |
| `context_window.total_input_tokens` | 37 | 0 | int | running total; 0 pre-response and post-compact |
| `context_window.total_output_tokens` | 37 | 0 | int | |
| `context_window.used_percentage` | 37 | 4 | int \| **null** | **0–100 integer**; `round(total_input/window*100)` |
| `cost.total_api_duration_ms` | 37 | 0 | int | |
| `cost.total_cost_usd` | 37 | 0 | float \| int | serialises as bare `0` when zero |
| `cost.total_duration_ms` | 37 | 0 | int | wall-clock; changes on every fire |
| `cost.total_lines_added` | 37 | 0 | int | stayed 0; population UNVERIFIED |
| `cost.total_lines_removed` | 37 | 0 | int | stayed 0; population UNVERIFIED |
| `cwd` | 37 | 0 | string | |
| `effort.level` | **2** | 0 | string | **Sonnet 5 only**; absent on Haiku 4.5 |
| `exceeds_200k_tokens` | 37 | 0 | bool | never observed true; UNVERIFIED |
| `fast_mode` | 37 | 0 | bool | |
| `model.display_name` | 37 | 0 | string | `"Haiku 4.5"`, `"Sonnet 5"` |
| `model.id` | 37 | 0 | string | `"claude-haiku-4-5-20251001"`, `"claude-sonnet-5"` |
| `output_style.name` | 37 | 0 | string | `"default"` |
| `prompt_id` | 33 | 0 | string (UUID) | **absent pre-first-response** |
| `rate_limits` | 33 | 0 | object | **absent pre-first-response; never empty** |
| `rate_limits.five_hour.resets_at` | 33 | 0 | int | **Unix epoch seconds** |
| `rate_limits.five_hour.used_percentage` | 33 | 0 | float \| int | 0–100, float noise |
| `rate_limits.seven_day.resets_at` | 33 | 0 | int | **Unix epoch seconds** |
| `rate_limits.seven_day.used_percentage` | 33 | 0 | float | 0–100, float noise |
| `session_id` | 37 | 0 | string (UUID) | |
| `session_name` | 37 | 0 | string | present from the first fire when `--name` is passed |
| `thinking.enabled` | 37 | 0 | bool | |
| `transcript_path` | 37 | 0 | string | absolute path under `~/.claude/projects/…` |
| `version` | 37 | 0 | string | `"2.1.233"` |
| `workspace.added_dirs` | 37 | 0 | array | `[]` throughout |
| `workspace.current_dir` | 37 | 0 | string | |
| `workspace.project_dir` | 37 | 0 | string | |

**Never observed, at all:** `permission_mode`, `weekly` (the key is `seven_day`), any per-model
`rate_limits` bucket, any auth-mode indicator.

The four "pre-first-response" absences/nulls are one single state, not four independent ones:
until a session's first API response completes, `rate_limits` and `prompt_id` are absent and
`current_usage` / `used_percentage` / `remaining_percentage` are null. After it, all are present.
A canary can assert exactly that invariant.

---

## SPEC corrections, collected

1. **§2.3** — the weekly bucket's wire key is **`seven_day`**, not `weekly`.
2. **§2.3 / §7** — `resets_at` is **Unix epoch seconds (int)**, not a timestamp string.
3. **§2.3** — "`rate_limits` is empty until the first API response" is wrong: the key is
   **absent**, never empty. Restate the limitation and make the consumer null-safe on the key.
4. **§2.3** — `rate_limits` populates on a **Team** plan, so the "Pro/Max subscription only"
   framing is at least incomplete. The API-key case remains UNVERIFIED.
5. **§2.2** — the context gauge must use the payload's own `context_window_size` (200k on Haiku,
   **1M on Sonnet 5**), or read `used_percentage` directly. Never hardcode 200000.
6. **§2.2** — `/compact` resets the gauge to a true 0%, so percentage alone is a poor "restart
   this session" signal. Pair it with a compaction count or absolute token total.
7. **§7 table** — "Planning state | permission mode from hook/**status-line** payload" is wrong
   on the status-line half. The status line has no `permission_mode`. `Planning` must be derived
   from hooks or dropped.
8. **§7** — status-line invocations are event-driven with **no idle polling**; peak ~3/s per
   active session, zero when idle. `refreshInterval` does **not** control this — Muster must
   throttle `usage_sample` writes itself.
9. **§2.3** — because nothing fires while idle, account-level bars go stale on an idle
   dashboard. Timestamp samples and prefer the freshest across all sessions (the counter is
   account-wide, confirmed).
10. **§2.1** — the status line **is** a viable title source (`session_name`, present from the
    first fire), but `/rename` does not trigger a fire, so title updates lag until the session
    next does something.
11. **§9 canary** — assert the key set **per model**: `effort` is present on Sonnet 5 and absent
    on Haiku 4.5.

---

## Open / unverified

- `exceeds_200k_tokens` never went true. Its exact trigger on a 1M-window model is unknown.
- `cost.total_lines_added` / `total_lines_removed` population on an actual edit.
- `rate_limits` behaviour under API-key auth (SPEC's claimed absence) — not testable on this
  account.
- `session_name` presence when a session is launched with no `--name` and never renamed.
  Recommendation: have Muster always pass `--name` (§2.5 launches every session anyway).
- `refreshInterval` unit and effect — no workload found where changing it changed behaviour.

## Teardown

`tmux -L ccc-spike-2 kill-server` run; capture server on 8782 stopped; no orphan `claude`
processes left from this spike. `~/.claude/` untouched throughout (md5 verified at end).
`instances/2/repo/.claude/settings.json` left with `refreshInterval` restored to `1000` as the
rig generates it. `instances/2/repo/bigfile.txt` (672KB of generated filler) left in place.
