// card-location — the display properties of plan stale-dirs-models-branches (REQ-10 to
// REQ-13, REQ-16) and its review cycles, re-levelled from web/e2e/card-location.spec.ts on
// 2026-10-20 (plans/_audit/test-audit-2026-10-20-relevel.md): what a rail card and the Focus
// header show for a session whose names are long, whose Claude is in another checkout, or
// whose window is narrow. Nothing here changes state: the density comes from the fixture's
// prefs (`long-names-*`, `moved-to-worktree-*`), the moved and ended sessions from the
// `focus-header-*` scenarios, and the Focus header is opened by clicking a card, which
// touches no API.
import {
  addedCountSuffix,
  ANCHOR_GAP,
  EDGE_GAP,
  expectLocationPanel,
  headerFolderLine,
  hoverReadout,
  leaveReadout,
  locationPanel,
  nameEllipsized,
  type PanelGeometry,
  panelGeometry,
  panelPattern,
  type PanelRow,
  suffixProblems,
} from "./helpers/added-dirs";
import {
  cardBranch,
  cardFolder,
  cardMoved,
  cardMovedBranch,
  cardMovedFolder,
  cardMovedLead,
  mainheadBranch,
  mainheadClaudeAt,
  mainheadFitProblems,
  mainheadFolder,
  mainheadLoc,
  mainheadMeta,
  mainheadModel,
  mainheadTitleEllipsized,
} from "./helpers/card-location";
import { focusSession } from "./helpers/focus";
import {
  type Dashboard,
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  type Session,
  test,
} from "./helpers/harness";
import { computedColor, lineGeometry, tokenColor } from "./helpers/style";
import { sessionTitled } from "./helpers/usage";

/** The rail's cards (`#sessions`), never the Tiles strip's copy of the same session. */
function railCards(page: Page): Locator {
  return page.locator("#sessions").getByTestId("session-card");
}

