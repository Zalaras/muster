> Spike 2026-09-13 for the **Markdown viewing** item in `TODO.md` § Pre-v1 Cleanup. **Nothing
> here is decided** — it settles what is *possible* and what it costs, so `/plan-work` can
> choose. Read this before planning that item; the measured wire fact it rests on is
> `kb:fact/plan-file-path-in-transcript`, which wins over the narrative here. Prototype code
> is on branch `spike/markdown-viewing` (worktree `../muster-spike-markdown`), not for landing.

# Markdown viewing — spike findings

The item asks for two things: render **a session's markdown files** in the dashboard, and
render **the plan a Claude Code session is working from**. The second is the hard question —
Muster has never known where a plan lives — so most of this spike is about that. Measured
against **Claude Code 2.1.270** by reading the installed bundle, scanning every transcript on
this machine (281 files, 176.6 MB), and running two renderer prototypes. No real Claude
session was launched; nothing in `~/.claude/settings.json` was touched or read.

## Verdict

**Feasible, cheap, and testable without a real Claude.** The plan's path is derivable from
the `transcript_path` every hook already carries (39 of 39 plan-mode sessions on this
machine resolve; the whole corpus scans in under half a second). Rendering costs about
24 kB gzip in the browser or 150 kB in the binary, and the change signal — a `PostToolUse`
`Write` on the plan path — is already on the wire. Four decisions remain for `/plan-work`
(§ 9).

## 1. Where a plan lives

Read out of the 2.1.270 bundle (`/Users/bob/.local/share/claude/versions/2.1.270`):

```js
// settings schema
plansDirectory: o().optional().describe("Custom directory for plan files, relative to project root. If not set, defaults to ~/.claude/plans/")

// plans directory resolution: plansDirectory must sit under the project root, else error + default
#t(){let e=ze().plansDirectory;if(e){let i=Z(),r=L(i,e);if(pe(r,i))return r;
  t(`plansDirectory must be within project root: ${e}`,{level:"error"})}return P()}

// the file names
function Ly(n){let e=X(),i=E$(e);if(Tm().markPlanPathServed(e),!n)return d(Ba(),`${i}.md`);return d(Ba(),`${i}-agent-${n}.md`)}
function oce(){let n=E$(X());return d(Ba(),`${n}.workshop.md`)}
```

So a session's plan is **`<plansDir>/<slug>.md`**, where `plansDir` is `settings.plansDirectory`
resolved under the project root (must stay inside it) or `~/.claude/plans`, and `slug` is a
per-session value (`getPlanSlug(sessionId)`) minted from the first prompt's words plus two
random words (`say-hi-golden-finch`, `bring-over-retro-land-glimmering-cake`). Subagents get
**`<slug>-agent-<agentName>.md`** and there is a **`<slug>.workshop.md`** sibling. The 32 files
in `~/.claude/plans/` on this machine all match those three patterns; the largest is 52.6 kB.

**Trap:** the slug is *not* on any hook payload (`kb:fact/hook-payload-fields`), not in
`~/.claude/sessions/<pid>.json` (which has pid, sessionId, cwd, name, status — no slug), and
not derivable from `session_id`. The transcript is the only place it is recorded.

## 2. How a session maps to its plan — the transcript

Every hook carries `transcript_path`. Two things in that JSONL name the plan:

- **`slug`** — a top-level field on every `user`/`assistant`/`attachment`/`system` line
  written *after* the slug is minted. It is absent on earlier lines (in four sampled
  transcripts the first slug line was 1–7 lines before the first plan-mode reminder) and on
  the bookkeeping line types (`mode`, `permission-mode`, `cost-state`, `file-history-*`,
  `last-prompt`, `atis-latch`, `bridge-session`, `ai-title`).
- **`attachment.planFilePath`** — the resolved absolute path, on three attachment types:

  ```json
  {"type":"attachment","attachment":{"type":"plan_mode","reminderType":"full","isSubAgent":false,
   "planFilePath":"/Users/bob/.claude/plans/say-hi-golden-finch.md","planExists":false}, …}
  ```

  | `attachment.type`   | lines in corpus | when |
  |---|---|---|
  | `plan_mode`         | 36 | the system reminder on entering plan mode |
  | `plan_mode_exit`    | 34 | on leaving plan mode |
  | `plan_mode_reentry` | 1  | re-entering |

  `planFilePath` is the authoritative form — it already honours `plansDirectory` — and
  `planExists` says whether Claude has written anything yet. Seven transcripts had a
  `plan_mode_exit` line but no `plan_mode` one, so a locator must accept **any** attachment
  carrying `planFilePath`, not just the reminder.

**Census (prototype `internal/claudecode/plan.go` + `spikes/markdown-viewing/planscan`):**

