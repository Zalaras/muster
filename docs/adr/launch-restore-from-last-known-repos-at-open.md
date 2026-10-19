---
id: launch-restore-from-last-known-repos-at-open
type: decision
status: accepted
date: 2026-10-19
summary: The launch dialog restores model, mode and effort at open from the repos list it last fetched; the open's own fetch corrects untouched fields.
features: [launch]
tags: [ux]
files: [web/src/features/launch.ts, web/src/features/launchrestore.ts]
tests: []
refs: [plan:launch-dialog-fixes]
supersedes: []
---
**Context.** Each open checked the defaults (`sonnet`, `auto`, `default`) and applied the first
recent's remembered values only after `GET /api/repos` and `GET /api/browse` returned — about
0.5 s measured on the developer's daemon (repos 0.10–0.12 s, browse 0.36–0.46 s), during which
Model, Start in and Effort showed the wrong values.

**Options.** (A) Hold the dialog closed until both fetches return: every open is half a second
slower. (B) Keep the last-fetched repos list in the controller — fetched at page load and again
after every successful launch from the dialog — and apply the restore from it at open; the
open's own fetch still decides. (C) Apply the restore as soon as the open's repos fetch returns,
before browse: shortens the window to ~0.1 s but does not close it.

**Decision.** B. The open-time restore goes through the same touched filter as before
(`initialRestore`). On the open's own outcome: `ok` re-applies the fresh first recent to
untouched fields; `failed` (the directory is gone) returns untouched fields to the defaults
(`defaultRestore`), so a vanished recent still restores nothing; `superseded` does nothing.

**Consequences.** A dialog opened before the page's first fetch returns, or after a launch from
another window, shows the older values until the open's fetch corrects them. The Recent sidebar
and directory listing still render only after the open's own fetches.