/** The one session a single-session fixture carries, with the repo it must have. */
function onlySession(fixture: RenderFixture): Session {
  const [session] = fixture.snapshot.sessions;
  expect(fixture.snapshot.sessions).toHaveLength(1);
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

/** A checkout's name and branch — every scenario here is on a born branch, never detached. */
function named(repo: { name: string; branch: string | null } | null, what: string) {
  if (!repo || repo.branch === null) throw new Error(`fixture ${what} has no repo on a branch`);
  return { name: repo.name, branch: repo.branch };
}

function repoOf(session: Session): { name: string; branch: string } {
  return named(session.repo, `session ${session.id}`);
}

function movedRepoOf(session: Session): { name: string; branch: string } {
  return named(session.claudeLocation?.repo ?? null, `session ${session.id}'s Claude location`);
}

function modelIdOf(session: Session): string {
  if (!session.model) throw new Error(`fixture session ${session.id} has no model`);
  return session.model.id;
}

test("the ↳ glyph is --fg-muted and the ↳ text --fg-dim, on the rail card and in the Focus header, never a state colour (REQ-16)", async ({
  page,
  dashboard,
}) => {
  // The ↳ block hides first as the header narrows (REQ-2 a), and with the uncapped readout
  // (REQ-1) the repo's row no longer fits beside the cluster in the default 1280px window.
  await page.setViewportSize({ width: 1400, height: 720 });
  const fixture = await dashboard.open("moved-to-worktree");
  onlySession(fixture);
  const card = railCards(page);
  await card.click();

  await expect(cardMoved(card)).toBeVisible();
  await expect(mainheadClaudeAt(page)).toBeVisible();

  // The live token, resolved by a probe element: the computed colour of
  // `color: var(--token)` is what the page's own cascade produces for that variable.
  const muted = await tokenColor(page, "--fg-muted");
  const dim = await tokenColor(page, "--fg-dim");
  expect(muted).not.toBe(dim);

  await expect.poll(() => computedColor(cardMovedLead(card))).toBe(muted);
  await expect.poll(() => computedColor(cardMovedFolder(card))).toBe(dim);
  await expect.poll(() => computedColor(cardMovedBranch(card))).toBe(dim);
  await expect.poll(() => computedColor(mainheadClaudeAt(page).locator(".lead"))).toBe(muted);
  await expect.poll(() => computedColor(mainheadClaudeAt(page).locator(".rf"))).toBe(dim);
  await expect.poll(() => computedColor(mainheadClaudeAt(page).locator(".rb"))).toBe(dim);
});

// 60-character folder and 80-character branch (plan edge case 24, E11): the `long-names`
// scenarios carry them, and each test proves the lengths before relying on them.
const LONG_NAMES: Record<"comfortable" | "compact" | "expanded", string> = {
  comfortable: "long-names",
  compact: "long-names-compact",
  expanded: "long-names-expanded",
};

async function openLongNames(
  page: Page,
  dashboard: Dashboard,
  density: keyof typeof LONG_NAMES,
): Promise<{ card: Locator; session: Session; repo: { name: string; branch: string } }> {
  const fixture = await dashboard.open(LONG_NAMES[density]);
  await expect(page.locator("body")).toHaveAttribute("data-rail-density", density);
  const session = onlySession(fixture);
  const repo = repoOf(session);
  expect(repo.name).toHaveLength(60);
  expect(repo.branch).toHaveLength(80);
  const card = railCards(page);
  await expect(cardFolder(card)).toHaveText(`${repo.name} /`);
  await expect(cardBranch(card)).toHaveText(repo.branch);
  return { card, session, repo };
}

for (const density of ["comfortable", "expanded"] as const) {
  test(`in ${density} density the rail card's folder and branch sit on two lines and each truncates at the end on its own, with the full text on hover (E10, REQ-10)`, async ({
    page,
    dashboard,
  }) => {
    const { card, repo } = await openLongNames(page, dashboard, density);

    await expect
      .poll(
        async () => {
          const rf = await lineGeometry(cardFolder(card));
          const rb = await lineGeometry(cardBranch(card));
          return rb.top >= rf.bottom - 0.5;
        },
        { message: "the branch line sits below the folder line" },
      )
      .toBe(true);

    for (const line of [cardFolder(card), cardBranch(card)]) {
      const g = await lineGeometry(line);
      expect(g.textOverflow).toBe("ellipsis");
      expect(g.whiteSpace).toBe("nowrap");
      expect(g.overflow).toBe("hidden");
      // Truly clipped: the full text is wider than the line that shows it.
      expect(g.scrollWidth).toBeGreaterThan(g.clientWidth);
    }

    await expect(card.locator(".r2")).toHaveAttribute("title", `${repo.name} / ${repo.branch}`);
  });
}

test("in compact density the rail card's folder and branch stay on one line, clipped inside the card (E10, REQ-11, edge case 26)", async ({
  page,
  dashboard,
}) => {
  const { card } = await openLongNames(page, dashboard, "compact");

  const metrics = await card.locator(".r2").evaluate((r2) => {
    const rf = r2.querySelector(".rf");
    const rb = r2.querySelector(".rb");
    if (!rf || !rb) throw new Error("missing .rf/.rb");
    // .r2 computes `line-height: normal` (parseFloat gives NaN), so one line's height is
    // measured from a probe in the card's own font rather than read from the style.
    const probe = document.createElement("span");
    probe.textContent = "x";
    probe.style.whiteSpace = "nowrap";
    r2.appendChild(probe);
    const lineHeight = probe.getBoundingClientRect().height;
    probe.remove();
    const r2box = r2.getBoundingClientRect();
    const rfBox = rf.getBoundingClientRect();
    const rbBox = rb.getBoundingClientRect();
    const clipped = [r2, rf, rb].filter(
      (el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth,
    ).length;
    return {
      lineHeight,
      r2Height: r2box.height,
      sameLine: rbBox.top < rfBox.bottom && rfBox.top < rbBox.bottom,
      rbAfterRf: rbBox.left >= rfBox.right - 1,
      rbInsideR2: rbBox.right <= r2box.right + 0.5,
      clipped,
    };
  });
  expect(metrics.sameLine).toBe(true);
  expect(metrics.rbAfterRf).toBe(true);
  expect(metrics.r2Height).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
  expect(metrics.rbInsideR2).toBe(true);
  expect(metrics.clipped).toBeGreaterThan(0);
});

test("with a 60-character folder and an 80-character branch at 2000x1000 the Focus header shows each line whole, uncapped, and the model is not clipped (E11, REQ-13; caps removed by plan title-crop-stop-resume-button REQ-1)", async ({
  page,
  dashboard,
}) => {
  await page.setViewportSize({ width: 2000, height: 1000 });
  const { card, session, repo } = await openLongNames(page, dashboard, "comfortable");
  await card.click();

  await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
  await expect(mainheadBranch(page)).toHaveText(repo.branch);
  // The bind named the model and no status line has confirmed a display name, so the
  // header carries the full id plus the unreported marker — longer than any display name.
  await expect(mainheadModel(page)).toHaveText(`${modelIdOf(session)} (…)`);

  const model = mainheadModel(page);
  const modelMetrics = await model.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    right: el.getBoundingClientRect().right,
    metaRight: (el.closest(".meta") as HTMLElement).getBoundingClientRect().right,
  }));
  expect(modelMetrics.scrollWidth).toBeLessThanOrEqual(modelMetrics.clientWidth);
  expect(modelMetrics.right).toBeLessThanOrEqual(modelMetrics.metaRight + 0.5);

  // No cap (plan title-crop-stop-resume-button, REQ-1): at a 1700 px header, with room to
  // spare, each line is as wide as its own text. The oracle is the line's max-content
  // width, measured on a clone in the line's own font; it is re-read with the line
  // inside the poll, so a stale or capped display times out instead of passing.
  const uncapped = async (cls: ".rf" | ".rb") =>
    await mainheadMeta(page)
      .locator(`.loc .repo ${cls}`)
      .evaluate((el) => {
        const probe = el.cloneNode(true) as HTMLElement;
        probe.style.cssText =
          "position:absolute;visibility:hidden;max-width:none;width:max-content;overflow:visible;text-overflow:clip";
        el.after(probe);
        const natural = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          actual: el.getBoundingClientRect().width,
          natural,
          clipped: el.scrollWidth > el.clientWidth,
        };
      });
  await expect
    .poll(async () => {
      const rf = await uncapped(".rf");
      const rb = await uncapped(".rb");
      return {
        rfClipped: rf.clipped,
        rbClipped: rb.clipped,
        rfWhole: rf.actual >= rf.natural - 1.5,
        rbWhole: rb.actual >= rb.natural - 1.5,
      };
    })
    .toEqual({ rfClipped: false, rbClipped: false, rfWhole: true, rbWhole: true });
});

