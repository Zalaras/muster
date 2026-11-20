// The diff viewer's journeys: the button following the checkout, opening and closing the viewer
// over each surface, what the two scopes list, the changed bar and its Refresh, an ended
// session, the terminal's refit, Tiles, polling per session, and the daemon going away. What the
// viewer shows for a given diff (layout, tokens, word highlight, folding, keys) is a render test
// (web/render/diff*.spec.ts); comments and ticks are diff-review.spec.ts.
//
// Fixture plan: `daemon` (fresh per test), as the plan's header says. Tests restart or kill the
// daemon, end a session, and assert on the daemon-global state a neighbour would disturb
// (auto-focus on "the only session", the persisted view).
//
// Claude Code is faked and barely involved: a session is the real `POST /api/sessions` bound
// with the measured enveloped `SessionStart`, and every change under review is real `git` or a
// file write in a scratch checkout the session was launched in. Authored before any of it is
// built: every test here asserts new behaviour and is collection-only at authoring.
import { cardMoved, hookMover, railCardByTitle } from "./helpers/card-location";
import {
  allFileFolds,
  anyDiffButton,
  barRefresh,
  barText,
  beforeLabels,
  bigRepo,
  branchOnlyRepo,
  buttonText,
  changedBar,
  changeTicks,
  cleanRepo,
  closeDiffButton,
  closeViewerButton,
  commentField,
  commentOnRow,
  commentRepo,
  commentsTab,
  COMMITTED_PATH,
  diffButton,
  endSession,
  FRESH_PATH,
  fileFold,
  fileHeader,
  filesTab,
  foldedChanges,
  getDiffBody,
  getDiffSummary,
  GONE_PATH,
  headBase,
  hoverRowPlus,
  launchBoundDiff,
  mainBase,
  NEW_NAME,
  OLD_NAME,
  openDiff,
  openDiffButton,
  progress,
  REVIEW_COUNTS,
  REVIEW_PATH,
  resetButton,
  scopeButton,
  seedComment,
  shownLines,
  siblingWorktree,
  standardRepo,
  STANDARD,
  SummaryPolls,
  summaryText,
  terminalFitProblems,
  tickRepo,
  toolbarRefresh,
  toolbarSummary,
  viewButton,
  viewer,
  writeIn,
  appText,
  APP_PATH,
  BIG_COUNTS,
  BLOB_PATH,
  cardHeading,
  lineRow,
  TICK_COUNTS,
} from "./helpers/diff";
import { focusedNode, tagNode } from "./helpers/focus-header";
import { git, scratchPlainDir, type ScratchRepo } from "./helpers/card-location";
import { expect, settleFor, test } from "./helpers/fixtures";
import type { Page, ScratchDaemon } from "./helpers/fixtures";
import { readerRegion } from "./helpers/reader";
import { sessionCard } from "./helpers/session";
import {
  mainheadSurfaceButton,
  shellSurfaceRegion,
  shellTmuxTarget,
  type SurfaceKind,
} from "./helpers/shell";
import { liveTile, TerminalSocketTracker, terminalRegion } from "./helpers/terminal";
import { parseSizenote } from "./helpers/terminal";

const cleanups: Array<() => Promise<void>> = [];

test.afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function track(repo: ScratchRepo): ScratchRepo {
  cleanups.push(repo.cleanup);
  return repo;
}

const SURFACES: SurfaceKind[] = ["claude", "shell", "docs"];

/** Selects `surface` in the Focus header and waits for it to show. */
async function selectSurface(page: Page, title: string, surface: SurfaceKind): Promise<void> {
  if (surface !== "claude") await mainheadSurfaceButton(page, surface).click();
  await expectSurface(page, title, surface);
}

/** `surface` is the one shown and the selected segment, and the viewer is not. */
async function expectSurface(page: Page, title: string, surface: SurfaceKind): Promise<void> {
  await expect(viewer(page)).toHaveCount(0);
  for (const kind of SURFACES) {
    await expect(mainheadSurfaceButton(page, kind)).toHaveAttribute(
      "aria-pressed",
      kind === surface ? "true" : "false",
    );
  }
  if (surface === "claude") await expect(terminalRegion(page, title)).toBeVisible();
  if (surface === "shell") await expect(shellSurfaceRegion(page, title)).toBeVisible();
  if (surface === "docs") await expect(readerRegion(page, title)).toBeVisible();
}

