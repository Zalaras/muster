# Spec: Markdown viewing

**Plan**: markdown-viewing
**Created**: 2026-09-13
**Status**: Draft

## Goal

Read markdown inside the dashboard instead of alt-tabbing to an editor. Three moments drive it,
all first-class:

1. reading the plan a Claude Code session wrote in plan mode;
2. reading the plan or spec a pipeline session is working from (`plans/<name>/plan.md`,
   `plans/<name>/spec.md`);
3. browsing any markdown under the session's directory, generated during the session or
   pre-existing (`TODO.md`, an ADR, a design note).

It is a `TODO.md` § Pre-v1 Cleanup item and blocks v1.

## Background & Context

- **Where a plan lives and how Muster finds it** — `kb:fact/plan-file-path-in-transcript`. The
  plan is `<plansDir>/<slug>.md`; the slug is on no hook payload. The only source is the
  transcript named by the `transcript_path` every hook carries: `attachment.planFilePath` on
  `plan_mode` / `plan_mode_exit` / `plan_mode_reentry` lines (authoritative), top-level `slug` as
  fallback. 39 of 39 plan-mode transcripts on this machine resolve; the whole 176 MB corpus scans
  in 268 ms. Muster currently persists nothing from `transcript_path`; it must start keeping the
  latest one per session (`/clear` mints a new transcript, `kb:fact/clear-mints-new-session-id`).
- **When the plan is ready and when it changes** — `kb:fact/plan-mode-hook-sequence` (the
  `ExitPlanMode` sequence) and the spike's measurement that plans are written with the `Write`
  tool (49 of 49 observed; `Edit` never seen). A `PostToolUse` hook carries `tool_input.file_path`,
  so a write to the open file is a change signal already on the wire.
- **Spike findings, numbers and traps** — `docs/history/design/markdown-viewing.md`. Read it
  before planning; the fact record wins where they differ. Prototype code (transcript scanner,
  renderer probes) is on branch `spike/markdown-viewing`, worktree `../muster-spike-markdown`,
  not for landing. **Do not assume the spike's proposed shape is right** — the interview
  overrode it in several places (below).
- **Precedents to follow** — `kb:adr/issue-preview-is-the-leak-check` (the daemon hands raw
  markdown, the dashboard is the viewer); `kb:adr/stack-git-and-gh-clis-not-go-git` (shelling to
  `git` is the settled way to talk to a checkout); `kb:adr/connection-protocol-bumps-only-on-shape-change`
  (an additive session field needs no protocol bump); `docs/design/design-system.md` (tokens,
  type roles, "stale is labelled, not hidden").
- **Surfaces this extends** — `docs/features/surfaces/spec.md`: the `claude | shell` segment
  (`web/src/terminal/surfaceswitch.ts`, rendered in the mainhead and every tile footer), the
  one-live-client law, and the shell precedent for a second attach target that is not a session.
- **Downstream consumer** — SPEC § 3.1 "Plan approval from the dashboard" will want the rendered
  plan next to approve/reject controls. This feature reserves the space and builds none of it.
- **Placement decision and mockups** — `docs/design/mockups/markdown-viewing/` (README lists
  them). Four placements were mocked in Focus and Tiles view; **option A (surface segment) was
  chosen for both views**, with a right-hand file nav in the docs-site "section nav" pattern
  (`a2-nav-files-focus.html`, `a2-nav-hidden-focus.html`, `a2-nav-tiles.html`). The rail already
  carries attention state, so the pane can be given over to reading.

## Scope

**In Scope:**

- A third `docs` segment in the `claude | shell` switch, in the mainhead and every tile footer.
  Selecting it replaces the terminal in that pane with the reader.
- The reader: a bar (current file with `plan` badge where applicable, real path, freshness cue,
  pop-out, nav collapse arrow) above the sanitized render.
- A right-hand nav: the plan pinned on top, a collapsible file tree of `*.md` under the session
  directory with a filter box, and a collapsible outline of the open file's headings.
