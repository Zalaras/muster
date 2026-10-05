// Locators, oracles and setup for plan groups (named, collapsible rail sections, select
// mode, the launch dialog's Group row, the Focus header's group control).
//
// Locators follow the plan's Testable UI Elements table: role + accessible name where it pins
// one, the pinned class / data attribute where it names one. Nothing here is a wire shape a
// real Claude Code sends: sessions are launched through the real `POST /api/sessions` and
// driven with `helpers/payloads.ts`'s measured builders; groups are the developer's own state,
// made through the real group endpoints (setup) or the UI (the behaviour under test).
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { basename } from "node:path";
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
import { railCard } from "./railorder";
import {
  browseScratchDirectory,
  envelopeOpts,
  launchSession,
  scratchDirectory,
  type SessionObject,
} from "./session";

/** `data-group-id` of the Ungrouped section's header and body. */
export const UNGROUPED = "ungrouped";

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

// --- locators: the rail ---

export function railActionsButton(page: Page): Locator {
  return page.getByRole("button", { name: "Rail actions", exact: true });
}

export function selectToggle(page: Page): Locator {
  return page.getByRole("button", { name: "Select", exact: true });
}

export function filterGroup(page: Page): Locator {
  return page.getByRole("group", { name: "Filter", exact: true });
}

export type FilterName = "All" | "Groups" | "Ungrouped";

export function filterButton(page: Page, name: FilterName): Locator {
  return filterGroup(page).getByRole("button", { name, exact: true });
}

/** `#rail-count` — the plain total, or `<visible> of <total>` while the filter hides a card. */
export function railCount(page: Page): Locator {
  return page.locator("#rail-count");
}

export function groupHeads(page: Page): Locator {
  return page.locator("#sessions .ghead");
}

/** One section's header by `data-group-id` — a group's numeric id, or `UNGROUPED`. */
export function groupHead(page: Page, id: number | string): Locator {
  return page.locator(`#sessions .ghead[data-group-id="${id}"]`);
}

export function groupBody(page: Page, id: number | string): Locator {
  return page.locator(`#sessions .gbody[data-group-id="${id}"]`);
}

/** The cards of one section, in DOM order (collapsed ones included: they are hidden, not gone). */
export function sectionCards(page: Page, id: number | string): Locator {
  return groupBody(page, id).getByTestId("session-card");
}

export function groupName(head: Locator): Locator {
  return head.locator(".gname");
}

/** The caret: `Collapse <name>` while expanded, `Expand <name>` while collapsed. */
export function groupCaret(head: Locator): Locator {
  return head.getByRole("button", { name: /^(Collapse|Expand) / });
}

export function groupActionsButton(head: Locator): Locator {
  return head.getByRole("button", { name: "Group actions", exact: true });
}

/** The rename / new-group field (`aria-label="Group name"`); scope it to a header or `#sessions`. */
export function groupNameInput(scope: Locator): Locator {
  return scope.getByRole("textbox", { name: "Group name" });
}

export function summaryCount(head: Locator): Locator {
  return head.locator(".gsum .cnt");
}

export function summaryStates(head: Locator): Locator {
  return head.locator(".gsum .st");
}

export function summaryState(head: Locator, state: string): Locator {
  return head.locator(`.gsum .st[data-state="${state}"]`);
}

export function popover(page: Page): Locator {
  return page.getByRole("tooltip");
}

export function openMenu(page: Page): Locator {
  return page.getByRole("menu");
}

export function menuItem(page: Page, name: string): Locator {
  return openMenu(page).getByRole("menuitem", { name, exact: true });
}

/** Section keys in DOM order (`data-group-id` of each header); empty with no groups. */
export async function sectionIds(page: Page): Promise<string[]> {
  const raw = await page
    .locator("#sessions .ghead")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-group-id")));
  return raw.map((v) => {
    if (v === null) throw new Error("section header missing data-group-id");
    return v;
  });
}

