---
id: containers
type: diagram
status: active
date: 2026-09-15
kind: container
summary: Inside the Muster box — dashboard, musterd, SQLite and the data directory — and the wire to each outside system, every one labelled by protocol.
features: []
tags: []
files: [cmd/musterd/main.go, internal/server/server.go]
tests: []
refs: [kb:spec/connection, kb:spec/ingest, kb:spec/surfaces, kb:spec/launch, kb:spec/reader, kb:spec/usage, kb:spec/update, kb:spec/issue, kb:spec/drop, kb:diagram/context, kb:diagram/daemon-components, kb:adr/connection-dashboard-embedded-in-binary, kb:adr/ingest-all-hooks-command-wrappers, plans/_audit/diagrams-from-code.md]
---
Read this to see what Muster deploys and how each piece talks to the outside. The boxes
inside the boundary are Muster's own; everything else is a system it touches, the same
set as the context diagram. Read it before the daemon-components diagram, which opens the
musterd box.

Muster is four things. musterd, one Go process bound to 127.0.0.1, which starts a tmux
server on the dedicated `muster` socket. The dashboard, compiled into the binary and served
to the default browser, which musterd opens at startup; it holds a cookie exchanged for the
UI token and speaks HTTP for commands, one WebSocket for the state stream and one per live
terminal. The SQLite file. And the data directory beside it, holding the tokens file and
the hook wrapper scripts.

Claude Code never addresses musterd itself. musterd launches it inside a new tmux session
with the Muster session id in the pane environment; on every hook and status-line refresh
Claude Code runs a wrapper script from the data directory, and that script posts the JSON
to the ingest endpoints with curl, the ingest token in the URL path. musterd scans Claude
Code's transcript only to locate the plan file, reads the plan and the global config, and
writes each launched directory's project-scoped local settings. The remaining wires are outbound
polls and command lines.

Assumptions: the browser is a plain tab, not an app window, because startup runs `open`
with the URL; Claude Code's files are drawn apart from the Claude Code process because
their wire is a file read, not an HTTP post; musterd's startup write of the data directory
is stated on that box rather than drawn, so no wire crosses another box.

```mermaid
C4Container
    title Container diagram for Muster

    Person(user, "User", "Runs 3–6 Claude Code sessions at once")

    Boundary(outside, "Services and command lines") {
        System_Ext(github, "GitHub", "REST API and Releases")
        System_Ext(anthropic, "Anthropic usage API", "api.anthropic.com")
        System_Ext(keychain, "macOS Keychain", "Claude Code-credentials item")
        System_Ext(git, "git", "Version control command line")
        System_Ext(gh, "gh", "GitHub command line")
        System_Ext(spotlight, "Spotlight", "mdfind")
    }

    System_Boundary(muster, "Muster") {
        Container(dashboard, "Dashboard", "TypeScript, Vite, xterm.js, in the default browser", "index.html and the doc.html pop-out; embedded in and served by musterd")
        Container(musterd, "musterd", "Go, net/http", "Daemon on 127.0.0.1: routes, state machine, ingest queue, PTY bridge, pollers")
        ContainerDb(sqlite, "SQLite", "muster.db, pure-Go driver, WAL", "event, session, repo, kv and usage tables")
        ContainerDb(datadir, "Data directory", "Files", "tokens.json and the wrapper scripts (hook, status line, legacy), written by musterd at startup")
    }

    Boundary(agent, "Where sessions run") {
        System_Ext(claude, "Claude Code", "claude CLI, one process per Muster session, plus a version probe at startup")
        System_Ext(tmux, "tmux server", "On socket muster; one tmux session per Muster session, plus shells")
        System_Ext(claudefiles, "Claude Code files", "~/.claude.json, transcripts, plan files")
        System_Ext(repodir, "Repositories", "The launched checkout or worktree")
    }

    Rel(user, dashboard, "Uses", "browser")
    Rel(dashboard, musterd, "Commands, state, terminals", "HTTP, WebSockets")
    Rel(musterd, sqlite, "Reads and writes", "database/sql")
    Rel(musterd, claude, "Launches", "tmux new-session")
    Rel(musterd, tmux, "Preflight, drives, attaches", "tmux -V, CLI, PTY")
    Rel(tmux, claude, "Hosts", "tmux session")
    Rel(claude, datadir, "Runs wrapper scripts", "sh")
    Rel(claude, musterd, "Hooks and status line", "HTTP POST, curl")
    Rel(musterd, claudefiles, "Finds plan via transcript; reads plan, theme", "filesystem")
    Rel(musterd, repodir, "Writes local settings, reads .md", "filesystem")
    Rel(musterd, github, "Issues, releases", "HTTPS")
    Rel(musterd, anthropic, "Polls usage", "HTTPS, OAuth")
    Rel(musterd, keychain, "Reads token", "security")
    Rel(musterd, git, "Repo state; lists .md files", "git")
    Rel(musterd, gh, "Gets token", "gh auth token")
    Rel(musterd, spotlight, "Finds dropped file", "mdfind")

    UpdateRelStyle(musterd, claude, $offsetX="-20", $offsetY="-70")
    UpdateRelStyle(claude, musterd, $offsetX="-40", $offsetY="30")
    UpdateRelStyle(musterd, claudefiles, $offsetX="30", $offsetY="-40")
    UpdateRelStyle(musterd, tmux, $offsetX="-75", $offsetY="24")
    UpdateRelStyle(tmux, claude, $offsetX="20", $offsetY="-10")
    UpdateRelStyle(claude, datadir, $offsetX="-70", $offsetY="30")
    UpdateRelStyle(musterd, repodir, $offsetX="-40", $offsetY="28")
    UpdateRelStyle(user, dashboard, $offsetX="-40", $offsetY="-30")
    UpdateLayoutConfig($c4ShapeInRow="1", $c4BoundaryInRow="3")
```
