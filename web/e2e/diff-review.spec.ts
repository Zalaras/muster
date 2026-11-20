// The diff viewer's review journeys: comments and ticks written through the viewer, kept across
// a reload, a daemon restart and a second window, following the code when it moves, kept with an
// ended, resumed and restarted session and deleted with a removed one, and what a failed save
// does. What the viewer shows for a given comment or tick state (the box, the card, the folded
// change, the change map, the keys) is a render test (web/render/diff*.spec.ts).
//
// Fixture plan: `daemon` (fresh per test), as the plan's header says. Tests restart the daemon to
// prove comments and ticks keep, and remove a session.
//
// Claude Code is faked and barely involved: a session is the real `POST /api/sessions` bound with
// the measured enveloped `SessionStart`. Comments and ticks have no Claude Code source; every one
// a journey proves is written through the pointer and keyboard a developer has. The comment
// endpoint is used only to build a starting state (`seedComment`), never as the evidence for a
// step, and the daemon's own `GET …/diff/review` and the session table are the oracles for what
// was stored. Authored before any of it is built: every test here asserts new behaviour and is
// collection-only at authoring.
import {
  appText,
  APP_PATH,
  barRefresh,
  barText,
  changedBar,
  buttonText,
  cancelButton,
  cardHeading,
  changeTicks,
  closeViewerButton,
  commentBoxHeading,
  commentField,
  commentOnRow,
  commentRepo,
  commentsTab,
  deleteButton,
  diffButton,
  dragFromPlus,
  editButton,
  endSession,
  expectKeptEverywhere,
  getReview,
  headerFileTick,
  hoverRowPlus,
  launchBoundDiff,
  lineNumber,
  lineRow,
  listEntry,
  openDiff,
  progress,
  REVIEW_COUNTS,
  REVIEW_LINES,
  REVIEW_PATH,
  reopenButton,
  resetButton,
  resolveButton,
  resolvedRow,
  SAVE_FAILURE,
  saveButton,
  seedComment,
  sessionRowCount,
  storedReviewCount,
  TICK_COUNTS,
  TICK_EDITS,
  tickRepo,
  viewButton,
  viewer,
  writeIn,
} from "./helpers/diff";
import { type ScratchRepo } from "./helpers/card-location";
import type { APIRequestContext, Page, ScratchDaemon } from "./helpers/fixtures";
import { expect, test } from "./helpers/fixtures";
import { removeFromCardMenu, resumeFromCardMenu } from "./helpers/rail-menu";
import { sessionCard, type SessionObject } from "./helpers/session";

const cleanups: Array<() => Promise<void>> = [];

test.afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function track(repo: ScratchRepo): ScratchRepo {
  cleanups.push(repo.cleanup);
  return repo;
}

const LINE_4 = { path: REVIEW_PATH, line: 4, quote: ["delta four"] };

/** A session in `commentRepo`'s checkout, with the button showing. */
async function startCommentSession(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  title: string,
): Promise<{ repo: ScratchRepo; session: SessionObject }> {
  const repo = track(await commentRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, title);
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS }))).toBeVisible();
  return { repo, session };
}

/** A session in `commentRepo`'s checkout holding one seeded comment, with the button showing. */
async function startSeeded(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  title: string,
  seed: { id: string; body: string; resolved?: boolean },
): Promise<SessionObject> {
  const repo = track(await commentRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, title);
  await seedComment(page, daemon, session.id, { ...LINE_4, ...seed });
  const comments = seed.resolved ? 0 : 1;
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments }))).toBeVisible();
  return session;
}

test("a comment saved on one line is kept across a reload, a daemon restart and a second window (E12, REQ-5, REQ-17, REQ-18)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const { session } = await startCommentSession(page, request, daemon, "diff-e12-line");
  await openDiff(page);

  const plus = await hoverRowPlus(page, "delta four");
  await expect(plus).toHaveAccessibleName("Comment on line 4");
  await plus.click();
  await expect(commentBoxHeading(page, "line 4")).toBeVisible();
  await commentField(page).click();
  await page.keyboard.type("Should this say fourth?");
  await saveButton(page).click();

  await expect(commentBoxHeading(page, "line 4")).toHaveCount(0);
  await expect(cardHeading(page, "Line 4")).toBeVisible();
  await expect(viewer(page).getByText("Should this say fourth?")).toBeVisible();
  await expect(editButton(page)).toBeVisible();
  await expect(resolveButton(page)).toBeVisible();
  await expect(
    diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments: 1, open: true })),
  ).toBeVisible();

  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([
      {
        path: REVIEW_PATH,
        start: { side: "new", line: 4 },
        end: { side: "new", line: 4 },
        quote: ["delta four"],
        body: "Should this say fourth?",
        resolved: false,
      },
    ]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(cardHeading(p, "Line 4")).toBeVisible();
    await expect(viewer(p).getByText("Should this say fourth?")).toBeVisible();
    await expect(commentsTab(p, 1)).toBeVisible();
    await expect(
      diffButton(p, buttonText({ counts: REVIEW_COUNTS, comments: 1, open: true })),
    ).toBeVisible();
  });
});

