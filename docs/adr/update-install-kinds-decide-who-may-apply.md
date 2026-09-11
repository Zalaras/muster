---
id: update-install-kinds-decide-who-may-apply
type: decision
status: accepted
date: 2026-09-10
summary: The binary classifies its install at startup as dev, homebrew, unmanaged or installer; only installer may apply, the others badge with a remedy or stay silent.
features: [update]
tags: [security, ux]
files: [internal/selfupdate/install.go, internal/selfupdate/exeversion.go, cmd/musterd/update.go, internal/server/update.go]
tests: [TestClassify_Table, TestClassify_HomebrewChecksBeforeWritability, TestRunUpdate_DevInstallRefusesWithoutTouchingNetwork, TestRunUpdate_HomebrewAndUnmanagedPrintTheirRemedy]
refs: [docs/history/spec-changelog.md, plan:auto-update, kb:adr/release-homebrew-tap-via-casks-and-tap-pat, kb:adr/update-check-pref-governs-checking-only, kb:adr/release-installer-no-sudo-no-prompt]
supersedes: []
---
**Context.** A self-replacing binary must not overwrite a package-manager-managed install, a developer's local build, or a copy sitting in a git tree; the installer path and a future Homebrew path can shadow each other.

**Options.** (A) Always allow apply and let the user sort out the consequences. (B) Classify the resolved executable path once at startup: a non-release version string is a dev build that never checks and shows no buttons; a path under a Homebrew prefix badges but refuses apply and names the package manager's upgrade; a directory the installer would not have written, unwritable or inside a git tree under the home directory, badges but refuses and names the installer; everything else is an installer binary that may apply.

**Decision.** B. Refusal with a named remedy costs nothing and prevents the one irreversible mistake.

**Consequences.** Applies are serialised: a second request while one is in flight joins it rather than downloading again, and a non-blocking lock beside the binary keeps two processes from racing. A symlink at the invoked path is left alone. The Homebrew check runs before the writability check, since a Homebrew prefix is usually writable.