- Plan location from the transcript; refresh of the open file on the Write/Edit hook, on
  opening the surface and on window focus.
- Pop-out: the same reader on its own route, opened in a new tab.
- Per-session memory of the last open file and of which files Claude wrote this session.
- Confinement of served paths to the session directory or the derived plan path.
- Two pinned frontend dependencies and the ADR recording them.
- Read-only. The reader never edits or creates a file.

**Out of Scope:**

- Plan approval, the blocking `PermissionRequest` hook it needs, and any pending-approval state.
  Postponed to a follow-on plan that reuses this surface; the reader only leaves room.
- Files outside the session directory, other than the single derived plan path. No listing of
  `~/.claude/plans/` as a whole, no other repos.
- Non-markdown files. No code viewing, images or diffs (code diff viewing is its own TODO item
  behind `kb:adr/nongoal-diff-review-placeholder-button`).
- Subagent plans (`<slug>-agent-<name>.md`) and the `<slug>.workshop.md` sibling — never seen in
  practice; top-level plan only.
- Any filesystem watcher or modification-time poll (see Requirements § Change signal).
- Truncating large files or sending the user out of Muster to read one.
- `gh`. Not used anywhere in this feature.

## Requirements

### Surface

- R1. `SurfaceKind` gains `docs`. The segment renders as `claude | shell | docs` wherever the
  switch renders today, is keyboard-addressable like the other two, and follows the same
  "built once, mutated, never rebuilt on a tick" rule (`docs/conventions.md`).
- R2. Selecting `docs` shows the reader in that pane only; the session's Claude terminal keeps
  its one live client elsewhere untouched, exactly as the shell switch does today. Switching
  back restores the terminal.
- R3. `docs` is available on a dead session: the file tree still works; the plan slot is removed.

### Reader

- R4. Bar: `plan` badge (when the open file is the plan), file name, real absolute path (the
  plan lives outside the repo in `~/.claude/plans`, so the path is shown, never assumed),
  freshness cue ("changed N s ago", driven by the last Write hook seen for that path), a
  `pop out ↗` control, and the nav collapse/expand arrow (`›` on the nav edge when open, `‹` at
  the bar's right end when collapsed). No file-picker dropdown — the nav is the picker.
- R5. Body: the file rendered as GFM (tables, task-list checkboxes, fenced code, headings) on the
  `--well` ground with the existing type tokens (display face for headings, sans body, mono
  code). No new colours.
- R6. Whole file, always. No truncation and no "open elsewhere" fallback. A single generous
  refusal ceiling (far above any real document; number chosen at planning) returns a message
  instead of content; below it the file renders in full.
- R7. The last open file is remembered per session and restored when the surface is reopened.
  The first time a session has a plan and nothing remembered, the plan opens.
- R8. Pop-out opens the reader route for the same session and file in a **new tab**, carrying the
  full reader (bar and nav), not a bare render. The browser owns the tab from there.

### Right-hand nav

- R9. Plan slot pinned at the top, labelled, showing "no plan yet" when the session has no
  resolved plan or the resolved file does not exist. Removed on a dead session (R3).
- R10. File tree of every `*.md` under the session directory, folders collapsed by default with
  a count, paths relative to the directory. Listed via `git ls-files -co --exclude-standard`
  when the directory is a git checkout; otherwise a bounded plain walk skipping dot-directories.
- R11. A filter box above the tree narrows entries to matching paths.
- R12. The open file is highlighted in the tree; opening another moves the highlight.
- R13. A file the session's Claude wrote (any `PostToolUse` Write/Edit whose path is under the
  directory or is the plan) shows a changed dot until it is opened.
- R14. Below the tree, a collapsible **outline** of the open file's headings (VS Code
  Outline-panel style). Clicking a heading scrolls to it; the heading currently in view is
  highlighted as the reader scrolls. Tree and outline fold independently; the arrow (R4)
  collapses the whole nav.