/** No segment of the surface switch is selected (INV-2). */
async function expectNoSegmentSelected(page: Page): Promise<void> {
  for (const kind of SURFACES) {
    await expect(mainheadSurfaceButton(page, kind)).toHaveAttribute("aria-pressed", "false");
  }
}

/** The Focus pane's fitted geometry equals tmux's window, both read afresh inside the retry. */
async function expectGeometryMatchesTmux(
  page: Page,
  daemon: ScratchDaemon,
  tmuxTarget: string,
): Promise<void> {
  const sizenote = page.getByText(/one live client/i);
  await expect
    .poll(async () => {
      const { cols, rows } = parseSizenote((await sizenote.textContent()) ?? "");
      const width = await daemon.tmuxDisplay(tmuxTarget, "#{window_width}");
      const height = await daemon.tmuxDisplay(tmuxTarget, "#{window_height}");
      return `${cols}x${rows} vs tmux ${width}x${height}`;
    })
    .toMatch(/^(\d+)x(\d+) vs tmux \1x\2$/);
}

test("changing a file in the launch checkout shows the diff button with its counts and reverting it removes the button, with no reload (E1, REQ-1, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await cleanRepo());
  const polls = new SummaryPolls(page);
  await page.goto(daemon.dashboardUrl);
  await page.evaluate(() => Reflect.set(window, "__noReload", true));
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e1");

  // A clean checkout with no comment has no button, once the daemon has answered about it.
  await expect.poll(() => polls.answered(session.id)).toBeGreaterThan(0);
  await expect(anyDiffButton(page)).toHaveCount(0);

  await writeIn(repo, APP_PATH, appText({ 3: "app line 03 EDITED" }));
  await expect(
    diffButton(page, buttonText({ counts: { files: 1, additions: 1, deletions: 1 } })),
  ).toBeVisible();

  await git(repo.path, "checkout", "--", APP_PATH);
  await expect(anyDiffButton(page)).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__noReload"))).toBe(true);
});

test("a session launched outside any git repository never shows the button after a file in its directory changes (E2, REQ-9, edge case 2)", async ({
  page,
  request,
  daemon,
}) => {
  const plain = track(await scratchPlainDir());
  const polls = new SummaryPolls(page);
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, plain, "diff-e2");

  await writeIn(plain, "notes.txt", "one\ntwo\n");
  // Hold for two more answers: the dashboard has asked since the file existed, and still no button.
  const seen = polls.answered(session.id);
  await expect.poll(() => polls.answered(session.id)).toBeGreaterThanOrEqual(seen + 2);
  await expect(anyDiffButton(page)).toHaveCount(0);
  expect((await getDiffSummary(page, daemon, session.id)).repo).toBe(false);
});

test("while Claude reports another checkout with its own changes, the button and the viewer show the launch checkout's only (E3, edge case 1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await cleanRepo());
  await writeIn(repo, APP_PATH, appText({ 3: "app line 03 EDITED" }));
  const other = await siblingWorktree(repo, "elsewhere");
  cleanups.push(other.cleanup);
  await writeIn(other, "README.md", "# changed elsewhere\n");
  await writeIn(other, "other-only.txt", "only in the other checkout\n");

  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e3");
  await expect(
    diffButton(page, buttonText({ counts: { files: 1, additions: 1, deletions: 1 } })),
  ).toBeVisible();

  await hookMover(request, daemon, "claude-diff-e3")(other.path);
  await expect(cardMoved(railCardByTitle(page, "diff-e3"))).toBeVisible();

  // A later change in the launch checkout still moves the counts: it is the one being read.
  await writeIn(repo, "late.txt", "late\n");
  const both = buttonText({ counts: { files: 2, additions: 2, deletions: 1 } });
  await expect(diffButton(page, both)).toBeVisible();

  await openDiff(page);
  await expect(fileFold(page, APP_PATH)).toBeVisible();
  await expect(fileFold(page, "late.txt")).toBeVisible();
  await expect(fileFold(page, "other-only.txt")).toHaveCount(0);
  await expect(fileFold(page, "README.md")).toHaveCount(0);
  await expect(allFileFolds(page)).toHaveCount(2);
});