// The Focus header at every window width (kb:adr/focus-model-never-truncates-name-blocks-give-way,
// kb:adr/focus-mainhead-wraps-to-second-row-when-narrow). The full model id is on the header
// because the bind names it and no status line has confirmed a display name. The invariants
// are asserted, never the pixel at which the header wraps or a name block gives way: the
// model whole, every name block whole, the repo block on `.loc`'s first line (the developer's
// decision: the header wraps before the repo block drops below its floor, so narrowing never
// hides it), no blank `.loc` at any width (review cycle 4: not for a `↳` block that gave way,
// nor for a folder line under the floor), and End, Resume and Remove on screen.
//
// Each `focus-header-<names>` scenario holds one session per state on the same checkout, all
// titled with 65 characters so that the title is ellipsized at the narrow widths, where a
// blank `.loc` would cost the title room; the tests prove it was clipped there.
type NameSet = "long" | "short" | "tiny";
const NAME_SET_LABEL: Record<NameSet, string> = {
  long: "60-character folder and 80-character branch names",
  short: "short folder and branch names",
  tiny: "folder and branch lines under the 8-character floor",
};
type FitState = "unmoved" | "moved" | "ended";

/** The fixture session in `state`: dead, moved into another checkout, or neither. */
function fitSession(fixture: RenderFixture, state: FitState): Session {
  const matches = fixture.snapshot.sessions.filter((s) => {
    if (state === "ended") return !s.alive;
    if (state === "moved") return s.alive && s.claudeLocation !== null;
    return s.alive && s.claudeLocation === null;
  });
  const [session] = matches;
  expect(matches).toHaveLength(1);
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

/** The rail card in `state` — the three cards share one title, so the state picks it. */
function fitCard(page: Page, state: FitState): Locator {
  const cards = railCards(page);
  const shownMoved = page.locator(".r2c:not([hidden])");
  if (state === "ended") return cards.and(page.locator(".ended"));
  const alive = cards.and(page.locator(":not(.ended)"));
  return state === "moved"
    ? alive.filter({ has: shownMoved })
    : alive.filter({ hasNot: shownMoved });
}

/** The name set's fixture at 1280 px, Focus on the session in `state`, its header read. */
async function openFitHeader(
  page: Page,
  dashboard: Dashboard,
  names: NameSet,
  state: FitState,
): Promise<{ modelId: string }> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fixture = await dashboard.open(`focus-header-${names}`);
  const session = fitSession(fixture, state);
  const repo = repoOf(session);
  const modelId = modelIdOf(session);
  if (names === "long") {
    expect(repo.name).toHaveLength(60);
    expect(repo.branch).toHaveLength(80);
  }
  if (names === "tiny") expect(repo.name.length).toBeLessThan(8);
  expect(session.title?.length).toBe(65);

  const card = fitCard(page, state);
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(mainheadFolder(page)).toHaveText(`${repo.name} /`);
  await expect(mainheadBranch(page)).toHaveText(repo.branch);

  if (state === "moved") {
    const moved = movedRepoOf(session);
    await expect(cardMoved(card)).toBeVisible();
    await expect(mainheadClaudeAt(page)).not.toHaveAttribute("hidden");
    await expect(mainheadClaudeAt(page).locator(".rf")).toHaveText(`${moved.name} /`);
    await expect(mainheadClaudeAt(page).locator(".rb")).toHaveText(moved.branch);
  } else if (state === "ended") {
    await expect(mainheadMeta(page).locator(".ended-at")).toBeVisible();
  } else {
    await expect(mainheadClaudeAt(page)).toHaveAttribute("hidden");
  }
  return { modelId };
}

