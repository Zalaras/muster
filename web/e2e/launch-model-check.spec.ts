import { basename } from "node:path";
import { expect, settleFor, test } from "./helpers/fixtures";
import {
  currentCrumb,
  escapeForRegExp,
  launchError,
  modelError,
  openLaunchDialog,
  recentButton,
  recentsSidebar,
} from "./helpers/picker";
import { browseScratchDirectory, getState, launchSession, sessionCard } from "./helpers/session";

// Plan new-session-improvement (#29) — REQ-1, REQ-2, REQ-3, INV-1, INV-2 (E2E slice).
// Plan acceptance: E3, E4.
//
// The daemon's pre-check (`claude --bare --no-session-persistence --model <model> -p
// ''`, kb:fact/model-catalog-precheck-zero-token) is answered end to end by the shared
// stub `claude` (helpers/daemon.ts's STUB_CLAUDE_SCRIPT, extended by this plan): a model
// starting with `muster-e2e-unrecognized` gets the measured catalog-refusal sentence on
// stderr, every other model passes through clean. REQ-2's fail-open contract (a run that
// errors, times out or prints no sentence) is a daemon-unit concern (D4/D6) — this file
// drives only the two observable dashboard outcomes: refused and recognised.
//
// The two tests above take the per-test `daemon` fixture (helpers/fixtures.ts): INV-1
// asserts the rail's card count and the Recent sidebar are exactly as before a refusal,
// which a neighbour test's launch on a shared daemon would corrupt.
//
// Plan maintainability-regressions (#55) adds the dialog-open catalog check below:
// REQ-1, REQ-2, REQ-4 through REQ-10, INV-1 through INV-2 (E2E slice; INV-3/INV-4 are
// D3/D4's job, INV-5 is D7/D8's). Plan acceptance: E1-E5 (E6's two tests above keep every
// assertion they had — REQ-1's exact refusal message, REQ-3's field retention, INV-1's
// untouched rail/Recent state — except where that message is read from, amended in review
// cycle 1 to `#model-error` per decision A, kb:adr/launch-model-refusal-shown-in-field-error-only).
// Every new test takes `startDaemon` (helpers/fixtures.ts) with its own
// `stubUnrecognizedModels` — the per-run env seam helpers/daemon.ts's STUB_CLAUDE_SCRIPT
// gained for this plan, alongside the pre-existing `muster-e2e-unrecognized*` prefix —
// since none of them assert daemon-global rail state the way the two tests above do.

const UNRECOGNIZED_MODEL = "muster-e2e-unrecognized-model";
const REFUSAL_MESSAGE = `Claude Code doesn't recognise the model "${UNRECOGNIZED_MODEL}" — update Claude Code, or pick another model`;

const UNRECOGNIZED_PRESET = "fable";
const PRESET_REFUSAL_MESSAGE = `Claude Code doesn't recognise the model "${UNRECOGNIZED_PRESET}" — update Claude Code, or pick another model`;

test("an unrecognized custom model into a never-launched directory is refused, writes nothing, and a retry with a recognised model succeeds (REQ-1, REQ-2, REQ-3, INV-1, E3, E4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  // Fresh daemon, opened straight onto the browse root with no recents — E3's
  // "never-launched directory".
  await dialog.getByRole("radio", { name: "other…" }).check();
  await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
  await dialog.getByRole("radio", { name: "plan" }).check();
  await dialog.getByLabel("Title").fill("model-check-refused");
  await dialog.getByRole("button", { name: "Launch" }).click();

  // REQ-1: the refusal's exact message. Decision A
  // (kb:adr/launch-model-refusal-shown-in-field-error-only) puts a model_unrecognized
  // refusal in #model-error only; #launch-error is never used for this code.
  await expect(modelError(dialog)).toBeVisible();
  await expect(modelError(dialog)).toHaveText(new RegExp(escapeForRegExp(REFUSAL_MESSAGE)));
  await expect(launchError(dialog)).toBeHidden();

  // REQ-3: the dialog stays open with every field exactly as typed.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("model-check-refused");
  await expect(dialog.getByLabel("Custom model")).toHaveValue(UNRECOGNIZED_MODEL);
  await expect(dialog.getByRole("radio", { name: "other…" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "plan" })).toBeChecked();

  // INV-1 (E2E slice): a refused launch writes nothing the dashboard can see — no card
  // anywhere, and the Recent sidebar has no entry for the directory the refusal targeted
  // (the byte-identical settings.local.json / repo-row half of INV-1 is D7's job).
  await expect(page.getByTestId("session-card")).toHaveCount(0);
  await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
  await expect(recentsSidebar(dialog).getByRole("button")).toHaveCount(0);

  // E4: retrying with a recognised model closes the dialog and launches, from the very
  // same open dialog the refusal left in place.
  await dialog.getByRole("radio", { name: "sonnet" }).check();
  await dialog.getByRole("button", { name: "Launch" }).click();
  await expect(dialog).toBeHidden();

  const card = sessionCard(page, "model-check-refused");
  await expect(card).toBeVisible();

  const state = await getState(page, daemon);
  const launched = state.sessions.filter((s) => s.title === "model-check-refused");
  expect(
    launched,
    "exactly one session launched, no spurious extra from the refused attempt",
  ).toHaveLength(1);
  expect(launched[0]?.model?.id).toBe("sonnet");
});