- R15. In a tile the nav renders compact (narrower, path dropped from the bar). At 3×2 density
  the nav starts collapsed.

### Plan location and change signal

- R16. Muster keeps the latest `transcript_path` per session and derives the plan from it with
  the `planFilePath`-then-`slug` rule of the fact record, accepting every attachment type that
  carries `planFilePath`. The scan runs on `ExitPlanMode`, on `SessionStart` (resume/clear), and
  when the docs surface opens — not on every hook.
- R17. The session object gains an additive plan field (path + exists), refreshed by R16 and by
  any Write hitting the path. No protocol bump.
- R18. The open file re-renders when a `PostToolUse` Write or Edit hook names its path. Hooks are
  best-effort; a missed hook leaves the file stale and **labelled** stale by the freshness cue.
- R19. The plan is additionally re-read when the docs surface is opened and when the window
  regains focus. No polling, no filesystem watcher, no manual refresh button. (An edit made
  outside Claude is one the user already knows about.) The ADR notes that a plan-only
  modification-time poll may be wanted later.

### Serving and confinement

- R20. The daemon serves the file list and raw file bytes (`text/markdown`) for a session. A path
  is served only if, after symlink resolution, it sits under the session's directory or equals
  the derived plan path. Anything else is 404. The looseness of `GET /api/browse` (any
  directory) is not copied for file contents.
- R21. All Claude-Code-format knowledge (transcript line shapes, plan naming, `plansDirectory`)
  stays in `internal/claudecode/`.

### Rendering and dependencies

- R22. Rendering happens in the browser: **marked** (markdown → HTML) and **DOMPurify**
  (sanitizer) as the only two new runtime dependencies, pinned to exact versions like xterm.
  The daemon hands bytes; the dashboard never trusts them. Sanitization is not optional: the
  render lands in the dashboard's own origin, which holds the UI credential and can end/remove
  sessions, launch sessions and file public issues; and the content is composed from whatever
  Claude read, including web pages and third-party repos.
- R23. An ADR records the choice and the alternatives considered on 2026-09-13: markdown-it
  (six transitive deps vs. none, slower cadence), micromark/remark (no release in 18 months,
  large ecosystem), showdown (unmaintained), sanitize-html (archived), the daemon-side
  goldmark + bluemonday route (150 kB binary, dashboard must trust daemon HTML, task-list
  checkboxes stripped), and the browser-native Sanitizer API as the eventual exit for
  DOMPurify once it ships across browsers. It also states that no dependency-update automation
  exists in this repo — bumps are manual.

### Non-functional

- Rendering the largest plan on disk (52.6 kB) measured ~50 ms in the browser; anything under
  that is imperceptible. The transcript scan is ≤ 20 ms for the largest transcript.
- Hook loss is designed for (R18/R19), never assumed away.

## Edge Cases & Considerations

- **No plan yet.** Never entered plan mode, or entered and wrote nothing (`planExists:false`).
  Plan slot reads "no plan yet"; the tree still lists repo files.
- **`/clear` mid-session.** New transcript, old plan gone. "Latest `transcript_path`" wins, so
  the slot returns to "no plan yet" until a new plan is written.
- **Missed Write hook.** File is stale until the next hook, surface open or window focus. The
  freshness cue says so; nothing is hidden.
- **File deleted or renamed underneath the reader.** Reader shows "file no longer exists" with
  the path; the tree refreshes on its next listing.
- **Directory is not a git checkout.** Plain walk, dot-directories skipped, hard cap on entries.
- **Huge file.** Rendered whole (R6). A pathological input that slows the parser can only stall
  the dashboard tab, never the daemon; the refusal ceiling bounds it.
- **Dead session.** Files still exist; tree works, plan slot removed (R3).
- **Daemon down.** The existing banner covers it. The reader keeps its last render; the
  freshness cue ages.