async function assertFocusHeaderFits(
  page: Page,
  width: number,
  state: FitState,
  modelId: string,
): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  // Plan effort REQ-6: a bound session that has posted no status line reads `(…)` after its
  // model while alive, and a dead one that never reported reads the model alone — the
  // brackets are part of the model that never truncates.
  await expect(mainheadModel(page)).toHaveText(state === "ended" ? modelId : `${modelId} (…)`);
  await expect
    .poll(() => mainheadFitProblems(page), {
      message: `${state} header layout at ${width}px`,
    })
    .toEqual([]);
  if (width <= 1024) {
    // The blank-.loc check only means something while the title is clipped: prove it was,
    // so the check above was not true by default. A 65-character title cannot fit beside
    // the model, the repo block, the surface switch and the actions in 1024 px.
    await expect
      .poll(() => mainheadTitleEllipsized(page), {
        message: `the title is ellipsized at ${width}px, so the blank-.loc check applied`,
      })
      .toBe(true);
  }
  // Not a pixel breakpoint: a window too narrow for one row gets a second one, so the
  // header grows rather than a control leaving the screen.
  // The header holds one Session actions ⋯ button and no Stop, Resume or Remove
  // (plan remove-unread-right-click-1, REQ-4), whatever the session's state.
  await expect(
    page.locator("#mainhead").getByRole("button", { name: "Session actions", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.locator("#mainhead").getByRole("button", { name: /^(Stop|Resume|Remove)$/ }),
  ).toHaveCount(0);
}

for (const width of [1280, 1024, 960, 900, 800, 700]) {
  for (const state of ["unmoved", "moved", "ended"] as const) {
    test(`at ${width}px the Focus header of a session that is ${state}, with 60-character folder and 80-character branch names never clips the model, keeps every name block whole and keeps the Session actions button on screen (REQ-13, REQ-4)`, async ({
      page,
      dashboard,
    }) => {
      const { modelId } = await openFitHeader(page, dashboard, "long", state);
      await assertFocusHeaderFits(page, width, state, modelId);
    });

    test(`at ${width}px the Focus header of a session that is ${state}, with short folder and branch names keeps the repo block on its first line, no blank beside an ellipsized title, the model whole and End, Resume and Remove on screen (REQ-13, review cycle 3)`, async ({
      page,
      dashboard,
    }) => {
      const { modelId } = await openFitHeader(page, dashboard, "short", state);
      await assertFocusHeaderFits(page, width, state, modelId);
    });

    test(`at ${width}px the Focus header of a session that is ${state}, with folder and branch lines under the 8-character floor keeps .loc no wider than what it shows, the model whole and End, Resume and Remove on screen (REQ-13, review cycle 4)`, async ({
      page,
      dashboard,
    }) => {
      const { modelId } = await openFitHeader(page, dashboard, "tiny", state);
      await assertFocusHeaderFits(page, width, state, modelId);
    });
  }
}

// The repo readout never comes and goes as the window changes (the developer's decision,
// review cycle 3: "narrowing never brings it back"). One session, the window swept from wide
// to narrow and back in 16 px steps: at every width the same invariants hold, which includes
// the repo block on `.loc`'s first line. The widths around where the header wraps, where
// cycle 3's browser review saw the repo block vanish at 1024-976 and return at 975, are
// inside the sweep without the test naming a breakpoint.
for (const nameSet of ["long", "short", "tiny"] as const) {
  for (const state of ["unmoved", "moved"] as const) {
    test(`sweeping the window from 1440px to 700px and back, the Focus header of a session that is ${state}, with ${NAME_SET_LABEL[nameSet]}, shows its repo block on its first line at every width and never leaves blank in .loc (REQ-13, review cycles 3 and 4)`, async ({
      page,
      dashboard,
    }) => {
      await openFitHeader(page, dashboard, nameSet, state);

      const widths: number[] = [];
      for (let w = 1440; w >= 700; w -= 16) widths.push(w);
      const sweep = [...widths, ...[...widths].reverse()];
      let ellipsizedAt = 0;
      for (const width of sweep) {
        await page.setViewportSize({ width, height: 800 });
        await expect
          .poll(() => mainheadFitProblems(page), {
            message: `${state} header layout at ${width}px in the sweep`,
          })
          .toEqual([]);
        if (await mainheadTitleEllipsized(page)) ellipsizedAt += 1;
      }
      // The blank check applied across the sweep: the title was clipped somewhere in it,
      // so the sweep was not silent about the Minor it guards. Plan
      // title-crop-stop-resume-button (REQ-2) makes the title give way last, after the
      // readout is at its floor, so how much of the sweep clips it depends on how long the
      // readout is: with the 60-character names the readout reaches its floor early and the
      // title clips over a quarter of the sweep as before; with short names the title
      // clips only in the narrowest windows, where the 65-character title cannot fit even
      // on its own row.
      expect(ellipsizedAt).toBeGreaterThan(0);
      if (nameSet === "long") expect(ellipsizedAt).toBeGreaterThan(sweep.length / 4);
    });
  }
}

const MOVED_BY_DENSITY: Record<"comfortable" | "compact" | "expanded", string> = {
  comfortable: "moved-to-worktree",
  compact: "moved-to-worktree-compact",
  expanded: "moved-to-worktree-expanded",
};

for (const density of ["comfortable", "compact", "expanded"] as const) {
  test(`in ${density} density the rail card's ↳ block lines are exactly as tall as the repo block's lines (REQ-12, review cycle 2 Minor 1)`, async ({
    page,
    dashboard,
  }) => {
    const fixture = await dashboard.open(MOVED_BY_DENSITY[density]);
    await expect(page.locator("body")).toHaveAttribute("data-rail-density", density);
    const session = onlySession(fixture);
    const repo = repoOf(session);
    const moved = movedRepoOf(session);

    const card = railCards(page);
    await expect(cardMovedFolder(card)).toHaveText(`${moved.name} /`);
    await expect(cardMovedBranch(card)).toHaveText(moved.branch);
    await expect(cardBranch(card)).toHaveText(repo.branch);

    const heights = async () =>
      await card.evaluate((el) => {
        const h = (sel: string) => {
          const node = el.querySelector(sel);
          if (!node) throw new Error(`missing ${sel}`);
          return node.getBoundingClientRect().height;
        };
        return {
          r2: h(".r2"),
          r2c: h(".r2c"),
          rf: h(".r2 .rf"),
          movedRf: h(".r2c .rf"),
          rb: h(".r2 .rb"),
          movedRb: h(".r2c .rb"),
        };
      });
    // Re-read both sides inside the retry: a layout still settling must time out, not
    // pass on a stale pair.
    await expect
      .poll(async () => {
        const g = await heights();
        return {
          block: Math.abs(g.r2c - g.r2) <= 0.5,
          folder: Math.abs(g.movedRf - g.rf) <= 0.5,
          branch: Math.abs(g.movedRb - g.rb) <= 0.5,
          measured: g.r2 > 0 && g.rf > 0 && g.rb > 0,
        };
      })
      .toEqual({ block: true, folder: true, branch: true, measured: true });
  });
}

// ---------------------------------------------------------------------------------------
// Plan see-added-dirs — REQ-6, REQ-7, REQ-9, W2, W3, W4 and edge case 15: what the Focus
// header shows for a session's `addedDirs` — the `+N` suffix after the folder name, the
// hover panel listing Location (and the ↳ row while Claude is in an added checkout) then
// every added directory with its folder, branch and path, and where the panel sits when its
// rows do or do not fit under the readout. Re-levelled on 2026-10-20 from
// web/e2e/added-dirs.spec.ts (plans/_audit/relevel/misc-core.md); the lists come from the
// `added-dirs-*` scenarios, whose branches the daemon read from real checkouts when the
// fixture was recorded, and the panel opens on a real pointer path. The journeys — a status
// post changing the list, a checkout under the poll, End, liveness, restart, the /clear
// pair — stay in web/e2e/added-dirs.spec.ts.

/** The row the panel shows for one wire entry: its folder (the basename for a plain
 * directory), its branch when it is a checkout, and its path. */
function panelRowOf(entry: {
  directory: string;
  repo: { name: string; branch: string | null } | null;
}): PanelRow {
  const folder = entry.repo?.name ?? entry.directory.slice(entry.directory.lastIndexOf("/") + 1);
  return { folder, branch: entry.repo?.branch ?? null, path: entry.directory };
}

/** The launch checkout's row for a fixture session. */
function launchRowOf(session: Session): PanelRow {
  const { name, branch } = repoOf(session);
  return { folder: name, branch, path: session.directory };
}

test("hovering the header readout opens a tooltip listing Location then Added directories · 2 with each folder, branch and path, and moving away closes it (E2, REQ-7, REQ-9, W2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("added-dirs-two");
  const session = onlySession(fixture);
  await focusSession(page, "ad-two");
  await expect(addedCountSuffix(page)).toHaveText("+2");

  // The wire's two checkouts, as the daemon read them from disk when the fixture was
  // recorded: the second on its own `feature-x` branch.
  expect(session.addedDirs.map((d) => d.repo?.branch)).toEqual(["main", "feature-x"]);

  // The readout's plain `title` is replaced by the panel (REQ-7, W2).
  await expect(mainheadLoc(page)).not.toHaveAttribute("title");

  await expectLocationPanel(page, {
    launch: launchRowOf(session),
    added: session.addedDirs.map(panelRowOf),
  });

  // Closed on leave, open on hover, and a tooltip that never takes a click, appended to the body.
  await leaveReadout(page);
  await expect(locationPanel(page)).toHaveCount(0);
  await hoverReadout(page);
  const panel = locationPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("pointer-events", "none");
  expect(await panel.evaluate((el) => el.parentElement === document.body)).toBe(true);
  await leaveReadout(page);
  await expect(locationPanel(page)).toHaveCount(0);
});