test("an unrecognized model into a previously-launched directory leaves its rail card count and its Recent's stored model/mode untouched (REQ-1, INV-1)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-model-check-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "model-check-seed",
      model: "opus",
      permissionMode: "acceptEdits",
    });

    const dialog = await openLaunchDialog(page);
    // Opens straight onto the one recent (REQ-8, launch spec).
    await expect(currentCrumb(dialog)).toHaveText(basename(dir.path));

    await dialog.getByRole("radio", { name: "other…" }).check();
    await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
    await dialog.getByLabel("Title").fill("model-check-retry-seeded");
    await dialog.getByRole("button", { name: "Launch" }).click();

    // REQ-1: decision A (kb:adr/launch-model-refusal-shown-in-field-error-only) puts a
    // model_unrecognized refusal in #model-error only.
    await expect(modelError(dialog)).toBeVisible();
    await expect(modelError(dialog)).toHaveText(new RegExp(escapeForRegExp(REFUSAL_MESSAGE)));
    await expect(launchError(dialog)).toBeHidden();

    // INV-1: still exactly the one seeded card — the refused attempt added nothing.
    await expect(page.getByTestId("session-card")).toHaveCount(1);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Reopening shows the recent's stored model/mode exactly as the seed launch left
    // them — the refused attempt never overwrote the repo row's lastModel/lastPermissionMode.
    const reopened = await openLaunchDialog(page);
    await expect(recentButton(reopened, basename(dir.path))).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(reopened.getByRole("radio", { name: "opus" })).toBeChecked();
    await expect(reopened.getByRole("radio", { name: "accept edits" })).toBeChecked();
  } finally {
    await dir.cleanup();
  }
});

test("an unrecognised preset is disabled while the currently-selected preset stays launchable (REQ-6, REQ-7, INV-1, E1)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubUnrecognizedModels: [UNRECOGNIZED_PRESET] });
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  // The form's own default — no recent, so the dialog opens with sonnet selected.
  await expect(dialog.getByRole("radio", { name: "sonnet" })).toBeChecked();

  // REQ-6/REQ-7: the dialog-open request covers every preset; fable's verdict arrives
  // unrecognised and, since it isn't the current selection, disables it.
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).not.toBeChecked();

  // INV-1: the selected sonnet preset was never touched by fable's verdict.
  await expect(dialog.getByRole("radio", { name: "sonnet" })).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(modelError(dialog)).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
});

