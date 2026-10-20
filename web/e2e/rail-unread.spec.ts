import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawStop, rawUserPromptSubmit } from "./helpers/payloads";
import {
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  stateBadge,
} from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";
import { hasClass, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";

// Plan rail-card-improvements — REQ-7 through REQ-11 (unread idle and the new attention
// order), the journeys driven against the real terminal-attach and hook-ingest paths:
// a turn closing watched or unwatched, an attach clearing the marker, a restart. The
// display properties — the attention order for a snapshot, Opt+Cmd+0's preference and the
// read-idle title colour — are render tests in web/render/rail.spec.ts
// (plans/_audit/relevel/rail.md). Plan acceptance: E3, E4, E10. Fixture plan header: this
// file asserts attach state and restarts, so every test takes the per-test `daemon`
// fixture (helpers/fixtures.ts) — `unread` is daemon-global session state and several
// tests here restart the daemon or open a second window.
//
// "Watched" (REQ-8) is proved the same way every test in this suite proves an attach:
// the session shown in Focus by default (the first-launched session, per
// rail-order.spec.ts's "order-e15" precedent) has its terminal auto-attached as soon as
// the pane is ready, and a rail-card click attaches whichever session it names
// (kb:adr/focus-rail-click-focuses-terminal). Waiting for `MUSTER-STUB-READY` in the
// terminal region is this file's readiness gate for "the attach has actually
// registered" before a hook that depends on watched state is posted — without it, a Stop
// fired immediately after a click could race the WS handshake and land unread anyway.

test("a Stop for an unwatched session sets its unread marker; a Stop for the watched session never does (E3, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirA.path, title: "unread-e3-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "unread-e3-b" });

    // A is launched first, so it is the default-focus fallback — its terminal attaches
    // (and so is watched) without any click; B is never clicked, so it stays unwatched
    // for the whole test.
    await expect(terminalRegion(page, "unread-e3-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeA = "claude-unread-e3-a";
    const claudeB = "claude-unread-e3-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeA, await envelopeOpts(a, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeA) });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeB) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeA) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB) });

    const cardA = railCard(page, "unread-e3-a");
    const cardB = railCard(page, "unread-e3-b");
    await expect(stateBadge(cardA)).toHaveText(/idle/i);
    await expect(stateBadge(cardB)).toHaveText(/idle/i);

    await expect(cardB).toHaveAttribute("data-unread", "true");
    await expect.poll(() => hasClass(cardB, "unread")).toBe(true);
    await expect(cardB).toHaveAttribute("aria-label", /, unread$/);

    await expect(cardA).not.toHaveAttribute("data-unread", "true");
    await expect.poll(() => hasClass(cardA, "unread")).toBe(false);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("clicking an unread card clears the marker, and /api/state reports unread:false (E4)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "unread-e4-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "unread-e4-b" });
    await expect(terminalRegion(page, "unread-e4-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeB = "claude-unread-e4-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeB) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB) });

    const cardB = railCard(page, "unread-e4-b");
    await expect(cardB).toHaveAttribute("data-unread", "true");

    await cardB.click();
    await expect(terminalRegion(page, "unread-e4-b")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    await expect(cardB).not.toHaveAttribute("data-unread", "true");
    await expect.poll(() => hasClass(cardB, "unread")).toBe(false);

    const state = await getState(page, daemon);
    expect(findSession(state, b.id).unread).toBe(false);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a session watched only by a second window is not marked unread when its turn closes (edge case 4)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  const contextB = await browser.newContext();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "unread-mw-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "unread-mw-b" });
    await expect(terminalRegion(page, "unread-mw-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    // Window 2 explicitly focuses B — its own attach, independent of window 1's.
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);
    await railCard(pageB, "unread-mw-b").click();
    await expect(terminalRegion(pageB, "unread-mw-b")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeB = "claude-unread-mw-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeB) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB) });

    // Read back through window 1, which never attached B itself — "watched" is a
    // session-global fact from the daemon's own terminal registry, not per-window.
    const cardBInWindow1 = railCard(page, "unread-mw-b");
    await expect(stateBadge(cardBInWindow1)).toHaveText(/idle/i);
    await expect(cardBInWindow1).not.toHaveAttribute("data-unread", "true");
  } finally {
    await contextB.close();
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("attaching one session never clears a different session's unread marker (INV-2)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "unread-inv2-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "unread-inv2-b" });

    const claudeB = "claude-unread-inv2-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeB) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB) });
    const cardB = railCard(page, "unread-inv2-b");
    await expect(cardB).toHaveAttribute("data-unread", "true");

    // Attach a DIFFERENT session (A) — B's marker must be unaffected.
    await railCard(page, "unread-inv2-a").click();
    await expect(terminalRegion(page, "unread-inv2-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    await expect(cardB).toHaveAttribute("data-unread", "true");
    const state = await getState(page, daemon);
    expect(findSession(state, b.id).unread).toBe(true);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a new prompt on an unread idle session clears its marker with no attach at all (edge case 5)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "unread-ta-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "unread-ta-b" });
    await expect(terminalRegion(page, "unread-ta-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeB = "claude-unread-ta-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeB, { promptId: "p1" }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB, { promptId: "p1" }) });
    const cardB = railCard(page, "unread-ta-b");
    await expect(cardB).toHaveAttribute("data-unread", "true");

    // A second prompt reopens the turn — B is still never clicked or attached.
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeB, { promptId: "p2" }),
    });
    await expect(stateBadge(cardB)).toHaveText(/working/i);
    await expect(cardB).not.toHaveAttribute("data-unread", "true");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("after a daemon restart with the tmux pane gone, an unread session reconciles to ended, keeps its marker, and sorts last (E10)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB, dirC] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirA.path, title: "e10-a" });
    const b = await launchSession(page, daemon, { directory: dirB.path, title: "e10-b" });
    const c = await launchSession(page, daemon, { directory: dirC.path, title: "e10-c" });
    await expect(terminalRegion(page, "e10-a")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeB = "claude-e10-b";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeB, await envelopeOpts(b, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeB) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeB) });
    const cardB = railCard(page, "e10-b");
    await expect(cardB).toHaveAttribute("data-unread", "true");

    // Kill the pane, then restart — the same "reconcile decides alive from the pane, not
    // the hint" fixture reconcile.spec.ts and rail-cards.spec.ts already use.
    await daemon.killTmuxWindow(b.tmuxTarget);
    await daemon.restart();
    await page.reload();

    const endedCardB = railCard(page, "e10-b");
    await expect(endedCardB).toHaveClass(/ended/, { timeout: 15_000 });
    await expect(endedCardB).toHaveAttribute("data-unread", "true");

    // "Dead sessions sort last" is an Attention-mode guarantee (rail-cards.spec.ts's
    // REQ-9 precedent, `web/src/sessions/sort.ts`'s `orderRail`): manual mode's unpinned
    // order is pure `railPos`/`id` and ignores liveness entirely
    // (kb:adr/rail-user-owned-manual-order-default).
    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, c.id, b.id]);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup(), dirC.cleanup()]);
  }
});
