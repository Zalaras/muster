// Helpers for state-transitions.spec.ts (plan state-issues): launch one titled session, bind
// it, and feed it synthesized hooks while keeping count of how many the daemon must have
// persisted — the only honest "the daemon has processed this" signal for a hook that, by
// design, changes nothing visible.
import { queryEvents } from "./db";
import {
  type APIRequestContext,
  expect,
  type Page,
  type ScratchDaemon,
  settleFor,
} from "./fixtures";
import { envelopedSessionStart, rawStop, rawUserPromptSubmit } from "./payloads";
import {
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  type LaunchBody,
  scratchDirectory,
  type SessionObject,
  sessionCard,
} from "./session";

/**
 * Posts hooks for one Claude session id and remembers how many it sent. `persisted()` waits
 * until the daemon's event table holds exactly that many rows (the single ingest worker
 * inserts a row, then applies it, in order) and then holds a short fixed window, so a
 * stays-unchanged assertion made afterwards cannot pass merely because the event had not
 * been applied yet.
 */
export class HookFeed {
  private sent = 0;

  constructor(
    private readonly request: APIRequestContext,
    private readonly daemon: ScratchDaemon,
    readonly claudeId: string,
  ) {}

  async post(payload: Record<string, unknown>): Promise<void> {
    const res = await this.request.post(this.daemon.ingestURL("hook"), { data: payload });
    expect(res.status(), "the ingest endpoint acknowledges every hook with 200").toBe(200);
    this.sent += 1;
  }

  /** Waits for every posted hook to be persisted, then holds 500 ms (a stays-unchanged window). */
  async persisted(page: Page): Promise<void> {
    await expect
      .poll(async () => (await queryEvents(this.daemon.dbPath, this.claudeId)).length, {
        message: `waiting for all ${this.sent} posted hooks to be persisted`,
      })
      .toBe(this.sent);
    await settleFor(page, 500);
  }
}

export interface BoundSession {
  session: SessionObject;
  card: ReturnType<typeof sessionCard>;
  claudeId: string;
  feed: HookFeed;
  cleanup: () => Promise<void>;
}

/**
 * Launches a titled session through the real `POST /api/sessions`, then binds it with an
 * enveloped `SessionStart` (the one hook that is never plain HTTP) so the card sits in
 * `started`. `claudeId` is derived from the title, so two tests never share one.
 */
export async function openBoundSession(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  title: string,
  opts: { permissionMode?: LaunchBody["permissionMode"] } = {},
): Promise<BoundSession> {
  const dir = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir.path,
      title,
      ...(opts.permissionMode !== undefined ? { permissionMode: opts.permissionMode } : {}),
    });
    const claudeId = `claude-${title}`;
    const feed = new HookFeed(request, daemon, claudeId);
    await feed.post(envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)));
    return { session, card: sessionCard(page, title), claudeId, feed, cleanup: dir.cleanup };
  } catch (err) {
    await dir.cleanup();
    throw err;
  }
}

/** A finished ordinary turn: `UserPromptSubmit` then `Stop` for `promptId`, the card ending `idle`. */
export async function finishTurn(
  feed: HookFeed,
  promptId: string,
  opts: {
    lastAssistantMessage?: string;
    permissionMode?: "default" | "plan";
    backgroundTasks?: unknown[];
  } = {},
): Promise<void> {
  const { lastAssistantMessage, permissionMode, backgroundTasks } = opts;
  await feed.post(
    rawUserPromptSubmit(feed.claudeId, {
      promptId,
      ...(permissionMode !== undefined ? { permissionMode } : {}),
    }),
  );
  await feed.post(
    rawStop(feed.claudeId, {
      promptId,
      ...(lastAssistantMessage !== undefined ? { lastAssistantMessage } : {}),
      ...(permissionMode !== undefined ? { permissionMode } : {}),
      ...(backgroundTasks !== undefined ? { backgroundTasks } : {}),
    }),
  );
}

/** The daemon's own current view of one session (`GET /api/state`), the oracle for fields the card does not show. */
export async function snapshot(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<SessionObject> {
  return findSession(await getState(page, daemon), id);
}
