// drop — the display properties of file drop (the document-level
// foreign-drag guard), the client-side size cap and a dead surface swallowing
// a drop, re-levelled on 2026-10-20 from web/e2e/drop.spec.ts
// (plans/_audit/relevel/misc-core.md): each guard runs before any request, so the request
// log proves no locate was sent and the page's URL and notices prove nothing leaked. What
// IS synthesized is the dropped `File`/`DataTransfer` a real Finder drag would hand the page
// — built in-page via `page.evaluateHandle` (helpers/drop.ts), never a real OS drag. The
// live surface mounts against the harness's accepted, silent terminal socket, so the size
// gate (which runs first) is what fires for the over-cap file. The journeys — locate
// round-trips, the escaped path pasted into the PTY, the held "Locating …" notice, the
// not-connected notice over a closed socket — stay in web/e2e/drop.spec.ts.
import { dragoverThenDropFiles, dropFiles, dropNotice, MAX_DROP_BYTES } from "./helpers/drop";
import { deadSurface } from "./helpers/actions";
import { focusSession, terminalRegion } from "./helpers/focus";
import { expect, test } from "./helpers/harness";

test("dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("three-states");
  await focusSession(page, "Alpha");
  await expect(terminalRegion(page, "Alpha")).toBeVisible();

  const urlBefore = page.url();
  // dragover THEN drop (not a bare dispatched drop) — Implementation Notes: this is the
  // one case that must exercise the document-level guard's real `dragover` listener,
  // since a plain `drop`-only dispatch would never prove the guard claims the gesture
  // before any browser-native navigation attempt would.
  await dragoverThenDropFiles(page.locator("#mainhead"), [{ name: "anything.png", size: 16 }]);

  expect(page.url()).toBe(urlBefore);
  await expect(page.locator("#sessions")).toBeVisible();
});

test("a file over 50 MiB shows the too-large notice and issues no locate request (E7)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("three-states");
  const session = fixture.snapshot.sessions.find((s) => s.title === "Alpha");
  if (!session) throw new Error("three-states: no session titled Alpha");
  await focusSession(page, "Alpha");
  const region = terminalRegion(page, "Alpha");
  await expect(region).toBeVisible();

  let locateRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes(`/api/sessions/${session.id}/locate`)) locateRequests += 1;
  });

  // Size-only fixture (no `bytes`) — the cap is a client-side size check before any
  // upload, so the actual content is irrelevant and never needs to cross the CDP wire.
  await dropFiles(region, [{ name: "huge.bin", size: MAX_DROP_BYTES + 1 }]);

  await expect(dropNotice(region)).toHaveText("huge.bin is over 50 MiB — paste its path instead", {
    timeout: 15_000,
  });
  expect(locateRequests).toBe(0);
});

test("a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8)", async ({
  page,
  dashboard,
}) => {
  // `dead-session`'s one session is dead on arrival; Focus selects it and shows the dead
  // surface without a click.
  const fixture = await dashboard.open("dead-session");
  expect(fixture.snapshot.sessions.map((s) => s.alive)).toEqual([false]);
  const dead = deadSurface(page);
  await expect(dead).toBeVisible({ timeout: 15_000 });

  let locateRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/locate")) locateRequests += 1;
  });
  const urlBefore = page.url();

  await dragoverThenDropFiles(dead, [{ name: "anything.png", size: 16 }]);

  expect(page.url()).toBe(urlBefore);
  // "nothing to paste into, by design" — the drop must leave no visible trace
  // anywhere on the page, not just inside `#dead-surface`.
  //
  // review cycle 1, Major 3: the previous clause here, `deadSurface.locator(
  // ".terminal-notice")` having count 0, is unfalsifiable — `.terminal-notice` is only
  // ever created inside `TerminalSurface`'s constructor (web/src/terminal/pane.ts),
  // which never runs for `#dead-surface`'s static markup regardless of what the
  // implementation does, so that count is 0 by construction whether or not that guard is
  // actually honoured. What CAN fail is checking page-wide for the concrete symptom a
  // real leak would produce: if the drop escaped the dead surface (bubbled to a
  // differently-scoped listener, or raced a stale live `TerminalSurface` instance that
  // hadn't unmounted yet), the dropped filename or one of the notice-outcome phrases
  // would show up SOMEWHERE on the page — in a real `.terminal-notice` on another
  // session's surface, or any other status text.
  await expect(page.getByText("anything.png")).toHaveCount(0);
  const statusTexts = await page.getByRole("status").allInnerTexts();
  for (const text of statusTexts) {
    // Deliberately does not match the dead surface's own unrelated, pre-existing
    // "session ended" label (web/index.html) — only the phrases
    // the drop feature's own notices actually use (the exact strings in
    // web/e2e/drop.spec.ts), so a real leak of any of them is what fails this loop.
    expect(text).not.toMatch(
      /locating|can't locate|matches \d+ identical|over 50 mib|isn't connected/i,
    );
  }
  expect(locateRequests).toBe(0);
});
