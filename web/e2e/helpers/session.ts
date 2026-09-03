// Real-launch helper for the m1-sessions E2E suite (plan m1-sessions).
//
// `POST /api/sessions` is real in every M1 test — it's the one daemon action E2E never
// fakes, because REQ-2 says the session row + `sessionUpsert` must exist before any hook
// can arrive, and REQ-19's `-claude-bin` stub is exactly what lets it launch a real tmux
// window without ever starting a real `claude` process. Everything downstream of the
// launch (SessionStart, turn activity, notifications, Stop/StopFailure, …) is synthesized
// via web/e2e/helpers/payloads.ts and POSTed to the daemon's ingest endpoints the same
// way the real hook wrapper/status-line scripts would.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";

/**
 * Creates a fresh, never-before-launched-into scratch directory for one test, for tests
 * that launch straight via `POST /api/sessions` (no folder-browser navigation).
 */
export async function scratchDirectory(
  prefix = "muster-e2e-repo-",
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

/**
 * Creates a fresh scratch directory under the daemon's per-run browse root — where
 * `GET /api/browse`'s no-`path` default (protocol §3.6, `-browse-root`) lands, and so
 * the only place the launch modal's folder browser can reach in one click. The plan's
 * E2 criterion ("launch via Browse… into a fresh directory") requires driving that
 * actual control. The root lives inside the daemon's scratch data dir, so nothing ever
 * touches the real home directory; `cleanup()` keeps tests isolated within a run.
 */
export async function browseScratchDirectory(
  daemon: ScratchDaemon,
  prefix = "muster-e2e-browse-",
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(daemon.browseRoot, prefix));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

export interface LaunchBody {
  directory: string;
  title?: string;
  model?: string;
  /** Plan fix-auto-mode-select: `auto` is a fourth accepted request value (protocol
   * §3.1) alongside the three already here. */
  permissionMode?: "default" | "plan" | "acceptEdits" | "auto";
}

/** The Session object shape per protocol §5.3, as returned by the launch/state endpoints. */
export interface SessionObject {
  id: number;
  title: string | null;
  state: string;
  stateSince: string;
  alive: boolean;
  endedAt: string | null;
  attention: { reason: string; since: string } | null;
  failure: { error: string; message: string } | null;
  directory: string;
  repo: { name: string; branch: string | null; isWorktree: boolean } | null;
  model: { id: string; displayName: string } | null;
  permissionMode: { value: string; source: string };
  context: {
    usedPct: number | null;
    totalInputTokens: number | null;
    windowSize: number | null;
    compactions: number;
  };
  lastActivity: string | null;
  claudeSessionId: string | null;
  tmuxTarget: string;
  firstLaunchHere: boolean;
  createdAt: string;
  /** Plan order-sidebar §5.3: user-owned rail order, never null on the wire. */
  pinned: boolean;
  /** Plan order-sidebar §5.3: unique across all sessions; gaps allowed. */
  railPos: number;
}

/**
 * Launches a session via the real `POST /api/sessions`, using the page's already-authed
 * cookie (the endpoint requires the UI cookie per protocol §2/§3.1). Defaults to the
 * haiku model and "default" permission mode when the caller doesn't care.
 */
export async function launchSession(
  page: Page,
  daemon: ScratchDaemon,
  body: LaunchBody,
): Promise<SessionObject> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions`, {
    data: {
      directory: body.directory,
      title: body.title,
      model: body.model ?? "haiku",
      permissionMode: body.permissionMode ?? "default",
    },
  });
  if (res.status() !== 201) {
    throw new Error(`launch failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as SessionObject;
}

/** `GET /api/state`, using the page's already-authed cookie. */
export async function getState(page: Page, daemon: ScratchDaemon): Promise<{ sessions: SessionObject[] }> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/state failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { sessions: SessionObject[] };
}

/** Finds one session in a `GET /api/state` snapshot by its Muster id. */
export function findSession(state: { sessions: SessionObject[] }, id: number): SessionObject {
  const found = state.sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in state snapshot`);
  return found;
}

/**
 * Session card locator. The plan's Testable UI Elements table explicitly leaves this to
 * us ("locator strategy is e2e-specs' call") — scoped via a `data-testid="session-card"`
 * hook containing the card's title (or "untitled") text. If web-impl's rail markup
 * doesn't carry that testid, validate mode repairs this to whatever container the real
 * markup uses (e.g. a role or class web-impl actually ships) rather than the product
 * gaining a testid it wouldn't otherwise need.
 */
export function sessionCard(page: Page, titleOrUntitled: string): Locator {
  return page.getByTestId("session-card").filter({ hasText: titleOrUntitled });
}

/** The state-badge word inside a session card (Testable UI Elements: lowercase in DOM). */
export function stateBadge(card: Locator): Locator {
  return card.getByText(/^\s*(started|planning|working|needs input|failed|idle)\s*$/i);
}
