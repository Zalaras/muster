import {
  type APIRequestContext,
  expect,
  fileDaemon,
  type Page,
  settleFor,
  test,
} from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawNotification,
  rawStop,
  rawUserPromptSubmit,
  runningShellTask,
  runningSubagentTask,
} from "./helpers/payloads";
import { pinButton } from "./helpers/railorder";
import {
  currentRailCard,
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  type SessionObject,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

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

/** Launches a session, binds a Claude id to it (so Resume is enabled) and ends it. */
async function launchEndedSession(
  page: Page,
  request: APIRequestContext,
  dir: string,
  title: string,
): Promise<SessionObject> {
  const session = await launchSession(page, sharedDaemon(), { directory: dir, title });
  await request.post(sharedDaemon().ingestURL("hook"), {
    data: envelopedSessionStart(`claude-${title}`, await envelopeOpts(session, sharedDaemon())),
  });
  const res = await page.request.post(`${sharedDaemon().baseURL}/api/sessions/${session.id}/end`);
  expect(res.status()).toBe(200);
  await expect(sessionCard(page, title)).toHaveClass(/ended/, { timeout: 15_000 });
  return session;
}

test("ended sessions sort after every live session, most recently ended first (REQ-9)", async ({
  page,
  request,
}) => {
  const dirs = await Promise.all(Array.from({ length: 3 }, () => scratchDirectory()));
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const titles = ["sort-req9-live", "sort-req9-ended-first", "sort-req9-ended-second"];
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(
        await launchSession(page, sharedDaemon(), {
          directory: dir.path,
          title: titles[i] ?? "",
        }),
      );
    }
    const [live, endedFirst, endedSecond] = sessions;
    if (!live || !endedFirst || !endedSecond) throw new Error("expected three sessions");

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-sort-req9-live",
        await envelopeOpts(live, sharedDaemon()),
      ),
    });

    const endRes1 = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${endedFirst.id}/end`,
    );
    expect(endRes1.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-first")).toHaveClass(/ended/, {
      timeout: 15_000,
    });

    // Force a real gap between the two `endedAt` timestamps regardless of the daemon's
    // clock resolution, so "most recently ended first" has an unambiguous answer — a
    // deliberate hold (nothing to poll for: the second End has not happened yet).
    await settleFor(page, 1_100);

    const endRes2 = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${endedSecond.id}/end`,
    );
    expect(endRes2.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-second")).toHaveClass(/ended/, {
      timeout: 15_000,
    });

    // These orderings are an Attention-mode guarantee under plan order-sidebar's
    // approved protocol delta (REQ-5 default `railSort` is "manual"; REQ-7: a state
    // change — ending a session — never moves a card in manual mode). Switch to
    // Attention, then wait for the resort before asserting REQ-9's ordering.
    await page.locator("#rail-sort").selectOption("attention");
    await expect
      .poll(async () => {
        const cardTexts = await page.getByTestId("session-card").allInnerTexts();
        const indexOf = (label: string): number => cardTexts.findIndex((t) => t.includes(label));
        const liveIdx = indexOf("sort-req9-live");
        const firstEndedIdx = indexOf("sort-req9-ended-first");
        const secondEndedIdx = indexOf("sort-req9-ended-second");
        return (
          liveIdx >= 0 &&
          firstEndedIdx >= 0 &&
          secondEndedIdx >= 0 &&
          liveIdx < firstEndedIdx &&
          liveIdx < secondEndedIdx &&
          secondEndedIdx < firstEndedIdx
        );
      })
      .toBe(true);
    const cardTexts = await page.getByTestId("session-card").allInnerTexts();
    const indexOf = (label: string): number => cardTexts.findIndex((t) => t.includes(label));
    const liveIdx = indexOf("sort-req9-live");
    const firstEndedIdx = indexOf("sort-req9-ended-first");
    const secondEndedIdx = indexOf("sort-req9-ended-second");
    expect(liveIdx).toBeGreaterThanOrEqual(0);
    expect(liveIdx).toBeLessThan(firstEndedIdx);
    expect(liveIdx).toBeLessThan(secondEndedIdx);
    expect(secondEndedIdx).toBeLessThan(firstEndedIdx);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

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

