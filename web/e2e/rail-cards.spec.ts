import { expect, fileDaemon, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  rawNotification,
  rawStop,
  rawUserPromptSubmit,
  runningShellTask,
} from "./helpers/payloads";
import { pinButton } from "./helpers/railorder";
import {
  currentRailCard,
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { cardContextRow } from "./helpers/gauges";

// Plan code-breakup's E2E split (plan.md UI Specifications → E2E split) moved these
// tests out of actions.spec.ts: they exercise a rail card's own chrome (sort position,
// keyboard activation, hover/focus-reveal opacity, and focus survival across a render
// tick or a real re-sort) rather than the End/Remove/Resume/dead-surface flow the rest
// of that plan (m4-reconcile) covered — see actions.spec.ts's file header for what
// stayed there. Originally REQ-9, REQ-11 (m4-reconcile) and their review fix-cycle
// follow-ups (Major 1/2/5, Minor 1/2/3).
//
// Daemon shape (docs/conventions.md §Testing): every test here reads the file-shared
// `sharedDaemon()` (one scratch daemon per file via fileDaemon()) — every assertion is
// scoped to its own session's title/card, so a neighbour test's session sharing the
// daemon is harmless. They stay in file order rather than being grouped into a describe
// so no test is renamed or moved.

// Plan status-inconsistencies (REQ-6, REQ-7): a live card offers no action button (End is
// in the mainhead and tile footers), and a card whose session has background work shows a
// `N background task(s)` line. E5-E7 and E9 join the file-shared daemon (each test titles
// its own session); E8 needs Tiles, whose view pref is daemon-global, so it takes the
// per-test `daemon` fixture. The keyboard and focus tests that used to press End on a
// rail card now press the mainhead's End, or a control a live card still has (Pin), or the
// Remove an ended card still offers. Those assert new behaviour and were collection-only
// at authoring.

const sharedDaemon = fileDaemon();

// review m4-reconcile fix-cycle-1 Major 5: action buttons nested in a card whose own
// `keydown` listener used to run `event.preventDefault()` for every bubbled key, cancelling
// the button's own Enter/Space activation — the fix guards that listener with
// `event.target !== card`. Plan status-inconsistencies removed End from a live card, so the
// keyboard round-trip runs on the mainhead's End here, and on the nested Remove an ended
// card still offers in the test after the next. Focus and a separate real key, never
// `locator.press()`, which bundles the two.
test("the mainhead's End button activates via keyboard Enter and Space, not just a mouse click (REQ-7, REQ-11, Major 5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "kbd-mainhead-end",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-kbd-mainhead-end",
        await envelopeOpts(session, sharedDaemon()),
      ),
    });
    const card = sessionCard(page, "kbd-mainhead-end");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("kbd-mainhead-end");
    const endBtn = mainhead.getByRole("button", { name: "Stop", exact: true });
    const dialog = page.getByRole("dialog", { name: "Stop session?" });

    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stop session" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const state = await getState(page, sharedDaemon());
    expect(findSession(state, session.id).alive).toBe(false);
    // INV-D: the card never offered the button the keys were pressed on.
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 1: `reconcileCards`'s reorder calls `insertBefore` on an
// already-mounted card when a real priority change moves it, which blurs a focused
// descendant on detach. A live card's remaining focusable control is its pin button, so the
// reorder focus check runs on that (node identity tagged).
test("a focused card control survives a rail re-sort triggered by a real priority change (REQ-7, REQ-11, Minor 1)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const sessionA = await launchSession(page, sharedDaemon(), {
      directory: dirA.path,
      title: "resort-focus-a",
    });
    const sessionB = await launchSession(page, sharedDaemon(), {
      directory: dirB.path,
      title: "resort-focus-b",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-resort-focus-a",
        await envelopeOpts(sessionA, sharedDaemon()),
      ),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-resort-focus-b",
        await envelopeOpts(sessionB, sharedDaemon()),
      ),
    });

    const cardA = sessionCard(page, "resort-focus-a");
    const cardB = sessionCard(page, "resort-focus-b");
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    // A priority-driven DOM reorder only happens in Attention mode (plan order-sidebar:
    // manual mode, the default, never moves a card on a state change).
    await page.locator("#rail-sort").selectOption("attention");
    await expect(page.locator("#rail-sort")).toHaveValue("attention");

    const titlesBefore = await page.getByTestId("session-card").allInnerTexts();
    const idxABefore = titlesBefore.findIndex((t) => t.includes("resort-focus-a"));
    const idxBBefore = titlesBefore.findIndex((t) => t.includes("resort-focus-b"));
    expect(idxABefore).toBeGreaterThanOrEqual(0);
    expect(idxBBefore).toBeGreaterThanOrEqual(0);
    expect(idxABefore).toBeLessThan(idxBBefore);

    const pinBtnB = pinButton(cardB);
    await pinBtnB.focus();
    await expect(pinBtnB).toBeFocused();
    await pinBtnB.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-pin-btn";
    });

    // A genuine priority change (the `needs_input` band sorts first), not a render tick.
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-resort-focus-b"),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawNotification("claude-resort-focus-b", "p1", "permission_prompt"),
    });
    await expect(stateBadge(cardB)).toHaveText(/needs input/i, {
      timeout: 15_000,
    });

    await expect
      .poll(async () => {
        const titlesAfter = await page.getByTestId("session-card").allInnerTexts();
        const idxAAfter = titlesAfter.findIndex((t) => t.includes("resort-focus-a"));
        const idxBAfter = titlesAfter.findIndex((t) => t.includes("resort-focus-b"));
        return idxAAfter >= 0 && idxBAfter >= 0 && idxBAfter < idxAAfter;
      })
      .toBe(true);

    await expect(pinBtnB).toBeFocused();
    expect(
      await pinBtnB.evaluate(
        (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-pin-btn",
      ),
    ).toBe(true);
    await expect(cardB.getByRole("button", { name: "Stop" })).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

// E6: the task-notification turn that follows a finished background command ends with an
// empty list.
test("a later Stop with an empty background_tasks list removes the line (E6, REQ-5, REQ-6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "bgtasks-e6",
    });
    const claudeId = "claude-bgtasks-e6";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, sharedDaemon())),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningShellTask()] }),
    });
    const card = sessionCard(page, "bgtasks-e6");
    const line = card.getByText(/^\d+ background tasks?$/);
    await expect(line).toHaveText("1 background task");

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2", prompt: "<task-notification>done" }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p2", backgroundTasks: [] }),
    });

    await expect(line).toHaveCount(0);
    await expect(stateBadge(card)).toHaveText(/idle/i);
    expect(findSession(await getState(page, sharedDaemon()), session.id).backgroundTasks).toBe(0);
  } finally {
    await cleanup();
  }
});

