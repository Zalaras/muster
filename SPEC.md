# Muster — Claude Code session manager · specification

**This document is authoritative for what Muster is and is not.** Decisions here are settled;
the rationale behind each lives in `docs/adr/`, measured behaviour in `docs/facts/`, and the
current behaviour of every feature in `docs/features/<name>/spec.md` (see § Where things live).

Name: **Muster** (daemon binary `musterd`, module `github.com/Zalaras/muster`), chosen to be
agent-CLI-agnostic so supporting other agent CLIs later costs no rename
(kb:adr/process-naming-muster). Companion history: `docs/history/interview-notes.md` (frozen),
`docs/history/spec-changelog.md` (how every decision was reached or changed) and
`docs/research/claude-session-manager-handoff.md` (prior research, superseded by this document).

---

## 1. Overview

### Problem

Damian runs 3–6 concurrent Claude Code sessions in macOS Terminal tabs. The pain, in his
own ranking:

- No way to see at a glance which tab is doing what, in which directory, in what state.
- Forgetting a session's current progress/checkpoint after switching away.
- No visibility of per-session context length (when to restart a session) or account-level
  rate limits (when to back off before hitting 5-hour/weekly caps).
- Multiple sessions on one repo: worktrees are hard to manage, conflicts happen, cleanup
  almost never happens.
- When a PR needs changes: hunting for the right worktree directory, or temporarily
  switching a repo's branch away from current work.

### Target user

Damian, solo. Personal tool, macOS only, single machine, single user, English only.
Motivation is daily utility plus the challenge of building it — not a product.

### Success criteria

A month in, this is true: **"I can keep track of at least 5 sessions: I know overall
account usage (model, hourly, weekly), how much context each session has used, and what
each one is doing. I can easily navigate between them and see where I'm needed."**

The organizing principle: **the user's attention is the scarce resource.** The dashboard
is where work happens — it must show where you're needed, ordered by urgency, and let you
respond without hunting.

### Shape of the tool

A Go daemon plus a web dashboard in its own window (not a browser tab). The dashboard is
the primary workspace: it launches sessions, shows their state, and embeds **interactive
terminal panes** so sessions can be viewed and prompted directly from it. Sessions run
inside tmux, owned by the daemon, so they survive daemon and UI restarts. There are no
notifications by design — the point is to be working *in* the dashboard.

### Operating envelope

- **Scale**: 3–6 concurrent sessions, single user, localhost; no performance engineering.
- **Platform**: macOS only; GUI in its own window; mouse-first.
- **Availability**: the daemon survives the dashboard closing; sessions survive daemon
  crashes; the daemon reconciles on start and can resume dead sessions (kb:spec/lifecycle).
- **Security**: localhost bind plus a token cookie, nothing more (kb:spec/connection).

---

## 2. Out of scope (explicit non-goals)

- **Notifications** (macOS banners etc.) — the dashboard is the alert surface. (kb:adr/nongoal-macos-notifications)
- **Cost/spend tracking.** (kb:adr/nongoal-cost-tracking)
- **A "lead" orchestrator chat session** in the dashboard (Claude Code's native
  cross-session messaging already exists for this). (kb:adr/nongoal-lead-orchestrator-session)
- **Real diff review** (inline comments fed back to the agent). Placeholder instead: a
  button that runs `code <worktree>` to review in VSCode. Explicitly a hack. (kb:adr/nongoal-diff-review-placeholder-button)
- **Ship flow** (PR create/merge/archive buttons, CI status). (kb:adr/nongoal-ship-flow)
- **Session forking / pause-checkout**, and **browsable history of dead sessions**
  (future feature). (kb:adr/nongoal-session-forking-pause-checkout, kb:adr/nongoal-dead-session-history-browser)
- **Shared MCP servers across sessions** (e.g. one Grafana-in-Docker MCP instead of one
  per session) — real waste, but an MCP proxy is a project of its own. Captured as future. (kb:adr/nongoal-shared-mcp-servers)
- **Containers as isolation** — never: not everything runs cleanly in them, and they eat
  resources. (kb:adr/nongoal-containers-as-isolation)
- **Resource gauges (CPU/RAM)** — never. (kb:adr/nongoal-resource-gauges)
- **Second machine / distributed sessions** — never. (kb:adr/nongoal-second-machine-one-dashboard)
- Accessibility, i18n, multi-user, non-macOS platforms. **One bounded exception:** the
  dashboard's own chrome is held to a WCAG AA contrast bar across every built-in theme
  (kb:adr/theme-aa-contrast-gated-in-check). Screen-reader, keyboard-audit and i18n work
  stay non-goals. (kb:adr/nongoal-accessibility-i18n-multiuser-other-platforms)