// Cycle-2 Major 1/2 of the same review: the 1s render tick once rebuilt every card's DOM,
// dropping focus to <body> between a focus and its key. Focus, outlive a tick, assert the
// same node still holds focus, then press the key as a separate action.
test("the mainhead's End button keeps focus and node identity across a render tick and then opens the End dialog via a separate keyboard Enter (REQ-7, REQ-11, Major 1, Major 2)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "kbd-tick-mainhead-end",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-kbd-tick-mainhead-end",
        await envelopeOpts(session, sharedDaemon()),
      ),
    });
    const card = sessionCard(page, "kbd-tick-mainhead-end");
    await card.click();
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("kbd-tick-mainhead-end");
    const endBtn = mainhead.getByRole("button", { name: "Stop", exact: true });
    const dialog = page.getByRole("dialog", { name: "Stop session?" });

    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    await endBtn.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-end-btn";
    });

    // A stays-unchanged hold: the render tick itself is under test, so there is no
    // visible outcome to poll for.
    await settleFor(page, 1_400);
    await expect(endBtn).toBeFocused();
    expect(
      await endBtn.evaluate(
        (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-end-btn",
      ),
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// The nested-button half of Major 5 and Major 1/2, on the surface that still has nested
// buttons: an ended card's Remove. Focus, outlive a tick with node identity, then Enter and
// Space each as their own action.
test("an ended card's Remove button keeps focus and node identity across a render tick and activates via keyboard Enter and Space (REQ-7, REQ-11, Major 1, Major 5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    await launchEndedSession(page, request, dir, "kbd-ended-remove");
    const card = sessionCard(page, "kbd-ended-remove");
    const removeBtn = card.getByRole("button", { name: "Remove" });
    const dialog = page.getByRole("dialog", { name: "Remove session?" });

    await removeBtn.focus();
    await expect(removeBtn).toBeFocused();
    await removeBtn.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-remove-btn";
    });
    // A stays-unchanged hold over one render tick, as above.
    await settleFor(page, 1_400);
    await expect(removeBtn).toBeFocused();
    expect(
      await removeBtn.evaluate(
        (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-remove-btn",
      ),
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await removeBtn.focus();
    await expect(removeBtn).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 2/3: `toBeVisible()` cannot see a revealed row, because
// Playwright treats `opacity: 0` as visible, so this reads the computed style at rest and
// under hover and `:focus-within`. A live card's row no longer exists to reveal (REQ-7,
// asserted in E7); an ended card keeps its hover/focus reveal, which this pins.
test("an ended rail card's action row sits at opacity 0 until hover or focus-within reveals it (REQ-7, REQ-11, Minor 2/3)", async ({
  page,
  request,
}) => {
  const [{ path: dir, cleanup }, otherDir] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    await launchEndedSession(page, request, dir, "hover-reveal-acts-row");
    const card = sessionCard(page, "hover-reveal-acts-row");
    await expect(card).toBeVisible();
    const actsRow = card.locator(".acts-row");

    // An ended card that is the current one shows its row too (`.card.current`), so make a
    // different, live card current first: only hover and focus-within may reveal this one.
    const other = await launchSession(page, sharedDaemon(), {
      directory: otherDir.path,
      title: "hover-reveal-other",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(
        "claude-hover-reveal-other",
        await envelopeOpts(other, sharedDaemon()),
      ),
    });
    await sessionCard(page, "hover-reveal-other").click();
    await expect(currentRailCard(page)).toContainText("hover-reveal-other");
    await page.mouse.move(0, 0);

    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.hover();
    await expect(actsRow).toHaveCSS("opacity", "1");

    // Move the pointer well away so hover no longer explains any visibility, confirming the
    // row drops back before checking focus independently.
    await page.mouse.move(0, 0);
    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.getByRole("button", { name: "Remove" }).focus();
    await expect(actsRow).toHaveCSS("opacity", "1");
  } finally {
    await Promise.all([cleanup(), otherDir.cleanup()]);
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

// Plan status-inconsistencies E5 (REQ-5, REQ-6, #60): a Stop that lists a running shell
// leaves the state idle and shows a neutral line at the bottom of the card.
test("a Stop with one running shell shows '1 background task' on an idle card (E5, REQ-5, REQ-6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "bgtasks-e5",
    });
    const claudeId = "claude-bgtasks-e5";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, sharedDaemon())),
    });
    const card = sessionCard(page, "bgtasks-e5");
    await expect(card.getByText(/^\d+ background tasks?$/)).toHaveCount(0);

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningShellTask()] }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);

    const line = card.getByText(/^\d+ background tasks?$/);
    await expect(line).toHaveText("1 background task");
    await expect(line).toBeVisible();
    // Not hover-revealed: the line is on the card at rest.
    await expect(line).toHaveCSS("opacity", "1");
    await expect(line).toHaveAttribute("title", "1 background task");
    expect(findSession(await getState(page, sharedDaemon()), session.id).backgroundTasks).toBe(1);
    // The state is unchanged by the count: still idle, no attention.
    expect(findSession(await getState(page, sharedDaemon()), session.id).state).toBe("idle");
  } finally {
    await cleanup();
  }
});