test("a range comment made by dragging from a line's plus saves as Lines 2–4 and is kept across a reload, a daemon restart and a second window (E12, REQ-5, REQ-17, REQ-18)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const { session } = await startCommentSession(page, request, daemon, "diff-e12-range");
  await openDiff(page);

  await dragFromPlus(page, "bravo two", "delta four");
  await expect(commentBoxHeading(page, "lines 2–4")).toBeVisible();
  await commentField(page).click();
  await page.keyboard.type("These three belong together");
  await saveButton(page).click();

  await expect(cardHeading(page, "Lines 2–4")).toBeVisible();
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([
      {
        path: REVIEW_PATH,
        start: { side: "new", line: 2 },
        end: { side: "new", line: 4 },
        quote: ["bravo two", "charlie three", "delta four"],
        body: "These three belong together",
      },
    ]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(cardHeading(p, "Lines 2–4")).toBeVisible();
    await expect(viewer(p).getByText("These three belong together")).toBeVisible();
    await expect(commentsTab(p, 1)).toBeVisible();
  });
});

test("clicking a line number then shift-clicking another selects a range whose comment saves as one (E12, REQ-17)", async ({
  page,
  request,
  daemon,
}) => {
  const { session } = await startCommentSession(page, request, daemon, "diff-e12-shift");
  await openDiff(page);

  await lineNumber(page, 2).click();
  await lineNumber(page, 4).click({ modifiers: ["Shift"] });
  await expect(commentBoxHeading(page, "lines 2–4")).toBeVisible();
  await cancelButton(page).click();
  await expect(commentBoxHeading(page, "lines 2–4")).toHaveCount(0);
  expect((await getReview(page, daemon, session.id)).comments).toEqual([]);

  await lineNumber(page, 5).click();
  await lineNumber(page, 7).click({ modifiers: ["Shift"] });
  await expect(commentBoxHeading(page, "lines 5–7")).toBeVisible();
  await commentField(page).click();
  await page.keyboard.type("Selected with the numbers");
  await saveButton(page).click();

  await expect(cardHeading(page, "Lines 5–7")).toBeVisible();
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([
      {
        start: { line: 5 },
        end: { line: 7 },
        quote: ["echo five", "foxtrot six", "golf seven"],
        body: "Selected with the numbers",
      },
    ]);
});

test("editing a comment keeps its new text across a reload, a daemon restart and a second window (E12, REQ-5, REQ-18)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const session = await startSeeded(page, request, daemon, "diff-e12-edit", {
    id: "c-edit",
    body: "first wording",
  });
  await openDiff(page);

  await editButton(page).click();
  await expect(commentField(page)).toHaveValue("first wording");
  await commentField(page).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("second wording");
  await saveButton(page).click();

  await expect(viewer(page).getByText("second wording")).toBeVisible();
  await expect(viewer(page).getByText("first wording")).toHaveCount(0);
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([{ id: "c-edit", body: "second wording", resolved: false }]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(viewer(p).getByText("second wording")).toBeVisible();
    await expect(viewer(p).getByText("first wording")).toHaveCount(0);
  });
});

test("resolving a comment folds it to a Resolved row that is kept across a reload, a daemon restart and a second window, and drops the open counts (E12, REQ-5, REQ-18, REQ-19, INV-3)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const session = await startSeeded(page, request, daemon, "diff-e12-resolve", {
    id: "c-resolve",
    body: "settled by the author",
  });
  await openDiff(page);

  await resolveButton(page).click();
  await expect(resolvedRow(page)).toBeVisible();
  await expect(commentsTab(page, 0)).toBeVisible();
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, open: true }))).toBeVisible();
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([{ id: "c-resolve", resolved: true }]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(resolvedRow(p)).toBeVisible();
    await expect(commentsTab(p, 0)).toBeVisible();
    await expect(diffButton(p, buttonText({ counts: REVIEW_COUNTS, open: true }))).toBeVisible();
  });
});

