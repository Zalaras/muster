---
id: reader
type: spec
status: active
date: 2026-09-13
summary: The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out.
features: [reader]
tags: [ux, security, claude-code-format]
go: [internal/claudecode/plan*.go, internal/claudecode/files*.go, internal/server/reader*.go, internal/reader/**, internal/session/reader*.go]
web: [web/src/reader/**, web/src/features/reader.ts, web/src/features/readerscroll*.ts, web/src/features/readerscratch*.ts, web/src/render/reader.ts, web/src/render/frontmatter*.ts, web/src/render/diagrams.ts, web/src/render/diagramdialog.ts, web/src/render/mermaid.ts, web/src/doc.ts, web/doc.html, web/render/reader.spec.ts, web/render/reader-scratch.spec.ts, web/render/helpers/reader.ts, web/render/helpers/reader-scratch.ts]
e2e: [web/e2e/reader.spec.ts, web/e2e/reader-mermaid.spec.ts, web/e2e/reader-scratch.spec.ts, web/e2e/helpers/reader.ts, web/e2e/helpers/reader-scratch.ts]
protocol: [sessions.reader, sessions.reader-file, ws.doc-changed, ws.session]
refs: [plan:markdown-viewing, plan:markdown-render-fixes, plan:mermaid-support, kb:fact/plan-file-path-in-transcript, kb:fact/plan-mode-hook-sequence, kb:adr/issue-preview-is-the-leak-check, kb:adr/surfaces-shell-control-in-tile-footer, kb:adr/connection-banner-only-after-first-hello, kb:spec/surfaces, docs/design/design-system.md]
---
A session's third surface. The `claude | shell` segment in the Focus mainhead and every tile
footer gains `docs`; selecting it replaces the pane with a reader for the plan the session wrote
in plan mode and for every `.md` under the session's directory. The reader is read-only and its find bar is kb:spec/reader-find.

## Locating the plan

The plan is `<plansDir>/<slug>.md` and the slug is on no hook payload; only the transcript names
it (kb:fact/plan-file-path-in-transcript). The daemon keeps the latest transcript path per
session, persisted, and scans it on bounded triggers — SessionStart, leaving plan mode
(kb:fact/plan-mode-hook-sequence), a write under the plans directory, and the reader opening —
never on every hook. The result is the Session object's `plan` (`kb:anchor/ws.session`): the
path and whether the file exists — null until a transcript names one, and never null again once
it has; a scan that finds nothing keeps the last plan. A hook whose Claude session id the
session has already left never moves the transcript or the plan.

## Scratchpad

Claude names its per-session scratchpad folder on its hooks. The daemon keeps the one the
session's current Claude session id named, persisted, and a straggler from a session id the
session has left never moves it (kb:fact/scratchpad-dir-per-session-id,
kb:adr/reader-scratchpad-dir-from-hooks-persisted). The listing carries the folder's `.md`
files and the file route serves them (kb:adr/reader-served-paths-include-scratchpad).

## Change signal

A routed `PostToolUse` Write, Edit or MultiEdit naming a `.md` under the directory, the plan
path or the scratchpad becomes a `docChanged` message (`kb:anchor/ws.doc-changed`). The reader re-fetches the open
file on it, lights a changed dot on others, and shows `changed <age> ago` for the last write seen;
when no write was seen the cue is absent. A write to a scratch path the listing lacks, or a moved
scratchpad folder, re-fetches the listing. No filesystem watcher, no poll. The open file is also
re-fetched when the surface opens and, for the plan, when the window regains focus.

## Serving and confinement

`kb:anchor/sessions.reader` lists the plan slot and the relative `.md` paths — `git ls-files -co
--exclude-standard` in a checkout, a bounded walk skipping dot-directories otherwise — and runs
the transcript scan as a side effect. `kb:anchor/sessions.reader-file` serves raw `text/markdown`
bytes only for a symlink-resolved path under the resolved directory with a `.md` suffix, the
resolved plan path, or a `.md` under the resolved scratchpad folder; everything else is 404, and files over 10 MiB are 413. The daemon parses
nothing it serves (kb:adr/issue-preview-is-the-leak-check).

## The reader

Bar (plan badge, basename, absolute path, freshness cue, pop-out link, nav toggle), sanitized GFM
body and a right-hand nav: a **claude** section on top, a filterable tree
of files with folders collapsed and counted, and an outline of the open file's headings with
scroll-spy. The claude section is folded by default to one summary row whose chips (the plan, and the
number of scratch files) stay in both fold states (kb:adr/reader-claude-chips-stay-when-unfolded);
unfolded it lists the plan row, then the scratchpad's `.md` files newest first, each with a
`tmp` badge and its age as a bare bucket (`now`, `2m`, `1h`, `2d`; kb:adr/reader-scratch-row-age-bare).
The `tmp` badge, in a row and in the docbar, is neutral with a dashed border, not a state colour
(kb:adr/reader-scratch-badge-neutral-not-teal). The nav scrolls as one column: the claude
section, the Files tree and the Outline keep their natural height and never shrink, so every row is
reachable in every host (kb:adr/reader-nav-scrolls-as-one-column). A long file or folder name ends in an ellipsis inside the panel, with its path on
hover. The nav toggle is one button, last in the
bar and pinned to its right edge in every state (kb:adr/reader-nav-toggle-is-one-fixed-button); it is never hidden, reports the nav on
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
zoom and pan. The sanitized output enters the DOM as a fragment, never through `innerHTML`. A leading YAML
frontmatter block renders as a key/value table above the body (raw when not flat) and never
reaches the outline. The last open file, cleared dots, expanded
folders, the Files and Outline folds and each document's reading position are remembered per session in the browser. A position applies on any open with the loading cue and again after the diagram pass, never on a silent re-fetch. The pop-out
(`/doc.html`) is a second page sharing the component, the socket client and that memory live — a
change in one window shows in the other without a switch or reload, except that a `storage` event never scrolls a reader already showing. It reloads after an update restart. The pop-out's status line shows `connecting…`
until its first `hello`, the unreachable text after a lost connection, and its theme follows
the dashboard's live broadcasts (kb:adr/connection-banner-only-after-first-hello). Compact in
a tile; nav collapsed at 3×2. Works on a dead session, the claude section included
(kb:adr/reader-claude-section-kept-on-ended-session).

## Does not

Never edits or creates a file, never lists files outside the directory other than the plan and the scratchpad's markdown, never
renders non-markdown, never trusts daemon-served bytes, and never derives session state.