test("clicking the button shows the viewer in place of the pane listing the changed files, and the button ends Close diff × with no surface selected (E4, REQ-2, REQ-10)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e4");
  await expect(terminalRegion(page, "diff-e4")).toBeVisible();

  const closed = diffButton(page, buttonText({ counts: STANDARD.uncommitted }));
  await expect(closed).toBeVisible();
  // The hover title states both scopes' counts.
  await expect(closed).toHaveAttribute("title", /\+4 −5/);
  await expect(closed).toHaveAttribute("title", /\+6 −5/);
  await expect(closed).toHaveAttribute("aria-pressed", "false");

  await closed.click();
  await expect(viewer(page)).toBeVisible();
  await expect(terminalRegion(page, "diff-e4")).toBeHidden();

  const open = diffButton(page, buttonText({ counts: STANDARD.uncommitted, open: true }));
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("aria-pressed", "true");
  await expect(scopeButton(page, "Uncommitted")).toHaveAttribute("aria-pressed", "true");
  await expectNoSegmentSelected(page);

  await expect(allFileFolds(page)).toHaveCount(STANDARD.uncommitted.files);
  for (const path of [APP_PATH, FRESH_PATH, GONE_PATH, BLOB_PATH]) {
    await expect(fileFold(page, path)).toBeVisible();
  }
  await expect(fileFold(page, new RegExp(`${OLD_NAME}\\s*→\\s*${NEW_NAME}`))).toBeVisible();
});

