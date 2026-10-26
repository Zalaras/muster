// focus — the display properties of plan effort (the header's bracketed effort and the
// launch-mismatch warning strip, REQ-5 to REQ-9, REQ-12), plan title-crop-stop-resume-button
// (the Focus header's give-way order, its right-aligned cluster and the one Stop/Resume
// button at every width, REQ-1 to REQ-7), the state machine's fresh card (W7) and plan
// ui-text-and-focus (the Focus-pane marker, REQ-1 to REQ-3), re-levelled on 2026-10-20 from
// web/e2e/{effort-header,focus-header,sessions,focus-marker}.spec.ts
// (plans/_audit/relevel/focus.md). Nothing here changes state: the launched, bound, warned,
// moved and ended sessions come from the `effort-header`, `focus-header-rows-*` and
// `unbound-sessions` scenarios, a theme from an `effort-warned-*` fixture's prefs, and a
// session is focused by clicking its rail card, which touches no API.
import { mainheadClaudeAt, mainheadFitProblems, railCardByTitle } from "./helpers/card-location";
import {
  amberHueBand,
  clusterShiftProblems,
  computed,
  currentRailCard,
  effortStrip,
  effText,
  endedAgeAbsentProblems,
  endedAgeProblems,
  focusSession,
  headerEff,
  headerInvariantProblems,
  headerModel,
  type HeaderSnapshot,
  headerLifecycleButtons,
  headerMore,
  hueOf,
  mainheadRenameButton,
  onTwoRows,
  readHeaderSnapshot,
  sessionCard,
  settledSnapshot,
  settleLayout,
  stackedBandProblems,
  stateBadge,
  stripDismiss,
  stripSentence,
  sweepHeader,
  sweepWidths,
  terminalRegion,
} from "./helpers/focus";
import {
  type Dashboard,
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  type Session,
  test,
} from "./helpers/harness";
import { cardMenu, menuItemLabels, openCardMenu } from "./helpers/rail";
import { tokenColor } from "./helpers/style";

/** The one fixture session titled `title`. */
function sessionTitled(fixture: RenderFixture, title: string): Session {
  const matches = fixture.snapshot.sessions.filter((s) => s.title === title);
  expect(matches, `one fixture session titled ${title}`).toHaveLength(1);
  const [session] = matches;
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

/** A rail card by the fixture session it shows — titles repeat across the rows scenarios. */
function cardOf(page: Page, session: Session): Locator {
  return page.locator(`#sessions [data-testid="session-card"][data-session-id="${session.id}"]`);
}

// =======================================================================================
// Plan effort — the header half: the bracketed effort after the model and the
// launch-mismatch warning strip (web/e2e/effort-header.spec.ts). Claude Code is faked in
// the scenario: the status line's `effort.level` from kb:fact/status-line-effort-key, Opus
// 4.5 clamping `max` to `high` and Haiku 4.5 posting no key (kb:fact/effort-levels-per-model).
// =======================================================================================

const clamped = (requested: string, model: string, actual: string) =>
  `Asked for ${requested} — ${model} started at ${actual}.`;
const noEffort = (requested: string, model: string) =>
  `Asked for ${requested} — ${model} has no effort setting, so it started without one.`;

/** The `effort-header` scenario's session launched at `max` on Opus 4.5 whose first post
 * reported `high`: the clamped warning. */
const WARNED = "effort-clamped";

test("a launched session with no status post yet reads <model> (…), a dead one that never reported reads the model with no brackets (REQ-6, E5, E6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("effort-header");

  // E5: no hook and no status post at all — the launch alias with the unreported brackets.
  const noPost = sessionTitled(fixture, "effort-no-post");
  expect(noPost.claudeSessionId).toBeNull();
  await focusSession(page, "effort-no-post");
  await expect(headerModel(page)).toHaveText("sonnet (…)");
  expect(await effText(page)).toBe(" (…)");
  expect(noPost.effort).toBeNull();

  // A bound session that has still posted no status line reads the same.
  const bound = sessionTitled(fixture, "effort-bound");
  expect(bound.claudeSessionId).not.toBeNull();
  await focusSession(page, "effort-bound");
  await expect(headerModel(page)).toHaveText(/\(…\)$/);
  expect(bound.effort).toBeNull();

  // E6: it ended before any report — no brackets.
  const dead = sessionTitled(fixture, "effort-dead-never");
  expect(dead.alive).toBe(false);
  await focusSession(page, "effort-dead-never");
  await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
  await expect(headerEff(page)).toHaveCount(0);
  await expect(headerModel(page)).toHaveText(/^[^(]+$/);
  expect(dead.effort).toBeNull();
});

test("a launch with max whose first post reports high shows the strip 'Asked for max — Opus 4.5 started at high.' under the header and tints the effort warn (REQ-7, REQ-8, E8, INV-E1)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("effort-header");

  // Before any post: the launch alias, the unreported brackets and no strip.
  await focusSession(page, "effort-no-post");
  await expect(headerModel(page)).toHaveText("sonnet (…)");
  await expect(effortStrip(page)).toHaveCount(0);

  const warned = sessionTitled(fixture, WARNED);
  await focusSession(page, WARNED);
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));
  await expect(effortStrip(page).locator("b")).toHaveText(["max", "high"]);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  expect({ effort: warned.effort, effortWarning: warned.effortWarning }).toEqual({
    effort: { level: "high" },
    effortWarning: { requested: "max", actual: "high", model: "Opus 4.5" },
  });

  // The tint is the --warn token itself, the strip sits on --warn-bg in --warn-fg.
  await expect
    .poll(() => computed(headerEff(page), "color"))
    .toBe(await tokenColor(page, "--warn"));
  await expect
    .poll(() => computed(effortStrip(page), "background-color"))
    .toBe(await tokenColor(page, "--warn-bg"));
  await expect
    .poll(() => computed(effortStrip(page), "color"))
    .toBe(await tokenColor(page, "--warn-fg"));
  await expect
    .poll(() => computed(effortStrip(page), "border-bottom-color"))
    .toBe(await tokenColor(page, "--warn-line"));
});