/** `data-session-id` of every card inside one section's body, in DOM order. */
export async function sectionCardIds(page: Page, id: number | string): Promise<number[]> {
  const raw = await sectionCards(page, id).evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-session-id")),
  );
  return raw.map((v) => {
    if (v === null) throw new Error("rail card missing data-session-id");
    return Number(v);
  });
}

/** `data-session-id` of every rail card currently displayed (laid out), in DOM order. */
export async function visibleRailCardIds(page: Page): Promise<number[]> {
  const raw = await page
    .locator("#sessions [data-testid='session-card']")
    .evaluateAll((els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute("data-session-id")),
    );
  return raw.map((v) => Number(v));
}

/** Opens a header's ⋯ menu and returns the menu locator. */
export async function openGroupMenu(page: Page, head: Locator): Promise<Locator> {
  await groupActionsButton(head).click();
  await expect(openMenu(page)).toBeVisible();
  return openMenu(page);
}

/** Opens the rail's ⋯ menu and returns the menu locator. */
export async function openRailMenu(page: Page): Promise<Locator> {
  await railActionsButton(page).click();
  await expect(openMenu(page)).toBeVisible();
  return openMenu(page);
}

// --- locators: select mode ---

export function selectBar(page: Page): Locator {
  return page.locator("#select-bar");
}

export function selectBarCount(page: Page): Locator {
  return selectBar(page).locator(".cnt");
}

export type BarButton = "Move to" | "Ungroup" | "Stop…" | "Remove…" | "All" | "Done";

export function barButton(page: Page, name: BarButton): Locator {
  return selectBar(page).getByRole("button", { name, exact: true });
}

export function cardCheckbox(page: Page, title: string): Locator {
  return railCard(page, title).getByRole("checkbox", { name: `Select ${title}`, exact: true });
}

export function headerCheckbox(page: Page, groupNameText: string): Locator {
  return page.getByRole("checkbox", { name: `Select all in ${groupNameText}`, exact: true });
}

// --- locators: dialogs ---

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function deleteGroupDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name: `Delete group “${name}”?` });
}

export function newGroupModal(page: Page, n: number): Locator {
  return page.getByRole("dialog", { name: `New group from ${plural(n, "session")}` });
}

export function bulkStopDialog(page: Page, n: number): Locator {
  return page.getByRole("dialog", { name: `Stop ${plural(n, "session")}?` });
}

export function bulkRemoveDialog(page: Page, n: number): Locator {
  return page.getByRole("dialog", { name: `Remove ${plural(n, "session")}?` });
}

/** The exact singular/plural noun phrase the dialogs and the delete-group body use. */
export function sessionsPhrase(n: number): string {
  return plural(n, "session");
}

// --- locators: the Focus header and the launch dialog ---

/** `#mainhead .ingroup` — the Focus header's group control. */
export function mainheadGroupButton(page: Page): Locator {
  return page.locator("#mainhead .ingroup");
}

/** `#group-select` — the launch dialog's Group row (role `combobox`, name `Group`). */
export function groupSelect(dialog: Locator): Locator {
  return dialog.getByRole("combobox", { name: "Group", exact: true });
}

/** `#group-name-input` — shown only while `New group…` is the selected option. */
export function groupNameField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Group name" });
}

/** The text of the select's currently selected option. */
export async function selectedOptionLabel(select: Locator): Promise<string | null> {
  return await select.evaluate((el) => {
    const opt = (el as HTMLSelectElement).selectedOptions[0];
    return opt ? (opt.textContent ?? "").trim() : null;
  });
}

export async function optionLabels(select: Locator): Promise<string[]> {
  const labels = await select.locator("option").allTextContents();
  return labels.map((l) => l.trim());
}

// --- request log and focus/identity helpers ---

/**
 * Records every non-GET `/api/` request the page makes from now on, as `METHOD /path`. Attach
 * before the action under test; read `.requests()` after a `settleFor` for "nothing was sent" and
 * after a web-first expect for "exactly one batch was sent".
 */
export function trackMutations(page: Page): { requests: () => string[] } {
  const seen: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (req.method() !== "GET" && url.pathname.startsWith("/api/")) {
      seen.push(`${req.method()} ${url.pathname}`);
    }
  });
  return { requests: () => [...seen] };
}

