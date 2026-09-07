import { type APIRequestContext, expect, type Page, type ScratchDaemon, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { getState, launchSession, scratchDirectory, type SessionObject, stateBadge } from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";
import {
  expectedManualOrder,
  hasClass,
  pinButton,
  railCard,
  railOrderIds,
  railSortSelect,
  stripOrderIds,
} from "./helpers/railorder";

// Plan order-sidebar — REQ-1 through REQ-15 (Must Have) plus REQ-16/17 (Should Have),
// driven end-to-end: the real launch/pin/order endpoints and the client-side
// `orderRail`/`moveCard` wiring. Plan acceptance: E2-E16.
//
// Every test here takes the per-test `daemon` fixture (helpers/fixtures.ts; mirrors
// views.spec.ts's rationale): rail-order assertions read the FULL `#sessions` DOM order,
// so a session launched by a concurrently-running test in a shared daemon would silently
// corrupt every ordering expectation in this file. `fullyParallel: true` is safe only
// because each test's daemon, port, and tmux socket are entirely its own.

/** Launches one session per title, in order, into fresh scratch directories — the
 * common "N sessions with known titles" setup nearly every test below needs. Callers
 * must `await page.goto(daemon.dashboardUrl)` first (the launch endpoint needs the
 * page's auth cookie, same as every other launch-based spec in this suite). */
async function launchTitled(
  page: Page,
  daemon: ScratchDaemon,
  titles: string[],
): Promise<{ sessions: SessionObject[]; cleanup: () => Promise<void> }> {
  const dirs = await Promise.all(titles.map(() => scratchDirectory()));
  const sessions: SessionObject[] = [];
  for (const [i, dir] of dirs.entries()) {
    sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
  }
  return {
    sessions,
    cleanup: async () => {
      await Promise.all(dirs.map((d) => d.cleanup()));
    },
  };
}

/** Drives a session to `needs_input` via the real ingest endpoints (SessionStart ->
 * UserPromptSubmit -> a permission Notification), exactly per protocol §7.3. */
async function makeNeedsInput(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
): Promise<void> {
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, { musterSession: session.id }),
  });
  await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
  await request.post(daemon.ingestURL("hook"), { data: rawNotification(claudeId, "p1", "permission_prompt") });
}

test("three launched sessions appear in the rail in creation order with Manual selected (E2)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e2-a", "order-e2-b", "order-e2-c"]);
  try {
    await expect.poll(() => railOrderIds(page)).toEqual(sessions.map((s) => s.id));
    await expect(railSortSelect(page)).toHaveValue("manual");
  } finally {
    await cleanup();
  }
});

test("dragging the third card onto the first reorders the rail (E3)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e3-a", "order-e3-b", "order-e3-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    await railCard(page, "order-e3-c").dragTo(railCard(page, "order-e3-a"));

    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);
    // Independent oracle: the daemon's own persisted pinned/railPos, not just the DOM.
    const state = await getState(page, daemon);
    expect(expectedManualOrder(state.sessions)).toEqual([c.id, a.id, b.id]);

    await expect(page.locator("article.card.dragging")).toHaveCount(0);
    await expect(page.locator("article.card.drop-target")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a dragged order persists after a reload (E4)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e4-a", "order-e4-b", "order-e4-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    await railCard(page, "order-e4-c").dragTo(railCard(page, "order-e4-a"));
    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);

    await page.reload();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, a.id, b.id]);
  } finally {
    await cleanup();
  }
});

test("clicking Pin moves a card to the top of the pinned block (E5)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e5-a", "order-e5-b", "order-e5-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    const cardC = railCard(page, "order-e5-c");

    await pinButton(cardC).click();

    await expect.poll(() => railOrderIds(page)).toEqual([c.id, a.id, b.id]);
    await expect(cardC.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect(cardC.getByRole("button", { name: "Unpin" })).toHaveAttribute("title", "Unpin");
    await expect.poll(() => hasClass(cardC, "pinned")).toBe(true);
    await expect.poll(() => hasClass(cardC, "pinned-last")).toBe(true);

    const cardA = railCard(page, "order-e5-a");
    await expect(cardA.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => hasClass(cardA, "pinned")).toBe(false);
  } finally {
    await cleanup();
  }
});