test("a Stop listing two running tasks, one already finished, counts only the running ones and pluralises the line (E5, REQ-5, REQ-6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "bgtasks-e5-plural",
    });
    const claudeId = "claude-bgtasks-e5-plural";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, sharedDaemon())),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawStop(claudeId, {
        promptId: "p1",
        backgroundTasks: [
          runningShellTask("shell-1"),
          runningSubagentTask("agent-1"),
          { ...runningShellTask("shell-2"), status: "completed" },
        ],
      }),
    });

    const card = sessionCard(page, "bgtasks-e5-plural");
    await expect(card.getByText(/^\d+ background tasks?$/)).toHaveText("2 background tasks");
    expect(findSession(await getState(page, sharedDaemon()), session.id).backgroundTasks).toBe(2);
  } finally {
    await cleanup();
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

// INV-C: the line is only for a live session.
test("an ended card shows no background line even though its last Stop listed a running task (REQ-6, INV-C)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "bgtasks-ended",
    });
    const claudeId = "claude-bgtasks-ended";
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, sharedDaemon())),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1" }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", backgroundTasks: [runningShellTask()] }),
    });
    const card = sessionCard(page, "bgtasks-ended");
    await expect(card.getByText(/^\d+ background tasks?$/)).toHaveText("1 background task");

    const res = await page.request.post(`${sharedDaemon().baseURL}/api/sessions/${session.id}/end`);
    expect(res.status()).toBe(200);
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    await expect(card.getByText(/^\d+ background tasks?$/)).toHaveCount(0);
    await expect(card.locator(".bg-tasks")).toBeHidden();
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

// E8 (REQ-7, INV-D): a Tiles strip card is the same template, so it offers no End either.
// Own daemon: entering Tiles persists the view pref, which would hide every later test's
// rail cards on a shared one, and five sessions is what leaves one in the strip (two by two
// grid, the pattern rail-layout.spec.ts's E5 uses).
test("a live strip card in Tiles has no End button (E8, REQ-7, INV-D)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `no-end-e8-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) {
        strippedTitle = t;
        break;
      }
    }
    if (!strippedTitle) throw new Error("expected one of the five sessions demoted to the strip");
    const strip = stripCard(page, strippedTitle);
    await expect(strip).toBeVisible();

    await expect(strip.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await strip.hover();
    await expect(strip.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await expect(strip.getByRole("button", { name: /^(End|Resume|Remove)$/ })).toHaveCount(0);
    await expect(strip.locator(".acts-row button")).toHaveCount(0);
    // The tile footer's End is unchanged: a live tile still offers it.
    await expect(
      liveTile(page, titles[0] ?? "")
        .locator(".tfoot")
        .getByRole("button", { name: "Stop" }),
    ).toBeVisible();
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

// E9 (REQ-7): ending from the mainhead still works and leaves an ended card offering Resume
// then Remove; with a second live session, only the focused one ends.
test("ending from the mainhead ends only that session, and its card then offers Resume and Remove in that order (E9, REQ-7)", async ({
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

    await expect(cardA.locator(".acts-row button")).toHaveText(["Resume", "Remove"]);
    await expect(cardA.getByRole("button", { name: "Resume" })).toBeEnabled();
    await expect(cardA.getByRole("button", { name: "Remove" })).toBeEnabled();
    await expect(cardA.getByRole("button", { name: "Stop" })).toHaveCount(0);

    const state = await getState(page, sharedDaemon());
    expect(findSession(state, sessionA.id).alive).toBe(false);
    expect(findSession(state, sessionB.id).alive).toBe(true);
    await expect(cardB).not.toHaveClass(/ended/);
    expect(await sharedDaemon().tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});
