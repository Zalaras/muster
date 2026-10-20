// Locators and page-side oracles for the groups feature (named, collapsible rail sections,
// select mode, the launch dialog's Group row, the Focus header's group control). Pure DOM —
// no daemon, no fixture knowledge — so both tiers use it: the render spec here directly,
// the E2E journeys through `web/e2e/helpers/groups.ts`, which re-exports it beside its own
// daemon-side setup and oracles.
//
// Locators follow plan groups' Testable UI Elements table: role + accessible name where it
// pins one, the pinned class / data attribute where it names one.
import { mainheadBranch, mainheadFolder, railCardByTitle } from "./card-location";
import { expect, type Locator, type Page, settleFor } from "./harness";

/** `data-group-id` of the Ungrouped section's header and body. */
export const UNGROUPED = "ungrouped";

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
  return railCardByTitle(page, title).getByRole("checkbox", {
    name: `Select ${title}`,
    exact: true,
  });
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

/** How a tier holds the page past a render tick: the render harness advances its installed
 * clock, the E2E harness waits in real time. */
export type Settle = (page: Page, ms: number) => Promise<void>;

/**
 * The tick-survival check every focusable control the plan adds owes (kb:lesson/select-rebuilt-every-tick-passed-selectoption): focus it, tag the node, activate it with a real key, then hold
 * past one render tick (> 1 s) and assert the tagged node is still `document.activeElement`.
 * A control rebuilt by the tick loses the tag and the focus together.
 *
 * `afterActivate` runs between the key press and the tick for the caller's own assertion on what
 * the activation did. `settle` defaults to the render harness's clock advance; the E2E helper
 * passes its real-time hold.
 */
export async function expectFocusAndNodeSurviveTick(
  page: Page,
  control: Locator,
  key: string,
  afterActivate?: () => Promise<void>,
  settle: Settle = settleFor,
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

  await settle(page, 1_300);
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

// --- the Focus header's floors beside the group control ---

/** A rail card under a title two sessions share, told apart by its folder line (`<folder> /`). */
export function railCardByFolder(page: Page, title: string, folder: string): Locator {
  return railCardByTitle(page, title).filter({
    has: page.locator(".r2 .rf", { hasText: `${folder} /` }),
  });
}

/** One floor check on the Focus header at its current width: the problems found, empty when
 * the invariant holds, so `expect.poll(...).toEqual([])` prints what broke. */
export type FloorCheck = (page: Page, repoName: string) => Promise<string[]>;

/**
 * The title keeps its 6rem floor and a folder within the repo block's floor (`muster /`, exactly
 * 8 characters) reads whole beside the branch, whatever the group control does.
 */
export async function titleFloorAndReadoutProblems(
  page: Page,
  repoName: string,
): Promise<string[]> {
  const problems: string[] = [];
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const title = await page.locator("#mainhead h2.name").boundingBox();
  if (!title || title.width < 6 * rem - 1) {
    problems.push(`title is ${title?.width ?? 0}px wide, under its ${6 * rem}px floor`);
  }
  for (const [label, line, text] of [
    ["folder", mainheadFolder(page), `${repoName} /`],
    ["branch", mainheadBranch(page), "main"],
  ] as const) {
    const whole = await line.evaluate((el) => el.scrollWidth <= el.clientWidth);
    const shown = (await line.textContent())?.trim();
    if (!whole) problems.push(`${label} text is truncated`);
    if (shown !== text)
      problems.push(`${label} reads ${JSON.stringify(shown)}, not ${JSON.stringify(text)}`);
  }
  return problems;
}

/**
 * A long folder (`muster-app /`, 12 characters) is held to the repo block's floor rule, not to
 * "reads whole": REQ-10 and E27 were amended 2026-10-05 (user decision,
 * plans/groups/decisions/focus-header-floor-rule/decision.md, kb:adr/focus-repo-block-keeps-floor-beside-group-control).
 * The block is present (never hidden) and its folder line is at least 8 characters wide, measured
 * against a clone of the line itself so the font, and so the `ch` unit, is the line's own. The
 * title keeps its 6rem floor exactly as before.
 */
export async function titleAndRepoFloorProblems(page: Page, repoName: string): Promise<string[]> {
  const problems: string[] = [];
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const title = await page.locator("#mainhead h2.name").boundingBox();
  if (!title || title.width < 6 * rem - 1) {
    problems.push(`title is ${title?.width ?? 0}px wide, under its ${6 * rem}px floor`);
  }
  const folder = mainheadFolder(page);
  if ((await folder.count()) !== 1) return [...problems, "the repo block's folder line is absent"];
  const measured = await folder.evaluate((el) => {
    const probe = el.cloneNode(false) as HTMLElement;
    probe.textContent = "";
    probe.style.maxWidth = "none";
    probe.style.width = "8ch";
    el.after(probe);
    const floor = probe.getBoundingClientRect().width;
    probe.remove();
    const box = el.getBoundingClientRect();
    return {
      width: box.width,
      floor,
      display: getComputedStyle(el).display,
      repoDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : "none",
    };
  });
  if (measured.display === "none" || measured.repoDisplay === "none") {
    problems.push("the repo block is hidden");
  }
  if (measured.floor <= 0) problems.push("the 8-character reference measured no width");
  if (measured.width < measured.floor - 1) {
    problems.push(
      `folder line is ${measured.width.toFixed(1)}px wide, under its 8-character floor of ${measured.floor.toFixed(1)}px`,
    );
  }
  const shown = (await folder.textContent())?.trim();
  if (shown !== `${repoName} /`) {
    problems.push(`folder reads ${JSON.stringify(shown)}, not ${JSON.stringify(`${repoName} /`)}`);
  }
  const branch = (await mainheadBranch(page).textContent())?.trim();
  if (branch !== "main") problems.push(`branch reads ${JSON.stringify(branch)}, not "main"`);
  return problems;
}
