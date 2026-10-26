// rail — the display properties of the rail feature, re-levelled from
// web/e2e/rail-order.spec.ts, rail-menu.spec.ts, rail-cards.spec.ts, rail-layout.spec.ts,
// rail-unread.spec.ts, rail-drag-groups.spec.ts and rail-activity.spec.ts on 2026-10-20
// (plans/_audit/relevel/rail.md): what a rail card and a Tiles strip card show for a given
// snapshot — which controls a card has at rest, on hover, focused and current; the pin
// control's reveal; the right-click menu's items for a live, an ended, a pinned, a grouped
// and an unbound card and how it opens, closes and survives a render tick; the ended-cards
// and attention orders; the three densities over long text; the background-task and
// activity lines; the unread marker's title colour; the chords following the displayed
// order. Nothing here reaches the daemon: a menu, a dialog, a card click, a selection and a
// drag that sends nothing are window state; the sort, the density, the activity pref, the
// view and every session state come from the fixtures, since the dashboard adopts `railSort`,
// `railDensity`, `railActivity` and `view` only from the daemon's broadcast.
import { currentRailCard, sessionCard, stateBadge } from "./helpers/focus";
import {
  barButton,
  cardCheckbox,
  groupHead,
  menuItem,
  openRailMenu,
  sectionCardIds,
  selectBarCount,
  selectToggle,
} from "./helpers/groups";
import {
  type Dashboard,
  expect,
  type Page,
  type RenderFixture,
  type Session,
  settleFor,
  test,
} from "./helpers/harness";
import {
  CARD_ACTION_BUTTON,
  cardActivityClaude,
  cardActivityYou,
  cardBackgroundTasks,
  cardContextRow,
  cardContextTrack,
  cardMenu,
  cardMenuItem,
  cardName,
  cardRepoLine,
  cardStateRow,
  cardTitleRow,
  dragWithin,
  expectedManualOrder,
  menuItemLabels,
  newSessionButton,
  openCardMenu,
  pinButton,
  railActivityLegend,
  railActivityRadio,
  railActivityRadios,
  railCard,
  railDensityGroup,
  railOrderIds,
  railSortSelect,
  stripOrderIds,
  trackContextMenuEvents,
  trackMutationBodies,
} from "./helpers/rail";
import { mainheadName } from "./helpers/shortcuts";
import { computedColor, tokenColor } from "./helpers/style";
import { openSettingsDialog } from "./helpers/theme";
import { liveTile, stripCard } from "./helpers/tiles";

/** The fixture session with this title. */
function titled(fixture: RenderFixture, title: string): Session {
  const session = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`fixture ${fixture.scenario} has no session titled ${title}`);
  return session;
}

/** Every fixture session's title — the scenarios here title each one. */
function titlesOf(fixture: RenderFixture): string[] {
  return fixture.snapshot.sessions.map((s) => {
    if (s.title === null)
      throw new Error(`fixture ${fixture.scenario}: session ${s.id} is untitled`);
    return s.title;
  });
}

/** The fixture's group names in rail order (`pos`), the order Move to lists them in. */
function groupNamesInRailOrder(fixture: RenderFixture): string[] {
  return [...fixture.snapshot.groups].sort((a, b) => a.pos - b.pos).map((g) => g.name);
}

/** The fixture's group by name. */
function groupNamed(
  fixture: RenderFixture,
  name: string,
): RenderFixture["snapshot"]["groups"][number] {
  const group = fixture.snapshot.groups.find((g) => g.name === name);
  if (!group) throw new Error(`fixture ${fixture.scenario} has no group named ${name}`);
  return group;
}

/** The titles with no live tile in the grid, in the order given. */
async function strippedTitles(page: Page, titles: readonly string[]): Promise<string[]> {
  const stripped: string[] = [];
  for (const t of titles) {
    if ((await liveTile(page, t).count()) === 0) stripped.push(t);
  }
  return stripped;
}

/** The render tick every second (`setInterval(render, 1000)`) runs under the installed
 * clock: advancing past one proves what is asserted is the settled state. */
const ONE_TICK_MS = 1_300;

// ═══ web/e2e/rail-order.spec.ts — plan order-sidebar ═══

test("rail cards are draggable in both sort modes", async ({ page, dashboard }) => {
  // The sort is a pref the dashboard adopts only from the broadcast: each mode is its own
  // fixture of the same three sessions.
  const manual = await dashboard.open("shortcuts-rail");
  expect(manual.snapshot.prefs.railSort).toBe("manual");
  await expect(railSortSelect(page)).toHaveValue("manual");
  await expect(railCard(page, "rail-a")).toHaveAttribute("draggable", "true");
  await expect(railCard(page, "rail-b")).toHaveAttribute("draggable", "true");

  const attention = await dashboard.open("shortcuts-rail-attention");
  expect(attention.snapshot.prefs.railSort).toBe("attention");
  await expect(railSortSelect(page)).toHaveValue("attention");
  await expect(railCard(page, "rail-a")).toHaveAttribute("draggable", "true");
  await expect(railCard(page, "rail-b")).toHaveAttribute("draggable", "true");
});

test("the Tiles strip order matches the rail order minus live tiles (E14)", async ({
  page,
  dashboard,
}) => {
  // Six sessions, the last pinned: the rail reads [6, 1, 2, 3, 4, 5], the 2×2 grid takes four,
  // and the strip must list the two left in the rail's order, not launch order.
  const fixture = await dashboard.open("rail-strip-order");
  const titles = titlesOf(fixture);
  expect(titles).toHaveLength(6);
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

  // The rail stays mounted (hidden) behind Tiles; its DOM order is the daemon's own
  // pinned-then-railPos order (the independent oracle).
  const railBefore = await railOrderIds(page);
  expect(railBefore).toEqual(expectedManualOrder(fixture.snapshot.sessions));
  expect(railBefore).not.toEqual(fixture.snapshot.sessions.map((s) => s.id));

  const stripped = await strippedTitles(page, titles);
  expect(stripped).toHaveLength(2); // 6 sessions, 2x2 grid -> 4 live, 2 stripped
  const strippedIds = new Set(stripped.map((t) => titled(fixture, t).id));
  const expectedStrip = railBefore.filter((id) => strippedIds.has(id));
  await expect.poll(() => stripOrderIds(page)).toEqual(expectedStrip);
});