test("the strip is a full-width status line directly under the header and above the terminal, with the ⚠ glyph hidden from the accessible tree and Dismiss on its right (REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("effort-header");
  await focusSession(page, WARNED);
  await expect(effortStrip(page)).toHaveCount(1);

  const strip = effortStrip(page);
  const [head, box, slot] = await Promise.all([
    page.locator("#mainhead").boundingBox(),
    strip.boundingBox(),
    page.locator("#main-terminal-slot").boundingBox(),
  ]);
  if (!head || !box || !slot)
    throw new Error("expected the header, the strip and the slot to be laid out");
  expect(box.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(slot.y + 1);
  expect(box.width).toBeGreaterThanOrEqual(head.width - 2);

  await expect(strip.locator("[aria-hidden]")).toContainText("⚠");
  const dismiss = await stripDismiss(page).boundingBox();
  if (!dismiss) throw new Error("expected Dismiss to be laid out");
  expect(dismiss.x + dismiss.width).toBeGreaterThan(box.x + box.width * 0.7);
});

test("a launch with high whose first post carries no effort key shows the strip ending 'has no effort setting, so it started without one.' and the model with no brackets (REQ-7, REQ-8, E9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("effort-header");
  const none = sessionTitled(fixture, "effort-none");
  await focusSession(page, "effort-none");

  await expect(headerModel(page)).toHaveText("Haiku 4.5");
  await expect(headerEff(page)).toHaveCount(0);
  await expect.poll(() => stripSentence(page)).toBe(noEffort("high", "Haiku 4.5"));
  expect({ effort: none.effort, effortWarning: none.effortWarning }).toEqual({
    effort: { level: null },
    effortWarning: { requested: "high", actual: null, model: "Haiku 4.5" },
  });
});