```
transcripts=281 bytes=176.6MB with_plan=39 (by_slug_only=0) plan_file_exists=28
total_scan=268ms slowest=15ms (924eff72-….jsonl, 5.3MB)
```

39 sessions entered plan mode; all 39 resolve via `planFilePath`; 28 of the 39 files exist
(the other 11 are sessions that entered plan mode and wrote nothing — canary runs and quick
looks). The scan decodes only lines containing `"planFilePath"` or `"slug"` and skips the rest
on raw bytes, so the 5.3 MB transcript costs 15–20 ms. That is cheap enough to run on demand
when the viewer opens, and on the `ExitPlanMode` hook (`kb:fact/plan-mode-hook-sequence`) as the
natural "the plan is ready" moment — it does **not** need to run on every hook.

**What Muster has to start keeping:** the current session row persists nothing from
`transcript_path` (`internal/store/migrations/0002_sessions.sql`; `Interpret` reads only
`permission_mode`/`agent_id` off tool hooks). The feature needs the latest `transcript_path`
per session, in memory or as a column. Note `/clear` mints a new transcript with the old
session's plan gone (`kb:fact/clear-mints-new-session-id`), so "latest" matters.

## 3. When the plan changes

Across the corpus Claude wrote plans with the **`Write` tool 49 times and `Edit` 0 times**
(`"name":"Write","input":{"file_path":"/Users/bob/.claude/plans/…"}` in `assistant`
lines) — consistent with the reminder's "build your plan incrementally by writing to or
editing this file". A `PostToolUse` hook carries `tool_input.file_path` for `Write`
(measured on the wire: `test/rig/captures/capture-1.jsonl`, `"tool_name":"Write"` with
`"tool_input":{"file_path":"…/repo/notes.txt"}`), so the daemon can broadcast "plan changed"
the moment a write lands, with **no filesystem watcher and no new dependency**. Handle
`Edit`/`MultiEdit` the same way even though they were not observed. A subagent's plan
(`-agent-` file) arrives on hooks marked `agent_id` (`kb:fact/subagent-hooks-carry-agent-id`).

## 4. Rendering — two candidates, both measured

Baseline: dashboard JS 409.73 kB (106.42 kB gzip), `musterd` 20,782,112 bytes.

| | **Browser: marked 18.0.13 + DOMPurify 3.4.15** | **Daemon: goldmark v1.8.6 + bluemonday v1.0.27** |
|---|---|---|
| Size cost | +71.8 kB JS, **+23.6 kB gzip** (481.54 / 130.06 kB) | **+153 kB** binary (20,935,440) |
| 52.6 kB plan (largest on disk) | 24 ms parse + 25 ms sanitize+insert, 1,878 nodes | 2.9 ms render + 2.1 ms sanitize (then the UI still sets `innerHTML`) |
| `<script>`, `onerror=`, `javascript:` href | all stripped (DOMPurify `removed` = 2; `<a>` keeps text, loses href) | stripped; goldmark drops `javascript:` links itself |
| GFM tables, `<details>` | rendered / kept | rendered / kept |
| `- [ ] task` | `<input disabled type="checkbox">` **kept** | `<li> task</li>` — bluemonday's UGC policy **strips the checkbox**; needs policy work |
| Trust boundary | daemon hands raw markdown (same shape as the issue preview, `kb:adr/issue-preview-is-the-leak-check`); sanitization runs where the DOM is | daemon hands HTML the UI must trust; two sanitizers to keep in agreement if the browser also cleans |
| Deps | two pinned npm deps (`docs/conventions.md` pins xterm the same way) | two Go modules, cgo-free (fine for `kb:adr/release-builds-cross-compiled-on-linux`) |

Both are viable. The browser route is the recommendation to start the debate from: it
keeps the daemon Claude-format-only, matches the existing "daemon hands markdown, UI shows
it" pattern, and gets task lists right out of the box; 50 ms for the largest plan ever
written here is imperceptible. Either way the choice is an ADR (`stack-…`), and the deps
get pinned exactly like xterm.

**Sanitizer is not optional.** 23 of the 32 plan files contain angle-bracket tokens
(placeholders like `<name>`, quoted `<system-reminder>` text) and the plan is written by the
model from whatever it read, including files from the repo being worked on. Both
prototypes treat the plan as untrusted; the feature must too.

## 5. "A session's markdown files" — unmeasured, design only

The item's first half. Candidates for what the picker lists, cheapest first:

1. the plan (§ 2) — always first, labelled, with `planExists:false` rendered as "no plan yet";
2. tracked + untracked markdown in the session's directory:
   `git ls-files -co --exclude-standard -- '*.md'` (`kb:adr/stack-git-and-gh-clis-not-go-git`),
   bounded walk when the directory is not a git checkout;
