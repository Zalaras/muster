// Setup for plan rail-card-organise's right-click card menu (#56): sessions launched
// through the real `POST /api/sessions`, bound with the measured `SessionStart` builder and
// ended through the real endpoint, and `GET /api/state` as the oracle — nothing here is a
// wire shape a real Claude Code sends that `helpers/payloads.ts` does not already carry.
//
// The DOM side — the menu and item locators, the right-click opener, the contextmenu
// recorder and the body-bearing request log — is pure page and lives in the render tier's
// helper (web/render/helpers/rail.ts, where the display properties re-levelled on
// 2026-10-20 read them); the journeys here reach it through the re-export below.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { envelopedSessionStart } from "./payloads";
import { envelopeOpts, launchSession, type SessionObject, sessionCard } from "./session";

export {
  CARD_ACTION_BUTTON,
  cardMenu,
  cardMenuItem,
  menuItemLabels,
  openCardMenu,
  type SentRequest,
  trackContextMenuEvents,
  trackMutationBodies,
} from "../../render/helpers/rail";

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
