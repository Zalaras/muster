// Daemon-side setup and oracles for plan groups (named, collapsible rail sections, select
// mode, the launch dialog's Group row, the Focus header's group control): the real group
// endpoints, `GET /api/state` as the oracle every displayed value is checked against, the
// in-flight and dropped-frame holds. Nothing here is a wire shape a real Claude Code sends:
// sessions are launched through the real `POST /api/sessions` and driven with
// `helpers/payloads.ts`'s measured builders; groups are the developer's own state, made
// through the real group endpoints (setup) or the UI (the behaviour under test).
//
// The DOM side — every locator, the request log, the tick-survival check and the header
// sizing — is pure page and lives in the render tier's helper; the journeys here reach it
// through the re-export below so a locator is written once for both tiers.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { basename } from "node:path";
import {
  expectFocusAndNodeSurviveTick as surviveTickWith,
  UNGROUPED,
} from "../../render/helpers/groups";
import type { ScratchDaemon } from "./daemon";
import { settleFor } from "./fixtures";
import { childEntry, crumbButton } from "./picker";
import {
  envelopedSessionStart,
  rawNotification,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
} from "./payloads";
import {
  browseScratchDirectory,
  envelopeOpts,
  launchSession,
  scratchDirectory,
  type SessionObject,
} from "./session";

export {
  type BarButton,
  barButton,
  bulkRemoveDialog,
  bulkStopDialog,
  cardCheckbox,
  deleteGroupDialog,
  type FilterName,
  filterButton,
  filterGroup,
  groupActionsButton,
  groupBody,
  groupCaret,
  groupHead,
  groupHeads,
  groupName,
  groupNameField,
  groupNameInput,
  groupSelect,
  headerCheckbox,
  mainheadGroupButton,
  menuItem,
  newGroupModal,
  openGroupMenu,
  openMenu,
  openRailMenu,
  optionLabels,
  popover,
  railActionsButton,
  railCount,
  sectionCardIds,
  sectionCards,
  sectionIds,
  selectBar,
  selectBarCount,
  selectedOptionLabel,
  selectToggle,
  sessionsPhrase,
  setMainheadContentWidth,
  setMainheadWidth,
  summaryCount,
  summaryState,
  summaryStates,
  trackMutations,
  UNGROUPED,
  visibleRailCardIds,
} from "../../render/helpers/groups";

/** The Group object (plan groups, Protocol Contract). */
export interface GroupObject {
  id: number;
  name: string;
  pos: number;
  collapsed: boolean;
}

export interface UngroupedLayout {
  pos: number;
  collapsed: boolean;
}

/** `SessionObject` plus the one field this plan adds to kb:anchor/ws.session. */
export type GroupedSession = SessionObject & { groupId: number | null };

export interface GroupsState {
  sessions: GroupedSession[];
  groups: GroupObject[];
  ungrouped: UngroupedLayout;
}

/** `GET /api/state` — the daemon's own truth, the oracle every displayed value is checked against. */
export async function getGroupsState(page: Page, daemon: ScratchDaemon): Promise<GroupsState> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/state failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as GroupsState;
}

// --- setup through the real endpoints ---

async function expectStatus(
  res: { status(): number; text(): Promise<string> },
  want: number,
  what: string,
): Promise<void> {
  if (res.status() !== want) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  }
}

/** `POST /api/groups` (201). `sessionIds` become the group's first members, in that order. */
export async function createGroupViaApi(
  page: Page,
  daemon: ScratchDaemon,
  name: string,
  sessionIds?: number[],
): Promise<GroupObject> {
  const res = await page.request.post(`${daemon.baseURL}/api/groups`, {
    data: sessionIds === undefined ? { name } : { name, sessionIds },
  });
  await expectStatus(res, 201, `POST /api/groups ${name}`);
  return (await res.json()) as GroupObject;
}

/** `PUT /api/groups/{id}` (204); id 0 is the Ungrouped section. */
export async function updateGroupViaApi(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
  body: { name?: string; collapsed?: boolean },
): Promise<void> {
  const res = await page.request.put(`${daemon.baseURL}/api/groups/${id}`, { data: body });
  await expectStatus(res, 204, `PUT /api/groups/${id}`);
}

/** `PUT /api/groups/order` (204): every group id plus 0 for Ungrouped, exactly once. */
export async function putGroupsOrderViaApi(
  page: Page,
  daemon: ScratchDaemon,
  order: number[],
): Promise<void> {
  const res = await page.request.put(`${daemon.baseURL}/api/groups/order`, { data: { order } });
  await expectStatus(res, 204, "PUT /api/groups/order");
}