// The plan's 316px is the header's own width (the `@container (width < 316px)` rule), and the
// rail beside it is a fixed 300px, so the narrowest header the plan names is a 616px window. The
// 600px window (a 300px header) is the narrowest the existing header sweeps use.
const RAIL_PX = 300;
for (const width of [1280, 800, 700, 616, 600]) {
  test(`at ${width}px the strip wraps inside the window with Dismiss in view, and the model with its bracketed effort is never clipped (REQ-6, REQ-8)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await dashboard.open("effort-header");
    await focusSession(page, "effort-width-with-a-rather-long-title-to-crowd-the-header");
    await expect(effortStrip(page)).toHaveCount(1);
    await expect
      .poll(async () => (await page.locator("#mainhead").boundingBox())?.width ?? 0, {
        message: "the header is the window less the fixed rail",
      })
      .toBeGreaterThanOrEqual(width - RAIL_PX - 1);

    const dismiss = stripDismiss(page);
    await expect(dismiss).toBeVisible();
    await expect
      .poll(
        async () => {
          const box = await dismiss.boundingBox();
          return box !== null && box.x >= 0 && box.x + box.width <= width;
        },
        { message: "Dismiss sits fully inside the window" },
      )
      .toBe(true);
    const strip = await effortStrip(page).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth);

    const model = await headerModel(page).evaluate((el) => {
      const eff = el.querySelector(".eff");
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        effRight: eff?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        modelRight: el.getBoundingClientRect().right,
      };
    });
    expect(model.scrollWidth).toBeLessThanOrEqual(model.clientWidth);
    expect(model.effRight).toBeLessThanOrEqual(model.modelRight + 0.5);
    expect(model.effRight).toBeLessThanOrEqual(width);
  });
}

// The dashboard adopts `theme` only from the prefs broadcast (web/src/features/theme.ts), so
// each theme is a fixture whose prefs carry it, holding the one warned session.
for (const [label, data] of [
  ["Instrument", "instrument"],
  ["Dark", "dark"],
  ["Light", "light"],
] as const) {
  test(`in the ${label} theme the --warn family is defined, --warn sits outside amber's hue band, and the strip and the tint use it (REQ-12, REQ-8)`, async ({
    page,
    dashboard,
  }) => {
    const fixture = await dashboard.open(`effort-warned-${data}`);
    expect(fixture.snapshot.prefs.theme).toBe(data);
    await focusSession(page, WARNED);
    await expect(effortStrip(page)).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("data-theme", data);

    for (const token of ["--warn", "--warn-bg", "--warn-line", "--warn-fg"]) {
      const value = await page.evaluate(
        (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
        token,
      );
      expect(value, `${token} is defined in the ${label} theme`).not.toBe("");
    }

    const warn = await tokenColor(page, "--warn");
    const amber = await tokenColor(page, "--amber");
    expect(warn).not.toBe(amber);
    const band = await amberHueBand();
    const hue = hueOf(warn);
    expect(
      hue >= band.min && hue <= band.max,
      `--warn hue ${hue.toFixed(1)}deg is inside amber's band [${band.min}, ${band.max}]`,
    ).toBe(false);

    await expect.poll(() => computed(headerEff(page), "color")).toBe(warn);
    await expect
      .poll(() => computed(effortStrip(page), "background-color"))
      .toBe(await tokenColor(page, "--warn-bg"));
    await expect
      .poll(() => computed(effortStrip(page), "color"))
      .toBe(await tokenColor(page, "--warn-fg"));
  });
}

// =======================================================================================
// Plan title-crop-stop-resume-button — REQ-1 to REQ-7 (web/e2e/focus-header.spec.ts): the
// readout as wide as its text giving way before the title, the surface switch in one
// right-aligned cluster with the actions, Stop and Resume one button in one box. The
// invariants are asserted by sweeps in 16 px steps, never at chosen widths
// (kb:lesson/layout-invariant-needs-its-width-range). The plan's state table is
// title {9, 52, 300} x folder {6, 35, 60} x branch {4, 80} x {unmoved, moved} x {alive, dead};
// the `focus-header-rows-a` and `-b` scenarios hold the covering subset of rows the E2E
// swept (every value of every factor at least once, plus the plan's Chromium baseline row),
// one checkout per folder x branch pair, each a session on it. The row with the `shell`
// segment selected stays E2E: selecting it spawns a shell over the API.
// =======================================================================================

const FULL_MODEL_ID = "claude-haiku-4-5-20251001";

/** `text` cut to exactly `n` characters, the last one never a space. */
function exactly(text: string, n: number): string {
  const body = text.repeat(Math.ceil(n / text.length)).slice(0, n - 1);
  return `${body}x`;
}

const TITLE_9 = "Game Play";
const TITLE_29 = exactly("approve weekend shift swaps ", 29);
const TITLE_52 = exactly("rework shift-swap approval for the weekend rostering ", 52);
const TITLE_300 = exactly("a title that is far longer than any header can show ", 300);
const FOLDER_6 = "abc123";
const FOLDER_35 = "economic-game-theory-simulation-lab";
const FOLDER_60 = "long-folder-name-for-wrapping-".repeat(2);
const BRANCH_4 = "main";
const BRANCH_80 = exactly("long-branch-name-for-wrapping-", 80);