test("pinning a second card places it below the first pinned card (E6)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e6-a", "order-e6-b", "order-e6-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    await pinButton(railCard(page, "order-e6-c")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, a.id, b.id]);

    await pinButton(railCard(page, "order-e6-b")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, b.id, a.id]);

    const cardC = railCard(page, "order-e6-c");
    const cardB = railCard(page, "order-e6-b");
    await expect(cardC.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect(cardB.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    // pinned-last moved from C to B — the newly-pinned bottom of the block.
    await expect.poll(() => hasClass(cardC, "pinned-last")).toBe(false);
    await expect.poll(() => hasClass(cardB, "pinned-last")).toBe(true);
  } finally {
    await cleanup();
  }
});

test("unpinning the first pinned card places it after the remaining pinned card (E7)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e7-a", "order-e7-b", "order-e7-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    await pinButton(railCard(page, "order-e7-c")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, a.id, b.id]);
    await pinButton(railCard(page, "order-e7-b")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, b.id, a.id]);

    // Unpin the first pinned card (C).
    await railCard(page, "order-e7-c").getByRole("button", { name: "Unpin" }).click();

    await expect.poll(() => railOrderIds(page)).toEqual([b.id, c.id, a.id]);
    const cardC = railCard(page, "order-e7-c");
    const cardB = railCard(page, "order-e7-b");
    await expect(cardC.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => hasClass(cardC, "pinned")).toBe(false);
    // B is now the only pinned session — it carries both pinned and pinned-last.
    await expect(cardB.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => hasClass(cardB, "pinned-last")).toBe(true);
  } finally {
    await cleanup();
  }
});

test("dragging an unpinned card onto a pinned card pins it at that position (E8)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e8-a", "order-e8-b", "order-e8-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    await pinButton(railCard(page, "order-e8-a")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // B (unpinned) dropped onto A (pinned) — REQ-11: inserted at A's index, taking A's
    // pinned value (true).
    await railCard(page, "order-e8-b").dragTo(railCard(page, "order-e8-a"));

    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([b.id, a.id, c.id]);
    const cardB = railCard(page, "order-e8-b");
    const cardA = railCard(page, "order-e8-a");
    const cardC = railCard(page, "order-e8-c");
    await expect(cardB.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect(cardA.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect(cardC.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    // A is now last in the pinned block (index 1 of the pinned pair), so pinned-last
    // moved from A to... A: B (index 0) is not last, A (index 1) is.
    await expect.poll(() => hasClass(cardB, "pinned-last")).toBe(false);
    await expect.poll(() => hasClass(cardA, "pinned-last")).toBe(true);

    const state = await getState(page, daemon);
    expect(expectedManualOrder(state.sessions)).toEqual([b.id, a.id, c.id]);
  } finally {
    await cleanup();
  }
});

test("a state change in manual mode leaves the rail order unchanged (E9, REQ-7)", async ({ page, request, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e9-a", "order-e9-b", "order-e9-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    await makeNeedsInput(request, daemon, c, "claude-e9-c");

    await expect(stateBadge(railCard(page, "order-e9-c"))).toHaveText(/needs input/i);
    // The bottom card went needs_input — in manual mode this must NOT jump it up.
    expect(await railOrderIds(page)).toEqual([a.id, b.id, c.id]);
  } finally {
    await cleanup();
  }
});

test("switching to Attention resorts unpinned cards by need while the pinned block stays on top (E10, E11)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e10-a", "order-e10-b", "order-e10-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    await pinButton(railCard(page, "order-e10-a")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    await makeNeedsInput(request, daemon, c, "claude-e10-c");
    await expect(stateBadge(railCard(page, "order-e10-c"))).toHaveText(/needs input/i);
    // Still manual — order unaffected by the state change (REQ-7).
    expect(await railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // Real keyboard interaction, not `selectOption` (usage-model-bar precedent): a
    // focused, closed native <select> moves by single-letter typeahead. "Manual" and
    // "Attention" start with distinct letters, so one keystroke is unambiguous.
    const select = railSortSelect(page);
    await select.focus();
    await page.keyboard.press("A");
    await expect(select).toHaveValue("attention");

    // Pinned A stays first; unpinned C (needs_input) now sorts ahead of unpinned B
    // (idle) — §3.4's priority order applied only within the unpinned group (REQ-6).
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, c.id, b.id]);

    // REQ-10: no card is draggable while in attention mode.
    for (const title of ["order-e10-a", "order-e10-b", "order-e10-c"]) {
      await expect(railCard(page, title)).toHaveAttribute("draggable", "false");
    }

    // Switching back to Manual (typeahead again, past the ~1s concatenation window)
    // restores the pre-switch manual order exactly.
    await settleFor(page, 1100);
    await page.keyboard.press("M");
    await expect(select).toHaveValue("manual");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);
    for (const title of ["order-e10-a", "order-e10-b", "order-e10-c"]) {
      await expect(railCard(page, title)).toHaveAttribute("draggable", "true");
    }
  } finally {
    await cleanup();
  }
});

