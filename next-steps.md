# Muster — next steps (session plan)

Agreed after the spec session (2026-08-16). Each item is roughly one future session.
`SPEC.md` is the authoritative spec; `interview-notes.md` has rationale.

## 1. Spikes / validation — ✅ DONE 2026-08-16 (see `spikes/FINDINGS.md`)

Verdict: **GO**, with corrections applied to SPEC.md §11 changelog. Pin candidate confirmed
as **2.1.233**. Remaining gaps are listed at the end of `spikes/FINDINGS.md`. ~~Two are worth
closing before M1's state machine is finalised: whether `Stop` fires alongside `StopFailure`,
and `--resume` behaviour (which shapes reconcile).~~ Both were closed by the H2 probe on
2026-08-16 (see H2 below).

**Corrected 2026-08-16:** this previously listed "the multi-client sizing matrix (before M2)"
as an open gap. It is not — `spikes/FINDINGS.md` §7 records the full `shared`/`perclient` ×
`window-size` matrix, and SPEC §9.5 marks it resolved.

<details><summary>Original scope</summary>

De-risk SPEC.md open questions 3–5 and the load-bearing assumptions, against the real
Claude Code install (note its version — it becomes the pin candidate):
- Status line: confirm the stdin JSON actually carries `rate_limits.five_hour` /
  `seven_day`, `context_window.used_percentage`, `model`; ~10-line script POSTs it.
- HTTP hooks: register via `allowedHttpHookUrls`, capture real payloads for
  `SessionStart`, `Stop`, `Notification` (permission_prompt / idle_prompt).
- Failed-state: force an API-error turn end; see how it presents in hooks/transcript.
- Plan-mode detection: confirm permission mode is visible in hook/status-line payloads.
- Terminal bridge PoC: `claude` in tmux → PTY attach → WebSocket → xterm.js in a bare
  HTML page; typing works; resize behavior observed.
</details>

## 2. Setup — ✅ DONE 2026-08-16
- ~~Decide the name~~ — ✅ **Muster**. Repo `muster`, module `github.com/Zalaras/muster`,
  daemon binary `musterd`. Rationale and rejected candidates in `interview-notes.md`.
- ~~Create private GitHub repo; layout~~ — ✅ `cmd/musterd/`, `web/`, `internal/claudecode/`.
  Layout amended from SPEC §5's `musterd/`-at-root; SPEC updated to match.
- ~~Go toolchain~~ — ✅ Go 1.26.6, golangci-lint v2 config, testify.
- ~~Frontend stack decision~~ — ✅ Vite + TypeScript, **no framework**. Node pinned to
  24.19.0 via `.nvmrc`. xterm.js pinned to the versions S4 validated (6.0.0 / addon-fit 0.11.0).
- ~~Playwright E2E scaffold; canary E2E skeleton~~ — ✅ smoke test passes; canary asserts
  the version pin for real, field assertions skipped until the M4 harness.
- ~~Pin Claude Code version~~ — ✅ **but auto-update deliberately left ON.** There is one
  global `claude` binary, so freezing it would freeze all of Damian's work. Muster detects
  drift at daemon startup instead. Ritual in `docs/claude-code-pin.md`.
- ~~Backlog~~ — ✅ `TODO.md`.

## 3. AI harness — base ✅ DONE 2026-08-16; H1 ✅ built 2026-08-16; H2 ✅ DONE 2026-08-16

- ✅ `CLAUDE.md` (lean, per Anthropic/Cherny guidance: laws + commands + doc authority
  order, nothing Claude can infer from code).
- ✅ Project `.claude/settings.json`: permission allow-list (make/go/npm/git/jq;
  tmux **only** via `-L muster`), no deny rules by choice. context7 MCP via `.mcp.json`.
- ✅ Stack patterns chosen with Damian so agents never invent them mid-pipeline:
  stdlib `net/http`, `coder/websocket`, zerolog, `database/sql` + hand-written SQL.
  Recorded in SPEC §5 + changelog; code patterns in `docs/conventions.md`.
- ~~Decided: no custom agents for now~~ — **superseded the same day**: Damian wants an
  mdrostering-style multi-agent pipeline (see H1).

### H1 — multi-agent pipeline — ✅ BUILT 2026-08-16 (acceptance pending M0)

All of the below is implemented: skills `spec`/`plan-work`/`orchestrate`/`work-status`
plus six thin per-agent wrappers in `.claude/skills/`, agents in `.claude/agents/`,
Vitest wired (`make web-test`, `web/vitest.config.ts`, gate live via `passWithNoTests`
until the first logic module), Playwright moved to per-run ports with
`reuseExistingServer: false`, CLAUDE.md gained the workflow section, and MDR's changelog
backstop became the doc-upkeep backstop in `/orchestrate`. **Acceptance remains open by
design:** M0's first slice must run through `/plan-work` + `/orchestrate` end to end.

<details><summary>Original scope (all done)</summary>

Adapt the pipeline from `~/Documents/code/company/mdrostering/.claude/` (skills `spec`,
`plan-work`, `orchestrate`, `work-status`; the six worker agents) — **adapt, don't copy**;
it is the template, not the product. Muster-shape decisions, all settled 2026-08-16:

- Tracks are **`daemon`** (Go) and **`web`** (TS); work types `daemon`/`web`/`full-stack`.
  Agents: `daemon-impl`, `daemon-tests`, `web-impl`, `web-tests`, `e2e-specs`,
  `review-work`. Keep verdicts, fix waves, `plans/<name>/` coordination,
  `orchestration-state.json` resume, and the agent boundaries (impl never edits tests;
  evidence, not assertion; every agent leaves the tree compiling).