/** `DELETE /api/groups/{id}` (200) with the members' disposition. */
export async function deleteGroupViaApi(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
  body?: { sessions: "ungroup" | "move" | "remove"; to?: number },
): Promise<void> {
  const res = await page.request.delete(`${daemon.baseURL}/api/groups/${id}`, {
    ...(body === undefined ? {} : { data: body }),
  });
  await expectStatus(res, 200, `DELETE /api/groups/${id}`);
}

/** `PUT /api/sessions/group` (204): the end of the target section, `null` = Ungrouped. */
export async function moveToGroupViaApi(
  page: Page,
  daemon: ScratchDaemon,
  ids: number[],
  groupId: number | null,
): Promise<void> {
  const res = await page.request.put(`${daemon.baseURL}/api/sessions/group`, {
    data: { ids, groupId },
  });
  await expectStatus(res, 204, "PUT /api/sessions/group");
}

/** `DELETE /api/sessions/{id}` (kb:anchor/sessions.remove), the single Remove. */
export async function removeSessionViaApi(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<void> {
  const res = await page.request.delete(`${daemon.baseURL}/api/sessions/${id}`);
  await expectStatus(res, 204, `DELETE /api/sessions/${id}`);
}

/** `POST /api/sessions/{id}/end` (kb:anchor/sessions.end), the single Stop. */
export async function endSessionViaApi(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<void> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions/${id}/end`);
  await expectStatus(res, 200, `POST /api/sessions/${id}/end`);
}

/**
 * Launches one session per title, in order, each in its own scratch directory — the common
 * "N sessions with known titles" setup. Callers `page.goto(daemon.dashboardUrl)` first (the
 * launch endpoint needs the page's auth cookie). Titles must not be substrings of one another:
 * `railCard` matches by substring.
 */
export async function launchTitled(
  page: Page,
  daemon: ScratchDaemon,
  titles: string[],
): Promise<{ sessions: SessionObject[]; cleanup: () => Promise<void> }> {
  const dirs = await Promise.all(titles.map(() => scratchDirectory()));
  const sessions: SessionObject[] = [];
  for (const [i, dir] of dirs.entries()) {
    sessions.push(
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }),
    );
  }
  return {
    sessions,
    cleanup: async () => {
      await Promise.all(dirs.map((d) => d.cleanup()));
    },
  };
}

export type DrivenState = "started" | "working" | "needs_input" | "failed" | "idle";

/**
 * Walks a launched session to `state` through the real ingest endpoints, exactly per
 * kb:anchor/state.transitions: SessionStart, then a turn, then the closing event. `started` posts
 * nothing (a launched session is `started` until its first hook).
 */
export async function driveToState(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
  state: DrivenState,
): Promise<void> {
  if (state === "started") return;
  const post = async (data: Record<string, unknown>) => {
    await request.post(daemon.ingestURL("hook"), { data });
  };
  await post(envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)));
  await post(rawUserPromptSubmit(claudeId));
  if (state === "needs_input") await post(rawNotification(claudeId, "p1", "permission_prompt"));
  if (state === "failed") await post(rawStopFailure(claudeId));
  if (state === "idle") await post(rawStop(claudeId));
}

// --- oracles ---

/** Section keys in the order the daemon says they sit: every group by `pos`, Ungrouped among them. */
export function sectionOrderOracle(state: GroupsState): string[] {
  if (state.groups.length === 0) return [];
  const entries = [
    ...state.groups.map((g) => ({ key: String(g.id), pos: g.pos })),
    { key: UNGROUPED, pos: state.ungrouped.pos },
  ];
  return entries.sort((a, b) => a.pos - b.pos).map((e) => e.key);
}

/** One section's members in the daemon's own order: pinned block first, then `railPos`. */
export function memberIdsOracle(state: GroupsState, groupId: number | null): number[] {
  return state.sessions
    .filter((s) => s.groupId === groupId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.railPos - b.railPos;
    })
    .map((s) => s.id);
}

/**
 * Invariant I1 (plan groups): within each section every pinned session's `railPos` is below every
 * unpinned one's, and `railPos` is unique across all sessions. One line per violation, so
 * `expect(problems).toEqual([])` prints what broke.
 */
export function railInvariantProblems(state: GroupsState): string[] {
  const problems: string[] = [];
  const seen = new Map<number, number>();
  for (const s of state.sessions) {
    const other = seen.get(s.railPos);
    if (other !== undefined) problems.push(`railPos ${s.railPos} is held by ${other} and ${s.id}`);
    seen.set(s.railPos, s.id);
  }
  const buckets = new Map<number | null, GroupedSession[]>();
  for (const s of state.sessions) buckets.set(s.groupId, [...(buckets.get(s.groupId) ?? []), s]);
  for (const [groupId, members] of buckets) {
    const pinned = members.filter((m) => m.pinned);
    const loose = members.filter((m) => !m.pinned);
    const worstPinned = Math.max(-1, ...pinned.map((m) => m.railPos));
    const bestLoose = Math.min(Number.POSITIVE_INFINITY, ...loose.map((m) => m.railPos));
    if (worstPinned > bestLoose) {
      problems.push(
        `section ${groupId}: a pinned railPos ${worstPinned} is above an unpinned ${bestLoose}`,
      );
    }
  }
  return problems;
}

/** Invariant I2: every `groupId` is null or names an existing group. */
export function danglingGroupIds(state: GroupsState): number[] {
  const known = new Set(state.groups.map((g) => g.id));
  return state.sessions.filter((s) => s.groupId !== null && !known.has(s.groupId)).map((s) => s.id);
}

// --- the tick-survival check, with this tier's real-time hold ---

/**
 * The render helper's `expectFocusAndNodeSurviveTick` with the E2E hold: `settleFor` here waits in
 * real time, so the daemon's own render tick passes under the tagged node.
 */
export async function expectFocusAndNodeSurviveTick(
  page: Page,
  control: Locator,
  key: string,
  afterActivate?: () => Promise<void>,
): Promise<void> {
  await surviveTickWith(page, control, key, afterActivate, settleFor);
}

/**
 * Like `launchTitled`, but every session's directory sits under the daemon's browse root, so the
 * launch dialog (which opens onto the most recent launch directory) can navigate to a sibling with
 * `pickBrowseDirectory`.
 */
export async function launchTitledInBrowseRoot(
  page: Page,
  daemon: ScratchDaemon,
  titles: string[],
): Promise<{ sessions: SessionObject[]; cleanup: () => Promise<void> }> {
  const dirs = await Promise.all(titles.map(() => browseScratchDirectory(daemon)));
  const sessions: SessionObject[] = [];
  for (const [i, dir] of dirs.entries()) {
    sessions.push(
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }),
    );
  }
  return {
    sessions,
    cleanup: async () => {
      await Promise.all(dirs.map((d) => d.cleanup()));
    },
  };
}

/**
 * Points the open launch dialog at `dir` (a child of the browse root): up to the browse root, then
 * into the directory. The dialog must already have a launch on record so it opened below the root
 * (every caller launched sessions through `launchTitledInBrowseRoot` first).
 */
export async function pickBrowseDirectory(
  dialog: Locator,
  daemon: ScratchDaemon,
  dir: string,
): Promise<void> {
  await crumbButton(dialog, basename(daemon.browseRoot)).click();
  await childEntry(dialog, basename(dir)).click();
}

export interface GroupsFrameHold {
  /** From now on the `groups` frames the daemon sends this page are withheld. */
  hold(): void;
  /** Delivers every withheld `groups` frame, in order, and stops withholding. */
  release(): void;
}

/**
 * Proxies the dashboard's `/ws` socket and can withhold the whole-list `groups` frames — the
 * "dropped frame" the protocol is built to tolerate — so a test can hold a dialog's view of
 * the groups stale deterministically instead of racing the 1 s render tick. Every other frame passes
 * through untouched. Register before the page navigates: only sockets opened afterwards are routed.
 */
export async function routeGroupsFrames(page: Page): Promise<GroupsFrameHold> {
  let holding = false;
  const held: string[] = [];
  let toPage: { send(message: string): void } | null = null;
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();
    toPage = ws;
    server.onMessage((message) => {
      if (holding && typeof message === "string" && isGroupsFrame(message)) {
        held.push(message);
        return;
      }
      ws.send(message);
    });
  });
  return {
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const message of held.splice(0)) toPage?.send(message);
    },
  };
}

function isGroupsFrame(message: string): boolean {
  try {
    return (JSON.parse(message) as { type?: unknown }).type === "groups";
  } catch {
    return false;
  }
}

export interface HeldRequest {
  /** Resolves once the daemon has answered the held request: its effect is applied, its response is still withheld. */
  answered: Promise<void>;
  /** Hands the withheld response to the page. */
  release(): void;
}

/**
 * Withholds the response to the first `method` request whose path matches `path`, after the
 * daemon has applied it: the page's `await` stays pending while the daemon's own `groups` frame
 * arrives, which is the window an in-flight request leaves for the developer to start something
 * else. Later matching requests pass through. Register before the request is made.
 */
export async function holdResponse(
  page: Page,
  method: "POST" | "PUT",
  path: string,
): Promise<HeldRequest> {
  let markAnswered: () => void = () => undefined;
  let release: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    markAnswered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let taken = false;
  await page.route(`**${path}`, async (route) => {
    if (taken || route.request().method() !== method) {
      await route.fallback();
      return;
    }
    taken = true;
    const response = await route.fetch();
    markAnswered();
    await gate;
    await route.fulfill({ response });
  });
  return { answered, release };
}