test("the pin button is hidden until hover/focus reveals it, but always visible once pinned (REQ-8)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("shortcuts-rail-pinned");
  expect(titled(fixture, "rail-b").pinned).toBe(false);
  expect(titled(fixture, "rail-a").pinned).toBe(true);
  const card = railCard(page, "rail-b");
  const pin = pinButton(card);

  // Playwright's actionability model treats opacity:0 as visible, so the check must
  // read the computed style directly.
  await expect(pin).toHaveCSS("opacity", "0");

  await card.hover();
  await expect(pin).toHaveCSS("opacity", "1");

  await page.mouse.move(0, 0);
  await expect(pin).toHaveCSS("opacity", "0");

  await pin.focus();
  await expect(pin).toHaveCSS("opacity", "1");

  // Once pinned, the button stays visible with no hover/focus at all: move the pointer
  // away and shift focus onto a plain, non-interactive masthead element.
  const pinned = railCard(page, "rail-a");
  await expect(pinned.getByRole("button", { name: "Unpin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.move(0, 0);
  await page.locator(".brand").click();
  await expect(pinButton(pinned)).toHaveCSS("opacity", "1");
});

test("the rail sort select keeps focus and node identity across a render tick", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("shortcuts-rail");
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
});

test("Opt+Cmd+1 follows the manual rail order even when the needs-input session is not first", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("shortcuts-rail");
  const [one, two, three] = ["rail-a", "rail-b", "rail-c"].map((t) => titled(fixture, t));
  if (!one || !two || !three) throw new Error("expected 3 sessions");
  await expect.poll(() => railOrderIds(page)).toEqual([one.id, two.id, three.id]);
  await expect(railSortSelect(page)).toHaveValue("manual");

  // The LAST rail card (three) is the one that needs input, not the first — manual order
  // stays [one, two, three] regardless (REQ-7).
  await expect(stateBadge(railCard(page, "rail-c"))).toHaveText(/needs input/i);
  expect(await railOrderIds(page)).toEqual([one.id, two.id, three.id]);

  // Explicitly focus a different card first, so Opt+Cmd+1 has to move focus rather than
  // merely leave it where it already was.
  await railCard(page, "rail-b").click();
  await expect(mainheadName(page)).toHaveText("rail-b");

  await page.keyboard.press("Alt+Meta+Digit1");

  // Opt+Cmd+1 must select the rail's actual first card (one), not the needs-input card
  // (three) that a fixed attention sort would have picked.
  await expect(mainheadName(page)).toHaveText("rail-a");
});

test("Opt+Cmd+1 selects the pinned card in Attention mode, ahead of the neediest unpinned session", async ({
  page,
  dashboard,
}) => {
  // rail-a is pinned and idle, rail-c unpinned and the neediest: the attention-mode
  // pinned-block-first rule (`orderRail`) puts a ahead of c, where a plain priority sort
  // would put c first.
  const fixture = await dashboard.open("rail-pinned-attention");
  const [a, b, c] = ["rail-a", "rail-b", "rail-c"].map((t) => titled(fixture, t));
  if (!a || !b || !c) throw new Error("expected 3 sessions");
  expect(a.pinned).toBe(true);
  expect(c.state).toBe("needs_input");
  await expect(railSortSelect(page)).toHaveValue("attention");
  await expect(stateBadge(railCard(page, "rail-c"))).toHaveText(/needs input/i);
  await expect.poll(() => railOrderIds(page)).toEqual([a.id, c.id, b.id]);

  await railCard(page, "rail-b").click();
  await expect(mainheadName(page)).toHaveText("rail-b");

  await page.keyboard.press("Alt+Meta+Digit1");
  // Pinned a is the rail's actual first card in Attention mode — Opt+Cmd+1 must select
  // it, not the needs-input unpinned card c.
  await expect(mainheadName(page)).toHaveText("rail-a");
});

// ═══ web/e2e/rail-menu.spec.ts — plan rail-card-organise (#56) ═══

test("right-clicking a live rail card opens a menu at the pointer with Stop…, Remove…, each group in rail order, New group…, No group, Pin and the two Mark entries, and no Resume, and the browser's own menu is cancelled (REQ-1, REQ-2, E1; REQ-2, REQ-3 of remove-unread-right-click-1)", async ({
  page,
  dashboard,
}) => {
  // alpha-one is live and in Alpha; Bravo is the second group in rail order.
  const fixture = await dashboard.open("groups-titled");
  const names = groupNamesInRailOrder(fixture);
  expect(names).toEqual(["Alpha", "Bravo"]);
  const contextMenus = await trackContextMenuEvents(page);

  const card = railCard(page, "alpha-one");
  const cardBox = await card.boundingBox();
  if (!cardBox) throw new Error("the card has no layout box");
  const menu = await openCardMenu(page, card, { x: 24, y: 12 });

  expect(await menuItemLabels(page)).toEqual([
    "Stop…",
    "Remove…",
    ...names,
    "New group…",
    "No group",
    "Pin",
    "Mark as read",
    "Mark as unread",
  ]);
  await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
  await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
  await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
  // The ticked entry is the session's own group; No group is not ticked while it is grouped.
  await expect(cardMenuItem(page, "Alpha")).toHaveAttribute("aria-current", "true");
  await expect(cardMenuItem(page, "Bravo")).not.toHaveAttribute("aria-current", "true");
  await expect(cardMenuItem(page, "No group")).not.toHaveAttribute("aria-current", "true");

  // Opened at the pointer: the panel's corner sits within a small offset of where the button went down.
  const menuBox = await menu.boundingBox();
  if (!menuBox) throw new Error("the menu has no layout box");
  expect(Math.abs(menuBox.x - (cardBox.x + 24))).toBeLessThanOrEqual(40);
  expect(Math.abs(menuBox.y - (cardBox.y + 12))).toBeLessThanOrEqual(40);

  // The page's handler cancelled the browser's own menu.
  expect(await contextMenus()).toEqual([true]);
});

test("right-clicking an ended resumable rail card offers Resume, Remove…, the Move to items and Pin or Unpin, and no Stop… (REQ-2, E2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(groupNamesInRailOrder(fixture)).toEqual(["review"]);
  expect(titled(fixture, "menu-plain")).toMatchObject({
    alive: false,
    pinned: false,
    groupId: null,
  });
  expect(titled(fixture, "menu-pinned")).toMatchObject({ alive: false, pinned: true });
  await expect(sessionCard(page, "menu-plain")).toHaveClass(/ended/);

  await openCardMenu(page, railCard(page, "menu-plain"));
  expect(await menuItemLabels(page)).toEqual([
    "Resume",
    "Remove…",
    "review",
    "New group…",
    "No group",
    "Pin",
    "Mark as read",
    "Mark as unread",
  ]);
  await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
  await expect(cardMenuItem(page, "Resume")).toBeEnabled();
  await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
  // Ungrouped: No group carries the tick and the group does not.
  await expect(cardMenuItem(page, "No group")).toHaveAttribute("aria-current", "true");
  await expect(cardMenuItem(page, "review")).not.toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(cardMenu(page)).toHaveCount(0);

  await openCardMenu(page, railCard(page, "menu-pinned"));
  const pinnedLabels = await menuItemLabels(page);
  // Unpin sits where Pin does, ahead of the Mark as read/unread entries (REQ-2).
  expect(pinnedLabels).toContain("Unpin");
  expect(pinnedLabels).not.toContain("Pin");
  expect(pinnedLabels.indexOf("Unpin")).toBeLessThan(pinnedLabels.indexOf("Mark as read"));
  await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
});