- **Models: Sonnet workers, Opus review**; orchestrator/spec/plan-work are main-session
  skills (a subagent can't spawn subagents or hold a conversation).
- The shared contract letting tracks run parallel is the **daemon↔UI protocol**
  (`docs/protocol.md`, born in M0 planning) — same role as MDR's plan.md API contracts;
  same rule: no agent changes the contract unilaterally.
- Gates: `go build ./...`, `make test`, `golangci-lint run` / `npm run build`,
  `npm test` (Vitest — **added in H1**), `npm run e2e`. E2E uses ephemeral ports from
  day one (avoid MDR's stale-server port trap).
- `review-work`'s checklist = CLAUDE.md hard rules (adapter-boundary leaks, ANSI state
  parsing, blocking hook handlers, bare tmux, `resize-pane`, payload logging,
  empty-gauge dishonesty) + generic Go/TS quality. Design-system section is a
  placeholder until next-steps item 4 produces one.
- E2E fakes Claude Code by default (synthesized hook/status-line POSTs from spike
  captures); real `claude` only in canary/probes, haiku-only.
- MDR's changelog backstop becomes a **doc-upkeep backstop** (TODO ticks, SPEC
  changelog, canary-fields) before a plan may be marked completed.
- Skip entirely: `jira-ticket`, `pg-migration`, `ses-verify`, `ssm-debug`, UPDATES.md.
- H1 also adds the workflow section to `CLAUDE.md`. **Acceptance:** M0 is the shakedown —
  its first slice goes through `/plan-work` + `/orchestrate` end to end.
</details>

### H2 — `interface-probe` skill — ✅ DONE 2026-08-16

Rig ported to `test/rig/` (`newprobe.sh` + `capture/` + `failproxy/`), encoded as the
`/interface-probe` skill; `spikes/RIG.md` marked historical. One deliberate change from
the ccc-spike layout: instances stamp into `/tmp/muster-probe` (not the repo tree),
because Claude Code loads CLAUDE.md from every parent directory and an in-repo scratch
repo contaminated the first probe session with Muster's instructions.

**Acceptance passed**, plus a bonus probe while the rig was warm (evidence:
`test/rig/captures/capture-1.jsonl`, SPEC §11 H2 changelog entry):

- **Stop-vs-StopFailure: mutually exclusive per prompt** — verified across startup,
  first-API-call and genuinely mid-turn failures, with success controls. Caveat: a killed
  session emits *neither* (only `SessionEnd`). The M1 state machine is unblocked.
- **`--resume`: `SessionStart` fires with `source: "resume"` and the same
  `session_id`/`transcript_path`** — the M4 reconcile design is unblocked too.
- New wire facts recorded in `spikes/canary-fields.md` (taxonomy `"unknown"`, 500-retry
  behaviour, headless hook coverage).

- A dev-loop/run skill is deliberately deferred into M0's definition of done — there is
  nothing to run until the daemon exists.

## 4. Design — ✅ DONE 2026-08-16 (UX flows + visual direction A, Focus & Tiles peer views)

- ✅ **UX flows** → `docs/design/ux-flows.md`. Settles SPEC §9 Q2 (launch/worktree data
  layer) plus the launch form, trust-prompt handling, dashboard layout, rail sort order
  and the degraded/honest states. SPEC §11 carries the changelog entry.
  - Directory memory: **hybrid MRU + promotion**. Worktrees: **recognized, never created**
    in v1. Layout: **rail + one focused live pane** (the sizing constraint demands exactly
    one live client per session). Launch form: directory + title + model + starting
    permission mode.
- ✅ **Visual direction**: **A, "instrument"** (`docs/design/mockups/a-instrument.html`) —
  dark, dense, mono metadata, state as a coloured rail stripe. `b-editorial.html` and
  `c-terminal.html` are kept as rejected alternatives. Written up as
  `docs/design/design-system.md` and wired into `review-work`'s checklist (placeholder
  gone). Sub-decisions: **system font stacks only** (no web fonts, no vendored binaries —
  localhost app, small dep tree) and the **attention ribbon deferred post-v1** (needs a
  state-history query + timeline renderer for a signal time-in-state already mostly
  carries; `event` covers it later with no schema change).
- ✅ **Two peer views, both part of A**: **Focus** (`a-instrument.html`) and **Tiles**
  (`d-tiled.html`), switched from the masthead or **⌘\\**, with the choice persisted. Same
  masthead, state colours, ordering and degraded states in both. Tiles: live tiles = top N
  by attention, rest are snapshot cards, 2×2 / 3×2 density changing tile geometry.
  Only the *build order* differs — Focus in M1, Tiles in M2 with the PTY bridge; M1 must
  still lay out the switcher slot so adding the second view moves nothing.
- Reference material: `session-manager-mockup.html` (superseded — its tabbed views and
  lead-session chat panel are dropped; the aesthetic survives in direction A; file deleted
  2026-09-04).
- Must land before M1/M2 UI work, not before M0.

## 5. Build M0 → M4 per SPEC §10
- Early in M0: write down the daemon↔UI protocol (WS message contract, HTTP endpoints)
  and the state-machine transitions precisely.

## 6. (last) `claude-code-upgrade` skill
- Thin `/claude-code-upgrade` wrapper over the ritual in `docs/claude-code-pin.md`
  (canary → bump `PinnedVersion` → update README + canary-fields header → commit).
- Deliberately deferred to last: the doc alone suffices until upgrades become routine.