test("reopening a resolved comment brings its card back and is kept across a reload, a daemon restart and a second window (E12, REQ-5, REQ-18)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const session = await startSeeded(page, request, daemon, "diff-e12-reopen", {
    id: "c-reopen",
    body: "needs another look",
    resolved: true,
  });
  await openDiff(page);
  await expect(resolvedRow(page)).toBeVisible();

  await reopenButton(page).click();
  await expect(cardHeading(page, "Line 4")).toBeVisible();
  await expect(viewer(page).getByText("needs another look")).toBeVisible();
  await expect(commentsTab(page, 1)).toBeVisible();
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([{ id: "c-reopen", resolved: false }]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(cardHeading(p, "Line 4")).toBeVisible();
    await expect(resolvedRow(p)).toHaveCount(0);
    await expect(commentsTab(p, 1)).toBeVisible();
  });
});

test("deleting a resolved comment removes it for good, across a reload, a daemon restart and a second window (E12, REQ-5, REQ-18)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const session = await startSeeded(page, request, daemon, "diff-e12-delete", {
    id: "c-delete",
    body: "no longer wanted",
    resolved: true,
  });
  await openDiff(page);

  await resolvedRow(page).click();
  await expect(resolvedRow(page)).toHaveAttribute("aria-expanded", "true");
  await deleteButton(page).click();
  await expect(resolvedRow(page)).toHaveCount(0);
  await expect(viewer(page).getByText("no longer wanted")).toHaveCount(0);
  await expect.poll(async () => (await getReview(page, daemon, session.id)).comments).toEqual([]);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await expect(resolvedRow(p)).toHaveCount(0);
    await expect(cardHeading(p, "Line 4")).toHaveCount(0);
    await expect(viewer(p).getByText("no longer wanted")).toHaveCount(0);
    await expect(commentsTab(p, 0)).toBeVisible();
  });
});

test("changes ticked one by one are kept across a reload, a daemon restart and a second window, and a change whose lines then change reads unticked (E13, REQ-6, REQ-15)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const repo = track(await tickRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e13-changes");
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();
  await expect(progress(page)).toHaveText("0 / 3 changes reviewed");

  // The first change, then the last: each folds to its muted row as it is ticked.
  await changeTicks(page).first().click();
  await expect(progress(page)).toHaveText("1 / 3 changes reviewed");
  await changeTicks(page).last().click();
  await expect(progress(page)).toHaveText("2 / 3 changes reviewed");
  await expect.poll(async () => (await getReview(page, daemon, session.id)).ticks).toHaveLength(2);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await viewButton(p, "Review").click();
    await expect(progress(p)).toHaveText("2 / 3 changes reviewed");
    await expect(headerFileTick(p, APP_PATH)).toHaveJSProperty("indeterminate", true);
    await expect(headerFileTick(p, APP_PATH)).not.toBeChecked();
    await expect(viewer(p).getByText("2/3", { exact: true }).first()).toBeVisible();
  });

  // The first change's lines change; refreshed, it comes back unticked while the other stays ticked.
  await writeIn(repo, APP_PATH, appText({ ...TICK_EDITS, 3: "app line 03 EDITED AGAIN" }));
  await expect(changedBar(page)).toHaveText(barText("1 file changed"));
  await barRefresh(page).click();
  await expect(progress(page)).toHaveText("1 / 3 changes reviewed");
  await expect(changeTicks(page)).toHaveCount(2);
});

test("a file ticked as a whole is kept across a reload, a daemon restart and a second window, and Reset unticks every change for good (E13, REQ-6, REQ-15)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const repo = track(await tickRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-e13-file");
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();

  await headerFileTick(page, APP_PATH).click();
  await expect(progress(page)).toHaveText("3 / 3 changes reviewed");
  await expect(headerFileTick(page, APP_PATH)).toBeChecked();
  await expect.poll(async () => (await getReview(page, daemon, session.id)).ticks).toHaveLength(3);

  await expectKeptEverywhere(page, browser, daemon, async (p) => {
    await viewButton(p, "Review").click();
    await expect(progress(p)).toHaveText("3 / 3 changes reviewed");
    await expect(headerFileTick(p, APP_PATH)).toBeChecked();
  });

  await resetButton(page).click();
  await expect(progress(page)).toHaveText("0 / 3 changes reviewed");
  await expect.poll(async () => (await getReview(page, daemon, session.id)).ticks).toEqual([]);
  await page.reload();
  await openDiff(page);
  await viewButton(page, "Review").click();
  await expect(progress(page)).toHaveText("0 / 3 changes reviewed");
  await expect(headerFileTick(page, APP_PATH)).not.toBeChecked();
});

