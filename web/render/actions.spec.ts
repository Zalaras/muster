// actions — the display properties of plan m4-reconcile REQ-5 to REQ-16 (End / Remove /
// Resume, their confirm dialogs, the dead surface) and plan session-lifecycle E7/W3,
// re-levelled on 2026-10-20 from web/e2e/actions.spec.ts (plans/_audit/relevel/misc-core.md):
// a confirm dialog opens and closes client-side before any request is sent, the "ended
// now" copy is a function of the session's `endedAt` against the page clock, and a dead
// session with no Claude id disables its Resume with a stated reason. Nothing here changes
// state: a live card is focused by clicking it (`three-states`), the dead sessions come from
// `dead-session` and `stop-resume-pair`, and the harness's 404 on every `/api/**` is what
// makes "no request lands" true — the request log below proves none was even sent. The
// journeys — End and Remove round-trips, Resume relaunching with the same claude id, the
// real pane snapshot, the connection going down — stay in web/e2e/actions.spec.ts.
import {
  deadCap,
  deadSurface,
  NO_CLAUDE_ID_REASON,
  removeDialog,
  stopDialog,
} from "./helpers/actions";
import { railCardByTitle } from "./helpers/card-location";
import { focusSession } from "./helpers/focus";
import { cardMenuItem, openCardMenu } from "./helpers/rail";
import { expect, type RenderFixture, type Session, test } from "./helpers/harness";

/** The one fixture session titled `title`. */
function sessionTitled(fixture: RenderFixture, title: string): Session {
  const matches = fixture.snapshot.sessions.filter((s) => s.title === title);
  expect(matches, `one fixture session titled ${title}`).toHaveLength(1);
  const [session] = matches;
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return session;
}

test("Cancel and Escape close both End and Remove dialogs without sending any request (E10)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const session = sessionTitled(fixture, "Alpha");
  expect(session.alive).toBe(true);
  await focusSession(page, "Alpha");
  const mainhead = page.locator("#mainhead");
  await expect(mainhead).toContainText("Alpha");

  let mutations = 0;
  page.on("request", (req) => {
    const method = req.method();
    if (method !== "POST" && method !== "DELETE") return;
    const path = new URL(req.url()).pathname;
    if (/^\/api\/sessions\/\d+(\/(end|resume))?$/.test(path)) mutations++;
  });

  const endDialog = stopDialog(page);
  const alpha = railCardByTitle(page, "Alpha");
  await openCardMenu(page, alpha);
  await cardMenuItem(page, "Stop…").click();
  await expect(endDialog).toBeVisible();
  await endDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(endDialog).toBeHidden();

  await openCardMenu(page, alpha);
  await cardMenuItem(page, "Stop…").click();
  await expect(endDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(endDialog).toBeHidden();

  const remove = removeDialog(page);
  await openCardMenu(page, alpha);
  await cardMenuItem(page, "Remove…").click();
  await expect(remove).toBeVisible();
  await remove.getByRole("button", { name: "Cancel" }).click();
  await expect(remove).toBeHidden();

  await openCardMenu(page, alpha);
  await cardMenuItem(page, "Remove…").click();
  await expect(remove).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(remove).toBeHidden();

  // The card is still the live one it was: nothing was sent, so nothing could end it.
  await openCardMenu(page, alpha);
  await expect(cardMenuItem(page, "Stop…")).toBeEnabled();
  await page.keyboard.press("Escape");
  expect(mutations).toBe(0);
});

test("ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6)", async ({
  page,
  dashboard,
}) => {
  // `dead-session`'s one session ended a minute after the page clock's start, so its age
  // is the sub-minute bucket ("now") throughout — the state Major 6 was filed against.
  const fixture = await dashboard.open("dead-session");
  const [session] = fixture.snapshot.sessions;
  expect(fixture.snapshot.sessions).toHaveLength(1);
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  expect(session.alive).toBe(false);
  expect(session.endedAt).not.toBeNull();

  // Focus selects the fixture's one session, so the dead surface is up without a click.
  const mainhead = page.locator("#mainhead");
  const dead = deadSurface(page);
  await expect(dead).toBeVisible();

  const meta = mainhead.locator(".meta");
  await expect(meta).toContainText("ended now");
  await expect(meta).not.toContainText("now ago");

  const endbar = dead.locator(".endbar");
  await expect(endbar).toContainText("ended now ·");
  await expect(endbar).not.toContainText("now ago");

  // The cap's own age prefix ("now · last state:") is only composed for a captured pane;
  // the harness answers the pane GET with its 404, so the cap reads the confirmed-negative
  // copy instead. Its never-"now ago" half still holds; the positive clause is the E2E's.
  const cap = deadCap(page);
  await expect(cap).toContainText("no snapshot captured");
  await expect(cap).not.toContainText("now ago");
});

test("a session with no bound Claude id shows a disabled Resume control with a stated reason on the dead cap, and no Resume or Stop button in the mainhead (E7, W3)", async ({
  page,
  dashboard,
}) => {
  // `stop-resume-pair`'s second session was launched and its pane killed before any hook
  // arrived — claudeSessionId stays null for good (it only ever gets bound by an enveloped
  // SessionStart).
  const fixture = await dashboard.open("stop-resume-pair");
  const session = sessionTitled(fixture, "disabled-e13");
  expect(session.alive).toBe(false);
  expect(session.claudeSessionId).toBeNull();
  await focusSession(page, "disabled-e13");

  const mainhead = page.locator("#mainhead");
  // The header holds no Stop, Resume or Remove button (plan remove-unread-right-click-1, REQ-4);
  // the dead cap's own Resume is the one control left.
  await expect(mainhead.getByRole("button", { name: "Session actions" })).toBeVisible();
  await expect(mainhead.getByRole("button", { name: /^(Stop|Resume)$/ })).toHaveCount(0);

  const cap = deadCap(page);
  const capResume = cap.getByRole("button", { name: "Resume" });
  await expect(capResume).toBeVisible();
  await expect(capResume).toBeDisabled();
  await expect(capResume).toHaveAttribute("title", NO_CLAUDE_ID_REASON);
});
