import { basename } from "node:path";
import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { childEntry, crumbButton, launchDialog, openLaunchDialog } from "./helpers/picker";
import { newSessionButton } from "./helpers/railcards";
import { railCard, railSortSelect } from "./helpers/railorder";
import {
  browseScratchDirectory,
  currentRailCard,
  envelopeOpts,
  launchSession,
  mainheadRenameButton,
  scratchDirectory,
  waitForNextClockSecond,
} from "./helpers/session";
import { activeElementInsideTerminal, liveTile, terminalRegion } from "./helpers/terminal";

// Plan new-session-improvement (#41) — REQ-7, REQ-8, INV-4. Plan acceptance: E5, E6, E7,
// E8.
//
// Before this plan, Focus's `onLaunched` rendered the new card but never called
// `app.focus(id)` or `surfaces.focusSelected(id)` at all. Two different things are new,
// and a test can only isolate one of them from the pre-existing "top of sort order"
// default-focus behaviour at a time:
//   - the current MARKER landing on the launch is only distinguishable from that
//     pre-existing default when another session already held it — a lone first launch
//     would land the marker there anyway even without this plan. The Focus tests that
//     assert the marker therefore launch a SECOND session after a first one already
//     holds focus.
//   - keyboard FOCUS landing in the terminal with no click is new regardless of session
//     count, since pre-plan `onLaunched` never touched keyboard focus at all — there is
//     no pre-existing default to confuse it with. The first test below launches a LONE
//     session into an empty Focus view to cover exactly this state (INV-4's fifth source
//     state), which a second-session launch can't isolate.
// The Tiles tests further down (free slot, full grid) each launch only one session too —
// Tiles has no analogous "default landed there anyway" behaviour to distinguish from, so
// one launch already proves both halves in that view.
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts): the current
// marker and rail/grid membership are daemon-global (mirrors focus-marker.spec.ts and
// tiles-launch.spec.ts's own rationale), and a neighbour test's session on a shared
// daemon would corrupt both.

test("launching the only session in Focus focuses it and routes typed keys to its terminal with no click (REQ-7, INV-4)", async ({
  page,
  daemon,
}) => {
  const target = await browseScratchDirectory(daemon, "muster-e2e-opens-focus-lone-");
  try {
    await page.goto(daemon.dashboardUrl);
    await expect(page.locator("#main-empty")).toBeVisible();

    const dialog = await openLaunchDialog(page);
    // Fresh daemon, no recents — opens straight onto the browse root (`target` is a
    // direct child of it).
    await childEntry(dialog, basename(target.path)).click();
    await dialog.getByLabel("Title").fill("opens-focus-lone");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const card = railCard(page, "opens-focus-lone");
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(currentRailCard(page)).toHaveCount(1);

    const region = terminalRegion(page, "opens-focus-lone");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // REQ-7/E5/E6, isolated from marker-reassignment: keyboard focus lands in the
    // terminal at launch time with no click, and survives a full render tick, even for
    // the very first session — proving this doesn't depend on stealing focus back from
    // an already-focused sibling.
    expect(await activeElementInsideTerminal(page, "opens-focus-lone")).toBe(true);
    await settleFor(page, 1_200);
    expect(await activeElementInsideTerminal(page, "opens-focus-lone")).toBe(true);

    await page.keyboard.type("lone-no-click");
    await page.keyboard.press("Enter");
    await expect(region).toContainText("stub-echo:lone-no-click");
  } finally {
    await target.cleanup();
  }
});

test("launching a second session in Focus focuses it, shows its title in the mainhead, and routes typed keys to its terminal with no click (REQ-7, E5, E6)", async ({
  page,
  daemon,
}) => {
  const dirA = await browseScratchDirectory(daemon, "muster-e2e-opens-focus-a-");
  const dirB = await browseScratchDirectory(daemon, "muster-e2e-opens-focus-b-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "opens-focus-a" });

    const cardA = railCard(page, "opens-focus-a");
    await expect(cardA).toHaveAttribute("aria-current", "true"); // the only session so far

    const dialog = await openLaunchDialog(page);
    // initOpen's initial restore navigates onto dirA (the one recent, REQ-8) before this
    // test does anything — go up to the browse root, then descend into dirB.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dirB.path)).click();
    await dialog.getByLabel("Title").fill("opens-focus-b");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const cardB = railCard(page, "opens-focus-b");
    await expect(cardB).toHaveAttribute("aria-current", "true");
    await expect(cardA).not.toHaveAttribute("aria-current", "true");
    await expect(currentRailCard(page)).toHaveCount(1);
    // Bystander (INV-4): A's own card is untouched by B's launch.
    await expect(cardA).toBeVisible();

    await expect(mainheadRenameButton(page)).toHaveText("opens-focus-b");

    const regionB = terminalRegion(page, "opens-focus-b");
    await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // E6: keyboard focus lands in B's terminal at launch time with no click, and
    // survives a full render tick (terminal.spec.ts/tiles.spec.ts's Critical-2
    // precedent for "typable across the 1s render tick") rather than a synchronous
    // snapshot taken right after dialog.close() restores focus to the opener.
    expect(await activeElementInsideTerminal(page, "opens-focus-b")).toBe(true);
    await settleFor(page, 1_200);
    expect(await activeElementInsideTerminal(page, "opens-focus-b")).toBe(true);

    await page.keyboard.type("no-click-needed");
    await page.keyboard.press("Enter");
    await expect(regionB).toContainText("stub-echo:no-click-needed");
  } finally {
    await dirA.cleanup();
    await dirB.cleanup();
  }
});

