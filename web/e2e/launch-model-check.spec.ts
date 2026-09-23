import { basename } from "node:path";
import { expect, test } from "./helpers/fixtures";
import {
  currentCrumb,
  launchError,
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
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts): INV-1 asserts
// the rail's card count and the Recent sidebar are exactly as before a refusal, which a
// neighbour test's launch on a shared daemon would corrupt.

const UNRECOGNIZED_MODEL = "muster-e2e-unrecognized-model";
const REFUSAL_MESSAGE = `Claude Code doesn't recognise the model "${UNRECOGNIZED_MODEL}" — update Claude Code, or pick another model`;

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

  // REQ-1: the refusal's exact message.
  await expect(launchError(dialog)).toBeVisible();
  await expect(launchError(dialog)).toHaveText(REFUSAL_MESSAGE);

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

    await expect(launchError(dialog)).toBeVisible();
    await expect(launchError(dialog)).toHaveText(REFUSAL_MESSAGE);

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
