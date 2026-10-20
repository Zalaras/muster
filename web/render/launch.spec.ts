// The launch feature's display properties (plans/_audit/relevel/classify-launch-update.md):
// what the launch dialog's own controls show for a given snapshot, and what a launch leaves
// on the rail, the Focus header and a tile before any hook arrives. Ported on 2026-10-20 from
// web/e2e/{launch,effort-launch,launch-model-check,launch-defaults,bypass,tiles-launch,
// permission-mode}.spec.ts; the journeys stay there.
//
// One fact shapes every dialog test here: `initOpen()` (web/src/features/launch.ts) always
// issues a `GET /api/browse`, which the harness answers 404 like every unmocked `/api/**`. So
// the dialog opens with the harness's message in `#launch-error`, the crumb bar and child
// listing never populate, no recent is ever `aria-pressed`, and the first recent's restored
// model/mode/effort is reset to the defaults by the failed navigate. Nothing below reads any
// of those; every property here touches only the form's own controls (radios, Title, tabs,
// Escape/Cancel, the bypass face, the Effort row, the sidebar's list from `/api/repos`) or
// a card's chip and note. The browse-dependent properties stay in web/e2e/ until the harness
// serves `/api/browse` from a recording.
//
// The clock starts at FIXTURE_EPOCH; every createdAt is that epoch plus whole minutes, so the
// no-signal test advances the clock from the epoch to the session's createdAt plus the
// threshold rather than waiting real time.
import { focusedNode, focusSession, sessionCard, tagNode } from "./helpers/focus";
import {
  type Dashboard,
  expect,
  FIXTURE_EPOCH,
  type Locator,
  type Page,
  type RenderFixture,
  settleFor,
  test,
} from "./helpers/harness";
import {
  bypassChip,
  bypassRadio,
  bypassWarning,
  effortRadio,
  effortRadiogroup,
  launchPrimaryButton,
  modelError,
  pickEffort,
  recentButton,
  recentsSidebar,
} from "./helpers/launch";
import { newSessionButton } from "./helpers/rail";
import { launchDialog, openLaunchDialog, resumeTab } from "./helpers/shortcuts";
import { liveTile } from "./helpers/tiles";

/** `web/src/sessions/card.ts`'s NO_SIGNAL_THRESHOLD_SECONDS: how long after a known
 * directory's launch a card with no Claude session reads "no signal yet". */
const NO_SIGNAL_THRESHOLD_SECONDS = 10;

/** One `GET /api/repos` row as the fixture carries it (kb:anchor/repos.list). */
interface RepoRow {
  path: string;
  name: string;
}

function repoRows(fixture: RenderFixture): RepoRow[] {
  return fixture.repos.map((row) => {
    const r = row as Partial<RepoRow>;
    if (typeof r.path !== "string" || typeof r.name !== "string") {
      throw new Error("fixture repos row without a string path and name");
    }
    return { path: r.path, name: r.name };
  });
}

