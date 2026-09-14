# Markdown viewer — placement mockups (2026-09-13)

Made during the `/spec markdown-viewing` interview to settle **where the viewer lives**. Nothing here
is decided; the spec records the pick. Each file is a self-contained 1440×900 render of the real
dashboard chrome (Instrument tokens transcribed from `web/src/style.css`) with sample content.

| Option | Focus | Tiles |
|---|---|---|
| A · Surface segment — a third `docs` choice in the `claude \| shell` switch; the document replaces the terminal in that pane | `a-surface-segment-focus.html` | `a-surface-segment-tiles.html` |
| B · Drawer — a Docs button opens a panel over the right side, file list on its left edge | `b-drawer-focus.html` | `b-drawer-tiles.html` |
| C · Split — reader beside the terminal (Focus); a reading column beside the grid (Tiles) | `c-split-focus.html` | `c-split-tiles.html` |
| D · Pop-out window — `Docs ↗` opens the reader as its own browser window on a `/doc` route | `d-popout-focus.html` | `d-popout-tiles.html` |

**Round 2 — A chosen (2026-09-13), with a right-hand file nav** (the docs-site "section nav"
pattern: main nav left, file nav right). The picker dropdown is gone; the bar shows the current
file, freshness and `pop out ↗`, which opens the same document in its own browser window (the
pop-out is a reader feature, not a placement). An arrow on the nav's edge collapses it; when
collapsed the arrow sits at the right end of the bar. **Decided: files only, the open file
highlighted in the nav** (the files-plus-outline variant was dropped):

| Variant | File |
|---|---|
| A2 · right nav holds the file tree — plan pinned on top, filter box, folders collapsed with counts | `a2-nav-files-focus.html` |
| A2 · nav collapsed via its arrow — full-width reading | `a2-nav-hidden-focus.html` |
| A2 · in a tile — compact nav, path dropped from the bar | `a2-nav-tiles.html` |

`reader-anatomy.html` is the reader component shared by every option: picker (plan first, then
`*.md` under the session directory), path, freshness cue from the Write hook, reserved space for
the postponed approval controls, sanitized body on the `--well` ground.

`gen.mjs` regenerates the artboards: `node gen.mjs` writes one `*.dc.html` per mockup (a canvas
editor format); the standalone files here are those with the `<x-dc>`/`<helmet>` wrappers and the
`support.js` script line stripped. It also writes a `canvas.json` layout, which is not kept.