test("the selected preset is marked invalid and blocks Launch when its own verdict is unrecognised (REQ-8, INV-1, INV-2, E2)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubUnrecognizedModels: [UNRECOGNIZED_PRESET] });
  await page.goto(daemon.dashboardUrl);

  // Holds GET /api/models open until fable is selected, so the selection change always
  // lands before its verdict — REQ-8's "kept selected, marked invalid" path exercised
  // deterministically (edge case 4's ordering) rather than racing the real round trip.
  let releaseModelsResponse: () => void = () => {};
  const modelsHeld = new Promise<void>((resolve) => {
    releaseModelsResponse = resolve;
  });
  await page.route("**/api/models*", async (route) => {
    await modelsHeld;
    await route.continue();
  });

  const dialog = await openLaunchDialog(page);
  await dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET }).check();

  // Move focus off the just-checked radio before releasing the held verdict, so the
  // assertion below can tell "the verdict's arrival left focus alone" apart from "focus
  // merely never left the radio it was checked with". `renderModelRowState`'s doc comment
  // (render/launch.ts, the canonical statement of this rule) says the default path never
  // moves focus off a control that stays enabled; the only default-path exception is a
  // focused Launch that this verdict is disabling, which is not this test's case (Title,
  // not Launch, holds focus below) — so this dialog-open verdict (`requestModelVerdicts`,
  // called with the default `forceFocusInvalid=false`) must leave focus on Title.
  const titleInput = dialog.getByLabel("Title");
  await titleInput.click();
  await expect(titleInput).toBeFocused();

  releaseModelsResponse();

  // REQ-8: the selection is kept and marked invalid — not disabled, since REQ-7 only
  // disables an unrecognised preset that ISN'T the current selection.
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toBeEnabled();
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toHaveAttribute(
    "aria-describedby",
    "model-error",
  );
  await expect(modelError(dialog)).toBeVisible();
  await expect(modelError(dialog)).toHaveText(new RegExp(escapeForRegExp(PRESET_REFUSAL_MESSAGE)));
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();

  // The dialog-open verdict marking this already-selected preset invalid must not steal
  // focus back onto it.
  await expect(titleInput).toBeFocused();
});

test("switching away from an invalid preset selection clears the mark and re-enables Launch (REQ-8, INV-1, INV-2, E3)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubUnrecognizedModels: [UNRECOGNIZED_PRESET] });
  await page.goto(daemon.dashboardUrl);

  // Same deterministic ordering as E2: select fable before its verdict lands.
  let releaseModelsResponse: () => void = () => {};
  const modelsHeld = new Promise<void>((resolve) => {
    releaseModelsResponse = resolve;
  });
  await page.route("**/api/models*", async (route) => {
    await modelsHeld;
    await route.continue();
  });

  const dialog = await openLaunchDialog(page);
  await dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET }).check();
  releaseModelsResponse();
  await expect(modelError(dialog)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();

  await dialog.getByRole("radio", { name: "sonnet" }).check();

  // E3: the mark and message clear, Launch re-enables, and fable — now unselected and
  // still unrecognised — becomes disabled (REQ-7).
  await expect(modelError(dialog)).toBeHidden();
  await expect(dialog.getByRole("radio", { name: "sonnet" })).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toBeDisabled();
});

test("an unrecognised custom model submitted via Launch marks Custom model invalid, and editing its text clears the mark (REQ-9, INV-1, INV-2, E4)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({});
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await dialog.getByRole("radio", { name: "other…" }).check();
  await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
  await dialog.getByLabel("Title").fill("model-check-custom-invalid");
  await dialog.getByRole("button", { name: "Launch" }).click();

  // REQ-9: the refused custom field is marked invalid the same way REQ-8 marks a preset
  // — via #model-error. Decision A
  // (kb:adr/launch-model-refusal-shown-in-field-error-only, review cycle 1 browser Major
  // 1 / Minor 2) means #launch-error is never used for a model_unrecognized refusal —
  // asserted explicitly below, both right after the refusal and after the edit that
  // clears the mark, since the pre-fix behaviour left #launch-error showing the stale
  // message even once the field itself had cleared.
  await expect(modelError(dialog)).toBeVisible();
  await expect(modelError(dialog)).toHaveText(new RegExp(escapeForRegExp(REFUSAL_MESSAGE)));
  await expect(launchError(dialog)).toBeHidden();
  await expect(dialog.getByLabel("Custom model")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByLabel("Custom model")).toHaveAttribute(
    "aria-describedby",
    "model-error",
  );
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();

  // REQ-9: editing the text has no verdict yet, so the mark clears and Launch
  // re-enables; #launch-error stays hidden throughout, never naming a model that is no
  // longer selected.
  await dialog.getByLabel("Custom model").fill("muster-e2e-custom-edited");
  await expect(dialog.getByLabel("Custom model")).not.toHaveAttribute("aria-invalid", "true");
  await expect(modelError(dialog)).toBeHidden();
  await expect(launchError(dialog)).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
});