test("an ended session with no Claude session id has no Resume item at all, not a disabled one, while its Remove… stays (REQ-3)", async ({
  page,
  dashboard,
}) => {
  // A viewport tall enough that menu-unbound (the last card) needs no scroll to right-click:
  // the menu closes on any `scroll` event (web/src/render/menu.ts).
  await page.setViewportSize({ width: 1280, height: 1600 });
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-unbound").claudeSessionId).toBeNull();
  expect(titled(fixture, "menu-unbound").alive).toBe(false);
  expect(titled(fixture, "menu-plain").claudeSessionId).not.toBeNull();

  await openCardMenu(page, railCard(page, "menu-unbound"));
  await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
  await expect(cardMenu(page).getByRole("menuitem", { name: /^Resume/ })).toHaveCount(0);
  await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
  expect((await menuItemLabels(page))[0]).toBe("Remove…");
  await page.keyboard.press("Escape");

  // The bound twin does offer it, so the absence above is the binding and nothing else.
  await openCardMenu(page, railCard(page, "menu-plain"));
  await expect(cardMenuItem(page, "Resume")).toBeEnabled();
});

test("no rail card renders a Stop, Resume or Remove button, live or ended, at rest, hovered, focused or current, and the pin control stays (REQ-6, INV-3, E3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-live").alive).toBe(true);
  expect(titled(fixture, "menu-plain").alive).toBe(false);
  expect(titled(fixture, "menu-unbound").claudeSessionId).toBeNull();

  for (const title of ["menu-live", "menu-plain", "menu-unbound"]) {
    const card = railCard(page, title);
    await expect(card).toBeVisible();
    const noActions = async () => {
      await expect(card.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
      await expect(card.locator(".acts-row")).toHaveCount(0);
      await expect(pinButton(card)).toBeVisible();
    };
    await noActions();
    await card.hover();
    await noActions();
    await card.focus();
    await noActions();
  }

  // Current: the card the Focus pane shows, live and ended in turn.
  for (const title of ["menu-live", "menu-plain"]) {
    await railCard(page, title).click();
    await expect(railCard(page, title)).toHaveAttribute("aria-current", "true");
    await expect(
      railCard(page, title).getByRole("button", { name: CARD_ACTION_BUTTON }),
    ).toHaveCount(0);
    await expect(railCard(page, title).locator(".acts-row")).toHaveCount(0);
  }

  // A render tick later, with nothing hovered, still none anywhere on the rail.
  await page.mouse.move(0, 0);
  await settleFor(page, ONE_TICK_MS);
  await expect(
    page.locator("#sessions").getByTestId("session-card").getByRole("button", {
      name: CARD_ACTION_BUTTON,
    }),
  ).toHaveCount(0);
});

test("the same menu opens on Tiles strip cards, live and ended, and no strip card renders a Stop, Resume or Remove button (REQ-1, REQ-6, INV-3, E4)", async ({
  page,
  dashboard,
}) => {
  // Six sessions, the last ended: the 2×2 grid takes four live ones and the strip holds a
  // live card and the ended one.
  const fixture = await dashboard.open("rail-strip-menu");
  const titles = titlesOf(fixture);
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

  const stripped = await strippedTitles(page, titles);
  expect(stripped).toHaveLength(2);
  const liveStrip = stripped.find((t) => titled(fixture, t).alive);
  const endedStrip = stripped.find((t) => !titled(fixture, t).alive);
  if (!liveStrip || !endedStrip) throw new Error("expected a live and an ended strip card");
  await expect(stripCard(page, endedStrip)).toHaveClass(/ended/);

  for (const title of stripped) {
    const strip = stripCard(page, title);
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
    await strip.hover();
    await expect(strip.getByRole("button", { name: CARD_ACTION_BUTTON })).toHaveCount(0);
    await expect(strip.locator(".acts-row")).toHaveCount(0);
  }

  await openCardMenu(page, stripCard(page, liveStrip));
  await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
  await expect(cardMenuItem(page, "Resume")).toHaveCount(0);
  await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
  await expect(cardMenuItem(page, "No group")).toBeVisible();
  await expect(cardMenuItem(page, "Pin")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cardMenu(page)).toHaveCount(0);

  await openCardMenu(page, stripCard(page, endedStrip));
  await expect(cardMenuItem(page, "Resume")).toBeEnabled();
  await expect(cardMenuItem(page, "Remove…")).toBeEnabled();
  await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);
});

test("Escape closes the card menu and returns focus to the card, and right-clicking a second card replaces the first menu (REQ-8, E7)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-live").alive).toBe(true);
  expect(titled(fixture, "menu-plain").alive).toBe(false);

  await openCardMenu(page, railCard(page, "menu-live"));
  await page.keyboard.press("Escape");
  await expect(cardMenu(page)).toHaveCount(0);
  await expect(railCard(page, "menu-live")).toBeFocused();

  // The menu opens at the pointer and covers the cards below it, so the second right-click
  // lands on the ended card beside the open menu, as a user's would.
  const firstMenu = await openCardMenu(page, railCard(page, "menu-live"), { x: 8, y: 8 });
  await expect(cardMenuItem(page, "Stop…")).toBeVisible();
  const menuBox = await firstMenu.boundingBox();
  const endedBox = await railCard(page, "menu-plain").boundingBox();
  if (!menuBox || !endedBox) throw new Error("expected the menu and the ended card on screen");
  const beside = menuBox.x + menuBox.width + 6 - endedBox.x;
  expect(beside).toBeLessThan(endedBox.width - 6);
  await railCard(page, "menu-plain").click({
    button: "right",
    position: { x: beside, y: 8 },
  });
  await expect(cardMenu(page)).toHaveCount(1);
  await expect(cardMenuItem(page, "Resume")).toBeVisible();
  await expect(cardMenuItem(page, "Stop…")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(cardMenu(page)).toHaveCount(0);
  await expect(railCard(page, "menu-plain")).toBeFocused();
});

test("right-clicking a card while the rail's ⋯ menu is open closes that menu and opens the card's (REQ-8, edge case 13)", async ({
  page,
  dashboard,
}) => {
  // A viewport tall enough for every section and card: the menu closes on any `scroll`
  // event (web/src/render/menu.ts), so a card Playwright must scroll into view to click
  // would close the menu the click just opened.
  await page.setViewportSize({ width: 1280, height: 1600 });
  const fixture = await dashboard.open("groups-titled");
  expect(fixture.snapshot.groups.length).toBeGreaterThan(0);
  await openRailMenu(page);
  await expect(menuItem(page, "Collapse all groups")).toBeVisible();

  await railCard(page, "loose-one").click({ button: "right" });
  await expect(cardMenu(page)).toHaveCount(1);
  await expect(cardMenuItem(page, "Pin")).toBeVisible();
  await expect(cardMenuItem(page, "Stop…")).toBeVisible();
  await expect(menuItem(page, "Collapse all groups")).toHaveCount(0);
});

