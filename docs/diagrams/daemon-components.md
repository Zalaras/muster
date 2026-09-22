---
id: daemon-components
type: diagram
status: active
date: 2026-09-15
kind: component
summary: The Go packages inside the musterd binary and which imports which, grouped as domain, server and adapters.
features: []
tags: [store, tmux, state-machine]
files: [cmd/musterd/**, internal/**]
tests: []
refs: [kb:diagram/containers, kb:adr/nongoal-generic-agent-abstraction-layer, kb:adr/stack-terminal-backing-tmux, kb:adr/process-composition-roots-registration-only, kb:adr/update-release-knowledge-in-selfupdate-package, plans/_audit/diagrams-from-code.md]
---
Components inside the `musterd` binary and their responsibilities. Every edge is a real import,
drawn from the import blocks, not from prose; the absent edges are the architecture.

`internal/store`, `internal/tmux`, `internal/tty` and `internal/claudecode` import nothing
internal — leaf adapters, which is what keeps Claude-Code-format knowledge inside one package
(kb:adr/nongoal-generic-agent-abstraction-layer). `internal/session` never imports
`internal/server`: it declares its own `PaneChecker`, `PaneSnapshotter` and `Killer` ports and
`*tmux.Client` satisfies them, injected by the composition root. Ingest is not a package of its
own: it is `internal/server/ingest.go`, one feature type among the server's twenty-odd.

This opens the musterd box of kb:diagram/containers. The outside systems stay on that diagram;
here an adapter's description names what it reaches, and only imports are wires. The loop worth
following is still `claude` posting its own hooks back to the ingest endpoint: the daemon writes
the wrapper scripts, tmux hosts the pane, and state arrives over HTTP rather than from the
terminal.

Not shown, because they are other containers: `tools/kb`, `tools/triage` and `tools/versions`,
the dev-tooling binaries built from `internal/kb` and `internal/triage` (`.goreleaser.yaml`
builds only `./cmd/musterd`). `internal/kb` imports `internal/claudecode` for version records;
nothing in the daemon imports either of them.

```mermaid
C4Component
    title Component diagram for musterd

    Container_Boundary(musterd, "musterd") {
        Boundary(root, "Domain, bridges and the composition root") {
            Component(session, "internal/session", "Go", "State machine and in-memory registry; its own tmux ports")
            Component(usage, "internal/usage", "Go", "Usage-sample aggregation")
            Component(bridge, "internal/termbridge", "creack/pty", "PTY lifecycle for one attach")
            Component(ghissue, "internal/ghissue", "GitHub API, gh", "Issue creation")
            Component(cmd, "cmd/musterd", "main", "Flags, data dir, preflight, http.Server, restart loop")
        }
        Boundary(srv, "Server") {
            Component(server, "internal/server", "net/http", "Routes, three WebSockets, the ingest queue, one type per feature")
        }
        Boundary(adapters, "Adapters") {
            Component(gitutil, "internal/gitutil", "git", "Repo, branch and worktree detection")
            ComponentDb(store, "internal/store", "database/sql", "Row gateway and forward-only migrations over SQLite")
            Component(tmuxpkg, "internal/tmux", "tmux CLI", "Dedicated-socket tmux driver")
            Component(ttypkg, "internal/tty", "TIOCGETA ioctl", "Reads a pane tty's line discipline to tell work from waiting")
            Component(cc, "internal/claudecode", "Go", "The only package that knows Claude Code's wire format; reads its files, the Keychain and the usage API")
            Component(webui, "internal/webui", "embed.FS", "Embedded dashboard assets")
            Component(locate, "internal/locate", "mdfind", "Dropped-file resolution")
            Component(selfupd, "internal/selfupdate", "minisign", "Release check, verify and apply from GitHub Releases")
        }
    }

    Rel(cmd, server, "constructs, serves")
    Rel(cmd, store, "opens")
    Rel(cmd, tmuxpkg, "preflight")
    Rel(cmd, cc, "wrapper scripts, version")
    Rel(cmd, webui, "serves")
    Rel(cmd, locate, "constructs")
    Rel(cmd, selfupd, "classifies, re-execs")

    Rel(server, session, "applies inputs")
    Rel(server, usage, "records samples")
    Rel(server, bridge, "attaches")
    Rel(server, ghissue, "files issues")
    Rel(server, gitutil, "detects repo")
    Rel(server, store, "events, rows")
    Rel(server, tmuxpkg, "spawns, kills")
    Rel(server, ttypkg, "reads line discipline")
    Rel(server, cc, "parses payloads")
    Rel(server, webui, "serves")
    Rel(server, locate, "resolves drops")
    Rel(server, selfupd, "polls, applies")

    Rel(session, store, "persists rows")
    Rel(session, tmuxpkg, "liveness, kill")
    Rel(session, cc, "StateInput")
    Rel(usage, store, "persists samples")
    Rel(bridge, tmuxpkg, "attach argv, resize")

    UpdateRelStyle(usage, store, $offsetY="-22")
    UpdateRelStyle(session, tmuxpkg, $offsetY="20")
    UpdateRelStyle(session, store, $offsetY="-20")
    UpdateLayoutConfig($c4ShapeInRow="1", $c4BoundaryInRow="3")
```
