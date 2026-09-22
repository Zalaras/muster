# Doc Reconcile: rail-card-improvements-2

**Plan**: rail-card-improvements-2
**Mode**: initial
**Verdict**: reconciled
**Features derived**: rail, surfaces, update, settings (plan header: rail, surfaces, update, settings)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| rail | A card is a title that wraps, above a state row of badge, time in the current state and pin. | `web/index.html:296-304` (`.r1` before `.r0` in `#session-card-template`'s `.card-in`) | added |
| rail | "A card is a state row (badge, time in the current state, pin) above a title that wraps" | — | deleted |
| rail | Compact clamps the title to one line and drops the activity line; comfortable clamps the activity line to three lines; expanded lets it run to however many lines it needs; the gauge track renders in all three. | `web/src/style.css:2009-2172` (base `.activity` 3-line clamp = comfortable; `[data-rail-density="compact"] .activity{display:none}` with `.r3` unaffected; `[data-rail-density="expanded"] .activity{display:block;overflow:visible}`) | added |
| rail | "compact clamps the title to one line and drops the gauge track and the activity line, expanded lets the activity line run to three lines" | — | deleted |
| rail | The activity line carries its full text as a hover title, alongside the repo line and the title. | `web/src/render/sessions.ts:115,128,144,150` (`name.title`, `repoLine.title`, `activityYou.title`, `activityClaude.title`) | added |
| rail (docs/protocol.md prefs section) | Same density-ramp correction as above, in the `railDensity` prose (`docs/protocol.md:199-203`) — the line named explicitly by the amendment. | same as above | added |
| rail (docs/protocol.md prefs section) | "`compact` clamps the title to one line and drops the gauge track and the activity line, `expanded` lets the activity line run to three lines" citing the superseded ADR | — | deleted |
| update | The `updateCheck` preference governs automatic checking only, and a user-initiated check runs regardless of it. | `internal/server/update.go:259` (`checkAvailability(ctx context.Context, manual bool)`), `:641-657` (`handleCheckUpdate` — no pref check, 404 only on `canCheck` false) | added |
| update | "turning it off clears the available version and stops every update-related request" (the "stops every update-related request" half) | — | deleted |
| update | The Updates section carries a Check now button and shows how long ago the last successful check ran. | `web/index.html` `#update-check-button`; `web/src/render/update.ts:43-63` (`checkEnabled`, `agoSuffix(formatAge(update.checkedAt, now))`) | added |
| update | `docs/protocol.md` carries `kb:anchor/update.check` and documents `canCheck` under `kb:anchor/ws.update`. | `docs/protocol.md` `POST /api/update/check` section and `canCheck` field in the `update` WS message — already present in the working tree (implemented directly against the protocol contract; not stale) | verified, no edit needed |
| update | `ws.update`'s "null when ... `prefs.updateCheck` is false" as a reason `available` is null | — | already corrected in `docs/protocol.md` (reads "after `prefs.updateCheck` was turned off, which clears it" — a one-time clearing event, not a standing condition); no edit needed |
| update | the prefs section's "`updateCheck`: governs checking only" | — | already corrected in `docs/protocol.md:182-186` (reads "governs the daemon's automatic checking only"); no edit needed |
| settings | Updates shows a Check now button beside a "Check for updates daily" toggle that governs automatic checking only. | `web/src/features/settings.ts:83,139,159` (`checkBtn`, `onCheckNow` → `deps.update.check()`) | added |
| settings | "a \"Check for updates daily\" toggle that governs checking only" | — | deleted |
| surfaces | (no doc change — REQ-6 made the code match the existing "shows a spinner while busy and a tick once work finishes" sentence) | `web/src/style.css:679-750` (`.shellact[data-act="busy"]`/`[data-act="done"]`) | verified, no edit needed |

ADR citations updated alongside the claims they support (body and frontmatter `refs`, in `docs/features/rail/spec.md`, `docs/features/settings/spec.md`, `docs/features/update/spec.md`):
`kb:adr/rail-card-state-row-then-wrapping-title` → `kb:adr/rail-card-title-leads-and-density-ramp-corrected`;
`kb:adr/update-check-pref-governs-checking-only` → `kb:adr/update-check-pref-governs-automatic-checking-only` (+ `kb:adr/update-manual-check-is-a-synchronous-post` added). Both new ADRs are `proposed` on this branch, matching the plan.

## Contradictions

None.

## For the orchestrator

None.

## Checks

`make gen-kb`:
```
kb: regenerated 2 file(s): docs/features/settings/contract.md, docs/features/views/contract.md
```
(both carry the shared `railDensity` prose from `docs/protocol.md`'s prefs section). Re-run after: `kb: all generated files fresh`.

`make check-kb`:
```
kb: 395 records, 23 features, 0 problem(s)
kb: all checks pass
```

Word counts (800-word spec budget, frontmatter excluded):
- `docs/features/rail/spec.md` — 586
- `docs/features/update/spec.md` — 346
- `docs/features/settings/spec.md` — 196
