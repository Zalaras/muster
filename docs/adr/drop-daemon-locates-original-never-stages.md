---
id: drop-daemon-locates-original-never-stages
type: decision
status: accepted
date: 2026-09-03
summary: Dropping a file on a live pane types the original file's escaped path: the daemon locates it on disk by name, size and bytes, or types nothing; never a copy.
features: [drop, surfaces]
tags: [ux, security, user-decision]
files: [internal/locate/locate.go, internal/locate/spotlight.go, internal/locate/walk.go, internal/server/locate.go, web/src/terminal/drop.ts]
tests: [TestLocate_NeverWritesToDisk, TestHandleLocateFile_NeverWritesUploadToDisk, TestLocate_ReturnsAmbiguousWithSortedPaths, web/e2e/drop.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:file-drop-fix, kb:anchor/sessions.locate, "#8"]
supersedes: []
---
**Context.** A file dragged from Finder onto a pane made the browser open it and lose the dashboard. A real terminal types the file's absolute path at the cursor. A browser hands a page a dropped file's name and bytes but never its path, and the drag pasteboard is private to the dragging application, so the path cannot be read from the operating system either.

**Options.** (A) Upload the bytes, stage a copy in the data directory and type that path. (B) Upload the bytes as a fingerprint; the daemon, on the same machine, asks Spotlight for files with that name and size, falls back to walking the session directory, byte-compares candidates, and returns exactly one identical path or nothing. (C) Swallow the drop and do nothing.

**Decision.** B, settled with Damian at planning. It must be the original file or nothing; an unlocatable or ambiguous file shows a notice on the pane and types nothing.

**Consequences.** The daemon never writes the upload anywhere, structurally: the multipart body is read straight off the wire. Foreign drags anywhere on the dashboard are swallowed so a missed drop never navigates away; text-only drops paste verbatim as terminals do; every outcome shows a status notice. The Spotlight step is the only platform-specific piece and is pluggable. The Spotlight query syntax is exercised only by hand.