test("a session that has reported no directories has no suffix and a panel showing Location alone, with no title on the readout (E2, REQ-7, W2, States: No data yet)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const session = sessionTitled(fixture, "Alpha");
  expect(session.addedDirs).toEqual([]);
  await focusSession(page, "Alpha");
  const { name } = repoOf(session);

  await expect(headerFolderLine(page)).toHaveText(`${name} /`);
  await expect(addedCountSuffix(page)).toHaveCount(0);
  await expect(mainheadLoc(page)).not.toHaveAttribute("title");
  await expectLocationPanel(page, { launch: launchRowOf(session), added: [] });
});

test("while Claude is in an added checkout the panel lists the ↳ row and the added list together (REQ-7, W3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("added-dirs-moved");
  const session = onlySession(fixture);
  const moved = session.claudeLocation;
  if (!moved) throw new Error("added-dirs-moved: Claude is not in another checkout");
  // The move is into the first added checkout.
  expect(moved.directory).toBe(session.addedDirs[0]?.directory);
  await focusSession(page, "ad-two");

  await expect(addedCountSuffix(page)).toHaveText("+2");
  await expectLocationPanel(page, {
    launch: launchRowOf(session),
    moved: panelRowOf(moved),
    added: session.addedDirs.map(panelRowOf),
  });
});

