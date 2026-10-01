# Decision: focus-header-wraps-before-repo-drops

**Outcome**: B — the header wraps as soon as the repo block would drop below its floor. The repo readout then shows at every width where a second row can hold it, and narrowing never brings it back.
**Reached by**: user decision (the developer, 2026-10-01, review cycle 3 browser Minor 2)
**Decisive argument**: The developer preferred a repo readout that never disappears and reappears as the window narrows over keeping the header on one row.
**Dissent to honour**: Option A (accept the readout coming and going; the rail card still shows the repo) was not chosen. Cost accepted: the header is 80 px instead of 49 px over a wider band of widths, 1024 px included.
**Landed in**: `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` (proposed, amended)