async function openEmptyDialog(page: Page, dashboard: Dashboard) {
  const fixture = await dashboard.open("empty");
  expect(fixture.repos).toEqual([]);
  const dialog = await openLaunchDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

// ═══ web/e2e/launch.spec.ts — the dialog's static layout, close paths, the sidebar ═══

// The static half of "opens on the browse root with an empty sidebar when there are no recents,
// exposing every Testable UI Element and none of the removed legacy browse controls" (its
// crumb half — the browse root, the Launch-in readout, the composed crumb path — stays in
// web/e2e/launch.spec.ts), folded together with permission-mode.spec.ts's "the Start in
// radiogroup keeps its role and accessible name across the rename" (REQ-1 regression).
test("with no recents the dialog exposes every Testable UI Element and none of the removed legacy browse controls, and the Start in radiogroup keeps its role and accessible name (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2; fix-auto-mode-select REQ-1)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  // REQ-2: no Browse… button, no unfold panel, no Up button, no Use this folder
  // button, no raw path field survives the rebuild. Exact names: every ancestor crumb is
  // a button, and a scratch dir name containing "up" would match a substring.
  await expect(dialog.getByRole("button", { name: "Browse…", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Up", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Use this folder", exact: true })).toHaveCount(0);
  for (const removedId of [
    "#browse-button",
    "#browse-panel",
    "#browse-up",
    "#use-this-folder",
    "#selected-directory",
  ]) {
    await expect(dialog.locator(removedId)).toHaveCount(0);
  }

  // REQ-16: no recents -> sidebar empty state, no recent buttons at all.
  await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
  await expect(recentsSidebar(dialog).getByRole("button")).toHaveCount(0);

  // Testable UI Elements: Title, Model group (5 options incl. fable), Start in group.
  await expect(dialog.getByLabel("Title")).toBeVisible();
  for (const model of ["sonnet", "opus", "haiku", "fable", "other…"]) {
    await expect(dialog.getByRole("radio", { name: model })).toBeVisible();
  }
  await expect(dialog.getByLabel("Custom model")).not.toBeVisible();
  await dialog.getByRole("radio", { name: "other…" }).check();
  await expect(dialog.getByLabel("Custom model")).toBeVisible();

  // REQ-1 (fix-auto-mode-select): renamed to Claude Code's own vocabulary, plus the new
  // `auto` fourth radio, in Shift+Tab cycle order — under a radiogroup whose role and
  // accessible name the rename left alone (the plan's one row marked "existing
  // aria-label; unchanged").
  await expect(dialog.getByRole("radiogroup", { name: "Start in" })).toBeVisible();
  for (const mode of ["manual", "accept edits", "plan", "auto"]) {
    await expect(dialog.getByRole("radio", { name: mode })).toBeVisible();
  }

  await expect(dialog.getByRole("button", { name: "Launch" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form (REQ-14, E15)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");

  let dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("should-not-persist");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  dialog = await openLaunchDialog(page);
  await expect(dialog.getByLabel("Title")).toHaveValue(""); // fresh reset on reopen
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  dialog = await openLaunchDialog(page);
  await dialog.getByLabel("Title").fill("still-here");
  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("still-here");
});

test("a recent's title attribute is its full absolute path (REQ-18)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const repos = repoRows(fixture);
  expect(repos.length).toBeGreaterThan(1);

  const dialog = await openLaunchDialog(page);
  await expect(recentsSidebar(dialog).getByRole("button")).toHaveCount(repos.length);
  for (const repo of repos) {
    await expect(recentButton(dialog, repo.name)).toHaveAttribute("title", repo.path);
  }
});

// review cycle 1 Major 4 of plan new-session-dialog: the one proof that a card for a known
// directory still reaches the "no signal yet" state. `firstLaunchNote`
// (web/src/sessions/card.ts) derives it from `state: started`, `claudeSessionId: null`,
// `firstLaunchHere: false` and `elapsedSeconds(createdAt, now) ≥ NO_SIGNAL_THRESHOLD_SECONDS`;
// the fixture's second launch into the same directory holds the first three, and the clock
// supplies the fourth without a wall-clock wait.
test("a card for a known (non-first-launch) directory still shows the no-signal note after ~10s (REQ-14 regression)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("second-launch-no-signal");
  const seed = fixture.snapshot.sessions.find((s) => s.title === "no-signal-seed");
  const second = fixture.snapshot.sessions.find((s) => s.title === "no-signal-second");
  if (!seed || !second) throw new Error("the fixture holds both launches by title");
  expect(seed.firstLaunchHere).toBe(true);
  expect(second.firstLaunchHere).toBe(false);
  expect(second.claudeSessionId).toBeNull();
  expect(second.state).toBe("started");

  const seedCard = sessionCard(page, "no-signal-seed");
  const card = sessionCard(page, "no-signal-second");
  await expect(card).toBeVisible();
  // The first launch into the directory reads the trust-prompt note at once; the second
  // reads nothing until the threshold.
  await expect(
    seedCard.getByText("first launch here — likely waiting on Claude Code's trust prompt"),
  ).toBeVisible();
  await expect(card.getByText(/no signal yet/i)).toHaveCount(0);

  // The clock is at the epoch and createdAt is later than it: advance to createdAt plus the
  // threshold, plus one render tick so the card re-derives its note.
  const sinceEpoch = Date.parse(second.createdAt) - Date.parse(FIXTURE_EPOCH);
  expect(sinceEpoch).toBeGreaterThanOrEqual(0);
  await settleFor(page, sinceEpoch + NO_SIGNAL_THRESHOLD_SECONDS * 1_000 + 1_500);

  await expect(card.getByText(/no signal yet/i)).toBeVisible();
  await expect(
    seedCard.getByText("first launch here — likely waiting on Claude Code's trust prompt"),
  ).toBeVisible();
});

// ═══ web/e2e/effort-launch.spec.ts — the Effort row ═══

test("the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort (REQ-1, E2)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  await expect(effortRadiogroup(dialog)).toBeVisible();
  await expect(dialog.locator("legend", { hasText: "Effort" })).toBeVisible();

  const radios = effortRadiogroup(dialog).getByRole("radio");
  await expect(radios).toHaveCount(6);
  for (const [i, name] of ["default", "low", "medium", "high", "xhigh", "max"].entries()) {
    await expect(radios.nth(i)).toHaveAccessibleName(name);
    await expect(radios.nth(i)).toHaveAttribute("name", "effort");
  }
  expect(
    await radios.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
  ).toEqual(["", "low", "medium", "high", "xhigh", "max"]);
  await expect(effortRadio(dialog, "default")).toBeChecked();
  for (const level of ["low", "medium", "high", "xhigh", "max"] as const) {
    await expect(effortRadio(dialog, level)).not.toBeChecked();
  }

  // After the Model row's error line and custom-model input, before Start in.
  const inOrder = await dialog.evaluate((root) => {
    const q = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) throw new Error(`no ${selector} in the dialog`);
      return el;
    };
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const model = q('[role="radiogroup"][aria-label="Model"]');
    const error = q("#model-error");
    const custom = q("#custom-model-input");
    const effort = q('[role="radiogroup"][aria-label="Effort"]');
    const startIn = q('[role="radiogroup"][aria-label="Start in"]');
    return [
      follows(model, effort),
      follows(error, effort),
      follows(custom, effort),
      follows(effort, startIn),
    ];
  });
  expect(inOrder).toEqual([true, true, true, true]);
});