test("a long folder name ellipsizes before the +N suffix, which stays fully visible and the header keeps its fit invariants at every width (W4, REQ-6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("added-dirs-long");
  const session = onlySession(fixture);
  expect(repoOf(session).name).toBe("long-folder-name-for-wrapping-".repeat(2));
  expect(session.addedDirs).toHaveLength(2);
  await focusSession(page, "ad-two");
  await expect(addedCountSuffix(page)).toHaveText("+2");

  let ellipsizedAtNarrowest = false;
  // 600 px is the floor every existing header sweep stops at (`sweepWidths`); below it the
  // header overflows with no suffix at all (Stop and Remove past the viewport).
  const widths = [1280, 1024, 768, 600];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => suffixProblems(page), { message: `suffix at ${width}px` }).toEqual([]);
    await expect
      .poll(() => mainheadFitProblems(page), { message: `header fit at ${width}px` })
      .toEqual([]);
    if (width === widths[widths.length - 1]) ellipsizedAtNarrowest = await nameEllipsized(page);
  }
  // The checks above only mean something where the name really was cut short.
  expect(ellipsizedAtNarrowest).toBe(true);
});

// --- Edge case 15, as amended (decisions/location-panel-overflow, outcome B): the panel lists
// every directory; past what fits below the readout it moves to the top of the viewport. ---