3. Muster's own pipeline plan, `plans/<name>/plan.md`, is just a special case of 2.

Nothing here needed measuring; it is a `/plan-work` choice of scope.

## 6. Wire and confinement — proposed shape, not a contract

- `Session.plan: { path, exists } | null` on the session object, refreshed on
  `ExitPlanMode`, `SessionStart` (resume/clear) and any `Write` hitting the path — additive,
  no protocol bump (`kb:adr/connection-protocol-bumps-only-on-shape-change`).
- `GET /api/sessions/{id}/files` → the list from § 5; `GET /api/sessions/{id}/file?path=`
  → raw bytes as `text/markdown`, size-capped.
- **Confinement:** serve only a path that, after `filepath.EvalSymlinks`, sits under the
  session's `directory` or equals the derived plan path. Never an arbitrary absolute path —
  this would otherwise be a LAN-reachable file-read primitive behind the UI cookie.
  (`GET /api/browse` today lists any directory; that looseness should not be copied for
  file *contents*.)
- A `planChanged`/`fileChanged` WS message, or fold it into the `sessionUpsert` the write
  already triggers.

## 7. UI placement

Two natural homes; pick at `/plan-work`:

- a third segment in the `claude | shell` surface switch (`SurfaceKind` in
  `web/src/terminal/surfaceswitch.ts`, rendered in the mainhead and every tile footer) —
  the plan sits where the terminal does, one click away, keyboard-addressable;
- a drawer/dialog with a file picker, so "any markdown file" and "the plan" share one
  surface without touching the segment control.

The plan-approval flow (SPEC § 3.1) will want the same rendered plan next to an
approve/reject control, so whichever home is chosen should leave room for buttons.

## 8. Testability

The E2E fixtures already fake Claude with synthesized hook posts whose `transcript_path`
is `/tmp/t.jsonl` (`web/e2e/helpers/payloads.ts`). A spec can write a two-line fake
transcript (one `plan_mode` attachment line, optional `slug`), a plan file beside it, and
post a `PostToolUse` `Write` to prove the change signal — no real Claude, no subscription
burn. The daemon side is a pure function over a reader (`scanPlanFile`) and unit-tests
against captured lines. `kb:fact/plan-file-path-in-transcript` has `guard: none` until that
test exists; the canary's plan-mode run (`TestPlanModeSequence`) is where a live
transcript assertion would attach.

## 9. Decisions for `/plan-work`

1. **Renderer side** — browser (recommended) or daemon (§ 4). Either is an ADR.
2. **Where the viewer lives** — surface segment or drawer (§ 7).
3. **Scope of "a session's markdown files"** — plan only, plan + repo markdown, or with a
   picker (§ 5).
4. **Change signal** — `Write` hook only (measured), or also a bounded mtime poll while the
   viewer is open, for edits made outside Claude.

## 10. Lead checked and closed: no inter-process plan approval

The bundle read turned up typed `plan_approval_request` / `plan_approval_response` messages and an
inter-session peer socket (`/tmp/cc-socks/<pid>.sock`, `messagingSocketPath` in
`~/.claude/sessions/<pid>.json`), which looked like a route to SPEC § 3.1 "plan approval from the
dashboard" without the `PermissionRequest` race. Probed statically the same day
(`kb:fact/plan-approval-request-teammate-only`): the request is built only when `ExitPlanMode`
runs inside a **teammate agent spawned with plan mode required**, and it goes into the team
lead's file inbox (`~/.claude/teams/<team>/inboxes/<agent>.json`) for another Claude session to
answer. A top-level session takes the local dialog branch, so nothing crosses a process
boundary for Muster to catch. On disk: 15 inbox files, none with a plan approval; 51
`ExitPlanMode` calls, all top-level. Dashboard plan approval still rests on
`kb:fact/permission-request-races-terminal-prompt`.

## Limitations

- The bundle read is 2.1.268–2.1.270 (all three on disk, identical strings); the transcript
  shape held across every version that wrote a plan-mode transcript here, 2.1.233–2.1.270.
  These are unversioned internals, so the fact record's guard test is what will catch a
  rename. The fact's range stops at 2.1.269 because that is the canary ceiling
  (`internal/claudecode/observed_versions.txt`), not because 2.1.270 differs.
- No `plansDirectory` override was observed — the resolution rule is read from code, not
  measured with a project that sets it.
- `Edit` on a plan file was never observed; § 3's "handle it the same way" is inference.
- The bundle greps were manual; the static canary tier (`kb:adr/canary-static-tier-asserts-bundle-strings`)
  could pin `planFilePath`, `plansDirectory` and `-agent-` as interface strings.
