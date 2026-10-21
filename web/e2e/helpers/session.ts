// Real-launch helper.
//
// `POST /api/sessions` is real in every test that needs a session — it's the one daemon
// action E2E never fakes, because the session row + `sessionUpsert` must exist before any
// hook can arrive, and the `-claude-bin` stub is exactly what lets it launch a real tmux
// window without ever starting a real `claude` process. Everything downstream of the
// launch (SessionStart, turn activity, notifications, Stop/StopFailure, …) is synthesized
// via web/e2e/helpers/payloads.ts and POSTed to the daemon's ingest endpoints the same
// way the real hook wrapper/status-line scripts would.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { type ScratchDaemon, scratchOwner } from "./daemon";
import { liveTile, liveTileById } from "./terminal";

// The rail card, its state word, the Focus-pane marker and the mainhead's heading and rename
// trigger are pure DOM and live in the render tier's helper (web/render/helpers/focus.ts,
// where the display properties re-levelled on 2026-10-20 read them), as is the mainhead's
// rename field (web/render/helpers/rename.ts); the journeys here reach them through these
// re-exports.
export {
  currentRailCard,
  mainheadHeading,
  mainheadRenameButton,
  sessionCard,
  stateBadge,
} from "../../render/helpers/focus";
export { mainheadRenameField } from "../../render/helpers/rename";

/**
 * Creates a fresh, never-before-launched-into scratch directory for one test, for tests
 * that launch straight via `POST /api/sessions` (no folder-browser navigation).
 */
export async function scratchDirectory(
  prefix = `muster-e2e-repo-${scratchOwner}-`,
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
 * `GET /api/browse`'s no-`path` default (kb:anchor/browse.get, `-browse-root`) lands, and so
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

/** Any daemon timestamp compared for strict ordering across two events posted back to
 * back can tie: every wire timestamp this dashboard reads (`stateSince`, `last_launched_at`,
 * `attention.since`, …) is formatted with `time.RFC3339` (whole-second resolution — see
 * `internal/server/sessionwire.go`, `internal/store/repo.go`), so two transitions inside
 * the same wall-clock second are indistinguishable on the wire even though the daemon
 * ordered them correctly in memory. Originally local to launch.spec.ts (recents
 * ordering); hoisted here once subagent-status.spec.ts needed the same wait for
 * `stateSince` ordering across quick successive hook POSTs. Waits only as long as the
 * current second has left to run (worst case ~1.05s), never a fixed sleep. */
export async function waitForNextClockSecond(): Promise<void> {
  const msIntoSecond = Date.now() % 1000;
  await new Promise((resolve) => setTimeout(resolve, 1000 - msIntoSecond + 50));
}

export interface LaunchBody {
  directory: string;
  title?: string;
  model?: string;
  /** Plan fix-auto-mode-select: `auto` is a fourth accepted request value
   * (kb:anchor/sessions.create) alongside the three already here. Plan
   * resume-and-dangerously-allow: `bypassPermissions` is a fifth. */
  permissionMode?: "default" | "plan" | "acceptEdits" | "auto" | "bypassPermissions";
  /** Plan effort: `POST /api/sessions`'s optional `effort` (kb:anchor/sessions.create) — a level,
   * or `null` for "default" (no `--effort`). Left out of the body when `undefined`. */
  effort?: string | null;
}

/** The Session object shape per kb:anchor/ws.session, as returned by the launch/state endpoints. */
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
  /** Plan order-sidebar kb:anchor/ws.session: user-owned rail order, never null on the wire. */
  pinned: boolean;
  /** Plan order-sidebar kb:anchor/ws.session: unique across all sessions; gaps allowed. */
  railPos: number;
  /**
   * Plan ui-text-and-focus kb:anchor/ws.session (REQ-11): the user's rename via `PUT …/title`, or `null`
   * when none is set. `title` above is already the *display* title (override when
   * non-null, else Claude's last-known name) — the daemon's precedence, never
   * recomputed here.
   */
  titleOverride: string | null;
  /**
   * Plan rail-card-improvements kb:anchor/ws.session (REQ-7): true iff the session's turn
   * closed while no terminal client was attached to it and nobody has attached since.
   * INV: `unread ⇒ state === "idle"`. Never null on the wire.
   */
  unread: boolean;
  /**
   * Plan rail-card-improvements kb:anchor/ws.session (REQ-12): the user's most recent
   * prompt, truncated to 200 characters; `null` until a first prompt and again after
   * `/clear`.
   */
  lastPrompt: string | null;
  /**
   * Plan status-inconsistencies kb:anchor/ws.session (REQ-5): how many `status:"running"`
   * entries the latest `Stop` listed in `background_tasks`. Never null on the wire.
   */
  backgroundTasks: number;
  /**
   * Plan effort kb:anchor/ws.session (REQ-5): `null` until a status post (or a Resume-tab
   * seed) reports; `{ level }` after, `{ level: null }` when the post carried no effort key.
   */
  effort: { level: string | null } | null;
  /**
   * Plan effort kb:anchor/ws.session (REQ-7): the launch-mismatch warning, or `null`.
   * INV-E1: non-null implies `requested !== actual`.
   */
  effortWarning: { requested: string; actual: string | null; model: string | null } | null;
  /**
   * Plan session-notes kb:anchor/ws.session (REQ-1): the developer's note via `PUT …/note`, or
   * `null` when none is set. Never an empty or whitespace-only string.
   */
  note: string | null;
}