/** The session's display title lands via the status line when it is over the rename cap. */
const OVER_RENAME_CAP = 100;

interface Row {
  label: string;
  /** The scenario whose checkouts carry this row's folder x branch pair. */
  fixture: "focus-header-rows-a" | "focus-header-rows-b";
  title: string;
  folder: string;
  branch: string;
  grouped: boolean;
  moved: boolean;
  dead: boolean;
  /** Launched in bypass mode, so the danger chip follows the name (edge case 13). */
  bypass?: boolean;
  /** A status line carries the full model id as the display name, the widest model readout. */
  fullModel?: boolean;
}

// The covering subset. Row 1 is the plan's Chromium baseline (35-character folder, `main`,
// `Game Play`, grouped `Game`, alive and unmoved), the row that fails against the pre-fix build.
const ROWS: Row[] = [
  {
    label: "baseline: title 9, folder 35, branch 4, unmoved, alive, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_9,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: false,
  },
  {
    label: "title 9, folder 35, branch 4, moved, alive, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_9,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: true,
    dead: false,
  },
  {
    label: "title 52, folder 35, branch 4, unmoved, alive, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_52,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: false,
  },
  {
    label: "title 300, folder 60, branch 80, moved, alive, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_300,
    folder: FOLDER_60,
    branch: BRANCH_80,
    grouped: true,
    moved: true,
    dead: false,
  },
  {
    label: "title 9, folder 6, branch 4, unmoved, alive, ungrouped",
    fixture: "focus-header-rows-a",
    title: TITLE_9,
    folder: FOLDER_6,
    branch: BRANCH_4,
    grouped: false,
    moved: false,
    dead: false,
  },
  {
    label: "title 52, folder 60, branch 80, unmoved, dead, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_52,
    folder: FOLDER_60,
    branch: BRANCH_80,
    grouped: true,
    moved: false,
    dead: true,
  },
  {
    label: "title 9, folder 6, branch 80, unmoved, dead, ungrouped",
    fixture: "focus-header-rows-b",
    title: TITLE_9,
    folder: FOLDER_6,
    branch: BRANCH_80,
    grouped: false,
    moved: false,
    dead: true,
  },
  {
    label: "title 300, folder 35, branch 4, unmoved, dead, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_300,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: true,
  },
  {
    label: "title 300, folder 6, branch 80, unmoved, alive, ungrouped",
    fixture: "focus-header-rows-b",
    title: TITLE_300,
    folder: FOLDER_6,
    branch: BRANCH_80,
    grouped: false,
    moved: false,
    dead: false,
  },
  {
    label: "title 52, folder 35, branch 80, moved, alive, grouped, bypass chip",
    fixture: "focus-header-rows-b",
    title: TITLE_52,
    folder: FOLDER_35,
    branch: BRANCH_80,
    grouped: true,
    moved: true,
    dead: false,
    bypass: true,
  },
  {
    label: "title 9, folder 60, branch 4, moved, alive, grouped",
    fixture: "focus-header-rows-b",
    title: TITLE_9,
    folder: FOLDER_60,
    branch: BRANCH_4,
    grouped: true,
    moved: true,
    dead: false,
  },
];

/** The plan's pre-fix anchor and the cluster tests' session: `Game Play` on the 35-character
 * folder, ungrouped, alive and unmoved — the E2E's `launchBound` shape. */
const ROW_PLAIN: Row = {
  label: "title 9, folder 35, branch 4, unmoved, alive, ungrouped",
  fixture: "focus-header-rows-a",
  title: TITLE_9,
  folder: FOLDER_35,
  branch: BRANCH_4,
  grouped: false,
  moved: false,
  dead: false,
};

/**
 * The fixture session in the shape `row` describes, exactly one: the rows scenarios repeat
 * a title across sessions, so the checkout, the group, the move, the end, the bypass mode and
 * whether a status line reported (a long title lands through one, as does `fullModel`) pick
 * it. A dead session holds no Claude location (kb:spec/card-location), whatever it did alive.
 */