test("the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);
  await resumeTab(dialog).click();
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");

  // Resume hides the form's fields as a block: Effort goes with Model and Start in. (The
  // past list shows the harness's fetch error, which this claim never reads.)
  await expect(dialog.getByRole("radiogroup", { name: "Model" })).toBeHidden();
  await expect(effortRadiogroup(dialog)).toBeHidden();
});

// The keyboard half of "the arrow keys move the Effort selection with focus on the same node,
// it survives a render tick, and the keyboard-chosen level is what launches"; the launch half
// (the pane's `--effort`) stays in web/e2e/effort-launch.spec.ts.
test("the arrow keys move the Effort selection with focus on the same node, and it survives a render tick (REQ-1)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  // Setup, not evidence: put focus on the checked segment. The keys below are the round trip.
  await effortRadio(dialog, "default").focus();
  await page.keyboard.press("ArrowRight");
  const low = effortRadio(dialog, "low");
  await expect(low).toBeChecked();
  await expect(low).toBeFocused();
  await tagNode(low, "effort-low");
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-low" });

  // Past the 1 s render tick: the same node, still focused, still checked.
  await settleFor(page, 1_200);
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-low" });
  await expect(low).toBeChecked();

  await page.keyboard.press("ArrowRight");
  const medium = effortRadio(dialog, "medium");
  await expect(medium).toBeChecked();
  await expect(medium).toBeFocused();
  await expect(low).not.toBeChecked();
  await tagNode(medium, "effort-medium");
  await settleFor(page, 1_200);
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-medium" });
  await expect(medium).toBeChecked();
});

test("clicking the max segment checks it, and it stays the checked one across a render tick (REQ-1)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  await pickEffort(dialog, "max");
  await expect(effortRadio(dialog, "max")).toBeChecked();
  await expect(effortRadio(dialog, "default")).not.toBeChecked();

  await settleFor(page, 1_200);
  await expect(effortRadio(dialog, "max")).toBeChecked();
  await expect(effortRadio(dialog, "default")).not.toBeChecked();

  await pickEffort(dialog, "default");
  await expect(effortRadio(dialog, "default")).toBeChecked();
  await expect(effortRadio(dialog, "max")).not.toBeChecked();
});

// ═══ web/e2e/launch-model-check.spec.ts — the fail-open display ═══

