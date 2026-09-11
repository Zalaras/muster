---
id: release-install-front-door-curl-sh
type: decision
status: accepted
date: 2026-09-10
summary: The install front door is a POSIX sh script piped from curl needing no GitHub CLI or account; make install wraps it; Homebrew and auto-update are separate.
features: [release]
tags: [deps, user-decision]
files: [scripts/install.sh, Makefile, README.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/history/todo-done.md, kb:adr/release-distribution-github-release-not-brew, kb:adr/release-installer-verifies-sha256-against-checksums, kb:adr/release-latest-resolved-via-redirect-not-api, kb:adr/release-installer-no-sudo-no-prompt, kb:adr/release-homebrew-tap-via-casks-and-tap-pat, kb:adr/process-repo-public, "#7"]
supersedes: [release-distribution-github-release-not-brew]
---
**Context.** Distribution had been the GitHub Release pulled by the GitHub CLI, which requires an account and a login even for a public asset, and the README's by-hand commands had already broken once on Apple Silicon. Going public made anonymous asset downloads work, so the account-gated path became obsolete rather than merely inconvenient.

**Options.** (A) Keep the CLI-based target and per-architecture README fences. (B) A Homebrew tap as the front door. (C) A single shell script fetched with curl and piped to sh, written to POSIX sh because the system shell is an old bash in POSIX mode, with the make target reduced to a one-line wrapper around it.

**Decision.** C, with B split out as its own item and auto-update likewise. The script takes version, bin directory, architecture and base URL as flags or environment, the last two so the other architecture and the failure paths can be run on one machine.

**Consequences.** Architecture resolution, the fresh temp directory, the archive member selection and the shadowing warning exist in exactly one place. The GitHub CLI has left the install path. Running the script, not reading it, found two bugs before it shipped. The README was rewritten around it and cut hard on Damian's instruction to review the whole file.