function rowSession(fixture: RenderFixture, row: Row): Session {
  const reported = !!row.fullModel || row.title.length > OVER_RENAME_CAP;
  const matches = fixture.snapshot.sessions.filter(
    (s) =>
      s.title === row.title &&
      s.repo?.name === row.folder &&
      s.repo?.branch === row.branch &&
      (s.groupId !== null) === row.grouped &&
      s.alive === !row.dead &&
      (s.claudeLocation !== null) === (row.moved && !row.dead) &&
      (s.permissionMode.value === "bypassPermissions") === !!row.bypass &&
      (s.effort !== null) === reported,
  );
  expect(matches, `one fixture session for ${row.label}`).toHaveLength(1);
  const [session] = matches;
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

/** Focus on the row's session at 1280x800, its header checked the way the E2E's `openRow` did. */
async function openRow(
  page: Page,
  dashboard: Dashboard,
  row: Row,
): Promise<{ fixture: RenderFixture; session: Session }> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fixture = await dashboard.open(row.fixture);
  const session = rowSession(fixture, row);
  if (row.title.length > OVER_RENAME_CAP || row.fullModel) {
    expect(session.model).toEqual({ id: FULL_MODEL_ID, displayName: FULL_MODEL_ID });
  }
  await cardOf(page, session).click();

  await expect(mainheadRenameButton(page)).toHaveText(row.title);
  await expect(page.locator("#mainhead .meta .loc .repo .rf")).toHaveText(`${row.folder} /`);
  await expect(page.locator("#mainhead .meta .loc .repo .rb")).toHaveText(row.branch);
  if (row.bypass) await expect(page.locator("#mainhead .chip-danger")).toHaveText("bypass");
  if (row.moved && !row.dead) {
    await expect(mainheadClaudeAt(page)).not.toHaveAttribute("hidden");
  }
  if (row.dead) {
    await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
  }
  await expect(headerMore(page)).toBeVisible();
  return { fixture, session };
}

// ---------------------------------------------------------------------------------------
// E3 — the give-way order and its invariants, swept
// ---------------------------------------------------------------------------------------

for (const row of ROWS) {
  test(`sweeping the window from 2000px to 600px and back in 16px steps, the Focus header holds INV-1 to INV-4 and INV-8 and retraces its give-way order: ${row.label} (E3, REQ-1, REQ-2, REQ-3, REQ-7)`, async ({
    page,
    dashboard,
  }) => {
    await openRow(page, dashboard, row);
    await sweepHeader(page, row.label, async () => await mainheadFitProblems(page));
  });
}

// The plan's pre-fix anchor (E3's "at least one row fails against the pre-fix build"): the
// 35-character folder at a 1700 px header shows its whole line, not the 30ch cap, with the
// width of the line's own text as the oracle. Both sides are re-read inside the poll.
test("a 35-character folder at a 1700px header shows its whole folder line on one row (E3, REQ-1)", async ({
  page,
  dashboard,
}) => {
  await page.setViewportSize({ width: 2000, height: 800 });
  const fixture = await dashboard.open(ROW_PLAIN.fixture);
  const session = rowSession(fixture, ROW_PLAIN);
  expect(FOLDER_35).toHaveLength(35);
  await cardOf(page, session).click();
  await expect(mainheadRenameButton(page)).toHaveText(TITLE_9);
  await expect(page.locator("#mainhead .meta .loc .repo .rf")).toHaveText(`${FOLDER_35} /`);
  await expect
    .poll(async () => {
      const s = await readHeaderSnapshot(page);
      const folder = s?.lines.find((l) => l.block === "repo" && l.kind === ".rf");
      if (!s || !folder) return "no folder line";
      const shown = folder.box.right - folder.box.left;
      return {
        oneRow: !onTwoRows(s),
        wholeLine: shown >= folder.natural - 1,
        widerThanTheOldCap: folder.natural > 210,
      };
    })
    .toEqual({ oneRow: true, wholeLine: true, widerThanTheOldCap: true });
});

