# Muster

A session manager for concurrent Claude Code sessions: a Go daemon (`musterd`) plus a web
dashboard served in its own window, with interactive terminal panes backed by tmux.

Personal tool, macOS only, single user. Not a product.

> **Why "Muster":** to muster is to assemble a group *and* review it. The name is
> deliberately agent-CLI-agnostic — nothing in it ties to Claude, so supporting other agent
> CLIs later costs no rename. `internal/claudecode/` is the only concession to the current one.

## Status

**M0–M4 shipped.** The daemon manages real sessions end to end: hook/status-line ingest, the
state machine, the SQLite store, tmux-backed terminal panes, reconcile and shutdown policy,
and a dashboard with Focus and Tiles views. Remaining work is the Pre-v1 Cleanup in
[`TODO.md`](TODO.md).

`musterd` ships as a **single self-contained binary** — the dashboard is compiled in via
`internal/webui` (`//go:embed`), so a copy of the binary needs nothing beside it.

| Document | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | **Authoritative spec.** Features, tech stack, milestones, risks |
| [`TODO.md`](TODO.md) | Milestone backlog (SPEC §10) and open questions |
| [`next-steps.md`](next-steps.md) | Session-by-session plan |
| [`spikes/FINDINGS.md`](spikes/FINDINGS.md) | Validated interface facts, measured against Claude Code 2.1.233 (addenda through 2.1.246) |
| [`spikes/canary-fields.md`](spikes/canary-fields.md) | Field inventory the canary asserts before any version bump |
| [`interview-notes.md`](interview-notes.md) | Rationale and rejected options |
| [`docs/claude-code-pin.md`](docs/claude-code-pin.md) | The version pin and the upgrade ritual |

`claude-session-manager-handoff.md` is prior research, treated as input only — SPEC.md
supersedes it wherever they disagree.

## Layout

```
cmd/musterd/          daemon entrypoint
internal/claudecode/  adapter for everything Claude-Code-specific (hooks, status line, CLI)
web/                  dashboard (Vite + TypeScript, no framework) + Playwright E2E
test/canary/          canary suite: run before adopting a new Claude Code version
docs/                 operational docs
spikes/               step-1 validation findings (historical record, not built code)
```

Packages arrive when they have contents — M0 adds the HTTP/WS server, the state machine and
the SQLite store.

## Install

Releases are published to GitHub whenever a `feat` or `fix` lands on `main` (see
[`docs/conventions.md`](docs/conventions.md) § Commits). The repo is private, so downloads go
through `gh`:

```sh
make install     # latest release -> ~/.local/bin/musterd
```

Or by hand, if you want a specific version or a different location:

```sh
gh release download --repo Zalaras/muster \
  --pattern 'musterd_*_darwin_amd64.tar.gz'   # arm64 on Apple Silicon
tar -xzf musterd_*.tar.gz musterd
```

The binary is unsigned, but `gh` doesn't set the `com.apple.quarantine` xattr, so it runs
without a Gatekeeper prompt. If you download one through a browser instead, clear it with
`xattr -d com.apple.quarantine musterd`.

## Requirements

| Tool | Version | Note |
|---|---|---|
| Go | 1.26.6 | |
| Node | 24.19.0 | pinned in `.nvmrc`; `nvm use` in the repo root |
| tmux | 3.7b | Muster uses a dedicated socket (`-L muster`), never your default server |
| Claude Code | 2.1.246 | The pin. Auto-update is deliberately **left on** — see below |

Frontend toolchain: Vite 8, TypeScript 7, Playwright 1.62.

## Version pinning

Muster does not disable Claude Code's auto-updater — that would freeze your everyday
install. It **detects drift instead**: `musterd` compares the installed version against
`claudecode.PinnedVersion` at startup and logs a warning if they differ. The full ritual is
in [`docs/claude-code-pin.md`](docs/claude-code-pin.md).

## Development

```sh
make help      # list targets
make build     # build ./bin/musterd
make check     # lint + unit tests
make web       # frontend dev server
make e2e       # Playwright suite (needs: npx playwright install chromium)
make canary    # assert the installed Claude Code still emits what Muster needs
```
