import { expect, fileDaemon, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import {
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  type SessionObject,
  sessionCard,
  stateBadge,
} from "./helpers/session";

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

const sharedDaemon = fileDaemon();

test("ended sessions sort after every live session, most recently ended first (REQ-9)", async ({
  page,
  request,
}) => {
  const dirs = await Promise.all(
    Array.from({ length: 3 }, () => scratchDirectory()),
  );
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const titles = [
      "sort-req9-live",
      "sort-req9-ended-first",
      "sort-req9-ended-second",
    ];
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
    if (!live || !endedFirst || !endedSecond)
      throw new Error("expected three sessions");

    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-sort-req9-live", {
        musterSession: live.id,
      }),
    });

    const endRes1 = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${endedFirst.id}/end`,
    );
    expect(endRes1.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-first")).toHaveClass(
      /ended/,
      { timeout: 15_000 },
    );

    // Force a real gap between the two `endedAt` timestamps regardless of the daemon's
    // clock resolution, so "most recently ended first" has an unambiguous answer — a
    // deliberate hold (nothing to poll for: the second End has not happened yet).
    await settleFor(page, 1_100);

    const endRes2 = await page.request.post(
      `${sharedDaemon().baseURL}/api/sessions/${endedSecond.id}/end`,
    );
    expect(endRes2.status()).toBe(200);
    await expect(sessionCard(page, "sort-req9-ended-second")).toHaveClass(
      /ended/,
      { timeout: 15_000 },
    );

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
    const indexOf = (label: string): number =>
      cardTexts.findIndex((t) => t.includes(label));
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

// review m4-reconcile fix-cycle-1 Major 5: card/strip action buttons nest real
// `<button>`s inside a card whose own `keydown` listener used to run
// `event.preventDefault()` for every bubbled key, cancelling the button's own Enter/Space
// activation — the fix guards that listener with `event.target !== card`. Verify the
// keyboard round-trip actually opens the dialog, across both Enter and Space, on the
// exact surface (a rail card's End button) the reviewer measured live.
test("a card's End button activates via keyboard Enter and Space, not just a mouse click (REQ-11, Major 5)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "kbd-card-end",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-kbd-card-end", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "kbd-card-end");
    const dialog = page.getByRole("dialog", { name: "End session?" });

    // `renderSessions` rebuilds every card's DOM (`el.replaceChildren(...)`) on every 1s
    // render tick, so a focused button loses DOM focus within that window with no
    // automatic re-focus. `locator.press()` performs the focus-then-key as one
    // Playwright action instead of a separate `.focus()` call followed by a polling
    // assertion, so it isn't racing that tick the way the latter would be — the point
    // under test is that the key opens the dialog, not that focus survives a rebuild.
    await card.getByRole("button", { name: "End" }).press("Enter");
    // Before the fix: the card's own `keydown` listener called `event.preventDefault()`
    // for every bubbled key regardless of origin, so `endDialogOpen` stayed false and
    // focus was dropped to <body> instead of the button activating.
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await card.getByRole("button", { name: "End" }).press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const state = await getState(page, sharedDaemon());
    expect(findSession(state, session.id).alive).toBe(false);
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-2 Major 2: the keyboard test above uses `locator.press()`,
// which bundles the focus and the keypress into one fast Playwright action and so cannot
// observe cycle-2 Major 1 (the 1s render tick's unconditional `replaceChildren` dropping
// focus to `<body>` before the next keypress ever lands). This test performs the two
// steps separately with a real render tick in between: focus the button, confirm it's
// still focused after outliving at least one tick (>1.1s), then press Enter as a
// genuinely separate action. Before Major 1's fix this reproduced exactly what the
// reviewer measured live (`sameNodeAfter1.4s=false, activeTag=BODY`); the fix
// (`reconcileCards`/`reconcileActsRow` reconciling in place instead of rebuilding) is
// what makes this pass.
test("a card's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-11, Major 1, Major 2)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "kbd-tick-card-end",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-kbd-tick-card-end", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "kbd-tick-card-end");
    const endBtn = card.getByRole("button", { name: "End" });
    const dialog = page.getByRole("dialog", { name: "End session?" });

    await endBtn.focus();
    await expect(endBtn).toBeFocused();

    // Outlive at least one 1s render tick as a separate step from the focus above — a
    // stays-unchanged hold (settleFor): the render tick itself (not a WS round-trip) is
    // exactly what's under test, so there is no visible-outcome signal to poll for.
    await settleFor(page, 1_400);
    // Re-resolves the locator against the live DOM: if the render tick had rebuilt the
    // button node (the pre-fix defect), the freshly-resolved element would not be
    // `document.activeElement` and this would fail regardless of node identity.
    await expect(endBtn).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 2/3 (e2e-specs, web-implementation.md Fix Attempt
// 3): the review's Critical 1 fix scoped the hover-reveal opacity rule to `.card
// .acts-row`, leaving the dead-surface cap unconditionally visible while live rail
// cards stay hover/focus-only, per Damian's cycle-3 sign-off. `toBeVisible()` cannot
// see either half of this (Playwright's actionability model treats `opacity: 0` as
// visible) — this test reads the computed style directly, at rest and revealed by
// both mouse hover and keyboard `:focus-within`.
test("a live rail card's action row sits at opacity 0 until hover or focus-within reveals it (REQ-11, Minor 2/3)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(sharedDaemon().dashboardUrl);
    const session = await launchSession(page, sharedDaemon(), {
      directory: dir,
      title: "hover-reveal-acts-row",
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-hover-reveal-acts-row", {
        musterSession: session.id,
      }),
    });
    const card = sessionCard(page, "hover-reveal-acts-row");
    await expect(card).toBeVisible();
    const actsRow = card.locator(".acts-row");

    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.hover();
    await expect(actsRow).toHaveCSS("opacity", "1");

    // Move the pointer well away from the card so hover no longer explains any
    // visibility, confirming the row drops back before checking focus independently.
    await page.mouse.move(0, 0);
    await expect(actsRow).toHaveCSS("opacity", "0");

    await card.getByRole("button", { name: "End" }).focus();
    await expect(actsRow).toHaveCSS("opacity", "1");
  } finally {
    await cleanup();
  }
});