test("navigating to a recent whose stored model is not a preset re-requests its verdict on restore (REQ-6, edge case 11)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({});
  const dir = await browseScratchDirectory(daemon, "muster-e2e-model-restore-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "model-check-restore-seed",
      model: "muster-e2e-custom-restore",
      permissionMode: "default",
    });

    const modelsRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/api/models") &&
        new URL(req.url()).searchParams.getAll("model").includes("muster-e2e-custom-restore"),
    );
    const dialog = await openLaunchDialog(page);

    // REQ-8 (launch spec): a single recent opens the dialog straight onto it, restoring
    // its stored (non-preset) model — REQ-6 says that value gets its own verdict
    // request too, not just the four presets'.
    await expect(currentCrumb(dialog)).toHaveText(basename(dir.path));
    await expect(dialog.getByRole("radio", { name: "other…" })).toBeChecked();
    await expect(dialog.getByLabel("Custom model")).toHaveValue("muster-e2e-custom-restore");
    await modelsRequest;

    // Recognised (not stubbed unrecognised), so nothing is marked and Launch stays
    // enabled — the request firing is this test's point, not a refusal.
    await expect(modelError(dialog)).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
  } finally {
    await dir.cleanup();
  }
});

test("with the daemon down, opening the dialog marks and disables nothing (REQ-10, E5)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubUnrecognizedModels: [UNRECOGNIZED_PRESET] });
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  await daemon.kill();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });

  // Set up the listener before the click that triggers the dialog-open GET /api/models,
  // so the connection-level failure (the daemon is dead, not just slow or erroring) is
  // never missed. Waiting for this event, rather than only polling the assertions below,
  // ties this test to the failed request actually happening — otherwise every assertion
  // below would pass on the very first poll whether or not the request ran at all.
  const modelsRequestFailed = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("/api/models"),
  );
  const dialog = await openLaunchDialog(page);
  await modelsRequestFailed;

  // REQ-10: the verdict request fails outright (no daemon to answer it), so nothing is
  // marked or disabled — the dialog looks exactly as it would with no verdicts at all.
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toBeEnabled();
  await expect(dialog.getByRole("radio", { name: UNRECOGNIZED_PRESET })).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(modelError(dialog)).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
});

test("a refusal that disables a focused Launch moves focus onto the invalid Custom model field, which survives a tick and keeps a following Tab inside the dialog (review cycle 1 browser Minor 1)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({});
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await dialog.getByRole("radio", { name: "other…" }).check();
  await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
  await dialog.getByLabel("Title").fill("model-check-focus-retain");

  // A real pointer click both focuses Launch and submits it — the reviewer's own repro
  // (browser review cycle 1 Minor 1): before the fix, the refusal's `disabled = true`
  // dropped `document.activeElement` to `<body>`.
  await dialog.getByRole("button", { name: "Launch" }).click();

  await expect(modelError(dialog)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();

  const customModelInput = dialog.getByLabel("Custom model");
  await expect(customModelInput).toBeFocused();
  // Node-identity check, not just "a field with this name is focused" — a re-render
  // that rebuilt the input would also carry the accessible name.
  await customModelInput.evaluate((el) => el.setAttribute("data-e2e-kept-focus", "1"));

  await settleFor(page, 1_500);
  await expect(dialog.locator('[data-e2e-kept-focus="1"]')).toBeFocused();
  await expect(customModelInput).toBeFocused();

  // The disabled Launch button is skipped in the tab order, so the next stop stays
  // somewhere inside the dialog rather than escaping it the way <body> would.
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
});

test("a model_unrecognized refusal submitted by Enter in Title, never focusing Launch, still moves focus onto the invalid Custom model field (review cycle 2 code Major 1/3)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({});
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await dialog.getByRole("radio", { name: "other…" }).check();
  await dialog.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);

  // Submits via the form's native Enter-in-a-text-field behaviour — `document.activeElement`
  // never touches Launch on this path (the form's own `submit` listener runs `submit()`
  // regardless of which field dispatched it). Review cycle 2 code Major 1's bug:
  // `renderModelRowState`'s pre-fix `launchHadFocus`-only guard moved focus only when Launch
  // itself had been focused, so this exact path left the refusal unannounced —
  // `#model-error` has no live-region role, so a moved focus was its only announcement
  // (kb:adr/launch-model-refusal-shown-in-field-error-only's consequence clause). The fix
  // (`submit`'s `updateModelRowState(true)`) forces focus onto the invalid control
  // regardless of where it started.
  const titleInput = dialog.getByLabel("Title");
  await titleInput.fill("model-check-enter-from-title");
  await titleInput.press("Enter");

  await expect(modelError(dialog)).toBeVisible();
  await expect(modelError(dialog)).toHaveText(new RegExp(escapeForRegExp(REFUSAL_MESSAGE)));
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();
  await expect(dialog.getByLabel("Custom model")).toBeFocused();
});