- **A generic multi-agent plugin layer.** Other agent CLIs are a maybe; the only concession
  is the `internal/claudecode` adapter boundary. (kb:adr/nongoal-generic-agent-abstraction-layer)

---

## 3. Roadmap (v1.x, in rough priority order)

### 3.1 Plan-mode flow (high interest)

Damian works mostly in auto-accept mode, so ordinary permission prompts are rare. The
friction is plan mode: research prompts interrupt before the plan exists, and after
approval the run needs babysitting.

- **Auto-accept while planning**: a per-session toggle; while the permission mode is `plan`,
  a `PermissionRequest` hook auto-allows research prompts (web fetches, read-only bash) so
  the plan arrives uninterrupted. This does not exist in Claude Code today.
- **Plan approval from the dashboard**: the plan surfaces in Muster; approve or reject
  there. The hook sequence that makes this possible is kb:fact/plan-mode-hook-sequence.
  A `PermissionRequest` hook races the terminal prompt rather than blocking it: whoever
  answers first wins, and a timeout, error or empty reply degrades to stock behaviour —
  Muster must handle losing the race (kb:fact/permission-request-races-terminal-prompt).
- **Auto-accept on approval** is native: approving the plan flips the session to
  `acceptEdits` on its own. Nothing to build.

### 3.2 Worktree manager

Create, assign and remove worktrees per repo; show which session owns which tree, dirty or
clean, ahead or behind; surface abandoned trees for cleanup. **Setup scripts are must-have
within this feature**: on worktree creation, copy untracked `.env` files and run install
steps, per-repo configurable — without this a worktree is present but unusable. Prefer
Claude Code's native `--worktree` and worktree hooks over reimplementing.

### 3.3 Start from PR / issue

"PR #123 needs changes" → one click → a session on that branch in a worktree, with PR
context. Implemented through the `gh` CLI (kb:adr/stack-git-and-gh-clis-not-go-git).

### 3.4 Basic permissions UI

User-level scope only; a deterministic JSON merge into settings with an atomic write —
never an LLM editing settings (kb:adr/nongoal-permissions-ui-basic-user-level-only).

### 3.5 Permission-mode indicator per session

A visible indicator of each session's permission mode. It can only ever be *last known*:
a user cycling modes with Shift+Tab fires no hook and no status-line update
(kb:fact/shift-tab-mode-cycle-fires-no-hook), so Muster seeds it from the launch flag and
corrects it from the first hook carrying the field (kb:fact/permission-mode-presence-split).

### 3.6 Futures kept alive by architecture

- **Phone/remote access** — the reason the frontend is a browser-served web app; would
  need real auth or Tailscale. Not built.
- **Other agent CLIs** — maybe; only the adapter boundary is conceded.
- **Shared MCP proxy**, **browsable dead-session history**, **real diff review** — parked.

---

## 4. Tech stack and layout

The stack is listed in `docs/conventions.md` § Stack, and each row's rationale is an ADR:
`go run ./tools/kb ls --type adr | grep '/stack-'`.

Layout: `cmd/musterd/` (daemon), `web/` (frontend), `internal/claudecode/` (the adapter
boundary, the only package that knows Claude Code's formats), the other `internal/` packages
by concern, and later `cmd/muster-desktop/` if a Wails shell happens
(kb:adr/stack-wails-desktop-shell-deferred).

---

## 5. Standing risks

- **Claude Code interface churn** — mitigated by the verified range, the canary and the
  one-package boundary (kb:spec/canary), but not removable; a standing tax on the project.
- **Hook delivery gaps** — hooks can be missed (kb:fact/hook-delivery-best-effort);
  reconcile tolerates stale state and state inference self-heals rather than assuming a
  perfect stream (kb:spec/lifecycle).
- **Rate-limit blind spots** — unknown until a session's first response, absent under
  API-key auth (kb:fact/unknown-before-first-response); the UI renders "unknown" honestly.

---

## 6. Build order

The milestone plan v1 was built against is frozen at `docs/history/build-order.md`.

---

## 7. Where things live

- `docs/features/<name>/spec.md` — current behaviour of each feature; its frontmatter is the
  feature registry, and the generated `INDEX.md` and `contract.md` beside it list the
  records and protocol sections that belong to it.
- `docs/adr/` — one decision per record, with the rationale and the rejected options.
- `docs/facts/` — measured Claude Code and tmux behaviour, each with a verified version range.
- `docs/protocol.md` — the daemon↔dashboard wire contract, addressed by `kb:anchor` ids.
- `docs/history/` — how things got here: changelogs, frozen notes, done work. Never current state.
- `go run ./tools/kb` — indexes and gates all of the above; `kb show <id>` reads any record.
