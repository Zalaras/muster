// Locators and page-side oracles for the rail feature: the rail card and its controls (pin,
// sort select, density control), the card's rows and lines, the right-click card menu, the
// context row and the request log. Pure DOM — no daemon, no fixture knowledge — so both
// tiers use it: the render spec here directly, the E2E journeys through
// `web/e2e/helpers/{railorder,rail-menu,railcards,gauges}.ts`, which re-export it.
//
// The rail and strip cards share one `data-testid="session-card"` template, and both copies
// are in the DOM whenever Tiles is active (`./tiles.ts`'s `stripCard` comment), so every rail
// locator here is scoped to the rail's own container (`#sessions`).
import { railCardByTitle } from "./card-location";
import { openMenu } from "./groups";
import { expect, type Locator, type Page } from "./harness";

/** A rail card by title, scoped to `#sessions` so a session that is both known (rail) and
 * shown elsewhere (strip) never produces a strict-mode ambiguity. */
export { railCardByTitle as railCard };

/**
 * DOM order of the rail's cards, by `data-session-id` — the oracle plan order-sidebar's
 * Testable UI Elements table names ("order asserted via `data-session-id` sequence").
 */
export async function railOrderIds(page: Page): Promise<number[]> {
  const raw = await page
    .locator("#sessions [data-testid='session-card']")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-session-id")));
  return raw.map((v) => {
    if (v === null) throw new Error("rail card missing data-session-id");
    return Number(v);
  });
}

/** Same, scoped to the Tiles strip (REQ-13: same order, minus live tiles). */
export async function stripOrderIds(page: Page): Promise<number[]> {
  const raw = await page
    .locator("#tiles-strip [data-testid='session-card']")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-session-id")));
  return raw.map((v) => {
    if (v === null) throw new Error("strip card missing data-session-id");
    return Number(v);
  });
}

/**
 * The pin/unpin control inside a card's state row (Testable UI Elements: role `button`,
 * name `Pin` unpinned / `Unpin` pinned, `aria-pressed` mirroring `pinned`). The accessible
 * name flips with state, so match either — callers assert the specific name/state separately.
 */
export function pinButton(card: Locator): Locator {
  return card.getByRole("button", { name: /^(Pin|Unpin)$/ });
}

/** The rail-head sort toggle (Testable UI Elements: `combobox` named "Sort", options
 * Manual/Attention — a real `<select>` carries the `combobox` role implicitly). */
export function railSortSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Sort" });
}

/**
 * Exact class-token membership check via `classList.contains`, rather than a regex against
 * the `class` attribute string — `"pinned-last"` contains `"pinned"` as a literal prefix, so
 * a naive `\bpinned\b` regex matches both.
 */
export async function hasClass(locator: Locator, className: string): Promise<boolean> {
  return await locator.evaluate((el, cls) => el.classList.contains(cls), className);
}

/**
 * REQ-6's manual-mode order, replicated from the plan's pure definition (pinned first — by
 * `railPos` ascending — then unpinned by `railPos` ascending, `id` as the final tiebreak)
 * over a session list: the oracle independent of the rendered DOM. Never mutates its input.
 */
export function expectedManualOrder(
  sessions: ReadonlyArray<{ id: number; pinned: boolean; railPos: number }>,
): number[] {
  return [...sessions]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.railPos !== b.railPos) return a.railPos - b.railPos;
      return a.id - b.id;
    })
    .map((s) => s.id);
}

// --- the card's rows and lines (plan rail-card-improvements) ---

export type RailDensity = "compact" | "comfortable" | "expanded";

const DENSITY_LABEL: Record<RailDensity, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  expanded: "Expanded",
};

/**
 * The rail head's density control (REQ-5): `#rail-density`, `role="group"
 * aria-label="Card density"` — distinct from the Tiles toolbar's own `role="group"
 * aria-label="Density"` (2×2/3×2 grid density).
 */
export function railDensityGroup(page: Page): Locator {
  return page.getByRole("group", { name: "Card density" });
}

/** One density button, by its `aria-label` (REQ-5: Compact / Comfortable / Expanded). */
export function railDensityButton(page: Page, density: RailDensity): Locator {
  return railDensityGroup(page).getByRole("button", { name: DENSITY_LABEL[density] });
}

/** `body[data-rail-density]` — written only from the `prefs` broadcast (REQ-3, INV-4),
 * never from the click. */
export async function bodyRailDensity(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.body.getAttribute("data-rail-density"));
}

/** The masthead's one New session button (REQ-6): `#new-session-button`, scoped to
 * `header.masthead`; it stays mounted — and visible — across both views (INV-3). */
export function newSessionButton(page: Page): Locator {
  return page.locator("header.masthead").getByRole("button", { name: "New session" });
}

/** REQ-1's state row: `.r0`, holding the badge, timer and pin control. */
export function cardStateRow(card: Locator): Locator {
  return card.locator(".r0");
}

/** Plan rail-card-improvements-2 REQ-4: the card's title row, `.r1` — leads `.card-in`,
 * ahead of `cardStateRow`'s `.r0` (E5, INV-4). */
export function cardTitleRow(card: Locator): Locator {
  return card.locator(".r1");
}

/** REQ-1/REQ-2: the card's title, `.name` — carries a `title` attribute equal to the
 * display title on every render. */
export function cardName(card: Locator): Locator {
  return card.locator(".name");
}

/** REQ-1/REQ-2: the repo and branch line, `.r2` — carries a `title` attribute equal to
 * `<repo> / <branch>` on every render. */
export function cardRepoLine(card: Locator): Locator {
  return card.locator(".r2");
}

