# Web Implementation: launch-dialog-fixes

**Plan**: launch-dialog-fixes
**Mode**: initial
**Pack**: kb: pack 18007 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/launch.ts` | modified | REQ-1: the `model_unrecognized` force-focus also requires `selectedModel() === model`. REQ-2: `knownRepos` held by the controller (survives `resetForm`), filled by `refreshKnownRepos()` at init, by `initOpen`'s own fetch, and in the new `finishLaunch` (shared by New and Resume success); `resetForm` applies `initialRestore` from it at open. REQ-3: `applyInitialRestore` became `applyRestore(restore)`; the `failed` branch and the no-recents branch apply `defaultRestore(touched)`. |
| `web/src/features/launchrestore.ts` | modified | `untouchedOnly` is now the one touched filter; `initialRestore` and new `defaultRestore(touched)` both go through it. |

## Decisions

- REQ-1 to REQ-3 all done; no protocol change, no Testable UI Elements table.
- design: `defaultRestore` sits beside `initialRestore` and shares `untouchedOnly`, so the touched decision exists once (the plan's reviewer-verified item). Precedent: `initialRestore`/`repoRestore` in the same file; nothing else restores defaults (`rg "DEFAULT_MODEL|DEFAULT_EFFORT" web/src` -> only `resetForm` and this module).
- design: `knownRepos` is separate from `repos`/`reposLoaded` (which `resetForm` clears so the sidebar keeps rendering only after the open's own fetch, per the plan's out of scope). Owner is the launch controller; written only by `refreshKnownRepos` and `initOpen`.
- design: `finishLaunch(session)` collapses the two identical close + `onLaunched` tails (New and Resume) and carries the repos refresh, so the refresh cannot be missed on one tab.
- design: `launch.ts` was already over the file-length threshold (824 lines before, 856 after); not split here, the change is localised.
- No comments added beyond editing one existing comment in `submitNew` to match the new guard.
- doc-delta: none beyond the plan's Doc Delta.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; vitest 2761 passed (96 files).
**E2E smoke**: `npx playwright test launch-model-check.spec.ts launch-defaults.spec.ts` -> `17 passed (1.7m)` (both new tests green: "a late refusal ... (REQ-1)" and "the dialog opens showing the first recent's remembered ... (REQ-2)").
None. No test files touched; no unit tests cover the new `defaultRestore` (web-tests may add one beside `launchrestore.test.ts`).
