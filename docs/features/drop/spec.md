---
id: drop
type: spec
status: active
date: 2026-09-12
summary: File drop pastes the original on-disk path into the pane.
features: [drop]
tags: [ux]
go: [internal/server/locate*.go, internal/locate/**]
web: [web/src/render/dropguard*.ts, web/src/terminal/drop*.ts]
e2e: [web/e2e/drop.spec.ts, web/e2e/helpers/dropfiles.ts]
protocol: [sessions.locate]
refs: [kb:adr/drop-daemon-locates-original-never-stages, kb:adr/drop-reorder-drag-mime-custom-type]
---
Dropping a file onto a live terminal surface types that file's original on-disk path into
the pane, as Terminal.app would.

A browser hands the page a dropped file's name and bytes, never its path, so the daemon
locates the original: the surface uploads the bytes to `kb:anchor/sessions.locate`, and the
daemon compares them in memory against every file on disk with the same basename and size,
Spotlight first and then a walk of the session's directory, verifying each candidate byte
for byte. The bytes are never written to disk; the answer is the original file or nothing
(kb:adr/drop-daemon-locates-original-never-stages). On success the surface types the path
shell-escaped with a trailing space. Several files are located sequentially so the pasted
paths keep drop order.

Classification: files win whenever any are present; a text-only drop pastes the text
verbatim; anything else is not this feature's business. Files over the size cap are refused
client-side before any request. While a file is being located the pane shows a notice with
its name; a failure shows one naming the outcome: not found, ambiguous with the number of
identical files, too large, or an unexpected error. A drop onto a surface whose terminal
socket is not open sends nothing and says so. The session's liveness is not consulted;
locating is a filesystem question.

A document-level guard stops the browser opening a file dropped anywhere else on the
dashboard. Internal rail and tile reorder drags carry a Muster-specific MIME type so the
surface and the guard never mistake them for a foreign drop
(kb:adr/drop-reorder-drag-mime-custom-type).

Nothing is copied or staged, and an ambiguous match offers no chooser.