/** REQ-14: the user's-prompt activity line, `.activity.you` (text `/^(on|you): /`,
 * `hidden` when null). */
export function cardActivityYou(card: Locator): Locator {
  return card.locator(".activity.you");
}

/** REQ-14: Claude's-reply activity line, `.activity.claude` (text `/^claude: /`,
 * `hidden` when null). */
export function cardActivityClaude(card: Locator): Locator {
  return card.locator(".activity.claude");
}

/** The card's background-task line (plan status-inconsistencies REQ-6): `1 background task`
 * or `<n> background tasks`, the card's last line while work runs. */
export function cardBackgroundTasks(card: Locator): Locator {
  return card.getByText(/^\d+ background tasks?$/);
}

/** REQ-13: the Settings dialog's fieldset legend — `fieldset.seg`, `<legend>Rail card
 * shows</legend>`, no implicit ARIA role. */
export function railActivityLegend(dialog: Locator): Locator {
  return dialog.locator("legend", { hasText: "Rail card shows" });
}

export type RailActivityLabel = "Turn-aware" | "Your prompt" | "Claude's reply" | "Both";

/** One of REQ-13's four `railActivity` radios, scoped to the Settings dialog —
 * `input[name="railActivity"]`, accessible name from its wrapping `<label>`. */
export function railActivityRadio(dialog: Locator, label: RailActivityLabel): Locator {
  return dialog.getByRole("radio", { name: label });
}

/** All four `railActivity` radios in DOM order (REQ-13: Turn-aware, Your prompt,
 * Claude's reply, Both). */
export function railActivityRadios(dialog: Locator): Locator {
  return dialog.locator('input[type="radio"][name="railActivity"]');
}

// --- the context gauge on a card is the usage feature's locator (kb:spec/usage) ---
export { cardContextRow, cardContextTrack } from "./usage";

// --- the right-click card menu (plan rail-card-organise, #56) ---

/** Any button a card could offer as an action: Stop, the old End, Resume, Remove, with or without `…`. */
export const CARD_ACTION_BUTTON = /^(Stop|End|Resume|Remove)/;

/** The open menu — built by the one menu builder (kb:adr/web-menu-component-single-builder),
 * so this is the locator every group menu already uses. */
export function cardMenu(page: Page): Locator {
  return openMenu(page);
}

/** One entry of the open menu, by its exact accessible name. */
export function cardMenuItem(page: Page, name: string): Locator {
  return cardMenu(page).getByRole("menuitem", { name, exact: true });
}

/** The labels of the open menu's items in order, without the current-group tick glyph. */
export async function menuItemLabels(page: Page): Promise<string[]> {
  return await cardMenu(page)
    .getByRole("menuitem")
    .evaluateAll((els) =>
      els.map((el) => (el.querySelector(".mlabel")?.textContent ?? el.textContent ?? "").trim()),
    );
}

/** Right-clicks `card` (at `position` when given) and waits for the menu. */
export async function openCardMenu(
  page: Page,
  card: Locator,
  position?: { x: number; y: number },
): Promise<Locator> {
  await card.click({ button: "right", ...(position === undefined ? {} : { position }) });
  await expect(cardMenu(page)).toBeVisible();
  return cardMenu(page);
}

/**
 * Records every `contextmenu` event the page sees from now on, so a test can read whether the
 * dashboard cancelled the browser's own menu. The listener sits on `window` in the capture
 * phase, ahead of every handler, and the event objects are read afterwards: `defaultPrevented`
 * is final by then.
 */
export async function trackContextMenuEvents(page: Page): Promise<() => Promise<boolean[]>> {
  await page.evaluate(() => {
    const seen: Event[] = [];
    Reflect.set(window, "__e2eContextMenus", seen);
    window.addEventListener("contextmenu", (event) => seen.push(event), true);
  });
  return async () =>
    await page.evaluate(() => {
      const seen = Reflect.get(window, "__e2eContextMenus") as Event[];
      return seen.map((event) => event.defaultPrevented);
    });
}

// --- the request log with bodies ---

/** One non-GET `/api/` request: method, path and the body it carried (parsed when JSON). */
export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Records every non-GET `/api/` request the page makes from now on with its parsed body — the
 * body-bearing sibling of `./groups.ts`'s `trackMutations`, for asserting WHICH endpoint a drop
 * used and what it listed, or that none was used at all.
 */
export function trackMutationBodies(page: Page): { requests: () => SentRequest[] } {
  const seen: SentRequest[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (req.method() === "GET" || !url.pathname.startsWith("/api/")) return;
    let body: unknown = null;
    const raw = req.postData();
    if (raw !== null) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    seen.push({ method: req.method(), path: url.pathname, body });
  });
  return { requests: () => [...seen] };
}

/**
 * A real drag that ends on the card it started on: press, move past the drag threshold inside
 * the card, release. `dragTo(card, card)` never moves, so it is the click that toggles the
 * selection (REQ-15). Returns once the browser has fired `dragstart`, so the drag is shown to
 * have happened.
 */
export async function dragWithin(page: Page, card: Locator): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, "__e2eDragStarts", 0);
    document.addEventListener(
      "dragstart",
      () =>
        Reflect.set(window, "__e2eDragStarts", Number(Reflect.get(window, "__e2eDragStarts")) + 1),
      { capture: true, once: true },
    );
  });
  const box = await card.boundingBox();
  if (!box) throw new Error("expected the card on screen");
  const x = box.x + 40;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 14, y, { steps: 4 });
  await page.mouse.move(x + 28, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__e2eDragStarts"))).toBe(1);
}