test("a stale model_unrecognized refusal from a cancelled-and-reopened dialog moves no focus in the reopened dialog (review cycle 3 code Major 1 / browser Minor 1)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubUnrecognizedModels: [UNRECOGNIZED_PRESET] });
  await page.goto(daemon.dashboardUrl);

  // Holds the launch POST so it can be released only after the dialog that sent it has
  // been cancelled and a second dialog opened in its place — web-implementation.md's Fix
  // Attempt 3 repro for browser review cycle 3 Minor 1 / maintainability Minor 1: the
  // refusal's store write and its force-focus are two effects of one response, and a
  // stale refusal (generation mismatch, `features/launch.ts`'s `appliedToCurrentStore`)
  // must move neither.
  let releaseSessionsResponse: () => void = () => {};
  const sessionsHeld = new Promise<void>((resolve) => {
    releaseSessionsResponse = resolve;
  });
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await sessionsHeld;
    await route.continue();
  });

  const g1 = await openLaunchDialog(page);
  await g1.getByRole("radio", { name: "other…" }).check();
  await g1.getByLabel("Custom model").fill(UNRECOGNIZED_MODEL);
  await g1.getByLabel("Title").fill("model-check-stale-refusal");
  await g1.getByRole("button", { name: "Launch" }).click();

  // Cancel while the POST is still in flight. Escape closes a native <dialog> with no
  // listener of this feature's own in the way (no "cancel"/"close" handler in
  // features/launch.ts), so nothing here reacts to the still-pending response.
  await page.keyboard.press("Escape");
  await expect(g1).toBeHidden();

  // Reopening bumps `modelVerdicts`' generation (`resetForm`, called from `openModal`) —
  // the g1 POST above is now answering a generation that no longer matches. Hold the
  // reopened dialog's own open-time GET /api/models, exactly like the "the selected
  // preset is marked invalid…" test above, so selecting fable always lands before its
  // own verdict rather than racing the round trip.
  let releaseModelsResponse: () => void = () => {};
  const modelsHeld = new Promise<void>((resolve) => {
    releaseModelsResponse = resolve;
  });
  await page.route("**/api/models*", async (route) => {
    await modelsHeld;
    await route.continue();
  });

  const g2 = await openLaunchDialog(page);
  await g2.getByRole("radio", { name: UNRECOGNIZED_PRESET }).check();
  const titleInput = g2.getByLabel("Title");
  await titleInput.click();
  await expect(titleInput).toBeFocused();

  releaseModelsResponse();

  // Sanity check first: fable's own dialog-open verdict marks it invalid, and — the
  // default, non-forced path this plan's other tests already cover — leaves focus on
  // Title. This confirms the state the stale refusal below is released into.
  await expect(g2.getByRole("radio", { name: UNRECOGNIZED_PRESET })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(modelError(g2)).toHaveText(new RegExp(escapeForRegExp(PRESET_REFUSAL_MESSAGE)));
  await expect(titleInput).toBeFocused();
  // Node-identity check, not just "a field named Title is focused" — a re-render that
  // rebuilt the input would also carry the accessible name.
  await titleInput.evaluate((el) => el.setAttribute("data-e2e-kept-focus", "1"));

  // Release the cancelled dialog's stale refusal and wait for the real round trip (the
  // route forwards to the actual daemon rather than fabricating a response) to finish
  // and its handler to run. #model-error already reads fable's message before this
  // release (asserted above), so a `waitFor`-style expect immediately after the release
  // would pass trivially whether or not the stale refusal's own handler had run yet —
  // this is the one sanctioned fixed hold for exactly that "did it change" gap, the same
  // `settleFor` idiom the focus-retention test above uses.
  releaseSessionsResponse();
  await settleFor(page, 1_500);

  // The store write is already known to drop a stale generation (review cycle 2); this
  // is the proof that the force-focus guard added in review cycle 3 drops the second
  // effect too — #model-error keeps showing fable's own (unrelated) invalidity, never
  // the custom model's, and focus stays on the exact Title node.
  await expect(modelError(g2)).toHaveText(new RegExp(escapeForRegExp(PRESET_REFUSAL_MESSAGE)));
  await expect(g2.locator('[data-e2e-kept-focus="1"]')).toBeFocused();
  await expect(titleInput).toBeFocused();
});