for (const surface of SURFACES) {
  test(`the button, Close diff viewer and Escape each close the viewer and return to the ${surface} surface it was opened from (E5, REQ-2, INV-2)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = track(await standardRepo());
    const title = `diff-e5-${surface}`;
    await page.goto(daemon.dashboardUrl);
    await launchBoundDiff(page, request, daemon, repo, title);
    await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
    await selectSurface(page, title, surface);

    await openDiff(page);
    await expectNoSegmentSelected(page);
    await closeDiffButton(page).click();
    await expectSurface(page, title, surface);

    await openDiff(page);
    await expectNoSegmentSelected(page);
    await closeViewerButton(page).click();
    await expectSurface(page, title, surface);

    await openDiff(page);
    await expectNoSegmentSelected(page);
    await page.keyboard.press("Escape");
    await expectSurface(page, title, surface);
  });
}

test("choosing a surface segment while the viewer is open closes it and shows that surface, each in turn (E6, REQ-2, INV-2)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e6");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();

  for (const surface of ["shell", "docs", "claude"] as const) {
    await openDiff(page);
    await expectNoSegmentSelected(page);
    await mainheadSurfaceButton(page, surface).click();
    await expectSurface(page, "diff-e6", surface);
  }
});

test("Uncommitted lists a modified, an untracked added, a deleted, a git mv renamed and a binary file as the daemon reads them (E7, REQ-3, REQ-11)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e7");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);

  // The daemon's own read of the same scope is the oracle for what each file is.
  const body = await getDiffBody(page, daemon, session.id, "uncommitted");
  const byPath = Object.fromEntries(body.files.map((f) => [f.path, f]));
  expect(byPath[APP_PATH]?.status).toBe("modified");
  expect(byPath[FRESH_PATH]?.status).toBe("added");
  expect(byPath[GONE_PATH]?.status).toBe("deleted");
  expect(byPath[NEW_NAME]).toMatchObject({ status: "renamed", oldPath: OLD_NAME });
  expect(byPath[BLOB_PATH]).toMatchObject({ status: "added", binary: true });

  await expect(toolbarSummary(page)).toHaveText(
    summaryText(STANDARD.uncommitted, await headBase(repo)),
  );
  await expect(allFileFolds(page)).toHaveCount(body.files.length);

  // Each header carries its path and counts; the rename reads old → new; the binary reads so.
  await expect(fileHeader(page, APP_PATH)).toContainText(/\+1\s*−1/);
  await expect(fileHeader(page, FRESH_PATH)).toContainText(/\+3\s*−0/);
  await expect(fileHeader(page, GONE_PATH)).toContainText(/\+0\s*−4/);
  await expect(fileFold(page, new RegExp(`${OLD_NAME}\\s*→\\s*${NEW_NAME}`))).toBeVisible();
  await expect(viewer(page).getByText("Binary file not shown")).toHaveCount(1);
  await expect(fileFold(page, COMMITTED_PATH)).toHaveCount(0);
});

test("Branch additionally lists a file changed only in a commit since main, against the merge base (E8, REQ-3)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e8");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);
  await expect(fileFold(page, COMMITTED_PATH)).toHaveCount(0);

  await scopeButton(page, "Branch").click();
  await expect(scopeButton(page, "Branch")).toHaveAttribute("aria-pressed", "true");
  await expect(scopeButton(page, "Uncommitted")).toHaveAttribute("aria-pressed", "false");
  await expect(fileFold(page, COMMITTED_PATH)).toBeVisible();
  await expect(toolbarSummary(page)).toHaveText(summaryText(STANDARD.branch, await mainBase(repo)));
  await expect(allFileFolds(page)).toHaveCount(STANDARD.branch.files);
});

test("a checkout whose only difference is a commit since main reads branch · counts and the viewer opens on Branch, with Uncommitted reading No changes (REQ-3, REQ-9, REQ-11)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await branchOnlyRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-branch-only");
  const counts = { files: 1, additions: 2, deletions: 0 };
  await expect(diffButton(page, buttonText({ branch: true, counts }))).toBeVisible();

  await openDiffButton(page).click();
  await expect(scopeButton(page, "Branch")).toHaveAttribute("aria-pressed", "true");
  await expect(scopeButton(page, "Uncommitted")).toHaveAttribute("aria-pressed", "false");
  await expect(toolbarSummary(page)).toHaveText(summaryText(counts, await mainBase(repo)));
  await expect(fileFold(page, COMMITTED_PATH)).toBeVisible();

  await scopeButton(page, "Uncommitted").click();
  await expect(viewer(page).getByText("No changes")).toBeVisible();
  await expect(toolbarSummary(page)).toContainText("0 files");
});

for (const view of ["Unified", "Split", "Review"] as const) {
  test(`with the ${view} view open, a changed checkout shows the bar naming what changed and the lines on screen stay put apart from the bar's height (E9, REQ-4, INV-1)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = track(await standardRepo());
    await page.goto(daemon.dashboardUrl);
    await launchBoundDiff(page, request, daemon, repo, `diff-e9-${view}`);
    await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
    await openDiff(page);
    await viewButton(page, view).click();
    await expect(viewButton(page, view)).toHaveAttribute("aria-pressed", "true");
    await expect(changedBar(page)).toHaveCount(0);

    const before = await shownLines(page);
    const anchor = fileFold(page, FRESH_PATH);
    const yBefore = (await anchor.boundingBox())?.y ?? Number.NaN;
    const summaryBefore = await toolbarSummary(page).textContent();

    // A new file, and a change to a file that is already shown.
    await writeIn(repo, "src/late.txt", "late arrival\n");
    await writeIn(repo, APP_PATH, appText({ 3: "app line 03 EDITED", 10: "app line 10 EDITED" }));
    await expect(changedBar(page)).toHaveText(barText("1 new file, 1 file changed"));

    expect(await shownLines(page)).toBe(before);
    await expect(fileFold(page, "src/late.txt")).toHaveCount(0);
    await expect(toolbarSummary(page)).toHaveText(summaryBefore ?? "");
    const barHeight = (await changedBar(page).boundingBox())?.height ?? Number.NaN;
    const yAfter = (await anchor.boundingBox())?.y ?? Number.NaN;
    expect(Math.abs(yAfter - yBefore - barHeight)).toBeLessThanOrEqual(2);
  });
}

test("the bar leaves the shown diff alone while a comment box holds text, a change is flipped to before and a file is folded (E9, REQ-4, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e9-busy");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();

  await fileFold(page, GONE_PATH).click();
  await expect(fileFold(page, GONE_PATH)).toHaveAttribute("aria-expanded", "false");
  await afterLabelsFirst(page).click();
  await expect(beforeLabels(page)).toHaveCount(1);
  await (await hoverRowPlus(page, "fresh beta")).click();
  await commentField(page).click();
  await page.keyboard.type("half a thought");
  await expect(commentField(page)).toHaveValue("half a thought");

  const before = await shownLines(page);
  await writeIn(repo, "src/late.txt", "late arrival\n");
  await expect(changedBar(page)).toHaveText(barText("1 new file"));

  expect(await shownLines(page)).toBe(before);
  await expect(commentField(page)).toHaveValue("half a thought");
  await expect(commentField(page)).toBeFocused();
  await expect(beforeLabels(page)).toHaveCount(1);
  await expect(fileFold(page, GONE_PATH)).toHaveAttribute("aria-expanded", "false");
});