test("the card keeps its node and focus through opening and closing its menu from the keyboard, and the open menu keeps its focused item across a render tick (REQ-9, REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("rail-menu-cards");
  const card = railCard(page, "menu-live");
  await card.focus();
  await card.evaluate((el) => {
    Reflect.set(el, "__e2eNode", "card");
  });
  const cardTagged = () =>
    page.evaluate(() => Reflect.get(document.activeElement ?? {}, "__e2eNode") === "card");
  expect(await cardTagged()).toBe(true);

  await page.keyboard.press("Shift+F10");
  await expect(cardMenuItem(page, "Stop…")).toBeFocused();
  await cardMenuItem(page, "Stop…").evaluate((el) => {
    Reflect.set(el, "__e2eNode", "item");
  });
  const itemTagged = () =>
    page.evaluate(() => Reflect.get(document.activeElement ?? {}, "__e2eNode") === "item");
  expect(await itemTagged()).toBe(true);

  // Past one 1 s render tick: the menu is neither rebuilt nor closed and the item holds focus.
  await settleFor(page, ONE_TICK_MS);
  await expect(cardMenu(page)).toBeVisible();
  expect(await itemTagged()).toBe(true);

  await page.keyboard.press("Escape");
  await expect(cardMenu(page)).toHaveCount(0);
  expect(await cardTagged()).toBe(true);
  await settleFor(page, ONE_TICK_MS);
  await expect(card).toBeFocused();
  expect(await cardTagged()).toBe(true);
});

// ═══ web/e2e/rail-cards.spec.ts — plans m4-reconcile, status-inconsistencies ═══

test("ended sessions sort after every live session, most recently ended first (REQ-9)", async ({
  page,
  dashboard,
}) => {
  // These orderings are an Attention-mode guarantee (REQ-7: a state change — ending a
  // session — never moves a card in manual mode), so the fixture holds the attention sort.
  const fixture = await dashboard.open("rail-ended-order");
  expect(fixture.snapshot.prefs.railSort).toBe("attention");
  await expect(railSortSelect(page)).toHaveValue("attention");
  const first = titled(fixture, "sort-ended-first");
  const second = titled(fixture, "sort-ended-second");
  if (!first.endedAt || !second.endedAt) throw new Error("an ended session has no endedAt");
  expect(Date.parse(second.endedAt)).toBeGreaterThan(Date.parse(first.endedAt));
  await expect(sessionCard(page, "sort-ended-first")).toHaveClass(/ended/);
  await expect(sessionCard(page, "sort-ended-second")).toHaveClass(/ended/);
  await expect(sessionCard(page, "sort-live")).not.toHaveClass(/ended/);

  const cardTexts = await page.locator("#sessions").getByTestId("session-card").allInnerTexts();
  const indexOf = (label: string): number => cardTexts.findIndex((t) => t.includes(label));
  const liveIdx = indexOf("sort-live");
  const firstEndedIdx = indexOf("sort-ended-first");
  const secondEndedIdx = indexOf("sort-ended-second");
  expect(liveIdx).toBeGreaterThanOrEqual(0);
  expect(liveIdx).toBeLessThan(firstEndedIdx);
  expect(liveIdx).toBeLessThan(secondEndedIdx);
  expect(secondEndedIdx).toBeLessThan(firstEndedIdx);
});

// The 1s render tick once rebuilt every card's DOM, dropping focus to <body> between a focus
// and its key. Focus, outlive a tick, assert the same node still holds focus, then press the
// key as a separate action.
test("the Focus header's Session actions button keeps focus and node identity across a render tick and then opens the card menu via a separate keyboard Enter, whose Stop… opens the Stop dialog (REQ-4, REQ-5, REQ-7, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-live").alive).toBe(true);
  const card = sessionCard(page, "menu-live");
  await card.click();
  const mainhead = page.locator("#mainhead");
  await expect(mainhead).toContainText("menu-live");
  await expect(mainhead.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  const moreBtn = mainhead.getByRole("button", { name: "Session actions", exact: true });
  const dialog = page.getByRole("dialog", { name: "Stop session?" });

  await moreBtn.focus();
  await expect(moreBtn).toBeFocused();
  await moreBtn.evaluate((el) => {
    (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-more-btn";
  });

  // A stays-unchanged hold: the render tick itself is under test, so there is no
  // visible outcome to poll for.
  await settleFor(page, 1_400);
  await expect(moreBtn).toBeFocused();
  expect(
    await moreBtn.evaluate(
      (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-more-btn",
    ),
  ).toBe(true);

  await page.keyboard.press("Enter");
  await expect(cardMenu(page)).toBeVisible();
  await expect(moreBtn).toHaveAttribute("aria-expanded", "true");
  await cardMenuItem(page, "Stop…").click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
});

// The nested-control half: the ended card's menu's Remove… item. Focus the card, open the
// menu with a real key, outlive a tick with node identity, then Enter and Space each as
// their own action.
test("an ended card's Remove… menu item keeps focus and node identity across a render tick and activates via keyboard Enter and Space (REQ-7, REQ-11, Major 1, Major 5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-plain").alive).toBe(false);
  const card = sessionCard(page, "menu-plain");
  await expect(card).toHaveClass(/ended/);
  const removeItem = page.getByRole("menu").getByRole("menuitem", { name: "Remove…", exact: true });
  const dialog = page.getByRole("dialog", { name: "Remove session?" });

  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(removeItem).toBeFocused();
  await removeItem.evaluate((el) => {
    (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-remove-item";
  });
  // A stays-unchanged hold over one render tick, as above.
  await settleFor(page, 1_400);
  await expect(removeItem).toBeFocused();
  expect(
    await removeItem.evaluate(
      (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-remove-item",
    ),
  ).toBe(true);

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press("ContextMenu");
  await page.keyboard.press("ArrowDown");
  await expect(removeItem).toBeFocused();
  await page.keyboard.press("Space");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("an ended rail card has no action row and no action button at rest, on hover or with focus (REQ-7, REQ-11, Minor 2/3, plan rail-card-organise REQ-6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-menu-cards");
  expect(titled(fixture, "menu-plain").alive).toBe(false);
  const card = sessionCard(page, "menu-plain");
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/ended/);
  const actsRow = card.locator(".acts-row");
  const anyAction = card.getByRole("button", { name: /^(Stop|End|Resume|Remove)/ });

  // An ended card that is the current one used to show its row too, so make a different, live
  // card current first: nothing about "current" may explain a missing row.
  await sessionCard(page, "menu-live").click();
  await expect(currentRailCard(page)).toContainText("menu-live");
  await page.mouse.move(0, 0);

  await expect(actsRow).toHaveCount(0);
  await expect(anyAction).toHaveCount(0);

  await card.hover();
  await expect(actsRow).toHaveCount(0);
  await expect(anyAction).toHaveCount(0);

  await page.mouse.move(0, 0);
  await card.focus();
  await expect(card).toBeFocused();
  await expect(actsRow).toHaveCount(0);
  await expect(anyAction).toHaveCount(0);
  // The pin control is the one control the card keeps.
  await expect(pinButton(card)).toBeVisible();
});

// Plan status-inconsistencies E5 (REQ-5, REQ-6, #60): a Stop that lists a running shell
// leaves the state idle and shows a neutral line at the bottom of the card.
test("a Stop with one running shell shows '1 background task' on an idle card (E5, REQ-5, REQ-6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-bg-tasks");
  // A card whose Stops listed no running task carries no line.
  expect(titled(fixture, "bgtasks-none").backgroundTasks).toBe(0);
  await expect(cardBackgroundTasks(sessionCard(page, "bgtasks-none"))).toHaveCount(0);

  const card = sessionCard(page, "bgtasks-one");
  await expect(stateBadge(card)).toHaveText(/idle/i);

  const line = cardBackgroundTasks(card);
  await expect(line).toHaveText("1 background task");
  await expect(line).toBeVisible();
  // Not hover-revealed: the line is on the card at rest.
  await expect(line).toHaveCSS("opacity", "1");
  await expect(line).toHaveAttribute("title", "1 background task");
  // The daemon's own count, as the fixture recorded it from the Stop.
  expect(titled(fixture, "bgtasks-one").backgroundTasks).toBe(1);
  // The state is unchanged by the count: still idle, no attention.
  expect(titled(fixture, "bgtasks-one").state).toBe("idle");
});

