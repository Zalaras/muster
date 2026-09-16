---
id: context
type: diagram
status: active
date: 2026-09-15
kind: context
summary: Muster in one box beside its user and every outside system it touches, from Claude Code and tmux to GitHub, the Keychain and three local command lines.
features: []
tags: []
files: []
tests: []
refs: [SPEC.md, kb:diagram/containers, kb:spec/launch, kb:spec/ingest, kb:spec/surfaces, kb:spec/usage, kb:spec/issue, kb:spec/update, kb:spec/drop]
---
Read this for the shortest true answer to "what is Muster and what does it touch". One
person, one system, and every outside system Muster depends on, with no technology named;
the containers diagram opens the Muster box and puts a protocol on each wire.

The user works in Muster from a browser to launch Claude Code sessions, watch their state and
context, watch account usage, and type into them. Muster launches Claude Code and observes
it through the signals Claude Code sends back and the files it writes; it never reads the
terminal to learn state. Sessions live in tmux, which keeps them alive when the dashboard
or the daemon is gone. Muster launches into the user's repositories and writes its hook
settings there. GitHub receives the issues filed from the dashboard and serves the
releases Muster updates itself from. The Anthropic usage API answers the per-model usage
poll, with the Claude Code token Muster reads from the Keychain and never keeps. Three
local command lines do small jobs: git reads repo state and lists a checkout's files, gh
supplies the GitHub token, and Spotlight finds a dropped file.

Assumption: the outside systems match the containers diagram one for one, except that
Claude Code's own files, a separate box there, are part of the Claude Code system here.

```mermaid
C4Context
    title System Context diagram for Muster

    System_Ext(claude, "Claude Code", "Anthropic's coding agent, and the files it keeps")
    System_Ext(tmux, "tmux", "Terminal multiplexer that keeps sessions alive")
    System_Ext(repodir, "Repositories", "The user's checkouts and worktrees")
    Person(user, "User", "Runs 3–6 Claude Code sessions at once")
    System(muster, "Muster", "Launches, watches and drives Claude Code sessions from one dashboard")
    System_Ext(github, "GitHub", "Issues and Releases")
    System_Ext(anthropic, "Anthropic usage API", "Reports per-model weekly usage")

    Boundary(local, "Command lines Muster runs") {
        System_Ext(git, "git", "Version control command line")
        System_Ext(gh, "gh", "GitHub command line")
        System_Ext(spotlight, "Spotlight", "macOS file search")
        System_Ext(keychain, "macOS Keychain", "Holds Claude Code's sign-in token")
    }

    Rel(user, muster, "Uses")
    Rel(muster, claude, "Launches and observes")
    Rel(muster, tmux, "Hosts sessions in")
    Rel(muster, repodir, "Launches into")
    Rel(muster, github, "Files issues, fetches releases")
    Rel(muster, anthropic, "Polls usage")
    Rel(muster, keychain, "Reads sign-in token")
    Rel(muster, git, "Repo state, file lists")
    Rel(muster, gh, "Gets GitHub token")
    Rel(muster, spotlight, "Finds dropped files")

    UpdateRelStyle(muster, github, $offsetX="-105", $offsetY="-70")
    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```