test("after the commented line moves and the diff is refreshed the comment sits on its new line, and once the line is gone it is listed outdated with its line quoted (E15, REQ-7)", async ({
  page,
  request,
  daemon,
}) => {
  const { repo } = await startCommentSession(page, request, daemon, "diff-e15");
  await openDiff(page);
  await commentOnRow(page, "delta four", "Why is this one fourth?");
  await expect(cardHeading(page, "Line 4")).toBeVisible();

  // A line is added above it: the commented line is now line 5.
  await writeIn(repo, REVIEW_PATH, `${["zero zero", ...REVIEW_LINES].join("\n")}\n`);
  await expect(changedBar(page)).toBeVisible();
  await barRefresh(page).click();

  await expect(cardHeading(page, "Line 5")).toBeVisible();
  await expect(cardHeading(page, "Line 4")).toHaveCount(0);
  const card = await cardHeading(page, "Line 5").boundingBox();
  const above = await lineRow(page, "delta four").boundingBox();
  const below = await lineRow(page, "echo five").boundingBox();
  expect(card && above && below).toBeTruthy();
  expect(card?.y ?? 0).toBeGreaterThanOrEqual((above?.y ?? 0) + (above?.height ?? 0) - 1);
  expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual((below?.y ?? 0) + 1);
  await commentsTab(page, 1).click();
  await expect(listEntry(page, REVIEW_PATH)).toContainText(":5");

  // The line itself is deleted: no card in the body, the comment kept in the list.
  await writeIn(
    repo,
    REVIEW_PATH,
    `${REVIEW_LINES.filter((line) => line !== "delta four").join("\n")}\n`,
  );
  await expect(changedBar(page)).toBeVisible();
  await barRefresh(page).click();

  await expect(cardHeading(page, "Line 5")).toHaveCount(0);
  await expect(cardHeading(page, "Line 4")).toHaveCount(0);
  await expect(commentsTab(page, 1)).toBeVisible();
  const entry = listEntry(page, REVIEW_PATH);
  await expect(entry).toContainText("outdated");
  await expect(entry).toContainText("delta four");
  await expect(entry).toContainText("Why is this one fourth?");
  await expect(viewer(page).getByText("Why is this one fourth?")).toHaveCount(1);
});

test("comments and ticks stay with an ended session, survive resume and a daemon restart, and are deleted with the row by Remove (E14, REQ-8, INV-7)", async ({
  page,
  request,
  daemon,
}) => {
  const repo = track(await tickRepo());
  await page.goto(daemon.dashboardUrl);
  const session = await launchBoundDiff(page, request, daemon, repo, "diff-life");
  await seedComment(page, daemon, session.id, {
    id: "c-life",
    path: APP_PATH,
    line: 15,
    quote: ["app line 15 EDITED"],
    body: "outlives the session",
  });
  await expect(diffButton(page, buttonText({ counts: TICK_COUNTS, comments: 1 }))).toBeVisible();
  await openDiff(page);
  await viewButton(page, "Review").click();
  await changeTicks(page).first().click();
  await expect(progress(page)).toHaveText("1 / 3 changes reviewed");
  await expect.poll(() => storedReviewCount(daemon)).toBe(1);
  await closeViewerButton(page).click();

  const shown = async (p: Page) => {
    await openDiff(p);
    await viewButton(p, "Review").click();
    await expect(progress(p)).toHaveText("1 / 3 changes reviewed");
    await expect(viewer(p).getByText("outlives the session")).toBeVisible();
    await expect(commentsTab(p, 1)).toBeVisible();
    await closeViewerButton(p).click();
  };

  await endSession(page, daemon, session.id);
  await expect(page.locator("#dead-surface")).toBeVisible();
  await shown(page);

  await resumeFromCardMenu(page, sessionCard(page, "diff-life"));
  await shown(page);

  await daemon.restart();
  await page.reload();
  await shown(page);

  await removeFromCardMenu(page, sessionCard(page, "diff-life"));
  await expect(sessionCard(page, "diff-life")).toHaveCount(0);
  await expect.poll(() => sessionRowCount(daemon, session.id)).toBe(0);
  expect(await storedReviewCount(daemon)).toBe(0);
  const gone = await page.request.get(`${daemon.baseURL}/api/sessions/${session.id}/diff/review`);
  expect(gone.status()).toBe(404);
});