// Fix wave of validate attempt 1: where the row cannot hold the title floor, the readout floor
// and the model, the model stacks under the readout (the title and readout stay side by side,
// REQ-2 and INV-4). The sweeps' INV-1 and INV-2 would also catch an overlap or a clipped
// model there, but only this test proves the band is reached and that the model is under the
// readout, whole and inside the viewport, rather than assuming it.
test("at 640px a 300-character title keeps the readout beside it at its floor and the model stacks under the readout, whole and inside the viewport (REQ-2, REQ-3, INV-2, INV-4)", async ({
  page,
  dashboard,
}) => {
  const row: Row = {
    label: "stacked band: title 300, folder 35, branch 4, unmoved, alive, ungrouped",
    fixture: "focus-header-rows-a",
    title: TITLE_300,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: false,
    moved: false,
    dead: false,
  };
  await openRow(page, dashboard, row);
  await page.setViewportSize({ width: 640, height: 800 });
  await settleLayout(page);
  await expect
    .poll(
      async () => {
        const s = await readHeaderSnapshot(page);
        if (!s) return ["a header part is missing"];
        return [...stackedBandProblems(s), ...(await headerInvariantProblems(page))];
      },
      { message: "the Focus header at 640px with a 300-character title" },
    )
    .toEqual([]);
});

// ---------------------------------------------------------------------------------------
// INV-6 at every width — Stop and Resume move nothing (review cycle 1, browser Major 1)
//
// E1 and E2 (web/e2e/focus-header.spec.ts) prove the swap in place at 1600 px, where the
// header is one row and the ended clause has room, so they could not fail for the shift the
// review measured below 784 px (the ended clause took a row of its own and pushed the cluster
// down 13 px), nor for the shifts web-impl found at 1112-1184, 1248-1320 and 1416-1488 px (the
// clause beside the model made the title row too wide for the cluster to stay on row one, so
// Stop dropped it). Each sweep below measures the header alive at every 16 px width from 2000
// to 600, then the same session's header once ended — the scenario holds a dead twin of each
// row, the same title, checkout and group, which is what the daemon shows once a Stop lands —
// and compares Remove, the Stop/Resume button, the surface switch and the header's own box at
// every one of the same widths. The ended age must show under the model at each of them. The
// comparison is state against state at one width, so the alive side is recorded and the dead
// side is re-read inside the retry.
// ---------------------------------------------------------------------------------------

const SWAP_ROWS: Row[] = [
  {
    label: "title 9, folder 35, branch 4, unmoved, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_9,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: false,
  },
  {
    label: "title 29, folder 35, branch 4, unmoved, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_29,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: false,
  },
  {
    label: "title 52, folder 35, branch 4, unmoved, grouped",
    fixture: "focus-header-rows-a",
    title: TITLE_52,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: true,
    moved: false,
    dead: false,
  },
  {
    label: "title 52, folder 35, branch 80, moved, grouped, bypass chip, full model id",
    fixture: "focus-header-rows-b",
    title: TITLE_52,
    folder: FOLDER_35,
    branch: BRANCH_80,
    grouped: true,
    moved: true,
    dead: false,
    bypass: true,
    fullModel: true,
  },
  {
    label: "title 300, folder 35, branch 4, unmoved, ungrouped, full model id",
    fixture: "focus-header-rows-a",
    title: TITLE_300,
    folder: FOLDER_35,
    branch: BRANCH_4,
    grouped: false,
    moved: false,
    dead: false,
  },
];

for (const row of SWAP_ROWS) {
  test(`sweeping the window from 2000px to 600px in 16px steps, a Stop leaves the Session actions ⋯, the surface switch and the header where they were and shows the ended age under the model at every width: ${row.label} (E1, REQ-5, REQ-6, INV-6)`, async ({
    page,
    dashboard,
  }) => {
    const { fixture } = await openRow(page, dashboard, row);
    const widths = sweepWidths();
    const alive = new Map<number, HeaderSnapshot>();
    for (const w of widths) {
      const s = await settledSnapshot(page, w);
      expect(s.more, `alive at ${w}px: the Session actions ⋯ is laid out`).not.toBeNull();
      expect(await endedAgeAbsentProblems(page), `alive at ${w}px`).toEqual([]);
      alive.set(w, s);
    }

    // The session once a Stop has landed: its ended twin in the same checkout and group.
    const ended = rowSession(fixture, { ...row, dead: true });
    expect(ended.alive).toBe(false);
    await page.setViewportSize({ width: 1280, height: 800 });
    await cardOf(page, ended).click();
    await expect(mainheadRenameButton(page)).toHaveText(row.title);
    await expect(headerMore(page)).toBeVisible();

    for (const w of widths) {
      const before = alive.get(w);
      if (!before) throw new Error(`no alive reading at ${w}px`);
      await expect
        .poll(
          async () => {
            const s = await settledSnapshot(page, w);
            return [...clusterShiftProblems(before, s), ...(await endedAgeProblems(page))];
          },
          { message: `${row.label}: the header after a Stop, at ${w}px` },
        )
        .toEqual([]);
    }
  });
}

