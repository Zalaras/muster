import { expect, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawNotification,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
} from "./helpers/payloads";
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
import { cardName } from "./helpers/railcards";
import { resolvedCssVar } from "./helpers/theme";

// Plan rail-card-improvements — REQ-7 through REQ-11 (unread idle and the new attention
// order), driven end-to-end against the real terminal-attach and hook-ingest paths.
// Plan acceptance: E3 through E6, E10. Fixture plan header: this file asserts rail
// order, attach state and restarts, so every test takes the per-test `daemon` fixture
// (helpers/fixtures.ts) — `unread` is daemon-global session state and several tests here
// restart the daemon or open a second window.
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

test("the attention-mode rail order is needs input, failed, unread idle, started, planning, working, then read idle (E5, REQ-11)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 7 }, () => scratchDirectory()));
  try {
    const [dirNI, dirF, dirUI, dirST, dirPL, dirW, dirRI] = dirs;
    if (!dirNI || !dirF || !dirUI || !dirST || !dirPL || !dirW || !dirRI) {
      throw new Error("expected 7 scratch directories");
    }
    await page.goto(daemon.dashboardUrl);
    const ni = await launchSession(page, daemon, { directory: dirNI.path, title: "order5-ni" });
    const f = await launchSession(page, daemon, { directory: dirF.path, title: "order5-f" });
    const ui = await launchSession(page, daemon, { directory: dirUI.path, title: "order5-ui" });
    const st = await launchSession(page, daemon, { directory: dirST.path, title: "order5-st" });
    const pl = await launchSession(page, daemon, {
      directory: dirPL.path,
      title: "order5-pl",
      permissionMode: "plan",
    });
    const w = await launchSession(page, daemon, { directory: dirW.path, title: "order5-w" });
    const ri = await launchSession(page, daemon, { directory: dirRI.path, title: "order5-ri" });

    // ni is launched first, so it is the default-attached session — irrelevant to its
    // own needs_input transition, and it leaves ui/st/pl/w genuinely unwatched below.
    await expect(terminalRegion(page, "order5-ni")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeNI = "claude-order5-ni";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeNI, await envelopeOpts(ni, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeNI) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(claudeNI, "p1", "permission_prompt"),
    });
    await expect(stateBadge(railCard(page, "order5-ni"))).toHaveText(/needs input/i);

    const claudeF = "claude-order5-f";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeF, await envelopeOpts(f, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeF) });
    await request.post(daemon.ingestURL("hook"), { data: rawStopFailure(claudeF) });
    await expect(stateBadge(railCard(page, "order5-f"))).toHaveText(/failed/i);

    const claudeUI = "claude-order5-ui";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeUI, await envelopeOpts(ui, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeUI) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeUI) });
    const cardUI = railCard(page, "order5-ui");
    await expect(stateBadge(cardUI)).toHaveText(/idle/i);
    await expect(cardUI).toHaveAttribute("data-unread", "true");

    // st: SessionStart only — no prompt yet, stays "started".
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-order5-st", await envelopeOpts(st, daemon)),
    });
    await expect(stateBadge(railCard(page, "order5-st"))).toHaveText(/started/i);

    const claudePL = "claude-order5-pl";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudePL, await envelopeOpts(pl, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudePL, { permissionMode: "plan" }),
    });
    await expect(stateBadge(railCard(page, "order5-pl"))).toHaveText(/planning/i);

    const claudeW = "claude-order5-w";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeW, await envelopeOpts(w, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeW) });
    await expect(stateBadge(railCard(page, "order5-w"))).toHaveText(/working/i);

    // ri: attach it first, then close its turn while watched — it lands idle with
    // unread:false, the "read idle" group at the very end of REQ-11's table.
    await railCard(page, "order5-ri").click();
    await expect(terminalRegion(page, "order5-ri")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });
    const claudeRI = "claude-order5-ri";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeRI, await envelopeOpts(ri, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeRI) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeRI) });
    const cardRI = railCard(page, "order5-ri");
    await expect(stateBadge(cardRI)).toHaveText(/idle/i);
    await expect(cardRI).not.toHaveAttribute("data-unread", "true");

    await railSortSelect(page).selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");

    await expect
      .poll(() => railOrderIds(page))
      .toEqual([ni.id, f.id, ui.id, st.id, pl.id, w.id, ri.id]);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("Opt+Cmd+0 focuses the unread idle session over a merely working one (E6)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirW, dirUI] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const w = await launchSession(page, daemon, { directory: dirW.path, title: "e6-working" });
    const ui = await launchSession(page, daemon, { directory: dirUI.path, title: "e6-unread" });
    await expect(terminalRegion(page, "e6-working")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeW = "claude-e6-working";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeW, await envelopeOpts(w, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeW) });
    await expect(stateBadge(railCard(page, "e6-working"))).toHaveText(/working/i);

    const claudeUI = "claude-e6-unread";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeUI, await envelopeOpts(ui, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeUI) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeUI) });
    const cardUI = railCard(page, "e6-unread");
    await expect(cardUI).toHaveAttribute("data-unread", "true");

    // Explicitly focus the working session first, so Opt+Cmd+0 has to move focus rather
    // than merely leave it where it already was.
    await railCard(page, "e6-working").click();
    await expect(page.locator("#mainhead .name")).toHaveText("e6-working");

    await page.keyboard.press("Alt+Meta+Digit0");
    await expect(page.locator("#mainhead .name")).toHaveText("e6-unread");
  } finally {
    await Promise.all([dirW.cleanup(), dirUI.cleanup()]);
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

test("a read idle title drops to --fg-muted while a working title and an unread idle title both stay --fg (decision read-idle-title-colour, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirRI, dirW, dirUI] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    // RI is launched first, so it is the default-focus fallback and its terminal
    // auto-attaches — its Stop below closes a watched turn, landing read idle
    // (`s-idle:not(.unread)`). W and UI are never clicked.
    const ri = await launchSession(page, daemon, { directory: dirRI.path, title: "color-ri" });
    const w = await launchSession(page, daemon, { directory: dirW.path, title: "color-w" });
    const ui = await launchSession(page, daemon, { directory: dirUI.path, title: "color-ui" });
    await expect(terminalRegion(page, "color-ri")).toContainText("MUSTER-STUB-READY", {
      timeout: 15_000,
    });

    const claudeRI = "claude-color-ri";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeRI, await envelopeOpts(ri, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeRI) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeRI) });
    const cardRI = railCard(page, "color-ri");
    await expect(stateBadge(cardRI)).toHaveText(/idle/i);
    await expect(cardRI).not.toHaveAttribute("data-unread", "true");

    const claudeW = "claude-color-w";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeW, await envelopeOpts(w, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeW) });
    const cardW = railCard(page, "color-w");
    await expect(stateBadge(cardW)).toHaveText(/working/i);

    const claudeUI = "claude-color-ui";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeUI, await envelopeOpts(ui, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeUI) });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeUI) });
    const cardUI = railCard(page, "color-ui");
    await expect(cardUI).toHaveAttribute("data-unread", "true");

    // Read the theme's own tokens rather than hardcoding hex/rgb, so the assertion holds
    // under whichever of the three themes the run's daemon fixture starts in.
    const fg = await resolvedCssVar(page, "--fg");
    const fgMuted = await resolvedCssVar(page, "--fg-muted");
    expect(fgMuted).not.toBe(fg);

    // REQ-9 (decision read-idle-title-colour, Outcome A): the base `.card .name` rule
    // paints every title `--fg`; only the read-idle rule (`.s-idle:not(.unread)`) drops
    // it to `--fg-muted`. Neither a working title nor an unread-idle title (marked by the
    // dot, not by colour) may be muted.
    await expect
      .poll(() => cardName(cardRI).evaluate((el) => getComputedStyle(el).color))
      .toBe(fgMuted);
    expect(await cardName(cardW).evaluate((el) => getComputedStyle(el).color)).toBe(fg);
    expect(await cardName(cardUI).evaluate((el) => getComputedStyle(el).color)).toBe(fg);
  } finally {
    await Promise.all([dirRI.cleanup(), dirW.cleanup(), dirUI.cleanup()]);
  }
});