test("rail cards are draggable only in Manual mode", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e11-a", "order-e11-b"]);
  try {
    if (sessions.length !== 2) throw new Error("expected 2 sessions");
    await expect(railCard(page, "order-e11-a")).toHaveAttribute("draggable", "true");
    await expect(railCard(page, "order-e11-b")).toHaveAttribute("draggable", "true");

    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect(railCard(page, "order-e11-a")).toHaveAttribute("draggable", "false");
    await expect(railCard(page, "order-e11-b")).toHaveAttribute("draggable", "false");

    await railSortSelect(page).selectOption("manual");
    await expect(railCard(page, "order-e11-a")).toHaveAttribute("draggable", "true");
    await expect(railCard(page, "order-e11-b")).toHaveAttribute("draggable", "true");
  } finally {
    await cleanup();
  }
});

test("the Attention selection persists after a reload (E12)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["order-e12-a", "order-e12-b"]);
  try {
    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");

    await page.reload();
    await expect(railSortSelect(page)).toHaveValue("attention");
  } finally {
    await cleanup();
  }
});

test("a second window sees a pin and a reorder without reloading (E13)", async ({ page, browser, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e13-a", "order-e13-b", "order-e13-c"]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect.poll(() => railOrderIds(pageB)).toEqual([a.id, b.id, c.id]);

      // Window A pins C.
      await pinButton(railCard(page, "order-e13-c")).click();
      await expect
        .poll(() => railOrderIds(pageB), { timeout: 15_000 })
        .toEqual([c.id, a.id, b.id]);
      await expect(
        railCard(pageB, "order-e13-c").getByRole("button", { name: "Unpin" }),
      ).toHaveAttribute("aria-pressed", "true");

      // Window A drags B onto A (both unpinned) — window B sees the reorder too.
      await railCard(page, "order-e13-b").dragTo(railCard(page, "order-e13-a"));
      await expect
        .poll(() => railOrderIds(pageB), { timeout: 15_000 })
        .toEqual([c.id, b.id, a.id]);
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("the Tiles strip order matches the rail order minus live tiles (E14)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const titles = Array.from({ length: 6 }, (_, i) => `order-e14-${i}`);
  const { sessions, cleanup } = await launchTitled(page, daemon, titles);
  try {
    await expect.poll(() => railOrderIds(page)).toEqual(sessions.map((s) => s.id));
    const railBefore = await railOrderIds(page);

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const strippedIds = new Set<number>();
    for (const [i, s] of sessions.entries()) {
      const title = titles[i] ?? "";
      if ((await liveTile(page, title).count()) === 0) strippedIds.add(s.id);
    }
    expect(strippedIds.size).toBe(2); // 6 sessions, 2x2 grid -> 4 live, 2 stripped

    const expectedStrip = railBefore.filter((id) => strippedIds.has(id));
    await expect.poll(() => stripOrderIds(page)).toEqual(expectedStrip);
  } finally {
    await cleanup();
  }
});

test("clicking Pin does not change the focused session (E15)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["order-e15-a", "order-e15-b"]);
  try {
    // A is opened first and manual order's default is opened-order, so A is the
    // default-focus fallback (REQ-6's third call site).
    await expect(page.locator("#mainhead .name")).toHaveText("order-e15-a");

    await pinButton(railCard(page, "order-e15-b")).click();
    await expect(
      railCard(page, "order-e15-b").getByRole("button", { name: "Unpin" }),
    ).toHaveAttribute("aria-pressed", "true");

    // The pin click on B's card must not have focused B.
    await expect(page.locator("#mainhead .name")).toHaveText("order-e15-a");
  } finally {
    await cleanup();
  }
});

test("a Pin click while the daemon is down leaves the card unpinned and the order unchanged (E16)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, ["order-e16-a", "order-e16-b"]);
  try {
    const [a, b] = sessions;
    if (!a || !b) throw new Error("expected 2 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id]);

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    const cardA = railCard(page, "order-e16-a");
    await pinButton(cardA).click();

    // REQ-15: no optimistic state — the failed PUT changes nothing on screen.
    await expect(cardA.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => hasClass(cardA, "pinned")).toBe(false);
    expect(await railOrderIds(page)).toEqual([a.id, b.id]);
  } finally {
    await cleanup();
  }
});

test("pinning from the Tiles strip pins the session the same as the rail (REQ-13)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const titles = Array.from({ length: 5 }, (_, i) => `order-strip-pin-${i}`);
  const { sessions, cleanup } = await launchTitled(page, daemon, titles);
  try {
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedTitle: string | undefined;
    let strippedId: number | undefined;
    for (const [i, s] of sessions.entries()) {
      const title = titles[i] ?? "";
      if ((await liveTile(page, title).count()) === 0) {
        strippedTitle = title;
        strippedId = s.id;
      }
    }
    if (!strippedTitle || strippedId === undefined) throw new Error("expected exactly one stripped title");

    const strip = stripCard(page, strippedTitle);
    await pinButton(strip).click();
    await expect(strip.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => hasClass(strip, "pinned")).toBe(true);

    // The rail (still mounted, just hidden behind Tiles) reflects the same pin.
    await page.getByRole("button", { name: "Focus" }).click();
    const rail = railCard(page, strippedTitle);
    await expect(rail.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");

    const state = await getState(page, daemon);
    const pinned = state.sessions.find((s) => s.id === strippedId);
    expect(pinned?.pinned).toBe(true);
  } finally {
    await cleanup();
  }
});

test("the pin button is hidden until hover/focus reveals it, but always visible once pinned (REQ-8)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["order-hover-a"]);
  try {
    const card = railCard(page, "order-hover-a");
    const pin = pinButton(card);

    // Playwright's actionability model treats opacity:0 as visible, so the check must
    // read the computed style directly (m4-reconcile precedent, actions.spec.ts).
    await expect(pin).toHaveCSS("opacity", "0");

    await card.hover();
    await expect(pin).toHaveCSS("opacity", "1");

    await page.mouse.move(0, 0);
    await expect(pin).toHaveCSS("opacity", "0");

    await pin.focus();
    await expect(pin).toHaveCSS("opacity", "1");

    await pin.click();
    await expect(card.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");

    // Once pinned, the button stays visible with no hover/focus at all: move the
    // pointer away and shift focus onto a plain, non-interactive masthead element.
    await page.mouse.move(0, 0);
    await page.locator(".brand").click();
    await expect(pinButton(card)).toHaveCSS("opacity", "1");
  } finally {
    await cleanup();
  }
});

// review usage-model-bar cycle 1 precedent: a control re-rendered every 1s render tick
// can silently lose focus/identity even though every functional test passes with
// `selectOption`. `main.ts`'s `render()` runs on a 1s `setInterval` and touches the
// Focus rail on every pass, so `#rail-sort` is exercised by that same tick — this test
// is the dedicated node-identity/focus regression check for it, independent of the
// functional keyboard-driven test above.
test("the rail sort select keeps focus and node identity across a render tick", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { cleanup } = await launchTitled(page, daemon, ["order-tick-a"]);
  try {
    const select = railSortSelect(page);
    await select.focus();
    await expect(select).toBeFocused();

    await select.evaluate((node) => {
      (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag = "original-rail-sort";
    });

    await settleFor(page, 1600);

    await expect(select).toBeFocused();
    const stillTagged = await select.evaluate(
      (node) => (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag === "original-rail-sort",
    );
    expect(stillTagged).toBe(true);
    await expect(select).toHaveValue("manual");
  } finally {
    await cleanup();
  }
});

// Decision `plans/order-sidebar/decisions/cmd-n-ordering/decision.md` (Option A, review
// cycle 2): ⌥⌘1–9 (`focusNth`) now indexes into `orderRail(store.values(), railSort)` —
// the exact order the rail currently displays — rather than a fixed attention-priority
// sort. Before this fix, ⌥⌘1 could disagree with what card 1 visually is; these three
// tests are the reviewer's measured repro (Major 1) plus the drag/pin and attention-mode
// cases the decision's "one order across both views" reasoning implies.

test("Opt+Cmd+1 follows the manual rail order even when the needs-input session is not first", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "order-cmdn-one",
    "order-cmdn-two",
    "order-cmdn-three",
  ]);
  try {
    const [one, two, three] = sessions;
    if (!one || !two || !three) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([one.id, two.id, three.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");

    // Reviewer's measured case: the LAST rail card (three) is the one that needs input,
    // not the first — manual order must stay [one, two, three] regardless (REQ-7).
    await makeNeedsInput(request, daemon, three, "claude-cmdn-three");
    await expect(stateBadge(railCard(page, "order-cmdn-three"))).toHaveText(/needs input/i);
    expect(await railOrderIds(page)).toEqual([one.id, two.id, three.id]);

    // Explicitly focus a different card first, so Opt+Cmd+1 has to move focus rather than
    // merely leave it where it already was.
    await railCard(page, "order-cmdn-two").click();
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-two");

    await page.keyboard.press("Alt+Meta+Digit1");

    // Opt+Cmd+1 must select the rail's actual first card (one), not the needs-input card
    // (three) that a fixed attention sort would have picked.
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-one");
  } finally {
    await cleanup();
  }
});

test("Opt+Cmd+1 follows the rail order after a drag reorder", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "order-cmdn-drag-a",
    "order-cmdn-drag-b",
    "order-cmdn-drag-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // Drag C to the front — the rail's new first card is C, not A.
    await railCard(page, "order-cmdn-drag-c").dragTo(railCard(page, "order-cmdn-drag-a"));
    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);

    await railCard(page, "order-cmdn-drag-b").click();
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-drag-b");

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-drag-c");
  } finally {
    await cleanup();
  }
});