function afterLabelsFirst(page: Page) {
  return viewer(page).getByText("after", { exact: true }).first();
}

test("a commit made while the viewer is open names the files that are no longer changed (E9, REQ-4, edge case 19)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e9-commit");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);

  await git(repo.path, "add", "-A");
  await git(repo.path, "commit", "-m", "land it");
  await expect(changedBar(page)).toHaveText(barText("5 files no longer changed"));
  await expect(allFileFolds(page)).toHaveCount(STANDARD.uncommitted.files);
  await expect(fileFold(page, APP_PATH)).toBeVisible();
});

test("the bar stays in view while the diff scrolls, and Refresh shows the new diff, keeps ticks, comments and place, and removes the bar (E10, REQ-4)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await bigRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e10");
  await expect(diffButton(page, buttonText({ counts: BIG_COUNTS }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();
  await expect(progress(page)).toHaveText("0 / 4 changes reviewed");

  await changeTicks(page).first().click();
  await expect(progress(page)).toHaveText("1 / 4 changes reviewed");
  await commentOnRow(page, "big line 125 altered", "keep this across a refresh");
  await expect(cardHeading(page, "Line 125")).toBeVisible();

  await writeIn(repo, "zz-late.txt", "late\n");
  await expect(changedBar(page)).toHaveText(barText("1 new file"));
  const barBefore = await changedBar(page).boundingBox();

  // Scroll with the wheel until the top of the file has left the screen.
  await viewer(page).hover();
  await page.mouse.wheel(0, 1600);
  await expect(lineRow(page, "big line 017")).not.toBeInViewport();
  await expect(changedBar(page)).toBeInViewport();
  const barScrolled = await changedBar(page).boundingBox();
  expect(
    Math.abs((barScrolled?.y ?? Number.NaN) - (barBefore?.y ?? Number.NaN)),
  ).toBeLessThanOrEqual(1);

  const anchor = lineRow(page, "big line 130 altered");
  await anchor.scrollIntoViewIfNeeded();
  await expect(anchor).toBeInViewport();
  await barRefresh(page).click();

  await expect(changedBar(page)).toHaveCount(0);
  await expect(fileFold(page, "zz-late.txt")).toBeVisible();
  await expect(progress(page)).toHaveText("1 / 5 changes reviewed");
  await expect(foldedChanges(page)).toHaveCount(1);
  await expect(cardHeading(page, "Line 125")).toBeVisible();
  await expect(viewer(page).getByText("keep this across a refresh")).toBeVisible();
  await expect(anchor).toBeInViewport();
});

test("with the viewer open across a daemon restart and no change to the checkout, no bar appears and the diff stays (E11, REQ-4, edge case 16)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  const polls = new SummaryPolls(page);
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e11");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);
  const before = await shownLines(page);
  const fingerprint = (await getDiffSummary(page, daemon, session.id)).uncommitted.fingerprint;

  await daemon.restart();
  const answered = polls.answered(session.id);
  await expect.poll(() => polls.answered(session.id)).toBeGreaterThanOrEqual(answered + 2);

  expect((await getDiffSummary(page, daemon, session.id)).uncommitted.fingerprint).toBe(
    fingerprint,
  );
  await expect(changedBar(page)).toHaveCount(0);
  await expect(
    diffButton(page, buttonText({ counts: STANDARD.uncommitted, open: true })),
  ).toBeVisible();
  expect(await shownLines(page)).toBe(before);
});

test("an ended session still shows the button and opens its diff with its comments, with no surface selected (E14, REQ-1, REQ-8, INV-2)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await commentRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e14");
  await seedComment(page, daemon, session.id, {
    id: "c-e14",
    path: REVIEW_PATH,
    line: 4,
    quote: ["delta four"],
    body: "kept on the ended session",
  });
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments: 1 }))).toBeVisible();

  await endSession(page, daemon, session.id);
  await expect(page.locator("#dead-surface")).toBeVisible();
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments: 1 }))).toBeVisible();

  await openDiff(page);
  await expectNoSegmentSelected(page);
  await expect(fileFold(page, REVIEW_PATH)).toBeVisible();
  await expect(cardHeading(page, "Line 4")).toBeVisible();
  await expect(viewer(page).getByText("kept on the ended session")).toBeVisible();
  await expect(commentsTab(page, 1)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator("#dead-surface")).toBeVisible();
  await expect(mainheadSurfaceButton(page, "claude")).toHaveAttribute("aria-pressed", "true");
});