let tagSeq = 0;

/**
 * The tick-survival check every focusable control the plan adds owes (kb:lesson/select-rebuilt-every-tick-passed-selectoption): focus it, tag the node, activate it with a real key, then hold
 * past one render tick (> 1 s) and assert the tagged node is still `document.activeElement`.
 * A control rebuilt by the tick loses the tag and the focus together.
 *
 * `afterActivate` runs between the key press and the tick for the caller's own assertion on what
 * the activation did.
 */
export async function expectFocusAndNodeSurviveTick(
  page: Page,
  control: Locator,
  key: string,
  afterActivate?: () => Promise<void>,
): Promise<void> {
  tagSeq += 1;
  const tag = `e2e-node-${tagSeq}`;
  await control.focus();
  await control.evaluate((el, t) => {
    Reflect.set(el, "__e2eNode", t);
  }, tag);
  const isTaggedActive = () =>
    page.evaluate((t) => Reflect.get(document.activeElement ?? {}, "__e2eNode") === t, tag);
  expect(await isTaggedActive(), "the control holds focus before the key").toBe(true);

  await page.keyboard.press(key);
  if (afterActivate) await afterActivate();
  expect(await isTaggedActive(), `the control keeps focus right after ${key}`).toBe(true);

  await settleFor(page, 1_300);
  expect(await isTaggedActive(), "the same node keeps focus across a render tick").toBe(true);
}

/**
 * Sizes the Focus header (`#mainhead`, the container the group control's 640px rule measures) to
 * `target` CSS pixels by moving the viewport, and returns the width it settled at. The rail and
 * margins take a fixed share, so two corrections converge; the final read must land within 1 px or
 * the helper throws (a header that cannot be sized is a harness problem, not a pass).
 */
export async function setMainheadWidth(page: Page, target: number): Promise<number> {
  const head = page.locator("#mainhead");
  const measure = async () => (await head.boundingBox())?.width ?? 0;
  const startWidth = page.viewportSize()?.width ?? 1280;
  let viewport = startWidth;
  for (let i = 0; i < 4; i += 1) {
    const now = await measure();
    if (Math.abs(now - target) <= 1) break;
    viewport = Math.max(320, viewport + Math.round(target - now));
    await page.setViewportSize({ width: viewport, height: 800 });
    await expect.poll(measure).not.toBe(now);
  }
  await expect.poll(async () => Math.abs((await measure()) - target) <= 1).toBe(true);
  return await measure();
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
 * "dropped frame" the protocol is built to tolerate (REQ-26) — so a test can hold a dialog's view of
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

/**
 * Sizes the Focus header so the container the group control's `@container (width < 640px)` rule
 * measures — `#mainhead`'s content box, inside its padding and border — is exactly `target` CSS
 * pixels, and returns the content width it settled at. `setMainheadWidth` tolerates 1 px, which
 * is the whole difference between 640 (present) and 639 (hidden), so this one converges to the
 * pixel or throws.
 */
export async function setMainheadContentWidth(page: Page, target: number): Promise<number> {
  const head = page.locator("#mainhead");
  const measure = () =>
    head.evaluate((el) => {
      const cs = getComputedStyle(el);
      const inset = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce(
        (sum, key) => sum + parseFloat(cs[key as "paddingLeft"]),
        0,
      );
      return el.getBoundingClientRect().width - inset;
    });
  let viewport = page.viewportSize()?.width ?? 1280;
  for (let i = 0; i < 6; i += 1) {
    const now = await measure();
    if (Math.abs(now - target) < 0.01) return now;
    viewport = Math.max(320, viewport + Math.round(target - now));
    await page.setViewportSize({ width: viewport, height: 800 });
    await expect.poll(measure).not.toBe(now);
  }
  const settled = await measure();
  if (Math.abs(settled - target) >= 0.01) {
    throw new Error(`the Focus header's content box settled at ${settled}px, not ${target}px`);
  }
  return settled;
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