test("Opt+Cmd+1 follows the rail order after a pin", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "order-cmdn-pin-a",
    "order-cmdn-pin-b",
    "order-cmdn-pin-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // Pin C — it jumps to the top of the pinned block, becoming the rail's new first
    // card even though it was launched last.
    await pinButton(railCard(page, "order-cmdn-pin-c")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([c.id, a.id, b.id]);

    await railCard(page, "order-cmdn-pin-a").click();
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-pin-a");

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-pin-c");
  } finally {
    await cleanup();
  }
});

test("Opt+Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned session", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { sessions, cleanup } = await launchTitled(page, daemon, [
    "order-cmdn-att-a",
    "order-cmdn-att-b",
    "order-cmdn-att-c",
  ]);
  try {
    const [a, b, c] = sessions;
    if (!a || !b || !c) throw new Error("expected 3 sessions");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // Pin B — not the neediest session — so the attention-mode pinned-block-first rule
    // (`orderRail`: pinned block precedes the unpinned, need-sorted remainder in BOTH
    // modes) can be distinguished from a plain attention/priority sort.
    await pinButton(railCard(page, "order-cmdn-att-b")).click();
    await expect.poll(() => railOrderIds(page)).toEqual([b.id, a.id, c.id]);

    // C (unpinned) becomes the neediest session — if Opt+Cmd+1 merely followed attention
    // priority with no pinned-block rule, C would win. It must not: B is pinned.
    await makeNeedsInput(request, daemon, c, "claude-cmdn-att-c");
    await expect(stateBadge(railCard(page, "order-cmdn-att-c"))).toHaveText(/needs input/i);

    const select = railSortSelect(page);
    await select.focus();
    await page.keyboard.press("A");
    await expect(select).toHaveValue("attention");
    await expect.poll(() => railOrderIds(page)).toEqual([b.id, c.id, a.id]);

    await railCard(page, "order-cmdn-att-a").click();
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-att-a");

    await page.keyboard.press("Alt+Meta+Digit1");
    // Pinned B is the rail's actual first card in Attention mode — Opt+Cmd+1 must select
    // it, not the needs-input unpinned card C.
    await expect(page.locator("#mainhead .name")).toHaveText("order-cmdn-att-b");
  } finally {
    await cleanup();
  }
});