// E7 (REQ-7, INV-D): End is gone from a live rail card — at rest, under hover, and while
// the card is the current one.
test("a live rail card has no End button, on hover and while current (E7, REQ-7, INV-D)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "no-end-e7",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-no-end-e7", await envelopeOpts(session, sharedDaemon())),
    });
    const card = sessionCard(page, "no-end-e7");
    await expect(card).toBeVisible();
    const anyAction = card.getByRole("button", { name: /^(End|Resume|Remove)$/ });

    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await expect(anyAction).toHaveCount(0);

    await card.hover();
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await expect(anyAction).toHaveCount(0);

    await card.click();
    await expect(currentRailCard(page).filter({ hasText: "no-end-e7" })).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await expect(anyAction).toHaveCount(0);
    await expect(card.locator(".acts-row")).toBeHidden();
    await expect(card.locator(".acts-row button")).toHaveCount(0);

    // Still true after a render tick and an unrelated state change.
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-no-end-e7"),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// E9 (REQ-7): ending from the mainhead still works and leaves an ended card whose menu (plan
// rail-card-organise REQ-2: the card has no buttons) offers Resume then Remove…; with a second
// live session, only the focused one ends.
test("ending from the mainhead ends only that session, and its card's menu then offers Resume and Remove… in that order (E9, REQ-7)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const sessionA = await launchSession(page, sharedDaemon(), {
      directory: dirA.path,
      title: "end-e9-a",
    });
    const sessionB = await launchSession(page, sharedDaemon(), {
      directory: dirB.path,
      title: "end-e9-b",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-e9-a", await envelopeOpts(sessionA, sharedDaemon())),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-end-e9-b", await envelopeOpts(sessionB, sharedDaemon())),
    });
    const cardA = sessionCard(page, "end-e9-a");
    const cardB = sessionCard(page, "end-e9-b");
    await expect(cardA.getByRole("button", { name: "Stop" })).toHaveCount(0);

    await cardA.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("end-e9-a");
    await mainhead.getByRole("button", { name: "Stop", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Stop session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stop session" }).click();
    await expect(dialog).toBeHidden();
    await expect(cardA).toHaveClass(/ended/, { timeout: 15_000 });

    await expect(cardA.getByRole("button", { name: /^(Stop|End|Resume|Remove)/ })).toHaveCount(0);
    await cardA.click({ button: "right" });
    const menuItems = page.getByRole("menu").getByRole("menuitem");
    await expect(menuItems.nth(0)).toHaveText("Resume");
    await expect(menuItems.nth(1)).toHaveText("Remove…");
    await expect(menuItems.nth(0)).toBeEnabled();
    await expect(menuItems.nth(1)).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Stop…", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const state = await getState(page, sharedDaemon());
    expect(findSession(state, sessionA.id).alive).toBe(false);
    expect(findSession(state, sessionB.id).alive).toBe(true);
    await expect(cardB).not.toHaveClass(/ended/);
    expect(await sharedDaemon().tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

// Plan focus-lands REQ-1 (#69): a render pass must leave a known context row's elements
// in place, because Chrome fires no click when the pressed element is replaced before the
// release. The tag is a JS property on the live node, so it survives only if the node does.
test("a status line that changes a card's context percent updates its context row in place, so the row's track is the same element (REQ-1, E1)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "context-in-place",
    });
    const card = sessionCard(page, "context-in-place");
    const claudeId = "claude-context-in-place";
    const opts = await envelopeOpts(session, sharedDaemon());

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, opts),
    });
    await request.post(sharedDaemon().ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        ...opts,
        contextUsedPct: 40,
        totalInputTokens: 80000,
      }),
    });
    const row = cardContextRow(card);
    await expect(row).toContainText("40%");

    const track = row.locator(".ctx");
    await track.evaluate((el) => {
      (el as HTMLElement & { __kept?: boolean }).__kept = true;
    });

    await request.post(sharedDaemon().ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        ...opts,
        contextUsedPct: 41,
        totalInputTokens: 82000,
      }),
    });
    await expect(row).toContainText("41%");
    await expect(row.locator(".ctx > i")).toHaveAttribute("style", /width:\s*41%/);

    const kept = await track.evaluate(
      (el) => (el as HTMLElement & { __kept?: boolean }).__kept === true,
    );
    expect(kept).toBe(true);
  } finally {
    await cleanup();
  }
});
