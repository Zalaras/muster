# Rail groups — functional mockups (2026-10-05)

Made during the `/spec groups` interview (#74, with #27 bulk remove and #56 right-click menu in
reach). Nothing here is decided; the spec records the pick. Each page is the real dashboard chrome
(Instrument/Light tokens transcribed from `web/src/style.css`) with a clickable rail: groups collapse,
rename inline, delete with a choice of what happens to their sessions, Stop all, drag cards between
groups and headers to reorder blocks, multi-select, filter, and both sort modes. Tiles view is ignored.

All four pages run one engine (`shared.js`) switched by `window.V`, so any axis can be swapped:

| Axis | A · Sections + Select mode (recommended) | B · Folders + right-click | C · Stacks + picker |
|---|---|---|---|
| "Everything else" | a section called **Ungrouped**, same header as a group | no header — loose cards are the rail; groups sit above | a section called **Unfiled** |
| Header look | thin sticky section rule | thin section rule | collapsed group reads as a stacked card |
| Summary | count + dot·number per state | count + text (`2 working · 1 needs input`) | count + proportional state bar, numbers for needs-input/failed only |
| Multi-select | **Select** toggle → checkboxes + bottom bar | ⌘-click / ⇧-click, no mode; floating bar | checkbox on hover (Gmail) |
| Menus | header ⋯ kebab; cards have none (drag, select, Focus-header chip) | right-click on card, selection, header and blank rail | header ⋯ kebab |
| Move to | menu from the bar / Focus-header chip, or drag | right-click → Move to ▸, or drag | picker dialog with member counts |
| New group | `+ group` adds an empty, inline-named section | right-click → New group… (dialog); from a selection | `+ group` → name dialog |
| Pin scope | pinned block per section | one global pinned block, cards carry a group chip | per section |
| Attention sort | sections stay put, cards sort inside | folders bubble by their most urgent card | flattens to one list with group chips |
| Filter | segmented `All · Groups · Ungrouped` | dropdown, can isolate one group | hide a section with its hover `hide`; ⌸ lists hidden |

`mix.html?select=hover&summary=bar…` exposes every axis as a control; the URL is the combination.

## Round 2 — A chosen (2026-10-05), refining

`a-sections-select-mode.html` now takes `?sort=none|outside|inside&create=icon|menu|text|none&summary=…&hover=popover|title`
from its mock bar. `a-refine-board.html` lays out every summary style (dots, glyphs, chips, ticks, nums, bar, text) on
the same three groups with the hover popover, and five rail-head layouts. Findings so far: the live rail's sort
select has no label (the round-1 `sort:` prefix was invented); a label beside it costs a third head row at 300px;
the create affordance moved to a second "groups row" as an icon-only `+` with tooltip and ⌥⌘G, also reachable
from each header's ⋯ and the selection bar.

`a-round3.html` — round 3 board: New session vs New group, the launch dialog Group row, the Focus-header group at three widths, the rail with no groups. Live A gained `groups=0|1|2`, `lone=hidden|shown`, `mainhead=none|meta|chip`, `create=split`.

**Locked 2026-10-05 (round 3):** New group lives in a rail `⋯` menu with Select, Collapse all, Expand all (New session
stays in the masthead); the launch dialog gets a Group row under Title with `new group…`; the Focus header keeps a group
control that is the first thing dropped on a narrow pane — title first to a 22ch floor, repo / branch never truncate; no
Ungrouped header or filter until the first group exists.