test("a comment that cannot be saved keeps its box and text and reads Not saved, musterd unreachable, and saves once musterd is back (REQ-28, edge case 9)", async ({
  page,
  request,
  daemon,
}) => {
  const { session } = await startCommentSession(page, request, daemon, "diff-e28-save");
  await openDiff(page);
  await (await hoverRowPlus(page, "delta four")).click();
  await commentField(page).click();
  await page.keyboard.type("typed while musterd was down");

  await daemon.kill();
  await saveButton(page).click();
  await expect(viewer(page).getByText(SAVE_FAILURE)).toBeVisible();
  await expect(commentBoxHeading(page, "line 4")).toBeVisible();
  await expect(commentField(page)).toHaveValue("typed while musterd was down");
  await expect(cardHeading(page, "Line 4")).toHaveCount(0);

  await daemon.restart();
  await saveButton(page).click();
  await expect(cardHeading(page, "Line 4")).toBeVisible();
  await expect(viewer(page).getByText(SAVE_FAILURE)).toHaveCount(0);
  await expect
    .poll(async () => (await getReview(page, daemon, session.id)).comments)
    .toMatchObject([{ body: "typed while musterd was down" }]);
});

test("with two sessions, opening, ticking, commenting and closing on one never changes the other's comments, ticks or viewer (INV-5, REQ-27)", async ({
  page,
  request,
  daemon,
}) => {
  const repoA = track(await commentRepo());
  const repoB = track(await commentRepo());
  await page.goto(daemon.dashboardUrl);
  const a = await launchBoundDiff(page, request, daemon, repoA, "diff-two-a");
  const b = await launchBoundDiff(page, request, daemon, repoB, "diff-two-b");
  await seedComment(page, daemon, a.id, { id: "c-a", ...LINE_4, body: "comment for A" });
  await seedComment(page, daemon, b.id, { id: "c-b", ...LINE_4, body: "comment for B" });

  await sessionCard(page, "diff-two-a").click();
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments: 1 }))).toBeVisible();
  await openDiff(page);
  await expect(viewer(page).getByText("comment for A")).toBeVisible();
  await expect(viewer(page).getByText("comment for B")).toHaveCount(0);

  // B has its own surface, not A's open viewer; its viewer has its own comment, and gains another.
  await sessionCard(page, "diff-two-b").click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(diffButton(page, buttonText({ counts: REVIEW_COUNTS, comments: 1 }))).toBeVisible();
  await openDiff(page);
  await expect(viewer(page).getByText("comment for B")).toBeVisible();
  await expect(viewer(page).getByText("comment for A")).toHaveCount(0);
  await commentOnRow(page, "foxtrot six", "second comment for B");
  await expect(commentsTab(page, 2)).toBeVisible();

  // Back on A: its viewer is where it was left, with only its own comment, and a tick made here
  // is A's alone.
  await sessionCard(page, "diff-two-a").click();
  await expect(viewer(page)).toBeVisible();
  await expect(commentsTab(page, 1)).toBeVisible();
  await expect(viewer(page).getByText("second comment for B")).toHaveCount(0);
  await viewButton(page, "Review").click();
  await changeTicks(page).first().click();
  await expect(progress(page)).toHaveText("1 / 1 changes reviewed");

  await expect
    .poll(async () => ({
      a: (await getReview(page, daemon, a.id)).comments.map((c) => c.body),
      aTicks: (await getReview(page, daemon, a.id)).ticks.length,
      b: (await getReview(page, daemon, b.id)).comments.map((c) => c.body),
      bTicks: (await getReview(page, daemon, b.id)).ticks.length,
    }))
    .toEqual({
      a: ["comment for A"],
      aTicks: 1,
      b: ["comment for B", "second comment for B"],
      bTicks: 0,
    });

  // B's viewer is per session and was left open: back on B it is still there, untouched by A's tick.
  await sessionCard(page, "diff-two-b").click();
  await expect(viewer(page)).toBeVisible();
  await expect(commentsTab(page, 2)).toBeVisible();
  await viewButton(page, "Review").click();
  await expect(progress(page)).toHaveText("0 / 1 changes reviewed");
});
