// Locators and setup for plan rail-card-organise's right-click card menu (#56).
//
// The menu is built by the one menu builder (`render/menu.ts`, kb:adr/web-menu-component-single-builder),
// so every locator below is the one the existing group menus already use: role `menu`, role
// `menuitem` named by the entry's label. Sessions are launched through the real `POST /api/sessions`,
// bound with the measured `SessionStart` builder and ended through the real endpoint — nothing here
// is a wire shape a real Claude Code sends that `helpers/payloads.ts` does not already carry.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { openMenu } from "./groups";
import { envelopedSessionStart } from "./payloads";
import { envelopeOpts, launchSession, type SessionObject, sessionCard } from "./session";

/** Any button a card could offer as an action: Stop, the old End, Resume, Remove, with or without `…`. */
export const CARD_ACTION_BUTTON = /^(Stop|End|Resume|Remove)/;

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
 * dashboard cancelled the browser's own menu. The listener sits on `window` in the capture phase,
 * ahead of every handler, and the event objects are read afterwards: `defaultPrevented` is final
 * by then.
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

/**
 * Launches one session, optionally binds a Claude session id to it (so Resume has something to
 * resume), and ends it through the real endpoint. Resolves once the rail card shows it ended.
 * The page must already be on the dashboard (the launch endpoint needs its cookie).
 */
export async function launchEndedSession(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  directory: string,
  title: string,
  opts: { bindClaude?: boolean } = {},
): Promise<SessionObject> {
  const { bindClaude = true } = opts;
  const session = await launchSession(page, daemon, { directory, title });
  if (bindClaude) {
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(`claude-${title}`, await envelopeOpts(session, daemon)),
    });
  }
  const res = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
  expect(res.status()).toBe(200);
  await expect(sessionCard(page, title)).toHaveClass(/ended/);
  return session;
}

/**
 * Binds a Claude session id to a freshly launched session through a measured `SessionStart`, the
 * way every live session in the suite gets its `claudeSessionId`.
 */
export async function bindClaude(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
): Promise<void> {
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
  });
}

/** One non-GET `/api/` request: method, path and the body it carried (parsed when JSON). */
export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Records every non-GET `/api/` request the page makes from now on with its parsed body — the
 * body-bearing sibling of `helpers/groups.ts`'s `trackMutations`, for asserting WHICH endpoint a
 * drop used and what it listed.
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

/** `GET /api/state` sessions with the one field every spec of this plan also reads. */
export interface PinnedGroupedSession extends SessionObject {
  groupId: number | null;
}

export async function stateSession(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<PinnedGroupedSession> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/state failed: ${res.status()} ${await res.text()}`);
  }
  const state = (await res.json()) as { sessions: PinnedGroupedSession[] };
  const found = state.sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in state snapshot`);
  return found;
}