/** Opens the panel on the `added-dirs-plain-<n>` session, whose `n` added directories are
 * plain (no branch) with paths long enough to wrap in the panel, and returns its geometry. */
async function openPanelWithDirs(
  page: Page,
  dashboard: Dashboard,
  n: number,
): Promise<PanelGeometry> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fixture = await dashboard.open(`added-dirs-plain-${n}`);
  const session = onlySession(fixture);
  expect(session.addedDirs).toHaveLength(n);
  expect(session.addedDirs.every((d) => d.repo === null)).toBe(true);
  await focusSession(page, `ad-plain-${n}`);
  await expect(addedCountSuffix(page)).toHaveText(`+${n}`);
  const expected = {
    launch: launchRowOf(session),
    added: session.addedDirs.map(panelRowOf),
  };
  let geometry: PanelGeometry | undefined;
  await expect(async () => {
    await hoverReadout(page);
    // Every directory, in wire order, and nothing after the last one.
    await expect(locationPanel(page)).toHaveText(panelPattern(expected), { timeout: 2_000 });
    geometry = await panelGeometry(page);
  }).toPass({ timeout: 15_000 });
  await expect(locationPanel(page)).not.toContainText(/\+\s*\d+\s*more/i);
  await expect(locationPanel(page).locator(".dr")).toHaveCount(n + 1);
  if (geometry === undefined) throw new Error("the panel was never measured");
  return geometry;
}

