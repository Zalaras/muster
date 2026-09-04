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
and a dashboard with Focus and Tiles views. Remaining work is the Pre-v1 Cleanup and the
triaged pre-v1 issues in [`TODO.md`](TODO.md).

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

## Issues and contributions

**Issues are welcome; pull requests are not accepted at this time.** Muster is built through
a fixed multi-agent pipeline (`CLAUDE.md` § Workflow) with one maintainer, and outside
changes don't fit that flow yet — a PR will be closed without review. Fork freely instead;
the [MIT licence](LICENSE) permits it. If that policy changes, this section will say so.

Two ways to file an issue:

- **The dashboard's `Issue` button** (masthead). It attaches a snapshot of muster's own
  state — session states, timings, context percentages — built from a strict allowlist
  that never includes prompt text, hook payloads, pane contents, directories, branches or
  repo names. The dialog shows the exact payload before you post, and what you see is
  byte-for-byte what gets sent.
- **GitHub directly**, if you'd rather not attach anything.

Things to know about the button:

- **The issue is public**, filed on this repo under **your** GitHub account, so read the
  preview as you would any public post.
- **It needs the `gh` CLI, logged in.** Muster takes the token from `gh auth token` at the
  moment you click, stores nothing, and has no login flow of its own. If filing fails with
  an auth error, run `gh auth login` and try again.

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

## Prerequisites

- **tmux 3.2 or newer.** Muster runs every session in tmux, on its own dedicated socket,
  never your default server. `musterd` checks this at startup and refuses to start if
  it's missing or too old, naming the remedy:
  ```
  brew install tmux    # not installed
  brew upgrade tmux    # older than 3.2
  ```
- **macOS.** Muster is single-user, macOS-only tooling — see [`SPEC.md`](SPEC.md).
- **Claude Code.** Auto-update stays on; see Version pinning below.

## Install

Releases are published to GitHub whenever a `feat` or `fix` lands on `main` (see
[`docs/conventions.md`](docs/conventions.md) § Commits). Each release publishes two darwin
archives — `musterd_*_darwin_amd64.tar.gz` (Intel) and `musterd_*_darwin_arm64.tar.gz` (Apple
Silicon); take the one matching your Mac (`uname -m`: `x86_64` → amd64, `arm64` → arm64). The
repo is private, so downloads go through `gh`:

```sh
make install     # latest release -> ~/.local/bin/musterd
```

Or by hand, if you want a different location or a specific version. Both blocks below take
the **latest** release — `gh release download` defaults to it when given no tag, which is why
`--pattern` is mandatory there. **Apple Silicon** (`uname -m` → `arm64`):

```sh
tmp=$(mktemp -d) &&
gh release download --repo Zalaras/muster \
  --pattern 'musterd_*_darwin_arm64.tar.gz' --dir "$tmp" &&
mkdir -p ~/.local/bin &&
tar -xzf "$tmp"/musterd_*.tar.gz -C ~/.local/bin musterd &&
rm -rf "$tmp"
```

**Intel** (`uname -m` → `x86_64`) — identical but for the pattern:

```sh
tmp=$(mktemp -d) &&
gh release download --repo Zalaras/muster \
  --pattern 'musterd_*_darwin_amd64.tar.gz' --dir "$tmp" &&
mkdir -p ~/.local/bin &&
tar -xzf "$tmp"/musterd_*.tar.gz -C ~/.local/bin musterd &&
rm -rf "$tmp"
```

Both download into a **fresh temp dir** on purpose, and that is not cosmetic (it is what
`make install` does too). Downloading into the current directory needs `--clobber` on every
re-run, and leaves last version's archive sitting there — so `musterd_*.tar.gz` then matches
several files and `tar` is handed a list of archives plus a member name and fails
(`tar: musterd_0.3.0_darwin_arm64.tar.gz: Not found in archive`). An empty dir per run makes
the glob single by construction. Substitute a different `-C` target for a location other than
`~/.local/bin`; anything already on your `$PATH` works.

To pin a version instead of taking the latest, pass the tag as the first argument — the rest
of the command is unchanged:

```sh
gh release download v0.3.0 --repo Zalaras/muster \
  --pattern 'musterd_*_darwin_arm64.tar.gz' --dir "$tmp"
```

The binary is unsigned, but `gh` doesn't set the `com.apple.quarantine` xattr, so it runs
without a Gatekeeper prompt. If you download one through a browser instead, clear it with
`xattr -d com.apple.quarantine musterd`.

Confirm it worked — **both lines**, not just the second:

```sh
command -v musterd   # must print the path you just installed to
musterd -version     # prints the musterd version and the Claude Code version it's pinned to
```

If `command -v` prints some *other* path, an older copy earlier in your `$PATH`
(`/usr/local/bin/musterd` is the usual one) is shadowing the install and `-version` is
reporting that stale binary, not the one you just fetched. Delete the old copy, or re-run the
install with `-C` pointing at the directory it lives in.

`musterd -version` succeeds even without tmux installed — the tmux preflight above only runs
when musterd actually starts.

## Requirements

| Tool | Version | Note |
|---|---|---|
| Go | 1.26.6 | |
| Node | 24.19.0 | pinned in `.nvmrc`; `nvm use` in the repo root |
| tmux | 3.7b | Dev machine's version; `musterd` preflights 3.2+ at startup (see Prerequisites) |
| Claude Code | 2.1.246 | The pin. Auto-update is deliberately **left on** — see below |

Frontend toolchain: Vite 8, TypeScript 7, Playwright 1.62.

## Version pinning

Muster does not disable Claude Code's auto-updater — that would freeze your everyday
install. It **detects drift instead**: `musterd` compares the installed version against
`claudecode.PinnedVersion` at startup and logs a warning if they differ. The full ritual is
in [`docs/claude-code-pin.md`](docs/claude-code-pin.md).

## Development

Build from source (Go and Node versions in the table above; `nvm use` picks the pinned Node):

```sh
git clone https://github.com/Zalaras/muster && cd muster
nvm use && make build        # ./bin/musterd, dashboard embedded
```

```sh
make help      # list targets
make build     # build ./bin/musterd
make check     # lint + unit tests
make web       # frontend dev server
make e2e       # Playwright suite (needs: npx playwright install chromium)
make canary    # assert the installed Claude Code still emits what Muster needs
```
