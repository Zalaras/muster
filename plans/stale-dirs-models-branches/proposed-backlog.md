# Proposed backlog: stale-dirs-models-branches

Follow-up this run found. Nothing here is filed; `/land` puts each to the developer.

### One shared directory-resolving helper for the daemon

- **Summary**: `server.resolvePath` and `claudecode.resolveTranscriptDir` are two copies of "clean + resolve symlinks"; give them one leaf home.
- **Source**: review.maintainability.cycle1.md Minor 1 (closed with a `design:` reason); cycle 2–6 Note 1; daemon-implementation.md Fix Attempt 1.
- **Change requested**: yes, as a follow-up — "one leaf package with a `ResolveDir` used by both" (daemon-impl); the reviewer accepted the stated reason for this plan and kept it as an orchestrator follow-up.
- **Suggested section**: On their own.
- **Pre-existing**: no — `resolvePath` is new on this branch.

### `StopLivenessPoll` also stops the repo poll

- **Summary**: `Server.StopLivenessPoll` now stops the repo poll too, so its name is narrower than what it does.
- **Source**: review.maintainability.cycle1.md Note 7; daemon-implementation.md Decisions.
- **Change requested**: no — "a follow-up candidate" (reviewer); renaming needs test edits the impl agent could not make.
- **Suggested section**: On their own.
- **Pre-existing**: partly — the name predates the plan; the wider behaviour is this branch's.

### web-components diagram counts for `features/` and `api/`

- **Summary**: `docs/diagrams/web-components.md` lists `features/` as 24 modules (26 on disk) and `api/` as 8 (10).
- **Source**: review.code.cycle2.md Major 2 `[orchestrator]` (the `render/` count this plan changed was fixed; these two were already wrong on `main`).
- **Change requested**: no — "those counts were already off on `main`" (reviewer).
- **Suggested section**: On their own.
- **Pre-existing**: yes.

### A clipped Focus-header name block is still read by screen readers

- **Summary**: a `↳` block that gives way is clipped, not removed, so assistive tech still reads text that is not visible.
- **Source**: review.browser.cycle3.md and cycle 4 Notes.
- **Change requested**: no (note).
- **Suggested section**: On their own.
- **Pre-existing**: no — the give-way layout is this branch's.

### A launch directory that loses `.git` shows the folder alone

- **Summary**: a launch directory that still exists but is no longer a checkout shows the basename with no branch.
- **Source**: test-specs.md validate attempt 1, observation (not routed).
- **Change requested**: no — "the plan pins only a directory that is gone or not a directory" (e2e-specs).
- **Suggested section**: On their own.
- **Pre-existing**: no — consistent with the plan's REQ-2 as written.

### `make e2e-soak` takes a file only

- **Summary**: soaking one test needs `bin/gatelock run --exclusive -- make e2e-soak-run SPEC="<file> -g '<title>'"`; a `GREP=` knob would make it a one-liner.
- **Source**: test-specs.md, review cycle 2 wave 3 notes.
- **Change requested**: no (note).
- **Suggested section**: On their own.
- **Pre-existing**: yes.

## Decisions (the developer, 2026-10-01)

- One shared directory-resolving helper for the daemon: not doing
- `StopLivenessPoll` also stops the repo poll: not doing
- web-components diagram counts for `features/` and `api/`: not doing
- A clipped Focus-header name block is still read by screen readers: not doing
- A launch directory that loses `.git` shows the folder alone: not doing
- `make e2e-soak` takes a file only: done directly at the developer's request, in its own commit on `main` after this land. Not filed.
