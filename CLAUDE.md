# Muster

Go daemon (`musterd`) + web dashboard (Vite + TypeScript, **no framework**) that manages
Claude Code sessions running in tmux. Personal tool for Damian, macOS only, single user.

## Knowledge — records, read through `kb`

Project truth is typed records under `docs/`, found with `go run ./tools/kb` — never by
browsing: `docs/adr/` (decisions; `accepted` binds, `proposed` is a plan's not-yet-landed
choice, `superseded`/`rejected` are history — don't re-litigate them or reintroduce cut
features), `docs/facts/` (**measured** Claude Code facts with the versions they hold on; they
beat Claude Code's official docs, which have been wrong), `docs/lessons/` (retro learnings,
per role), `docs/runbooks/`, `docs/features/<name>/` (one folder per feature; its `spec.md`
frontmatter is the registry), `docs/protocol.md` (the daemon↔UI contract, stable anchors) and
`docs/conventions.md` (settled code patterns — change it there first). `SPEC.md` is the
product spec; where an accepted ADR and SPEC prose disagree, the ADR is newer and wins. Every
`INDEX.md`, `contract.md`, `.claude/rules/*.md` and CLAUDE.md trailer marked GENERATED comes
from `make gen-kb` — never edit one. Start with `kb for <path>` (what governs a file) or
`kb pack --plan <name> --role <role>` (what a pipeline role needs); cite records as
`kb:<type>/<slug>`. `TODO.md` is the backlog; `docs/history/` is how things got here, never
current state.

## Commands

- `make help` lists everything: `build`, `check` (lint + unit + `refs` + `check-kb`), `web-test`,
  `e2e`, `canary`, `web`.
- Frontend: `nvm use` in the repo root first (Node pinned 24.21.0); then work in `web/`.

## Workflow — the build pipeline

Feature work goes through the multi-agent pipeline, not ad-hoc editing:

1. `/spec <name> "<desc>"` — optional requirements interview → `plans/<name>/spec.md`.
2. `/plan-work <name>` — interactive plan with protocol-contract delta, Testable UI
   Elements, and an Automated Checks block → `plans/<name>/plan.md`. User approves.
3. `/orchestrate <name>` — runs e2e-specs (authoring) → daemon-impl ∥ web-impl →
   daemon-tests ∥ web-tests → e2e-validate → review-work (Opus), with fix waves and
   `orchestration-state.json` resume. Only a review verdict of `approved` completes it.
4. `/work-status [name]` — where things stand.
5. `/triage [N|--all|--audit]` — pulls open GitHub issues into `TODO.md` and audits the
   two lists. An issue is triaged iff its `issues/N` link is in `TODO.md` or
   `docs/history/todo-done.md`; triage never closes an issue, and commits its `TODO.md` edit
   (`docs(triage): …`, no push).
6. `/land <name>` — squash-merges the approved `plan/<name>` branch to `main` with a
   conventional subject carrying `closes #N`, pushes (cutting a release, which closes the
   issues), and deletes the branch.
7. `/retro <name>` — run in the session that ran `/orchestrate`, once it completes: names
   what the run cost and proposes the smallest pipeline-doc change (net ≤ 0 lines) that
   would have prevented it, or says nothing needs changing. Commits on `main` (`docs(retro)`).

Boundaries the pipeline enforces (also binding outside it): impl agents never edit
tests; test agents never edit implementation; nobody changes the daemon↔UI protocol
(`docs/protocol.md` / a plan's Protocol Contract; `docs/features/*/contract.md` is generated
from it by `make gen-kb`, never edited) unilaterally; every agent leaves the
tree compiling; claims need evidence (paste the failing output, don't assert) — and
claimed *effects* need measurement (the `ls -l` or the observed DOM, not the diff). A
`blocked`/`implementation-bug` verdict naming a real obstacle is a good outcome; the failure is
a green verdict hiding one. Never `sleep`/poll to wait on a subagent — the harness wakes only
the **main session**, so agents run gates in the foreground (kb:lesson/subagent-never-woken-by-harness).

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
  `resize-pane` exits 0 and silently no-ops on single-pane windows (kb:lesson/resize-pane-silent-noop).
- NEVER read or modify `~/.claude/settings.json` / `settings.local.json` — Damian's
  live sessions depend on them. Isolation is always a project-scoped
  `.claude/settings.json` in a scratch repo. `CLAUDE_CONFIG_DIR` breaks subscription
  OAuth — do not use it.
- Any test or spike that launches a real `claude` burns Damian's real subscription:
  always pass `--model claude-haiku-4-5-20251001`, keep prompts trivial ("say hi"), and
  kill the session when done — an orphan keeps burning.
- Never log hook payloads (they contain prompt text) anywhere world-readable.
- Never `git config user.*` in this repo **or any worktree of it** — worktrees share
  `.git/config` (kb:lesson/worktree-shares-git-config). Scratch repos are `git init` in a
  temp dir, or pass `-c user.name=… -c user.email=…` per command; `.githooks/pre-commit`
  refuses a repo-local override.

## Testing bar

Functional E2E always (real daemon, scratch repo); unit tests for specific logic (state
machine, reconcile, JSON merge). `make canary` gates any Claude Code version bump — the
ritual is `docs/claude-code-versions.md`.

## Doc upkeep (end of every session)

- Work item finished → tick it and move its block from `TODO.md` to `docs/history/todo-done.md` (same heading).
- Decision made or changed → an ADR in `docs/adr/` (one decision each; `accepted` on `main`,
  `proposed` on a plan branch — `/orchestrate` flips it at Completion). Superseding one sets
  `supersedes`; never edit an accepted ADR's decision.
- Measured Claude Code fact learned → a fact record in `docs/facts/` with the version it was
  measured on (`verified`) and the test that guards it (`guard`).
- Lesson learned (a cost with a cause) → a lesson record in `docs/lessons/` via `/retro`, never
  a sentence in an agent file.
- Then `make gen-kb && make check-kb`; generated files ride the same commit as the record.
