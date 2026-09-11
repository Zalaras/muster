# Muster

A session manager for concurrent Claude Code sessions: a Go daemon (`musterd`) plus a web
dashboard, with interactive terminal panes backed by tmux. One place to see which session
is working, which one is waiting on you, and how much context each has left.

![The Muster dashboard — three sessions in the rail, one focused with a live terminal pane](https://raw.githubusercontent.com/Zalaras/muster/main/docs/images/dashboard.png)

Personal tool, macOS only, single user. Not a product. M0–M4 have shipped; the remaining
pre-v1 work is in [`TODO.md`](TODO.md).

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh
```

That takes the latest release for your Mac's architecture, verifies it against the
release's published SHA-256, and puts `musterd` in `~/.local/bin`. The dashboard is
compiled into the binary (`//go:embed`), so that one file needs nothing beside it.

Piping a script into `sh` unread is a fair thing to refuse — download it first instead:

```sh
curl -fsSL -o install.sh https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh
less install.sh
sh install.sh
```

Either way, `--help` lists every option; each has an environment-variable equivalent:

```sh
sh install.sh --version v0.9.0          # pin a release instead of taking the latest
sh install.sh --bin-dir /usr/local/bin  # somewhere else on your $PATH
```

Then confirm it worked — **both lines**, not just the second:

```sh
command -v musterd   # must print the path you just installed to
musterd -version     # prints the musterd version and the Claude Code verified range
```

If `command -v` prints some *other* path, an older `musterd` earlier in your `$PATH`
(usually `/usr/local/bin/musterd`) is shadowing the new one and `-version` is reporting
that stale binary. The installer warns when it detects this. Delete the old copy, or
re-run with `--bin-dir` pointing at the directory it lives in.

The binary is unsigned, but `curl` does not set the `com.apple.quarantine` xattr, so it
runs without a Gatekeeper prompt. A browser download does — clear it with
`xattr -d com.apple.quarantine musterd`.

## Updating

`musterd` checks GitHub Releases once a day for a newer version (turn it off with the
`Check for updates daily` box in Settings — off means no request at all). When one exists,
the masthead **Settings** button gains a dot; the dialog's Updates section then offers
**Update** (swaps the binary, then asks you to restart) and **Update and restart** (swaps and
re-execs in place — every Claude session keeps running and is re-adopted; only plain-terminal
shells close, and the confirm step names them). From a terminal, `musterd -update` does the
swap without restarting anything. Every download is verified twice: the release's
`checksums.txt` must carry a valid minisign signature against the public key compiled into
the binary, and the archive's SHA-256 must match that signed file — nothing is installed
otherwise. A `musterd` installed by Homebrew is updated with `brew upgrade musterd` once the
tap exists, and the dialog says so instead of offering the buttons.

## Requirements

- **macOS.** Muster is single-user, macOS-only tooling — see [`SPEC.md`](SPEC.md).
- **tmux 3.2 or newer.** Every session runs in tmux, on Muster's own dedicated socket,
  never your default server. `musterd` checks this at startup and refuses to start if
  tmux is missing or too old, naming the remedy:
  ```
  brew install tmux    # not installed
  brew upgrade tmux    # older than 3.2
  ```
- **Claude Code**, verified against
  <!-- versions:range -->2.1.246–2.1.267<!-- /versions:range -->. Its auto-updater is
  deliberately left on — see below.

## Claude Code versions

Muster does not disable Claude Code's auto-updater; that would freeze your everyday
install. It **detects and classifies** instead: `musterd` compares the installed version
against the canary-verified range and warns on either side of it — below the floor means
"update Claude Code", above the ceiling means Muster hasn't been tested there yet — without
ever refusing to start. A green `make canary` run extends the range automatically. Full
rituals: [`docs/claude-code-versions.md`](docs/claude-code-versions.md).

## Development

```sh
git clone https://github.com/Zalaras/muster && cd muster
nvm use && make build        # ./bin/musterd, dashboard embedded
```

```sh
make help      # list targets
make check     # lint + unit tests
make web       # frontend dev server
make e2e       # Playwright suite (needs: npx playwright install chromium)
make canary    # assert the installed Claude Code still emits what Muster needs
```

Toolchain: Go 1.27.1, Node 24.21.0 (pinned in `.nvmrc`), Vite 8, TypeScript 7,
Playwright 1.63. Claude-Code-specific knowledge is confined to `internal/claudecode/`.

## Issues and contributions

**Issues are welcome; pull requests are not accepted at this time** — see
[`CONTRIBUTING.md`](CONTRIBUTING.md), which also covers what the dashboard's `Issue`
button attaches and what it never sends. Forks are fine; the [MIT licence](LICENSE)
permits it.

## Docs

| Document | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | **Authoritative spec.** Features, tech stack, milestones, risks |
| [`TODO.md`](TODO.md) | Milestone backlog and open questions |
| [`docs/protocol.md`](docs/protocol.md) | The daemon↔dashboard protocol contract |
| [`docs/claude-code-versions.md`](docs/claude-code-versions.md) | The verified version range and the upgrade rituals |
| [`spikes/FINDINGS.md`](spikes/FINDINGS.md) | Measured Claude Code interface facts |
| [`docs/history/spikes/canary-fields.md`](docs/history/spikes/canary-fields.md) | Field inventory the canary asserts before any version bump |
| [`interview-notes.md`](interview-notes.md) | Rationale and rejected options |

## Licence

[MIT](LICENSE).