test("a Stop listing two running tasks, one already finished, counts only the running ones and pluralises the line (E5, REQ-5, REQ-6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-bg-tasks");
  const card = sessionCard(page, "bgtasks-two");
  await expect(cardBackgroundTasks(card)).toHaveText("2 background tasks");
  expect(titled(fixture, "bgtasks-two").backgroundTasks).toBe(2);
});

// INV-C: the line is only for a live session.
test("an ended card shows no background line even though its last Stop listed a running task (REQ-6, INV-C)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-bg-tasks");
  // The daemon still carries the count; the display drops it with the liveness.
  expect(titled(fixture, "bgtasks-ended")).toMatchObject({ alive: false, backgroundTasks: 1 });
  const card = sessionCard(page, "bgtasks-ended");
  await expect(card).toHaveClass(/ended/);

  await expect(cardBackgroundTasks(card)).toHaveCount(0);
  await expect(card.locator(".bg-tasks")).toBeHidden();
});

// E8 (REQ-7, INV-D): a Tiles strip card is the same template, so it offers no End either.
test("a live strip card in Tiles has no End button (E8, REQ-7, INV-D)", async ({
  page,
  dashboard,
}) => {
  // Five sessions at the default 2×2 grid leaves exactly one stripped.
  const fixture = await dashboard.open("tiles-five");
  const titles = titlesOf(fixture);
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(liveTile(page, titles[0] ?? "")).toBeVisible();

  const [strippedTitle] = await strippedTitles(page, titles);
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
});

// ═══ web/e2e/rail-layout.spec.ts — plans rail-card-improvements, rail-card-improvements-2 ═══

test("the masthead's New session button opens the dialog from Focus and Tiles, Opt+Cmd+N still opens it, and no other launcher exists (E2, INV-3)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");

  // REQ-6/INV-3: exactly one New session button in the whole DOM, and the old Tiles
  // toolbar button is gone entirely.
  await expect(page.locator("#new-session-button")).toHaveCount(1);
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);

  const btn = newSessionButton(page);
  await expect(btn).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "New session" });

  await btn.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The view is a pref the page adopts only from the broadcast: Tiles is the same daemon
  // state recorded under `view: "tiles"`.
  await dashboard.open("empty-tiles");
  await expect(page.getByRole("button", { name: "Tiles", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#new-session-button")).toHaveCount(1);
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);
  await expect(newSessionButton(page)).toBeVisible();
  await newSessionButton(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(dialog).toBeVisible();
});

test("an empty rail still shows the sort select and the density control with a zero count (edge case 22)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
  await expect(railSortSelect(page)).toBeVisible();
  await expect(railDensityGroup(page)).toBeVisible();
  await expect(page.locator("#rail-count")).toHaveText("0");
  await expect(page.locator("#main-empty")).toContainText("No sessions yet");
});

/** The `rail-density*` scenarios: the same six sessions under each rail density. */
const DENSITY_FIXTURE: Record<"comfortable" | "compact" | "expanded", string> = {
  comfortable: "rail-density",
  compact: "rail-density-compact",
  expanded: "rail-density-expanded",
};

async function openDensity(
  page: Page,
  dashboard: Dashboard,
  density: keyof typeof DENSITY_FIXTURE,
): Promise<RenderFixture> {
  const fixture = await dashboard.open(DENSITY_FIXTURE[density]);
  expect(fixture.snapshot.prefs.railDensity).toBe(density);
  await expect(page.locator("body")).toHaveAttribute("data-rail-density", density);
  return fixture;
}

/** The one session of the density scenarios whose title wraps. */
function longTitled(fixture: RenderFixture): Session {
  const session = fixture.snapshot.sessions.find((s) => (s.title?.length ?? 0) > 60);
  if (!session) throw new Error(`fixture ${fixture.scenario} has no long-titled session`);
  return session;
}

test("a long title wraps to multiple lines in comfortable density and clamps to one line in compact, with title attributes on .name and .r2 throughout (E11, E13)", async ({
  page,
  dashboard,
}) => {
  // A real checkout, so `.r2` has a `<repo> / <branch>` to carry: the repo block wraps at the
  // `/` (its `innerText` is two lines) while its `title` stays one.
  const comfortable = await openDensity(page, dashboard, "comfortable");
  const session = longTitled(comfortable);
  const longTitle = session.title ?? "";
  if (!session.repo || session.repo.branch === null)
    throw new Error("the long-titled session is not on a branch");
  const repoTitle = `${session.repo.name} / ${session.repo.branch}`;

  let card = sessionCard(page, longTitle);
  let name = cardName(card);
  await expect(name).toHaveAttribute("title", longTitle);

  const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
  expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

  // E13 (REQ-2): `.r2` always carries `title` equal to `<repo> / <branch>`, in every
  // density — not to its own text, which is two lines when the block wraps.
  await expect(cardRepoLine(card)).toHaveAttribute("title", repoTitle);

  await openDensity(page, dashboard, "compact");
  card = sessionCard(page, longTitle);
  name = cardName(card);
  const compactLineHeight = await name.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight),
  );
  const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
  expect(compactHeight).toBeLessThanOrEqual(compactLineHeight * 1.5);
  await expect(name).toHaveAttribute("title", longTitle);

  await expect(cardRepoLine(card)).toHaveAttribute("title", repoTitle);
});

test("in compact density a long title is truly ellipsized within the card, not overflowing it (review cycle 1 Major 1, REQ-4)", async ({
  page,
  dashboard,
}) => {
  // Comfortable is the reference render (REQ-4): nothing truncates, so the same title
  // wraps to more than one line.
  const comfortable = await openDensity(page, dashboard, "comfortable");
  const longTitle = longTitled(comfortable).title ?? "";
  let name = cardName(sessionCard(page, longTitle));
  const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
  expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

  await openDensity(page, dashboard, "compact");
  const card = sessionCard(page, longTitle);
  name = cardName(card);

  // `.name` is a bare `<span>` inside the block `.r1`, so without a block-level `display`
  // it computes `inline`, on which a declared `overflow`/`text-overflow` never applies —
  // the title would overflow the card instead of ellipsizing. `display: inline` also
  // reports zero for scrollWidth/clientWidth, so the overflow check below only holds once
  // `display` is block-level.
  const metrics = await name.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      textOverflow: cs.textOverflow,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      lineHeight: parseFloat(cs.lineHeight),
    };
  });
  expect(metrics.display).not.toBe("inline");
  expect(metrics.textOverflow).toBe("ellipsis");
  // The title text still logically overflows its own box — exactly what `text-overflow`
  // clips to an ellipsis — even though nothing is visible past the edge.
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

  const nameBox = await name.evaluate((el) => el.getBoundingClientRect());
  const cardBox = await card.evaluate((el) => el.getBoundingClientRect());
  // The title's own box stays inside the card's.
  expect(nameBox.right).toBeLessThanOrEqual(cardBox.right + 1);

  const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
  expect(compactHeight).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
  await expect(name).toHaveAttribute("title", longTitle);
});

