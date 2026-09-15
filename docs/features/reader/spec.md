---
id: reader
type: spec
status: active
date: 2026-09-13
summary: The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out.
features: [reader]
tags: [ux, security, claude-code-format]
go: [internal/claudecode/plan*.go, internal/claudecode/files*.go, internal/server/reader*.go, internal/session/reader_test.go, internal/store/migrations/0008_reader.sql]
web: [web/src/reader/**, web/src/features/reader.ts, web/src/render/reader.ts, web/src/render/diagrams.ts, web/src/render/diagramdialog.ts, web/src/render/mermaid.ts, web/src/doc.ts, web/doc.html]
e2e: [web/e2e/reader.spec.ts, web/e2e/reader-mermaid.spec.ts, web/e2e/helpers/reader.ts]
protocol: [sessions.reader, sessions.reader-file, ws.doc-changed, ws.session]
refs: [plan:markdown-viewing, plan:markdown-render-fixes, plan:mermaid-support, kb:fact/plan-file-path-in-transcript, kb:fact/plan-mode-hook-sequence, kb:adr/issue-preview-is-the-leak-check, kb:adr/surfaces-shell-control-in-tile-footer, kb:spec/surfaces, docs/design/design-system.md]
---
A session's third surface. The `claude | shell` segment in the Focus mainhead and every tile
footer gains `docs`; selecting it replaces the pane with a reader for the plan the session wrote
in plan mode and for every `.md` under the session's directory. The reader is read-only and
leaves room in its bar for the plan-approval controls a later feature adds.

## Locating the plan

The plan is `<plansDir>/<slug>.md` and the slug is on no hook payload; only the transcript names
it (kb:fact/plan-file-path-in-transcript). The daemon keeps the latest transcript path per
session, persisted, and scans it on bounded triggers — SessionStart, leaving plan mode
(kb:fact/plan-mode-hook-sequence), a write under the plans directory, and the reader opening —
never on every hook. The result is the Session object's `plan` (`kb:anchor/ws.session`): the
path and whether the file exists, null when the latest transcript names none. A hook whose
Claude session id the session has already left never moves the transcript or the plan.

## Change signal

A routed `PostToolUse` Write, Edit or MultiEdit naming a `.md` under the directory or the plan
path becomes a `docChanged` message (`kb:anchor/ws.doc-changed`). The reader re-fetches the open
file on it, lights a changed dot on others, and shows `changed <age> ago` for the last write seen;
when no write was seen the cue is absent. No filesystem watcher, no poll. The open file is also
re-fetched when the surface opens and, for the plan, when the window regains focus.

## Serving and confinement

`kb:anchor/sessions.reader` lists the plan slot and the relative `.md` paths — `git ls-files -co
--exclude-standard` in a checkout, a bounded walk skipping dot-directories otherwise — and runs
the transcript scan as a side effect. `kb:anchor/sessions.reader-file` serves raw `text/markdown`
bytes only for a symlink-resolved path under the resolved directory with a `.md` suffix, or the
resolved plan path; everything else is 404, and files over 10 MiB are 413. The daemon parses
nothing it serves (kb:adr/issue-preview-is-the-leak-check).

## The reader

Bar (plan badge, basename, absolute path, freshness cue, pop-out link, nav toggle), sanitized GFM
body on the `--well` ground, and a right-hand nav: the plan slot pinned on top, a filterable tree
of files with folders collapsed and counted, and an outline of the open file's headings with
scroll-spy. The nav toggle is one button, last in the bar and pinned to its right edge in every
state (kb:adr/reader-nav-toggle-is-one-fixed-button); it is never hidden, reports the nav on
`aria-expanded`, and is the bar's only auto margin, so nothing re-aligns when the freshness cue
comes and goes. A user-initiated open greys the reading area out and names the file on the status
line rather than replacing the body, so a failed open keeps the last render; the body placeholder
carries `loading…` only while nothing has rendered, the tree carries a `loading…` row while the
listing is in flight, and a re-fetch of the file you are already reading is silent
(kb:adr/reader-loading-cue-never-clears-a-rendered-body). Rendering is in the browser with marked, DOMPurify and mermaid, pinned exactly; mermaid is
imported only when a document contains a ```` ```mermaid ```` fence and is bundled into the
binary, never fetched. A fence becomes a diagram whose SVG crosses DOMPurify like the markdown
does; one mermaid cannot parse keeps its fenced source with a labelled reason beneath. Diagrams
follow the dashboard theme and re-render when it changes, and each enlarges into a modal with
zoom and pan. The sanitized output enters the DOM as a fragment, never through `innerHTML`. Last open file and cleared dots
are remembered per session in the browser; the pop-out (`/doc.html`) is a second page sharing the
component, the socket client and that memory. Compact in a tile; nav collapsed at 3×2. Works on a
dead session with the plan slot — and the nav's plan header row — removed.

## Does not

Never edits or creates a file, never lists files outside the directory other than the plan, never
renders non-markdown, never trusts daemon-served bytes, and never derives session state.