test("a few added directories fit below the readout, so the panel sits under it inside the viewport (edge case 15, REQ-7)", async ({
  page,
  dashboard,
}) => {
  const g = await openPanelWithDirs(page, dashboard, 3);
  // The rows fit below the readout, so the panel is placed there: under it, not over it.
  expect(g.readout.bottom + ANCHOR_GAP + g.panel.height).toBeLessThanOrEqual(
    g.viewportHeight - EDGE_GAP,
  );
  expect(g.panel.top).toBeGreaterThanOrEqual(g.readout.bottom);
  expect(g.panel.bottom).toBeLessThanOrEqual(g.viewportHeight);
  for (const row of g.rows) expect(row.bottom).toBeLessThanOrEqual(g.viewportHeight);
});

test("fifteen added directories do not fit below the readout, so the panel moves to the top of the viewport and still shows every row inside it (edge case 15, REQ-7, kb:adr/focus-location-panel-lists-every-row)", async ({
  page,
  dashboard,
}) => {
  const g = await openPanelWithDirs(page, dashboard, 15);
  // Not vacuous: the panel really is too tall for the room under the readout.
  expect(g.readout.bottom + ANCHOR_GAP + g.panel.height).toBeGreaterThan(
    g.viewportHeight - EDGE_GAP,
  );
  // It moved to the top edge rather than staying below, and nothing runs off the bottom.
  expect(g.panel.top).toBeCloseTo(EDGE_GAP, 0);
  expect(g.panel.top).toBeLessThan(g.readout.top);
  expect(g.panel.bottom).toBeLessThanOrEqual(g.viewportHeight);
  expect(g.rows).toHaveLength(16);
  for (const row of g.rows) {
    expect(row.top).toBeGreaterThanOrEqual(0);
    expect(row.bottom).toBeLessThanOrEqual(g.viewportHeight);
  }
});

test("twenty-two added directories are all listed in the panel, none capped and no +K more line (edge case 15, kb:adr/focus-location-panel-lists-every-row)", async ({
  page,
  dashboard,
}) => {
  // Past the viewport the lower rows drop off the screen, a recorded limit; what is asserted
  // is that the panel still holds every directory (`openPanelWithDirs` matches all 22 rows in
  // order, counts 23 `.dr` and rejects a `+K more` line).
  const g = await openPanelWithDirs(page, dashboard, 22);
  expect(g.rows).toHaveLength(23);
  expect(g.panel.top).toBeCloseTo(EDGE_GAP, 0);
});