// REQ-10's fail-open display: with no verdicts nothing is marked or disabled. In the harness the
// dialog-open `GET /api/models` answers 404, which `requestModelVerdicts`
// (web/src/features/launch.ts) treats exactly as a connection failure — `{ok: false}` leaves
// the verdict store untouched — so the dialog looks as it would with no daemon at all.
test("with the daemon down, opening the dialog marks and disables nothing (REQ-10, E5)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  await expect(dialog.getByRole("radio", { name: "fable" })).toBeEnabled();
  await expect(dialog.getByRole("radio", { name: "fable" })).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(modelError(dialog)).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled();
});

// ═══ web/e2e/launch-defaults.spec.ts — the fresh dialog's defaults ═══

test("a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  await expect(dialog.getByRole("radio", { name: "auto" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "sonnet" })).toBeChecked();
});

// ═══ web/e2e/bypass.spec.ts — the bypass face, the chip and the note ═══

// Carries the pre-launch face half of "checking "bypass" shows the warning and turns Launch
// into a danger "Launch without checks"…" (REQ-1, E1) as well — the exact warning sentence and
// the not-checked-yet face; that journey keeps its launch half whole.
test('unchecking "bypass" restores the ordinary "Launch" face (INV-2)', async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);

  // Not checked yet: the ordinary amber, non-danger face.
  await expect(bypassWarning(dialog)).toBeHidden();
  await expect(launchPrimaryButton(dialog)).toHaveText("Launch");
  await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);

  await bypassRadio(dialog).check();
  await expect(bypassWarning(dialog)).toBeVisible();
  await expect(bypassWarning(dialog)).toHaveText(
    "Bypass permissions — every tool call runs without asking: edits, shell commands, network. Nothing stops a bad command.",
  );
  await expect(launchPrimaryButton(dialog)).toHaveText("Launch without checks");
  await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);

  await dialog.getByRole("radio", { name: "manual" }).check();
  await expect(bypassWarning(dialog)).toBeHidden();
  await expect(launchPrimaryButton(dialog)).toHaveText("Launch");
  await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);
});

async function bypassFixtureSession(fixture: RenderFixture, title: string) {
  const session = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`the fixture holds a session titled ${title}`);
  expect(session.permissionMode).toEqual({ value: "bypassPermissions", source: "seed" });
  expect(session.claudeSessionId).toBeNull();
  expect(session.firstLaunchHere).toBe(true);
  return session;
}

test("the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives (REQ-4, REQ-5, E2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("bypass-launch");
  await bypassFixtureSession(fixture, "bypass-chip-e2");

  const card = sessionCard(page, "bypass-chip-e2");
  await expect(bypassChip(card)).toHaveText("bypass");
  await focusSession(page, "bypass-chip-e2");
  await expect(bypassChip(page.locator("#mainhead"))).toHaveText("bypass");

  // REQ-5: no SessionStart has arrived yet, and this is a first launch into a never
  // before-seen directory — `firstLaunchHere` is true, so the note is the combined
  // trust-prompt-then-bypass-warning form (card.ts's `firstLaunchNote`), not the plain
  // "likely waiting on Claude Code's bypass warning" text that only applies once a
  // directory has been launched into before.
  await expect(
    card.getByText(
      "first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning",
    ),
  ).toBeVisible();
});

// The chip-shown half of "in Tiles, the bypass session's tile header shows the chip, and a
// hook reporting default removes it" (E12); the hook-driven clear stays in
// web/e2e/bypass.spec.ts. The view is a pref the dashboard adopts only from the broadcast, so
// the fixture holds it.
test("in Tiles, the bypass session's tile header shows the chip (E12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("bypass-launch-tiles");
  expect(fixture.snapshot.prefs.view).toBe("tiles");
  await bypassFixtureSession(fixture, "bypass-chip-e2");

  const tile: Locator = liveTile(page, "bypass-chip-e2");
  await expect(tile).toBeVisible();
  await expect(bypassChip(tile)).toHaveText("bypass");
});

// ═══ web/e2e/tiles-launch.spec.ts — the masthead button in Tiles ═══

test("Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("empty-tiles");
  expect(fixture.snapshot.prefs.view).toBe("tiles");
  expect(fixture.snapshot.sessions).toEqual([]);

  // REQ-6/INV-3 (rail-card-improvements): one button total, visible in Tiles too — not
  // hidden with the rail, and the old Tiles-only toolbar button is gone.
  await expect(newSessionButton(page)).toBeVisible();
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);
  await expect(page.locator("#tiles-empty")).toContainText("New session");

  await newSessionButton(page).click();
  const dialog = launchDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});