- **Pop-out.** A new tab; nothing to block or fall back from.
- **Hooks marked `agent_id`.** A subagent writing under the directory still lights a changed dot
  (R13); subagent plan files are not listed (out of scope).
- **`plansDirectory` override.** Honoured automatically because `planFilePath` is already
  resolved; the slug fallback assumes `~/.claude/plans`. Not observed in practice.

## Acceptance Criteria

Surface
- [ ] 1. The `claude | shell` switch shows a third `docs` segment in the mainhead and every tile footer; selecting it replaces the terminal with the reader in that pane only.
- [ ] 2. Switching back to `claude` restores the live terminal with no reattach beyond what the shell switch already does.

Plan location
- [ ] 3. A session whose fake transcript carries a `planFilePath` attachment shows that file pinned at the top of the nav, labelled as the plan, and renders it.
- [ ] 4. A session with no such transcript line shows "no plan yet" in the plan slot and still lists repo files.
- [ ] 5. After a `SessionStart` naming a new transcript without a plan, the slot returns to "no plan yet".

File tree
- [ ] 6. The tree lists exactly the markdown files under the session directory, folders collapsed with counts, and never lists a file outside it.
- [ ] 7. Typing in the filter narrows the tree to matching paths.
- [ ] 8. The open file is highlighted; opening another moves the highlight.
- [ ] 9. A file written by a `PostToolUse` Write during the session shows a changed dot until opened.

Refresh
- [ ] 10. A `PostToolUse` Write or Edit hook whose path is the open file re-renders it and updates the freshness cue.
- [ ] 11. Opening the docs surface and regaining window focus each re-read the plan.
- [ ] 12. No request is made for the open file while nothing happens (no polling).

Reader
- [ ] 13. GFM tables, task lists and fenced code render.
- [ ] 14. A file containing `<script>`, an `onerror` attribute and a `javascript:` link renders with all three removed.
- [ ] 15. The outline lists the file's headings, clicking one scrolls to it, and the heading in view is highlighted as the reader scrolls.
- [ ] 16. The outline and the tree each fold independently; the arrow collapses the whole nav and brings it back.
- [ ] 17. The last open file per session is restored when the surface is reopened.

Confinement
- [ ] 18. A request for a path outside the session directory that is not the plan path returns 404, including via symlink and `..`.

Pop-out and dead sessions
- [ ] 19. The pop-out opens the same file in a new tab with bar and nav present.
- [ ] 20. On an ended session the plan slot is absent and the tree still works.

Technical
- [ ] 21. The daemon's transcript scan is unit-tested against captured `plan_mode`, `plan_mode_exit` and slug-only lines and becomes the `guard` on `kb:fact/plan-file-path-in-transcript`.
- [ ] 22. marked and DOMPurify are pinned to exact versions with an ADR recording the choice and alternatives (R23).

## References

- `kb:fact/plan-file-path-in-transcript`, `kb:fact/plan-mode-hook-sequence`,
  `kb:fact/hook-payload-fields`, `kb:fact/clear-mints-new-session-id`,
  `kb:fact/subagent-hooks-carry-agent-id`
- `kb:adr/issue-preview-is-the-leak-check`, `kb:adr/stack-git-and-gh-clis-not-go-git`,
  `kb:adr/connection-protocol-bumps-only-on-shape-change`,
  `kb:adr/surfaces-shell-control-in-tile-footer`, `kb:adr/surfaces-one-live-client-per-attach-target`
- `docs/history/design/markdown-viewing.md` — spike findings (renderer numbers, census, traps)
- `docs/design/mockups/markdown-viewing/` — placement mockups; chosen: option A with right nav
- `docs/features/surfaces/spec.md`, `docs/design/design-system.md`
- `SPEC.md` § 3.1 Plan-mode flow (downstream consumer of the reserved approval space)
- `TODO.md` § Pre-v1 Cleanup → "Markdown viewing"
- Spike prototype: branch `spike/markdown-viewing`, worktree `../muster-spike-markdown`
