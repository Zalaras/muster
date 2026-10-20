// tiles — the display properties of plans m4-reconcile (REQ-12) and move-tiles (REQ-1,
// REQ-10, E2, E6, E7, E8), re-levelled from web/e2e/tiles.spec.ts on 2026-10-20
// (plans/_audit/relevel/shortcuts-views-tiles.md): what the Tiles grid does for a given
// snapshot when the user drags a tile, clicks a strip card or presses Enter on a footer
// button needs no daemon to falsify — order and membership are per-window client state
// (kb:adr/tiles-order-ephemeral-per-window) and the Stop dialog opens before any request is
// sent. The view is a pref the dashboard adopts only from the broadcast, so every fixture
// here is a `tiles-*` scenario recorded with `view: "tiles"`; a live tile's terminal is blank
// (the harness answers its socket and stays silent) but present. The journeys — End and
// Remove round-trips, density PUTs, tmux geometry, hooks changing a tile, the daemon going
// down — stay in web/e2e/tiles.spec.ts.
import {
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  settleFor,
  test,
} from "./helpers/harness";
import { dragTileOnto, liveTile, stripCard, tileDragHandle, tilesGridOrder } from "./helpers/tiles";

/** The strip's cards (`#tiles-strip`) — every session without a live tile. */
function stripCards(page: Page): Locator {
  return page.locator("#tiles-strip").getByTestId("session-card");
}

/** Every fixture session's title — the `tiles-*` scenarios title each one. */
function titlesOf(fixture: RenderFixture): string[] {
  return fixture.snapshot.sessions.map((s) => {
    if (s.title === null)
      throw new Error(`fixture ${fixture.scenario}: session ${s.id} is untitled`);
    return s.title;
  });
}

/** Splits `titles` by whether each currently has a live tile in the grid, in one pass, so
 * a "how many" assertion and a "which one" lookup cannot disagree. */
async function partitionByLiveTile(
  page: Page,
  titles: readonly string[],
): Promise<{ live: string[]; stripped: string[] }> {
  const live: string[] = [];
  const stripped: string[] = [];
  for (const t of titles) {
    if ((await liveTile(page, t).count()) > 0) live.push(t);
    else stripped.push(t);
  }
  return { live, stripped };
}

/** Opens a Tiles fixture and waits for its full 2×2 grid, returning the titles. */
async function openGrid(
  page: Page,
  open: (name: string) => Promise<RenderFixture>,
  scenario: string,
): Promise<string[]> {
  const fixture = await open(scenario);
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#tiles-grid article.tile")).toHaveCount(4);
  return titlesOf(fixture);
}

/** The Stop button in a tile's footer, and the dialog it opens. */
function footerStop(page: Page, tile: Locator): { button: Locator; dialog: Locator } {
  return {
    button: tile.locator(".tfoot").getByRole("button", { name: "Stop" }),
    dialog: page.getByRole("dialog", { name: "Stop session?" }),
  };
}

/** Whether `button` is the document's active element right now — node identity, not a
 * re-resolved locator, so a rebuilt button with the same name cannot pass. */
async function isActiveNode(button: Locator): Promise<boolean> {
  return await button.evaluate((el) => el === document.activeElement);
}