test("a long activity line clamps to three lines in comfortable density and runs past three lines in expanded (E1, REQ-1)", async ({
  page,
  dashboard,
}) => {
  // Comfortable is the density on load (default `railDensity`).
  const comfortable = await openDensity(page, dashboard, "comfortable");
  const longReply = titled(comfortable, "density-clamp-e1").lastActivity;
  if (!longReply) throw new Error("density-clamp-e1 has no last reply");
  // Under the adapter's 200-character cut, so the line's full text is known.
  expect(longReply.length).toBeLessThan(200);
  expect(longReply.length).toBeGreaterThan(150);

  let line = cardActivityClaude(sessionCard(page, "density-clamp-e1"));
  await expect(line).toHaveText(`claude: ${longReply}`);
  // REQ-2/edge case 1: the clamp makes the tail of the line unreachable without a hover
  // title carrying the full text.
  await expect(line).toHaveAttribute("title", `claude: ${longReply}`);

  const lineHeight = await line.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const comfortableHeight = await line.evaluate((el) => el.getBoundingClientRect().height);
  // REQ-1: clamped to three lines — never noticeably more than three line-heights.
  expect(comfortableHeight).toBeLessThanOrEqual(lineHeight * 3.5);
  expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

  await openDensity(page, dashboard, "expanded");
  line = cardActivityClaude(sessionCard(page, "density-clamp-e1"));
  await expect(line).toHaveText(`claude: ${longReply}`);
  await expect(line).toHaveAttribute("title", `claude: ${longReply}`);
  const expandedLineHeight = await line.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight),
  );
  const expandedHeight = await line.evaluate((el) => el.getBoundingClientRect().height);
  // REQ-1: expanded is uncapped — this reply needs well more than three lines.
  expect(expandedHeight).toBeGreaterThan(expandedLineHeight * 3.5);
});

test("card height is never greater in comfortable than in expanded, for a short and a long activity line (E2, INV-1)", async ({
  page,
  dashboard,
}) => {
  async function heights(density: keyof typeof DENSITY_FIXTURE) {
    const fixture = await openDensity(page, dashboard, density);
    expect(titled(fixture, "density-ramp-short").lastActivity).toBe("done");
    const cardShort = sessionCard(page, "density-ramp-short");
    const cardLong = sessionCard(page, "density-ramp-long");
    await expect(cardActivityClaude(cardShort)).toHaveText("claude: done");
    await expect(cardActivityClaude(cardLong)).toContainText("claude:");
    return {
      short: await cardShort.evaluate((el) => el.getBoundingClientRect().height),
      long: await cardLong.evaluate((el) => el.getBoundingClientRect().height),
    };
  }

  const compact = await heights("compact");
  const comfortable = await heights("comfortable");
  const expanded = await heights("expanded");

  // INV-1: for each card, height compact ≤ comfortable ≤ expanded. The short case is
  // where a naive clamp swap still passes; the long case is the reported inversion
  // (comfortable measured 248.5px against expanded's 169.8px pre-fix).
  expect(compact.short).toBeLessThanOrEqual(comfortable.short);
  expect(comfortable.short).toBeLessThanOrEqual(expanded.short);
  expect(compact.long).toBeLessThanOrEqual(comfortable.long);
  expect(comfortable.long).toBeLessThanOrEqual(expanded.long);
});

test("a compact card renders a visible context gauge track when context is known (E3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await openDensity(page, dashboard, "compact");
  expect(titled(fixture, "density-e3-known").context.usedPct).toBe(42);
  const card = sessionCard(page, "density-e3-known");
  await expect(cardContextRow(card)).not.toHaveClass(/unk/);

  // REQ-3: the rule hiding `.r3 .ctx` in compact is removed — the track keeps a non-zero
  // rendered width there, same as in every other density.
  const track = cardContextTrack(card);
  await expect(track).toBeVisible();
  const box = await track.evaluate((el) => el.getBoundingClientRect());
  expect(box.width).toBeGreaterThan(0);
});

test("a compact card with unknown context renders the word and no gauge track (E6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await openDensity(page, dashboard, "compact");
  // No status-line post at all — context stays unknown (kb:fact/unknown-before-first-response).
  expect(titled(fixture, "density-e6-unknown").context.usedPct).toBeNull();
  const card = sessionCard(page, "density-e6-unknown");

  // The unknown branch sets `.r3.unk` with plain text and builds no `.ctx` element at all —
  // REQ-3 removing compact's hiding rule can never produce an empty track here (edge case 3).
  await expect(card.locator(".r3.unk")).toContainText("unknown");
  await expect(cardContextTrack(card)).toHaveCount(0);
});

test("a card with no activity text renders no activity line in compact or expanded, and compact drops a populated one too (E4)", async ({
  page,
  dashboard,
}) => {
  const compact = await openDensity(page, dashboard, "compact");
  expect(titled(compact, "density-ramp-short").lastActivity).toBe("done");
  expect(titled(compact, "density-e6-unknown").lastActivity).toBeNull();
  expect(titled(compact, "density-e6-unknown").lastPrompt).toBeNull();
  const populatedCard = sessionCard(page, "density-ramp-short");
  const emptyCard = sessionCard(page, "density-e6-unknown");
  // Compact drops the line entirely (REQ-1's unchanged clause), even though it carries text.
  await expect(cardActivityClaude(populatedCard)).toBeHidden();
  await expect(cardActivityClaude(emptyCard)).toBeHidden();
  await expect(cardActivityYou(emptyCard)).toBeHidden();

  await openDensity(page, dashboard, "expanded");
  // The populated line is back in a density that shows it, so the hidden ones below are
  // hidden for their missing text, not for the density.
  await expect(cardActivityClaude(sessionCard(page, "density-ramp-short"))).toHaveText(
    "claude: done",
  );
  // A line with no text stays absent regardless of density's own `display` override
  // (kb:lesson/display-rule-overrides-hidden-attribute's companion-rule requirement).
  await expect(cardActivityClaude(sessionCard(page, "density-e6-unknown"))).toBeHidden();
  await expect(cardActivityYou(sessionCard(page, "density-e6-unknown"))).toBeHidden();
});