test("launching from Tiles with a full grid promotes the new session with keyboard focus already in its tile, no click needed (REQ-8, E7)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(
    Array.from({ length: 4 }, () => browseScratchDirectory(daemon, "muster-e2e-opens-tiles-seed-")),
  );
  const target = await browseScratchDirectory(daemon, "muster-e2e-opens-tiles-target-");
  try {
    await page.goto(daemon.dashboardUrl);
    for (const [i, d] of dirs.entries()) {
      await launchSession(page, daemon, { directory: d.path, title: `opens-tiles-seed-${i + 1}` });
    }

    // exact: true — the unscoped substring match also hits the seeded session
    // "opens-tiles-seed-1"'s rename button, whose accessible name contains "tiles"
    // (gauges.spec.ts/rail-layout.spec.ts/theme.spec.ts's own pattern for this collision).
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);

    await newSessionButton(page).click();
    const dialog = launchDialog(page);
    // Four prior launches means the dialog opens on the most recently launched
    // directory (a sibling of `target` under the same browse root) — go up one crumb to
    // the root, then descend into `target` (tiles-launch.spec.ts's own pattern).
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(target.path)).click();
    await dialog.getByLabel("Title").fill("opens-tiles-b");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    await expect(liveTile(page, "opens-tiles-b")).toBeVisible();
    // The grid stays full — one seed was demoted to the strip, not squeezed in.
    await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);

    const region = terminalRegion(page, "opens-tiles-b");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    expect(await activeElementInsideTerminal(page, "opens-tiles-b")).toBe(true);
    await settleFor(page, 1_200);
    expect(await activeElementInsideTerminal(page, "opens-tiles-b")).toBe(true);

    await page.keyboard.type("tile-no-click");
    await page.keyboard.press("Enter");
    await expect(region).toContainText("stub-echo:tile-no-click");
  } finally {
    await target.cleanup();
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("launching from Tiles with a free slot lands the new tile with keyboard focus already inside it (INV-4)", async ({
  page,
  daemon,
}) => {
  const target = await browseScratchDirectory(daemon, "muster-e2e-opens-tiles-free-");
  try {
    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.locator("#tiles-empty")).toBeVisible();

    await newSessionButton(page).click();
    const dialog = launchDialog(page);
    // Fresh daemon, no recents — opens straight onto the browse root (`target` is a
    // direct child of it).
    await childEntry(dialog, basename(target.path)).click();
    await dialog.getByLabel("Title").fill("opens-tiles-free");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    await expect(liveTile(page, "opens-tiles-free")).toBeVisible();
    const region = terminalRegion(page, "opens-tiles-free");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    expect(await activeElementInsideTerminal(page, "opens-tiles-free")).toBe(true);

    await page.keyboard.type("free-slot-no-click");
    await page.keyboard.press("Enter");
    await expect(region).toContainText("stub-echo:free-slot-no-click");
  } finally {
    await target.cleanup();
  }
});

test("in attention sort with another session needing input, the launched session stays focused across a render tick (REQ-7, E8)", async ({
  page,
  daemon,
  request,
}) => {
  const dirA = await scratchDirectory();
  const dirNeedy = await browseScratchDirectory(daemon, "muster-e2e-opens-attn-needy-");
  const dirC = await browseScratchDirectory(daemon, "muster-e2e-opens-attn-c-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "opens-attn-a" });
    // `last_launched_at` is whole-second RFC3339 (session.ts's own rationale for this
    // helper); without the wait, a launch inside the same wall-clock second as dirA's
    // ties on the repo list's `ORDER BY last_launched_at DESC` and the initial restore
    // can land back on dirA instead of dirNeedy.
    await waitForNextClockSecond();
    const needy = await launchSession(page, daemon, {
      directory: dirNeedy.path,
      title: "opens-attn-needy",
    });

    // Drives `needy` to needs-input (rail-order.spec.ts's own `makeNeedsInput` pattern)
    // so attention order puts it first — the state the default-focus render phase must
    // not fall back onto once the launched session holds focus.
    const claudeId = "claude-opens-attn-needy";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(needy, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });

    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect(railCard(page, "opens-attn-needy")).toBeVisible();

    const dialog = await openLaunchDialog(page);
    // initOpen's initial restore navigates onto dirNeedy (the most-recently-launched
    // recent, REQ-8) before this test does anything — go up to the browse root, then
    // descend into dirC.
    await crumbButton(dialog, basename(daemon.browseRoot)).click();
    await childEntry(dialog, basename(dirC.path)).click();
    await dialog.getByLabel("Title").fill("opens-attn-c");
    await dialog.getByRole("button", { name: "Launch" }).click();
    await expect(dialog).toBeHidden();

    const cardC = railCard(page, "opens-attn-c");
    await expect(cardC).toHaveAttribute("aria-current", "true");
    expect(await activeElementInsideTerminal(page, "opens-attn-c")).toBe(true);

    // The default-focus render phase only defaults `focusedId` when it is null or
    // vanished (Implementation Notes/Paths walked) — it must not steal it back from C
    // across the periodic render tick, even with the neediest session sorted first.
    await settleFor(page, 1_500);

    await expect(cardC).toHaveAttribute("aria-current", "true");
    await expect(currentRailCard(page)).toHaveCount(1);
    expect(await activeElementInsideTerminal(page, "opens-attn-c")).toBe(true);
  } finally {
    await dirA.cleanup();
    await dirNeedy.cleanup();
    await dirC.cleanup();
  }
});