// review m4-reconcile cycle-2 Major 2, tile-footer case: same defect, different
// surface — `renderTileFooterActions` also unconditionally rebuilt every 1s tick before
// the Major 1 fix. A single live session, so the tile renders at 1x1 with no strip involved.
test("a tile footer's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-12, Major 1, Major 2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("tiles-one");
  expect(fixture.snapshot.sessions).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  const tile = liveTile(page, "solo");
  await expect(tile).toBeVisible();
  await expect(stripCards(page)).toHaveCount(0);
  const { button: endBtn, dialog } = footerStop(page, tile);

  await endBtn.focus();
  await expect(endBtn).toBeFocused();
  const before = await endBtn.elementHandle();

  // Outlive a render tick (the installed clock drives `setInterval(render, 1000)`), then
  // prove focus STAYED on the very same node — a rebuilt button would be a new element.
  await settleFor(page, 1_400);
  await expect(endBtn).toBeFocused();
  expect(await isActiveNode(endBtn)).toBe(true);
  expect(await page.evaluate((el) => el === document.activeElement, before)).toBe(true);

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

// review m4-reconcile cycle-4 Minor 2/3, retargeted by plan move-tiles REQ-10/E6: the only
// thing that still moves a tile's DOM node is a user drag, so the focus-survives-a-reorder
// contract (`captureFocusedControl`/`restoreFocusedControl` inside `reconcileTilesGrid`)
// must be exercised via a drop, not a priority change.
test("a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)", async ({
  page,
  dashboard,
}) => {
  const titles = await openGrid(page, dashboard.open, "tiles-four");
  expect(titles).toHaveLength(4);
  for (const t of titles) {
    await expect(liveTile(page, t)).toBeVisible();
  }

  const orderBefore = await tilesGridOrder(page);
  expect(orderBefore).toHaveLength(4);
  const [slotA, slotB, slotC, slotD] = orderBefore;
  if (!slotA || !slotB || !slotC || !slotD) throw new Error("expected 4 distinct tile titles");

  const { button: endBtnB, dialog } = footerStop(page, liveTile(page, slotB));
  await endBtnB.focus();
  await expect(endBtnB).toBeFocused();

  // Control: render ticks alone must not blur it (already covered by the tick test
  // above, re-asserted here so the drop below is the only variable).
  await settleFor(page, 1_400);
  await expect(endBtnB).toBeFocused();

  // Dragging A's header onto B moves A's node past B — B (and its focused button)
  // shifts in the DOM, exercising the exact `insertBefore` path REQ-10 must survive.
  await dragTileOnto(page, slotA, slotB);
  await expect.poll(() => tilesGridOrder(page)).toEqual([slotB, slotA, slotC, slotD]);

  // Focus survived the reorder on the same node, and the button is still operable from
  // the keyboard.
  await expect(endBtnB).toBeFocused();
  expect(await isActiveNode(endBtnB)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

// Plan move-tiles — REQ-1 through REQ-10, INV-3/6/7. The Tiles grid stops re-sorting
// itself on every render; only a drag reorders it, and the order is client-only state.
test("dragging a tile's header onto an earlier tile reorders backward (E2)", async ({
  page,
  dashboard,
}) => {
  const titles = await openGrid(page, dashboard.open, "tiles-four");
  for (const t of titles) {
    await expect(liveTile(page, t)).toBeVisible();
  }

  const orderBefore = await tilesGridOrder(page);
  expect(orderBefore).toHaveLength(4);
  const [slot1, slot2, slot3, slot4] = orderBefore;
  if (!slot1 || !slot2 || !slot3 || !slot4) throw new Error("expected 4 distinct tile titles");

  // Edge Case 2 backward case: [A,B,C,D], drop D on B -> [A,D,B,C].
  await dragTileOnto(page, slot4, slot2);

  await expect.poll(() => tilesGridOrder(page)).toEqual([slot1, slot4, slot2, slot3]);
  // E4: both drag-feedback classes are cleared once the drop completes, and the order
  // holds across the next render tick.
  await expect(page.locator("article.tile.dragging")).toHaveCount(0);
  await expect(page.locator("article.tile.drop-target")).toHaveCount(0);
  await settleFor(page, 1_100);
  expect(await tilesGridOrder(page)).toEqual([slot1, slot4, slot2, slot3]);
});

test("clicking a strip card at capacity places the promoted tile into the demoted tile's former index (E7, REQ-1)", async ({
  page,
  dashboard,
}) => {
  const titles = await openGrid(page, dashboard.open, "tiles-five");
  expect(titles).toHaveLength(5);

  const before = await partitionByLiveTile(page, titles);
  expect(before.live).toHaveLength(4);
  const [strippedTitle] = before.stripped;
  if (before.stripped.length !== 1 || !strippedTitle)
    throw new Error("expected exactly one stripped title at 2x2 with 5 sessions");
  await expect(stripCard(page, strippedTitle)).toBeVisible();

  const orderBefore = await tilesGridOrder(page);
  expect(orderBefore).toHaveLength(4);

  await stripCard(page, strippedTitle).click();
  await expect(liveTile(page, strippedTitle)).toBeVisible();
  await expect(stripCard(page, strippedTitle)).toHaveCount(0);

  const orderAfter = await tilesGridOrder(page);
  expect(orderAfter).toHaveLength(4);

  // REQ-1: the promoted id lands in the demoted (worst-ranked) member's slot, and
  // every other index is untouched — assert both halves at once by reconstructing the
  // expected array from `orderBefore` with only the demoted slot swapped.
  const demotedTitle = orderBefore.find((t) => !orderAfter.includes(t));
  if (!demotedTitle) throw new Error("expected exactly one demoted title");
  const expectedOrder = orderBefore.map((t) => (t === demotedTitle ? strippedTitle : t));
  expect(orderAfter).toEqual(expectedOrder);
  // ...and the demoted session is the strip's one card now: grid size stays fixed at N.
  await expect(stripCard(page, demotedTitle)).toBeVisible();
  await expect(stripCards(page)).toHaveCount(1);
  await settleFor(page, 1_100);
  expect(await tilesGridOrder(page)).toEqual(expectedOrder);
});

test("a drag released over the strip leaves the tile order unchanged (E8)", async ({
  page,
  dashboard,
}) => {
  const titles = await openGrid(page, dashboard.open, "tiles-five");
  const { stripped } = await partitionByLiveTile(page, titles);
  const [strippedTitle] = stripped;
  if (stripped.length !== 1 || !strippedTitle)
    throw new Error("expected exactly one stripped title at 2x2 with 5 sessions");

  const orderBefore = await tilesGridOrder(page);
  expect(orderBefore).toHaveLength(4);
  const draggedTitle = orderBefore[0];
  if (!draggedTitle) throw new Error("expected a live tile to drag");

  // Edge Case 3: `dragover` is never prevented outside `#tiles-grid`, so the browser's
  // own `drop` never fires here — `dragTo` still completes the mouse gesture either way.
  // The drop target is the strip card itself (outside the grid), not another tile, so
  // this drags the raw `.thead` handle directly rather than going through
  // `dragTileOnto` (which always targets a live tile).
  await tileDragHandle(page, draggedTitle).dragTo(stripCard(page, strippedTitle));

  await expect(page.locator("article.tile.dragging")).toHaveCount(0);
  await expect(page.locator("article.tile.drop-target")).toHaveCount(0);
  expect(await tilesGridOrder(page)).toEqual(orderBefore);
  await settleFor(page, 1_100);
  expect(await tilesGridOrder(page)).toEqual(orderBefore);
  await expect(stripCard(page, strippedTitle)).toBeVisible();
});