// ---------------------------------------------------------------------------------------
// E5 — the disabled state
// ---------------------------------------------------------------------------------------

test("a dead session with no bound Claude id has no Stop, Resume or Remove button in the Focus header (E5, REQ-4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("unbound-sessions");
  const session = sessionTitled(fixture, "no-id");
  expect(session.alive).toBe(false);
  await railCardByTitle(page, "no-id").click();

  await expect(headerMore(page)).toBeVisible();
  await expect(headerLifecycleButtons(page)).toHaveCount(0);
  expect(session.claudeSessionId).toBeNull();
});

for (const title of ["enabled-e13", "disabled-e13"]) {
  test(`the Focus header of ${title === "enabled-e13" ? "a live" : "an ended"} session holds no Stop, Resume or Remove button — only the surface switch and the Session actions ⋯, last in the actions (R3, REQ-4)`, async ({
    page,
    dashboard,
  }) => {
    await dashboard.open("stop-resume-pair");
    await focusSession(page, title);
    await expect(page.locator("#mainhead")).toContainText(title);

    await expect(headerLifecycleButtons(page)).toHaveCount(0);
    await expect(page.locator("#mainhead .acts .surfseg")).toHaveCount(1);
    const more = headerMore(page);
    await expect(more).toBeVisible();
    await expect(more).toHaveCSS("opacity", "1");
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    // Last in `.acts`: nothing follows it.
    expect(
      await more.evaluate((el) => el === el.closest(".acts")?.lastElementChild),
      "the ⋯ is the last element of .acts",
    ).toBe(true);
  });
}

test("the header ⋯ opens the focused card's own menu: labelled Actions for <title>, the same items a right-click on its rail card gives (R3, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("stop-resume-pair");
  for (const title of ["enabled-e13", "disabled-e13"]) {
    await focusSession(page, title);
    await expect(page.locator("#mainhead")).toContainText(title);

    await openCardMenu(page, railCardByTitle(page, title));
    const fromCard = await menuItemLabels(page);
    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);

    const more = headerMore(page);
    await more.click();
    await expect(cardMenu(page)).toBeVisible();
    await expect(cardMenu(page)).toHaveAccessibleName(`Actions for ${title}`);
    await expect(more).toHaveAttribute("aria-expanded", "true");
    expect(await menuItemLabels(page), `${title}: header menu equals card menu`).toEqual(fromCard);
    expect(fromCard).toContain("Mark as unread");
    await page.keyboard.press("Escape");
    await expect(cardMenu(page)).toHaveCount(0);
  }
});

// ---------------------------------------------------------------------------------------
// REQ-4, E4 — the right-aligned cluster
// ---------------------------------------------------------------------------------------

