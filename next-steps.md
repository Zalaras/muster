# Muster — next steps (session plan)

Agreed after the spec session (2026-08-16). Each item is roughly one future session.
`SPEC.md` is the authoritative spec; `interview-notes.md` has rationale.

## 1. Spikes / validation — ✅ DONE 2026-08-16 (see `spikes/FINDINGS.md`)

Verdict: **GO**, with corrections applied to SPEC.md §11 changelog. Pin candidate confirmed
as **2.1.233**. Remaining gaps are listed at the end of `spikes/FINDINGS.md`. Two are worth
closing before M1's state machine is finalised: whether `Stop` fires alongside `StopFailure`,
and `--resume` behaviour (which shapes reconcile).

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

## 3. AI harness
- Agents, skills, CLAUDE.md, README, settings (MCP allow-list, permissions).
- After setup so CLAUDE.md/skills describe real conventions and real commands.

## 4. Design (can overlap with M0)
- UX flows first: the new-session flow and the worktree data layer (SPEC open
  question #2 — the one genuinely unsettled area), then visual design.
- Reference material: `session-manager-mockup.html` (aesthetic starting point; feature
  content superseded by SPEC).
- Must land before M1/M2 UI work, not before M0.

## 5. Build M0 → M4 per SPEC §10
- Early in M0: write down the daemon↔UI protocol (WS message contract, HTTP endpoints)
  and the state-machine transitions precisely.