test("the title renders above the state row on a rail card and on a Tiles strip card (E5, INV-4)", async ({
  page,
  dashboard,
}) => {
  await openDensity(page, dashboard, "comfortable");
  const rail = railCard(page, "density-ramp-short");
  await expect(rail).toBeVisible();
  const railTitleTop = await cardTitleRow(rail).evaluate((el) => el.getBoundingClientRect().top);
  const railStateTop = await cardStateRow(rail).evaluate((el) => el.getBoundingClientRect().top);
  expect(railTitleTop).toBeLessThan(railStateTop);

  // The Tiles strip only holds sessions demoted out of the live grid: five sessions at the
  // default 2×2 grid leaves exactly one stripped, and the view comes from the fixture.
  const tiles = await dashboard.open("tiles-five");
  const titles = titlesOf(tiles);
  await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(liveTile(page, titles[0] ?? "")).toBeVisible();
  const [strippedTitle] = await strippedTitles(page, titles);
  if (!strippedTitle) {
    throw new Error("expected exactly one of the five sessions demoted to the strip");
  }
  const strip = stripCard(page, strippedTitle);
  await expect(strip).toBeVisible();
  // INV-4: the rail card and the Tiles strip card share one template — a fix applied to
  // only one host is a fix applied to neither.
  const stripTitleTop = await cardTitleRow(strip).evaluate((el) => el.getBoundingClientRect().top);
  const stripStateTop = await cardStateRow(strip).evaluate((el) => el.getBoundingClientRect().top);
  expect(stripTitleTop).toBeLessThan(stripStateTop);
});

// ═══ web/e2e/rail-unread.spec.ts — plan rail-card-improvements REQ-7 to REQ-11 ═══

test("the attention-mode rail order is needs input, failed, unread idle, started, planning, working, then read idle (E5, REQ-11)", async ({
  page,
  dashboard,
}) => {
  // One session per band, launched in the reverse of the attention order, so the sort is
  // told apart from launch order; the read idle one was marked seen the way an attach does.
  const fixture = await dashboard.open("rail-attention-order");
  expect(fixture.snapshot.prefs.railSort).toBe("attention");
  await expect(railSortSelect(page)).toHaveValue("attention");
  const [ni, f, ui, st, pl, w, ri] = [
    "order5-ni",
    "order5-f",
    "order5-ui",
    "order5-st",
    "order5-pl",
    "order5-w",
    "order5-ri",
  ].map((t) => titled(fixture, t));
  if (!ni || !f || !ui || !st || !pl || !w || !ri) throw new Error("expected 7 sessions");
  expect(expectedManualOrder(fixture.snapshot.sessions)).toEqual([
    ri.id,
    w.id,
    pl.id,
    st.id,
    ui.id,
    f.id,
    ni.id,
  ]);

  await expect(stateBadge(railCard(page, "order5-ni"))).toHaveText(/needs input/i);
  await expect(stateBadge(railCard(page, "order5-f"))).toHaveText(/failed/i);
  const cardUI = railCard(page, "order5-ui");
  await expect(stateBadge(cardUI)).toHaveText(/idle/i);
  await expect(cardUI).toHaveAttribute("data-unread", "true");
  await expect(stateBadge(railCard(page, "order5-st"))).toHaveText(/started/i);
  await expect(stateBadge(railCard(page, "order5-pl"))).toHaveText(/planning/i);
  await expect(stateBadge(railCard(page, "order5-w"))).toHaveText(/working/i);
  // ri closed its turn while watched — idle with unread:false, the "read idle" group at the
  // very end of REQ-11's table.
  const cardRI = railCard(page, "order5-ri");
  await expect(stateBadge(cardRI)).toHaveText(/idle/i);
  await expect(cardRI).not.toHaveAttribute("data-unread", "true");

  await expect
    .poll(() => railOrderIds(page))
    .toEqual([ni.id, f.id, ui.id, st.id, pl.id, w.id, ri.id]);
});

test("Opt+Cmd+0 focuses the unread idle session over a merely working one (E6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-unread-pair");
  expect(titled(fixture, "e6-working").state).toBe("working");
  expect(titled(fixture, "e6-unread")).toMatchObject({ state: "idle", unread: true });
  await expect(stateBadge(railCard(page, "e6-working"))).toHaveText(/working/i);
  const cardUI = railCard(page, "e6-unread");
  await expect(cardUI).toHaveAttribute("data-unread", "true");

  // Explicitly focus the working session first, so Opt+Cmd+0 has to move focus rather
  // than merely leave it where it already was.
  await railCard(page, "e6-working").click();
  await expect(mainheadName(page)).toHaveText("e6-working");

  await page.keyboard.press("Alt+Meta+Digit0");
  await expect(mainheadName(page)).toHaveText("e6-unread");
});

test("a read idle title drops to --fg-muted while a working title and an unread idle title both stay --fg (decision read-idle-title-colour, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-attention-order");
  expect(titled(fixture, "order5-ri")).toMatchObject({ state: "idle", unread: false });
  expect(titled(fixture, "order5-w").state).toBe("working");
  expect(titled(fixture, "order5-ui")).toMatchObject({ state: "idle", unread: true });
  const cardRI = railCard(page, "order5-ri");
  await expect(stateBadge(cardRI)).toHaveText(/idle/i);
  await expect(cardRI).not.toHaveAttribute("data-unread", "true");
  const cardW = railCard(page, "order5-w");
  await expect(stateBadge(cardW)).toHaveText(/working/i);
  const cardUI = railCard(page, "order5-ui");
  await expect(cardUI).toHaveAttribute("data-unread", "true");

  // Read the theme's own tokens rather than hardcoding hex/rgb, so the assertion holds
  // under whichever theme the fixture's prefs start in.
  const fg = await tokenColor(page, "--fg");
  const fgMuted = await tokenColor(page, "--fg-muted");
  expect(fgMuted).not.toBe(fg);

  // REQ-9 (decision read-idle-title-colour, Outcome A): the base `.card .name` rule paints
  // every title `--fg`; only the read-idle rule (`.s-idle:not(.unread)`) drops it to
  // `--fg-muted`. Neither a working title nor an unread-idle title (marked by the dot, not
  // by colour) may be muted.
  await expect.poll(() => computedColor(cardName(cardRI))).toBe(fgMuted);
  expect(await computedColor(cardName(cardW))).toBe(fg);
  expect(await computedColor(cardName(cardUI))).toBe(fg);
});

// ═══ web/e2e/rail-drag-groups.spec.ts — plan rail-card-organise (#77) ═══

test("in attention order a drop inside the card's own section, on a sibling card or on its own header, changes nothing and sends nothing (REQ-13, E12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("rail-groups-pinned-attention");
  expect(fixture.snapshot.prefs.railSort).toBe("attention");
  await expect(railSortSelect(page)).toHaveValue("attention");
  const alpha = groupNamed(fixture, "Alpha");
  const [a1, a2] = ["alpha-one", "alpha-two"].map((t) => titled(fixture, t));
  if (!a1 || !a2) throw new Error("expected Alpha's two members");
  expect(a1).toMatchObject({ pinned: true, groupId: alpha.id });
  expect(a2).toMatchObject({ pinned: false, groupId: alpha.id });
  await expect.poll(() => sectionCardIds(page, alpha.id)).toEqual([a1.id, a2.id]);
  const orderBefore = await railOrderIds(page);
  const net = trackMutationBodies(page);
  // Draggable in attention order (REQ-12): a drag that sends nothing is only evidence when the
  // card can be dragged at all.
  await expect(railCard(page, "alpha-two")).toHaveAttribute("draggable", "true");
  await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "true");

  await railCard(page, "alpha-two").dragTo(railCard(page, "alpha-one"));
  await railCard(page, "alpha-one").dragTo(groupHead(page, alpha.id));
  await railCard(page, "alpha-two").dragTo(groupHead(page, alpha.id));

  await settleFor(page, 800);
  expect(net.requests()).toEqual([]);
  expect(await railOrderIds(page)).toEqual(orderBefore);
  expect(await sectionCardIds(page, alpha.id)).toEqual([a1.id, a2.id]);
  await expect(pinButton(railCard(page, "alpha-one"))).toHaveAttribute("aria-pressed", "true");
  await expect(pinButton(railCard(page, "alpha-two"))).toHaveAttribute("aria-pressed", "false");
});