for (const surface of ["claude", "shell"] as const) {
  test(`the ${surface} terminal refits to tmux's geometry with no clipped last row and no page scrollbar as the button appears, the viewer opens and closes, and the button goes (E16, REQ-22)`, async ({
    page,
    request,
    daemon,
  }) => {
    const repo = track(await cleanRepo());
    const title = `diff-e16-${surface}`;
    await page.goto(daemon.dashboardUrl);
    const session = await launchBoundDiff(page, request, daemon, repo, title);
    const label = surface === "claude" ? `Terminal: ${title}` : `Shell: ${title}`;
    const target = surface === "claude" ? session.tmuxTarget : shellTmuxTarget(session.id);
    await selectSurface(page, title, surface);

    const settled = async () => {
      await expectGeometryMatchesTmux(page, daemon, target);
      await expect.poll(() => terminalFitProblems(page, label)).toEqual([]);
    };
    await settled();

    await writeIn(repo, APP_PATH, appText({ 3: "app line 03 EDITED" }));
    await expect(anyDiffButton(page)).toBeVisible();
    await settled();

    await openDiff(page);
    await closeViewerButton(page).click();
    await expectSurface(page, title, surface);
    await settled();

    await git(repo.path, "checkout", "--", APP_PATH);
    await expect(anyDiffButton(page)).toHaveCount(0);
    await settled();
  });
}

test("a session left on the viewer shows its live terminal in its tile with no diff button anywhere, and the viewer again back in Focus (E17, REQ-23)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  const tracker = new TerminalSocketTracker(page);
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-e17");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);

  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(liveTile(page, "diff-e17")).toBeVisible();
  await expect(terminalRegion(page, "diff-e17")).toContainText("MUSTER-STUB-READY");
  await expect.poll(() => tracker.liveCount).toBe(1);
  await expect(anyDiffButton(page)).toHaveCount(0);
  await expect(viewer(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Focus" }).click();
  await expect(viewer(page)).toBeVisible();
  await expect(
    diffButton(page, buttonText({ counts: STANDARD.uncommitted, open: true })),
  ).toBeVisible();
  await expectNoSegmentSelected(page);
});

test("the dashboard asks for counts only for the focused session and only in Focus, and switching sessions shows only the focused one's diff (REQ-27, INV-5)", async ({
  page,
  request,
  daemon,
}) => {
  const repoA = track(await standardRepo());
  const repoB = track(await tickRepo());
  const polls = new SummaryPolls(page);
  await page.goto(daemon.dashboardUrl);
  const a = await launchBoundDiff(page, request, daemon, repoA, "diff-poll-a");
  const b = await launchBoundDiff(page, request, daemon, repoB, "diff-poll-b");

  // An API launch does not move focus: focus B, and its own counts show.
  await sessionCard(page, "diff-poll-b").click();
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS }))).toBeVisible();
  const aWhileB = polls.requested(a.id);
  await expect.poll(() => polls.requested(b.id)).toBeGreaterThanOrEqual(2);
  expect(polls.requested(a.id)).toBe(aWhileB);

  await sessionCard(page, "diff-poll-a").click();
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);
  await expect(fileFold(page, FRESH_PATH)).toBeVisible();

  const bAsked = polls.requested(b.id);
  const aAsked = polls.requested(a.id);
  await expect.poll(() => polls.requested(a.id)).toBeGreaterThanOrEqual(aAsked + 2);
  expect(polls.requested(b.id)).toBe(bAsked);

  // Focus B: a viewer of its own, none of A's files.
  await sessionCard(page, "diff-poll-b").click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS }))).toBeVisible();
  await openDiff(page);
  await expect(fileFold(page, APP_PATH)).toBeVisible();
  await expect(fileFold(page, FRESH_PATH)).toHaveCount(0);

  // Tiles asks about nobody.
  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  const asked = polls.totalRequested();
  await settleFor(page, 6_500);
  expect(polls.totalRequested()).toBe(asked);

  // Back in Focus, the focused session's viewer is still the one it was left on.
  await page.getByRole("button", { name: "Focus" }).click();
  await expect(viewer(page)).toBeVisible();
});