for (const viewport of [2000, 1200, 800]) {
  test(`at ${viewport}px the surface switch is inside the actions, immediately before the Session actions ⋯, with the ⋯ at the header's right edge (REQ-4, INV-5)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: viewport, height: 800 });
    const fixture = await dashboard.open(ROW_PLAIN.fixture);
    await cardOf(page, rowSession(fixture, ROW_PLAIN)).click();
    await expect(mainheadRenameButton(page)).toHaveText(TITLE_9);
    await expect(page.locator("#mainhead .acts .surfseg")).toHaveCount(1);
    for (const kind of ["claude", "shell", "docs"] as const) {
      await expect(
        page.locator("#mainhead .acts").getByRole("button", { name: kind, exact: true }),
      ).toBeVisible();
    }
    await settleLayout(page);
    await expect
      .poll(async () => {
        const s = await readHeaderSnapshot(page);
        if (!s?.surf || !s.more) return "cluster part missing";
        const gap = s.more.left - s.surf.right;
        return {
          switchBeforeMore: gap >= -0.5 && gap <= 16,
          sameRow: Math.abs(s.surf.top - s.more.top) <= s.more.bottom - s.more.top,
          moreAtContentEdge: Math.abs(s.more.right - s.contentRight) <= 1,
        };
      })
      .toEqual({
        switchBeforeMore: true,
        sameRow: true,
        moreAtContentEdge: true,
      });
  });
}

// =======================================================================================
// The state machine's fresh card (web/e2e/sessions.spec.ts, W7) and plan ui-text-and-focus's
// Focus-pane marker (web/e2e/focus-marker.spec.ts, REQ-1 to REQ-3, INV-3): the
// `unbound-sessions` scenario holds two titled and one untitled fresh launch no SessionStart
// ever bound, in launch order under the default manual sort, plus the dead `no-id` session.
// The marker is client-side state, so a click or a chord moves it with no API.
// =======================================================================================

test("a fresh session renders 'untitled' and its context row as ctx unknown (W7)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("unbound-sessions");
  const fresh = fixture.snapshot.sessions.filter((s) => s.title === null);
  expect(fresh).toHaveLength(1);
  expect(fresh[0]?.state).toBe("started");
  expect(fresh[0]?.claudeSessionId).toBeNull();

  const card = sessionCard(page, "untitled");
  await expect(card).toBeVisible();
  await expect(stateBadge(card)).toHaveText(/started/i);
  await expect(card.getByText(/ctx\s+unknown/i)).toBeVisible();
});

test("the top rail card is current by default, and clicking another card moves the marker (E1)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("unbound-sessions");
  const cardA = railCardByTitle(page, "marker-a");
  const cardB = railCardByTitle(page, "marker-b");

  // Default focus: the first-launched session's card is at the top of the rail and current,
  // and it is the ONLY current card (INV-3).
  await expect(page.locator('#sessions [data-testid="session-card"]').first()).toHaveText(
    /marker-a/,
  );
  await expect(cardA).toHaveAttribute("aria-current", "true");
  await expect(cardB).not.toHaveAttribute("aria-current", "true");
  await expect(currentRailCard(page)).toHaveCount(1);

  await cardB.click();

  await expect(cardB).toHaveAttribute("aria-current", "true");
  await expect(cardA).not.toHaveAttribute("aria-current", "true");
  await expect(currentRailCard(page)).toHaveCount(1);
});

test("clicking into the live terminal leaves the marker on the clicked-into session (E2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("unbound-sessions");
  const cardB = railCardByTitle(page, "marker-b");
  await cardB.click();
  await expect(cardB).toHaveAttribute("aria-current", "true");

  const terminal = terminalRegion(page, "marker-b");
  await expect(terminal).toBeVisible();
  await terminal.click();

  // The marker is a rail-only cue, orthogonal to keyboard focus (design decision,
  // Overview) — clicking into the terminal must not move it back or clear it.
  await expect(cardB).toHaveAttribute("aria-current", "true");
  await expect(currentRailCard(page)).toHaveCount(1);
});

test("Opt+Cmd+2 moves the marker to the rail's second card (REQ-3)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("unbound-sessions");
  const cardA = railCardByTitle(page, "marker-a");
  const cardB = railCardByTitle(page, "marker-b");
  await expect(cardA).toHaveAttribute("aria-current", "true");
  await expect(page.locator('#sessions [data-testid="session-card"]').nth(1)).toHaveText(
    /marker-b/,
  );

  await page.keyboard.press("Alt+Meta+Digit2");

  await expect(cardB).toHaveAttribute("aria-current", "true");
  await expect(cardA).not.toHaveAttribute("aria-current", "true");
  await expect(currentRailCard(page)).toHaveCount(1);
});

test(".card.current renders on --bg-hover with an --edge ring without hovering, and carries no action row (REQ-2, plan rail-card-organise REQ-6)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("unbound-sessions");
  const card = railCardByTitle(page, "marker-a");
  await expect(card).toHaveAttribute("aria-current", "true");

  // Move the mouse well away from the card so `:hover` cannot also explain the
  // ground/ring/reveal — the marker's own styling must hold on its own merits.
  await page.mouse.move(0, 0);

  const bgHover = await tokenColor(page, "--bg-hover", "background-color");
  const edge = await tokenColor(page, "--edge", "color");
  await expect(card).toHaveCSS("background-color", bgHover);
  const outline = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.outlineColor, style: cs.outlineStyle, width: cs.outlineWidth };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBe("1px");
  // Resolve the ring's rgb() the same way `tokenColor` does, so the string
  // comparison holds regardless of the browser's own hex<->rgb normalization.
  expect(outline.color).toBe(edge);

  // The row this once showed on the current card is gone from every card (Stop, Resume and
  // Remove live in the right-click menu).
  await expect(card.locator(".acts-row")).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^(Stop|End|Resume|Remove)/ })).toHaveCount(0);
});