/**
 * Plan general-cleanup REQ-12: `{ musterSession, tmuxPane }` for a launched session's
 * real pane, the envelope opts every `envelopedSessionStart` / `sessionStartResume` /
 * `envelopedStatusLine*` call site states explicitly now that `tmuxPane` has no fixture
 * default (kb:adr/ingest-envelope-pane-must-corroborate — a stale/absent pane persists
 * the event unrouted). Spread the result and override/add fields as needed, e.g.
 * `{ ...(await envelopeOpts(session, daemon())), source: "clear" }`.
 */
export async function envelopeOpts(
  session: SessionObject,
  daemon: ScratchDaemon,
): Promise<{ musterSession: number; tmuxPane: string }> {
  return { musterSession: session.id, tmuxPane: await daemon.tmuxPaneId(session.tmuxTarget) };
}

/**
 * Launches a session via the real `POST /api/sessions`, using the page's already-authed
 * cookie (the endpoint requires the UI cookie per kb:anchor/transport / kb:anchor/sessions.create). Defaults to the
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
      ...(body.effort !== undefined ? { effort: body.effort } : {}),
    },
  });
  if (res.status() !== 201) {
    throw new Error(`launch failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as SessionObject;
}

/** `GET /api/state`, using the page's already-authed cookie. */
export async function getState(
  page: Page,
  daemon: ScratchDaemon,
): Promise<{ sessions: SessionObject[] }> {
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

// --- ui-text-and-focus (plan) helpers: the Focus-pane marker, and the shared rename
// editor on both surfaces (mainhead, tile header). ---

/**
 * The same marker locator, scoped to the Tiles strip instead (`#tiles-strip`) — INV-3
 * says this must resolve to zero matches always, since a strip card is never current
 * (the strip's `renderStrip` passes `null` for `currentId`, REQ-1).
 */
export function currentStripCard(page: Page): Locator {
  return page.locator('#tiles-strip [data-testid="session-card"][aria-current="true"]');
}

/**
 * A tile's rename trigger button, scoped to that tile (`article.tile` via `liveTile`)
 * since two tiles may share a title/accessible name (Testable UI Elements note, edge
 * case 19) — an unscoped `getByRole("button", { name: title })` would be ambiguous the
 * moment two sessions are both "untitled".
 */
export function tileRenameButton(page: Page, title: string): Locator {
  return liveTile(page, title).locator(".thead .nm").getByRole("button");
}

/** A tile's rename field, scoped the same way as `tileRenameButton`. */
export function tileRenameField(page: Page, title: string): Locator {
  return liveTile(page, title).getByRole("textbox", { name: "Session title" });
}

/**
 * A tile's rename field, scoped by `data-session-id` (`liveTileById`) instead of by
 * title text. Validate-mode repair (plan ui-text-and-focus): use this variant whenever
 * the field must still be found while that same tile's own rename editor is open —
 * `tileRenameField`'s title-text scoping stops matching the moment the button's text is
 * swapped for `input.name-edit` (the title lives in the input's `value`, not its
 * `textContent`).
 */
export function tileRenameFieldById(page: Page, id: number): Locator {
  return liveTileById(page, id).getByRole("textbox", { name: "Session title" });
}

/**
 * Sets a session's title override directly via the real `PUT /api/sessions/{id}/title`
 * (kb:anchor/sessions.title) — used to build a starting configuration (e.g. "an override already
 * set before a daemon restart") without re-deriving it through the UI editor in every
 * test that needs one, mirroring `helpers/railorder.ts`'s `pinViaApi`. Throws on
 * anything but the documented 204.
 */
export async function putTitleViaApi(
  page: Page,
  daemonBaseURL: string,
  id: number,
  title: string | null,
): Promise<void> {
  const res = await page.request.put(`${daemonBaseURL}/api/sessions/${id}/title`, {
    data: { title },
  });
  if (res.status() !== 204) {
    throw new Error(`title PUT failed: ${res.status()} ${await res.text()}`);
  }
}
