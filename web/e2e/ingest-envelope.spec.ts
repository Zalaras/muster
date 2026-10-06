import { queryEvents } from "./helpers/db";
import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart } from "./helpers/payloads";
import { findSession, getState, launchSession, scratchDirectory } from "./helpers/session";

// Plan general-cleanup — REQ-12 (envelope pane corroboration,
// kb:adr/ingest-envelope-pane-must-corroborate). Takes the test-scoped `daemon` fixture:
// the assertion is that an unrouted event leaks into no session row, which a shared file
// daemon's neighbouring sessions would muddy.

test("an enveloped SessionStart with a mismatched pane persists unrouted; the same event with the real pane binds it (E4, REQ-12, INV-CORROBORATE)", async ({
  page,
  daemon,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "corroborate-e4" });
    const realPane = await daemon.tmuxPaneId(session.tmuxTarget);
    const claudeId = "claude-corroborate-e4";

    const mismatchRes = await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id, tmuxPane: "%999" }),
    });
    expect(mismatchRes.status()).toBe(200);

    // Ingest is async (CLAUDE.md: "return 200 immediately and process asynchronously") —
    // poll on the mismatched event's own persistence, never a fixed sleep, before
    // reading state back.
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length > 0, {
        message: "waiting for the mismatched-pane hook to be persisted",
      })
      .toBe(true);
    const afterMismatch = findSession(await getState(page, daemon), session.id);
    expect(afterMismatch.claudeSessionId).toBeNull();
    expect(afterMismatch.state).toBe("started");

    const matchRes = await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id, tmuxPane: realPane }),
    });
    expect(matchRes.status()).toBe(200);
    await expect
      .poll(async () => findSession(await getState(page, daemon), session.id).claudeSessionId)
      .toBe(claudeId);
  } finally {
    await cleanup();
  }
});