// review m4-reconcile cycle-3 Minor 1 (web-implementation.md Fix Attempt 3):
// `reconcileCards`'s reorder loop calls `container.insertBefore` on an already-mounted
// card when a genuine priority change moves it, which detaches the node before
// reattaching it — Chrome blurs a focused descendant on detach even though the reattach
// is synchronous. Distinct from cycle-2 Major 1 (the per-tick rebuild, covered by the
// existing "survives a render tick" tests above): this needs an actual sort-order
// change, not a clock tick. Reproduces the review's own measurement (`SORT-CHANGE
// focus: before=true after=false active=BODY`) against the pre-fix build.
test("a focused card action button survives a rail re-sort triggered by a real priority change (REQ-11, Minor 1)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
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
      data: envelopedSessionStart("claude-resort-focus-a", {
        musterSession: sessionA.id,
      }),
    });
    await request.post(sharedDaemon().ingestURL("hook"), {
      data: envelopedSessionStart("claude-resort-focus-b", {
        musterSession: sessionB.id,
      }),
    });

    const cardA = sessionCard(page, "resort-focus-a");
    const cardB = sessionCard(page, "resort-focus-b");
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    // This test needs a real priority-driven DOM reorder — under plan order-sidebar's
    // approved protocol delta that only happens in Attention mode (REQ-5's default
    // `railSort` is "manual"; REQ-7: a state change never moves a card in manual mode).
    // The unpinned ordering within Attention mode still delegates to the same
    // `sortSessions` launch-order tiebreak the pre-order-sidebar rail always used
    // (REQ-6), so the "A before B" check right below is unaffected by the switch.
    await page.locator("#rail-sort").selectOption("attention");
    await expect(page.locator("#rail-sort")).toHaveValue("attention");

    // Both sessions land in the same live priority band with no state change yet, so
    // they sort by launch order: A before B.
    const titlesBefore = await page.getByTestId("session-card").allInnerTexts();
    const idxABefore = titlesBefore.findIndex((t) =>
      t.includes("resort-focus-a"),
    );
    const idxBBefore = titlesBefore.findIndex((t) =>
      t.includes("resort-focus-b"),
    );
    expect(idxABefore).toBeGreaterThanOrEqual(0);
    expect(idxBBefore).toBeGreaterThanOrEqual(0);
    expect(idxABefore).toBeLessThan(idxBBefore);

    const endBtnB = cardB.getByRole("button", { name: "End" });
    await endBtnB.focus();
    await expect(endBtnB).toBeFocused();

    // A genuine priority change (REQ-9's `needs_input` band sorts first), not a render
    // tick: this is what actually drives `insertBefore` to move B's card node.
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

    // Focus must have survived the reorder — Playwright's own focus assertion, not
    // just a dataset probe. Before the fix this measured `active=BODY`.
    await expect(endBtnB).toBeFocused();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});
