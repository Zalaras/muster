# Plan: launch-dialog-fixes

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: launch-model-check.spec.ts daemon (per test, as the file's other tests); launch-defaults.spec.ts daemon (the recents list is daemon-global, as every test in the file)
**Features**: launch
**Description**: A late model refusal moves focus only while its model is still selected, and the launch dialog opens showing the remembered model, mode and effort.

## Symptom

From `TODO.md` § Fixes › Launch dialog:

- **A model refusal can move focus after the selection changed** — in one open dialog:
  submit model A (refused), change to B and submit, change back to A and click Title; B's
  refusal moves focus to the custom-model field. A refusal should move focus only while the
  refused model is still the selection. From `plans/maintainability-regressions/`.

- **Launch dialog briefly shows the wrong effort** — for up to 1.5 s after the launch dialog
  opens, Effort can read `default` before settling on the directory's remembered level. The
  dialog should open showing the remembered level. From `plans/effort/`.

## Findings

**Refusal focus — held as written.** `submitNew` (`web/src/features/launch.ts:567-586`) guards
the force-focus only on the verdict generation (`appliedToCurrentStore`), never on the current
selection, then calls `updateModelRowState(true)`. `renderModelRowState`
(`web/src/render/launch.ts:230`) focuses whichever control is invalid *now*. With A already
marked invalid by its own earlier refusal and selected again, B's late refusal focuses A's
control. Read from the code; the red E2E is the reproduction (a refusal lands late only when
the request is held).

**Effort flash — held, wider scope.** `resetForm` checks the defaults (`sonnet`, `auto`,
`default`) and `initOpen` (`launch.ts:476-504`) applies the first recent's remembered values only
after `GET /api/repos` and then `GET /api/browse` return. Measured against the developer's live
daemon: repos 0.097–0.121 s, browse 0.359–0.456 s — about half a second in which Model, Start
in and Effort all show defaults. "1.5 s" in the entry was the browse reviewer's sampling
interval (`plans/effort/review.md` Note 1), not the window. Model and mode share the cause; the
entry names Effort only because that run measured it.

## Requirements

### Must Have

- **REQ-1**: A `model_unrecognized` refusal moves focus only when the refused model is still the
  selected model when the refusal lands. The refused model is still marked unrecognized in the
  dialog's verdicts either way (selecting it again shows the mark and blocks Launch).
- **REQ-2**: When the dialog opens, Model, Start in and Effort already show the first recent's
  remembered values, before that open's own `GET /api/repos` and `GET /api/browse` return —
  provided a repos list has been fetched earlier in this page (the controller fetches it once
  at init and again after every successful launch from the dialog, New or Resume).
- **REQ-3**: The open's fresh fetch still decides: on `ok` its first recent's values are applied
  to every untouched field (as today); on `failed` (the first recent's directory is gone) every
  untouched field returns to the defaults, so a vanished recent restores nothing; on
  `superseded` nothing further happens. A field the developer changed after open is never
  overwritten.

## Affected Files

### Web (web-impl)
- `web/src/features/launch.ts` — REQ-1: the force-focus in `submitNew` also requires that the
  refused model is the current selection. REQ-2/3: a last-fetched repos list held by the controller,
  filled at init and after each successful launch; `resetForm`/`initOpen` apply the restore
  from it at open (through `initialRestore`, untouched fields only), and the `failed` branch
  resets untouched fields to the defaults.
- `web/src/features/launchrestore.ts` — only if the defaults-for-untouched step wants a pure
  helper beside `initialRestore`.

### Existing tests this breaks
- none

## Proof

Two E2E tests, written by **e2e-specs**, both red today:

1. `web/e2e/launch-model-check.spec.ts`, a new test "a late refusal of a model no longer selected
   leaves focus where it is (REQ-1)": submit custom model A (refused), change the custom field
   to B and Launch with B's `POST /api/sessions` held by `page.route`, change the field back to
   A, click Title, release B's request. Asserts Title is focused once `#model-error` shows —
   today focus lands on the custom-model field.
2. `web/e2e/launch-defaults.spec.ts`, a new test "the dialog opens showing the first recent's
   remembered model, mode and effort before its own fetch returns (REQ-2)": seed one launch
   via the API with model `haiku`, mode `default`, effort `high`; reload the page and wait for
   its first `GET /api/repos` response; hold every later `GET /api/repos` and `GET /api/browse`;
   open the dialog and assert `haiku`, `manual` and `high` are checked while both are held —
   today `sonnet`, `auto`, `default` are.

## Edge Cases

1. The dialog opens before the init fetch has returned (first open right after page load) →
   untested: falls back to today's behaviour, defaults until the fresh fetch lands.
2. A launch from another window changed the first recent since the last fetch → untested: the
   held list's values show at open and the fresh fetch corrects untouched fields, as REQ-3.
3. A vanished first recent: the held values show at open, then `failed` returns them to the
   defaults → E2 (the existing deleted-recent test in `launch-defaults.spec.ts`).
4. A field picked before the fresh fetch lands keeps the pick → E2 (shared with edge case 3; the existing model-race
   and effort-race tests).

## Acceptance Criteria

### Automated Checks

```checks
E1 cd web && npx playwright test launch-model-check.spec.ts launch-defaults.spec.ts -g 'late refusal|before its own fetch'
W1 make web-lint
W2 make web-test
W3 make web-build
E2 make e2e
```

### Reviewer-Verified
- The open-time restore still goes through `initialRestore`'s touched filter; no second copy of
  that decision.

## Doc Delta

**launch** — becomes true: the launch dialog opens showing the most recent directory's
remembered model, mode and effort from the list it last fetched, and the open's own fetch
corrects any field the developer hasn't changed; a late model refusal moves focus only while
that model is still selected. Stops being true: anything in the spec saying the remembered
values appear only after the open's fetch and navigation succeed.

## Out of scope
- The Recent sidebar and directory listing still render only once the open's own fetches
  return; only the three restored values change here.
