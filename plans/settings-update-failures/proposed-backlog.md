# Proposed backlog: settings-update-failures

Follow-up this run found. Proposed only; nothing here is filed in `TODO.md`. `/land` puts each entry to the developer.

### Retarget code citations of the superseded install-kinds ADR
**Summary**: ~10 comments still cite kb:adr/update-install-kinds-decide-who-may-apply, now superseded by update-install-rechecked-on-every-check.
**Source**: review.code.cycle3.md Note 3; review.code.md (cycle 4) Note 3; orchestrator's Completion step 4 grep (`cmd/musterd/main.go:164,449`, `internal/selfupdate/{install,lock}.go`, `internal/server/updatemanager.go:74`, `internal/selfupdate/CLAUDE.md:8`, two test files).
**Change requested**: no. The reviewer: "The sentences stay true; only the citation target changes when the ADR is accepted." The new ADR carries the kinds, precedence and apply serialisation forward unchanged.
**Suggested section**: Post v1
**Pre-existing**: partly. This branch added two of the citing comments; the rest predate it.

### The pop-out reader keeps the old dashboard across an update restart
**Summary**: After Update and restart, only dashboard windows reload; an open `doc.html` pop-out keeps the pre-update bundle.
**Source**: review.browser.cycle1.md Notes; review.browser.md (cycle 4): "`doc.html` has no banner and does not receive the mismatch or hello-arrived handlers".
**Change requested**: no. The reviewer called it "outside this plan".
**Suggested section**: Issues
**Pre-existing**: no. The reload is new in this branch, and the pop-out was deliberately left out of it.

### Keyboard focus drops to the page body after Check now
**Summary**: Pressing Check now by keyboard disables the button during the check, so focus falls to `<body>`.
**Source**: review.browser.cycle1.md Notes, carried in cycles 2–4.
**Change requested**: no. The reviewer marked it as predating the plan.
**Suggested section**: Issues
**Pre-existing**: yes. `settings.ts` / `update.ts` button disabling is unchanged by this branch.

## Decisions (the developer, 2026-09-25)

- Retarget code citations of the superseded install-kinds ADR — filed, reworded: TODO.md § Issues, "Code cites external docs".
- The pop-out reader keeps the old dashboard across an update restart — filed: TODO.md § Issues, "The pop-out reader keeps the old dashboard after Update and restart".
- Keyboard focus drops to the page body after Check now — filed: TODO.md § Issues, "Keyboard focus drops to the page body after Check now".
