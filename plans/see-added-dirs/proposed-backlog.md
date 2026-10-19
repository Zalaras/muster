# Proposed backlog — see-added-dirs

Follow-up this run found, proposed for the developer to file or drop at `/land`. Nothing here is
in `TODO.md`.

### Measure the status-line shapes the added-directories reader only assumes

**Summary**: Probe a status post with no `added_dirs`, a relative entry and a wrongly typed list; today a wrong type empties the list.
**Source**: test-specs.md Handoff 3 (authoring); daemon-tests.md Finding 2; review.code.cycle1.md notes.
**Change requested**: no — every reviewer noted it and asked for no change; the measured captures only ever show a list of absolute strings.
**Suggested section**: Fixes — card-location (an `/interface-probe` run, then a fact record).
**Pre-existing**: no; this branch adds the reader.

### Give the repo poll's read deadline a test seam

**Summary**: `repoReadTimeout` is a const, so the wedged-directory test waits out a real 5 s and shims git on `$PATH`.
**Source**: daemon-tests.md Fix Wave 2; review.code.cycle2.md Note 3.
**Change requested**: no — review-work left it to maintainability, which did not ask for it.
**Suggested section**: Work that releases nothing (test speed).
**Pre-existing**: partly; the poll had no git seam before this branch.

### Added-directory reads past about 180 per session

**Summary**: Past ~180 added directories in one session the tail of the list is not read within a tick and keeps its last reading.
**Source**: daemon-implementation.md Fix Attempt 1 `limit:` line; review.code.cycle2.md Note 2.
**Change requested**: no — review-work asked for no change; review-browser measured 200 directories all read in 3.9 s.
**Suggested section**: Fixes — card-location.
**Pre-existing**: no.

### Drop the `POPOVER_DELAY_MS` re-export from grouppopover.ts

**Summary**: Its only importer is `locationpanel.test.ts`; repoint it at `hovertip.ts` and drop the re-export.
**Source**: review.maintainability.cycle2.md Note 1.
**Change requested**: no — "A later tidy could … No change requested here."
**Suggested section**: Work that releases nothing (tidy).
**Pre-existing**: no.

### Launch-subdirectory and added-subdirectory folder names differ

**Summary**: A launch subdirectory reads `sub0` in the Location row, while an added subdirectory reads its checkout's top level.
**Source**: review.browser.cycle1.md Note 2; review.browser.cycle2.md notes.
**Change requested**: no — "matches the contract"; noted for review-work, who asked for nothing.
**Suggested section**: Features — card-location (would need a contract decision).
**Pre-existing**: partly; the launch row's naming predates this branch.

## Decisions (the developer, 2026-10-19)

1. Measure the status-line shapes — filed: TODO.md § Issues › Not yet grouped, "Added directories from status-line shapes nobody measured".
2. Test seam for the repo poll's read deadline — done on the branch instead of filed: 30a655c0 (`repoReadTimeout` is a var; the wedged-directory test runs in ~2.5 s, was ~6 s). Not filed.
3. Reads past about 180 directories — not doing.
4. Drop the `POPOVER_DELAY_MS` re-export — done on the branch instead of filed: 30a655c0. Not filed.
5. Folder names differ between the Location row and the Added list — filed: TODO.md § Issues › Features › Needs a `/spec` or a superseding ADR first, "A subdirectory's folder name differs between the Location row and the Added list".