for (const sort of ["manual", "attention"] as const) {
  test(`in ${sort} order an unselected card in Select mode is not draggable, and a drag released where it started, outside the rail or by an unselected card sends nothing and leaves the selection (REQ-15, REQ-18, E12)`, async ({
    page,
    dashboard,
  }) => {
    // A viewport tall enough for every section and card, so `dragWithin`'s manual
    // mouse-down lands on a card already in view: a card below the fold would scroll on
    // the press and never fire `dragstart` (web/e2e/rail-drag-groups.spec.ts's E11 sets
    // the same for the same reason).
    await page.setViewportSize({ width: 1280, height: 1600 });
    // Alpha [alpha-one, alpha-two], Bravo [bravo-one], Ungrouped [loose-one], under the sort
    // the fixture's prefs hold.
    const fixture = await dashboard.open(
      sort === "manual" ? "groups-titled" : "groups-titled-attention",
    );
    expect(fixture.snapshot.prefs.railSort).toBe(sort);
    await expect(railSortSelect(page)).toHaveValue(sort);
    const bravo = groupNamed(fixture, "Bravo");

    await selectToggle(page).click();
    await cardCheckbox(page, "loose-one").check();
    await expect(selectBarCount(page)).toHaveText("1 selected");
    // Selected: draggable, with the pin control hidden. Unselected: neither.
    await expect(railCard(page, "loose-one")).toHaveAttribute("draggable", "true");
    await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "false");
    await expect(railCard(page, "bravo-one")).toHaveAttribute("draggable", "false");
    await expect(pinButton(railCard(page, "loose-one"))).toBeHidden();

    const orderBefore = await railOrderIds(page);
    const sectionsBefore = await Promise.all(
      fixture.snapshot.groups.map((g) => sectionCardIds(page, g.id)),
    );
    const net = trackMutationBodies(page);

    // An unselected card does not drag.
    await railCard(page, "alpha-one").dragTo(groupHead(page, bravo.id));
    await railCard(page, "alpha-one").dragTo(railCard(page, "bravo-one"));
    // A selected card released where it started, and outside the rail.
    await dragWithin(page, railCard(page, "loose-one"));
    await railCard(page, "loose-one").dragTo(page.locator("#mainhead"));

    await settleFor(page, 800);
    expect(net.requests()).toEqual([]);
    expect(await railOrderIds(page)).toEqual(orderBefore);
    expect(
      await Promise.all(fixture.snapshot.groups.map((g) => sectionCardIds(page, g.id))),
    ).toEqual(sectionsBefore);
    await expect(selectBarCount(page)).toHaveText("1 selected");
    await expect(cardCheckbox(page, "loose-one")).toBeChecked();
    await expect(cardCheckbox(page, "alpha-one")).not.toBeChecked();

    // Leaving the mode makes every card draggable again.
    await barButton(page, "Done").click();
    await expect(railCard(page, "alpha-one")).toHaveAttribute("draggable", "true");
    await expect(pinButton(railCard(page, "loose-one"))).toBeVisible();
  });
}

// ═══ web/e2e/rail-activity.spec.ts — plan rail-card-improvements REQ-12 to REQ-14 ═══

test("Settings offers a Rail card shows fieldset with four radios in Turn-aware/Your prompt/Claude's reply/Both order, defaulting to Turn-aware (REQ-13)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.prefs.railActivity).toBe("turn");
  const dialog = await openSettingsDialog(page);
  await expect(railActivityLegend(dialog)).toHaveText("Rail card shows");

  const radios = railActivityRadios(dialog);
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(0)).toHaveAccessibleName("Turn-aware");
  await expect(radios.nth(1)).toHaveAccessibleName("Your prompt");
  await expect(radios.nth(2)).toHaveAccessibleName("Claude's reply");
  await expect(radios.nth(3)).toHaveAccessibleName("Both");
  await expect(railActivityRadio(dialog, "Turn-aware")).toBeChecked();
});

test("Both mode shows only the sides that have data, and hides both when neither does (edge cases 23, 24)", async ({
  page,
  dashboard,
}) => {
  // `railActivity: both` from the fixture's prefs, over three cards: no turn yet, a turn open
  // with no reply yet, and a closed turn.
  const fixture = await dashboard.open("rail-activity-both");
  expect(fixture.snapshot.prefs.railActivity).toBe("both");
  const dialog = await openSettingsDialog(page);
  await expect(railActivityRadio(dialog, "Both")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // No prompt or reply yet — both lines hidden, no empty "you:"/"claude:" prefix.
  expect(titled(fixture, "both-none")).toMatchObject({ lastPrompt: null, lastActivity: null });
  const none = sessionCard(page, "both-none");
  await expect(cardActivityYou(none)).toBeHidden();
  await expect(cardActivityClaude(none)).toBeHidden();

  // Turn open, no reply yet — one side only.
  expect(titled(fixture, "both-prompt")).toMatchObject({ lastPrompt: "do it", lastActivity: null });
  const prompt = sessionCard(page, "both-prompt");
  await expect(cardActivityYou(prompt)).toHaveText("you: do it");
  await expect(cardActivityClaude(prompt)).toBeHidden();

  expect(titled(fixture, "both-reply")).toMatchObject({
    lastPrompt: "do it",
    lastActivity: "ok, done",
  });
  const reply = sessionCard(page, "both-reply");
  await expect(cardActivityYou(reply)).toHaveText("you: do it");
  await expect(cardActivityClaude(reply)).toHaveText("claude: ok, done");
});

test("Turn-aware mode on a failed session shows the last reply's claude: line, not an on: line (edge case 25)", async ({
  page,
  dashboard,
}) => {
  // REQ-14's "last reply" (`lastActivity`) is written only by a successful `Stop` —
  // `StopFailure` never touches it. The scenario closed a first turn successfully ("here's
  // an attempt") before the second ("try again") failed, so the daemon's recorded reply is
  // the earlier turn's and not the failed one's message.
  const fixture = await dashboard.open("rail-activity-failed");
  expect(fixture.snapshot.prefs.railActivity).toBe("turn");
  expect(titled(fixture, "activity-failed")).toMatchObject({
    state: "failed",
    lastPrompt: "try again",
    lastActivity: "here's an attempt",
  });
  const card = sessionCard(page, "activity-failed");
  await expect(stateBadge(card)).toHaveText(/failed/i);
  await expect(cardActivityYou(card)).toBeHidden();
  // The claude: line reads the *prior* successful turn's reply, never this failed turn's
  // message — the "otherwise" branch reads `lastActivity`, not `Failure.Message`.
  await expect(cardActivityClaude(card)).toHaveText("claude: here's an attempt");
});