test("with musterd stopped the button keeps its counts and Refresh reads Couldn't read the diff: musterd unreachable, then works again once it is back (REQ-28, edge case 8)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-down");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);
  await expect(fileFold(page, APP_PATH)).toBeVisible();

  await daemon.kill();
  await toolbarRefresh(page).click();
  await expect(viewer(page).getByText("Couldn't read the diff: musterd unreachable")).toBeVisible();
  await expect(toolbarRefresh(page)).toBeVisible();
  await expect(anyDiffButton(page)).toBeVisible();

  await daemon.restart();
  await toolbarRefresh(page).click();
  await expect(viewer(page).getByText(/^Couldn't read the diff/)).toHaveCount(0);
  await expect(fileFold(page, APP_PATH)).toBeVisible();
  await expect(toolbarSummary(page)).toHaveText(
    summaryText(STANDARD.uncommitted, await headBase(repo)),
  );
});

test("the viewer's toolbar and side-panel controls keep focus and node identity across a real key press and a render tick (REQ-2, kb:lesson/select-rebuilt-every-tick-passed-selectoption)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await standardRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-focus");
  await expect(diffButton(page, buttonText({ counts: STANDARD.uncommitted }))).toBeVisible();
  await openDiff(page);

  // Scope and Refresh redraw the body once their reads answer; the next control is not tagged
  // until that redraw has landed, so a late one cannot replace the node under test.
  const controls: Array<{
    name: string;
    locator: () => ReturnType<typeof viewButton>;
    key: string;
    before?: () => Promise<void>;
    redrawn?: () => Promise<void>;
  }> = [
    { name: "view-split", locator: () => viewButton(page, "Split"), key: "Enter" },
    {
      name: "scope-branch",
      locator: () => scopeButton(page, "Branch"),
      key: "Space",
      redrawn: async () => {
        await expect(fileFold(page, APP_PATH)).toBeVisible();
      },
    },
    { name: "tab-comments", locator: () => commentsTab(page), key: "Enter" },
    { name: "tab-files", locator: () => filesTab(page), key: "Space" },
    {
      name: "refresh",
      locator: () => toolbarRefresh(page),
      key: "Enter",
      before: async () => {
        await tagNode(fileFold(page, APP_PATH), "pre-refresh");
      },
      redrawn: async () => {
        await expect(fileFold(page, APP_PATH)).not.toHaveAttribute("data-e2e-node", "pre-refresh");
        await expect(fileFold(page, APP_PATH)).toBeVisible();
      },
    },
    { name: "fold-app", locator: () => fileFold(page, APP_PATH), key: "Enter" },
  ];
  for (const { name, locator, key, before, redrawn } of controls) {
    await before?.();
    await tagNode(locator(), name);
    await locator().focus();
    expect(await focusedNode(page), `${name} focused`).toEqual({ tag: "BUTTON", node: name });

    await page.keyboard.press(key);
    expect(await focusedNode(page), `${name} after ${key}`).toEqual({ tag: "BUTTON", node: name });
    await redrawn?.();

    // The render tick itself is under test: a stays-unchanged hold.
    await settleFor(page, 1_400);
    expect(await focusedNode(page), `${name} after a tick`).toEqual({
      tag: "BUTTON",
      node: name,
    });
  }
});

test("the Review controls keep focus and node identity across a real key press and a render tick (REQ-15, kb:lesson/select-rebuilt-every-tick-passed-selectoption)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await tickRepo());
  await page.goto(daemon.dashboardUrl);
  await launchBoundDiff(page, request, daemon, repo, "diff-focus-review");
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();
  await expect(progress(page)).toHaveText("0 / 3 changes reviewed");

  const tick = viewer(page)
    .getByRole("checkbox", { name: `Mark ${APP_PATH} reviewed` })
    .first();
  await tagNode(tick, "file-tick");
  await tick.focus();
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "file-tick" });
  await page.keyboard.press("Space");
  await expect(progress(page)).toHaveText("3 / 3 changes reviewed");
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "file-tick" });
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "file-tick" });

  await tagNode(resetButton(page), "reset");
  await resetButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(progress(page)).toHaveText("0 / 3 changes reviewed");
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "reset" });
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "reset" });
});
