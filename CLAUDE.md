# Muster

Go daemon (`musterd`) + web dashboard (Vite + TypeScript, **no framework**) that manages
Claude Code sessions running in tmux. Personal tool for Damian, macOS only, single user.

## Documents — authority order

1. `SPEC.md` — authoritative. Decisions there (and rejected options in
   `interview-notes.md`) are settled; don't re-litigate them, and don't reintroduce cut
   features (notifications, cost tracking, containers, resource gauges).
2. `spikes/FINDINGS.md` + `spikes/canary-fields.md` — **measured** wire-format facts,
   against Claude Code 2.1.233. Where they contradict Claude Code's official docs, the
   measurements win — the docs have already been wrong (e.g. `SessionStart` over HTTP).
3. `docs/conventions.md` — settled code patterns (HTTP/WS/logging/DB choices, Go and TS
   conventions, testing rules). Follow it; change it there first if it must change.
4. `TODO.md` — execution backlog. `next-steps.md` — session-by-session plan.

## Commands

- `make help` lists everything: `build`, `check` (lint + unit), `web-test`, `e2e`,
  `canary`, `web`.
- Frontend: `nvm use` in the repo root first (Node pinned 24.19.0); then work in `web/`.

## Workflow — the build pipeline

Feature work goes through the multi-agent pipeline, not ad-hoc editing:

1. `/spec <name> "<desc>"` — optional requirements interview → `plans/<name>/spec.md`.
2. `/plan-work <name>` — interactive plan with protocol-contract delta, Testable UI
   Elements, and an Automated Checks block → `plans/<name>/plan.md`. User approves.
3. `/orchestrate <name>` — runs e2e-specs (authoring) → daemon-impl ∥ web-impl →
   daemon-tests ∥ web-tests → e2e-validate → review-work (Opus), with fix waves and
   `orchestration-state.json` resume. Only a review verdict of `approved` completes it.
4. `/work-status [name]` — where things stand.

Boundaries the pipeline enforces (also binding outside it): impl agents never edit
tests; test agents never edit implementation; nobody changes the daemon↔UI protocol
(`docs/protocol.md` / a plan's Protocol Contract) unilaterally; every agent leaves the
tree compiling; claims need evidence (paste the failing output, don't assert).
Trivial fixes and doc work don't need the pipeline — judgement call, default to it for
anything with acceptance criteria.

## Hard rules

- All Claude-Code-format knowledge (hook payloads, status-line JSON, CLI flags,
  transcript paths) lives in `internal/claudecode/` — never let it leak into other
  packages. If a fix wants to leak outward, the boundary is being violated.
- NEVER derive session state by parsing terminal output — hooks and status line only.
  tmux `capture-pane` is a test oracle and display source, never a state source.
- Hook delivery is best-effort, at-most-once, unordered, and carries no timestamps:
  design for loss, assign `seq` at ingest, return 200 immediately and process
  asynchronously, use 1–2 s hook timeouts (never 5).
- Session identity keys on the tmux target, never Claude's `session_id` (`/clear` mints
  a new one in the same pane).
- tmux ALWAYS via a dedicated socket (`tmux -L muster`, or a per-test socket) — never
  the user's default server. Sizing: `pty.Setsize` **and** `resize-window`;
  `resize-pane` exits 0 and silently no-ops on single-pane windows.
- NEVER read or modify `~/.claude/settings.json` / `settings.local.json` — Damian's
  live sessions depend on them. Isolation is always a project-scoped
  `.claude/settings.json` in a scratch repo. `CLAUDE_CONFIG_DIR` breaks subscription
  OAuth — do not use it.
- Any test or spike that launches a real `claude` burns Damian's real subscription:
  always pass `--model claude-haiku-4-5-20251001`, keep prompts trivial ("say hi"), and
  kill the session when done — an orphan keeps burning.
- Never log hook payloads (they contain prompt text) anywhere world-readable.

## Testing bar

Functional E2E always (real daemon, scratch repo); unit tests for specific logic (state
machine, reconcile, JSON merge). `make canary` gates any Claude Code version bump — the
ritual is `docs/claude-code-pin.md`.

## Doc upkeep (end of every session)

- Work item finished → tick it in `TODO.md`.
- Decision changed or settled → `SPEC.md` changelog entry.
- New wire-format fact learned → `spikes/canary-fields.md` (and `spikes/FINDINGS.md`
  if substantive).
