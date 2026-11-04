import {
  confirmAndCapture,
  confirmButton,
  dialogSection,
  expectRestartedInPlace,
  ignoreButton,
  INSTALLED,
  noticeButton,
  openRestartDialog,
  openSession,
  paneIdentity,
  panel,
  panelCountRow,
  panelHead,
  panelRestartButton,
  postRunningVersion,
  restartDialog,
  rowOf,
  stopTurn,
  versionReadoutPattern,
  waitForHello,
  wire,
} from "./helpers/claude-restart";
import { claudeVersionReadout } from "./helpers/connection";
import { expect, type Locator, settleFor, test } from "./helpers/fixtures";
import { scratchDirectory, sessionCard } from "./helpers/session";

// Restart onto the latest Claude Code (plan restart-latest-claude, E1-E3 and the journeys the
// rest of its REQs need): the dashboard's notice on the masthead readout, the confirm dialog,
// the daemon's Stop-then-Resume in place and its queue for busy sessions.
//
// Fixture plan: the per-test `daemon` fixture — the notice counts every live session's
// version, which is daemon-global state, and one journey restarts the daemon. Its stub
// `claude` answers `--version` with INSTALLED (the harness's `stubClaudeVersion` knob), so the
// installed version is known to the daemon; each session then reports an OLDER running version
// through a synthesized status-line POST (helpers/claude-restart.ts), exactly the shape a real
// session started before an update would post (kb:fact/running-session-version-sources). No
// real `claude` runs: Resume spawns the stub.
//
// What the readout, panel and dialog look like for a given state — fixed width, neutral
// tokens, collapsing sections, the disabled button while down — is a render test
// (web/render/claude-restart.spec.ts, R1-R7); the journeys here are the ones that need the daemon.
// Not covered here: a newer installed version re-showing Ignore's notice (the stub's reply is
// fixed per daemon and the version watch polls every 30 s; W4 pins the per-version key in
// Vitest), a Resume half that fails (D6, Go), and a pending session that became free while the
// daemon was down (D10, Go: hooks cannot reach a dead daemon).

test.use({ daemonOptions: { stubClaudeVersion: INSTALLED } });

test("two idle behind sessions restart in place from the readout panel and a current bystander is untouched (E1, REQ-4, REQ-7, REQ-8, REQ-13, D11)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const a = await openSession(page, request, daemon, dirs[0].path, "rs-e1-a", "2.1.317", "idle");
    const b = await openSession(page, request, daemon, dirs[1].path, "rs-e1-b", "2.1.316", "idle");
    const bystander = await openSession(
      page,
      request,
      daemon,
      dirs[2].path,
      "rs-e1-current",
      INSTALLED,
      "idle",
    );
    expect(
      (await wire(page, daemon, bystander.session.id)).claudeVersion,
      "a session on the installed version is not behind",
    ).toEqual({ running: INSTALLED, behind: false });
    expect((await wire(page, daemon, a.session.id)).claudeVersion).toEqual({
      running: "2.1.317",
      behind: true,
    });

    // REQ-7: the readout is the notice button, naming the OLDEST behind version and the installed patch.
    const readout = noticeButton(page);
    await expect(readout).toHaveText(/^claude 2\.1\.316→318/);
    await readout.click();
    await expect(panelHead(page)).toBeVisible();
    await expect(panelCountRow(page, "Restart now")).toHaveText(/^Restart now\s*2$/);
    await expect(panelCountRow(page, "Restart when free")).toHaveCount(0);
    await expect(ignoreButton(page)).toBeVisible();

    await panelRestartButton(page).click();
    const dialog = restartDialog(page);
    await expect(dialog).toBeVisible();

    // REQ-8: both behind sessions, free, in the one open section, with their reasons.
    const now = dialogSection(dialog, "Restart now · 2");
    await expect(now).toBeVisible();
    await expect(dialogSection(dialog, "Restart when free")).toHaveCount(0);
    await expect(rowOf(now, "rs-e1-a")).toContainText("idle");
    await expect(rowOf(now, "rs-e1-b")).toContainText("idle");
    await expect(dialog.getByText("rs-e1-current")).toHaveCount(0);
    await expect(confirmButton(dialog)).toHaveText("Restart 2");

    const paneBefore = {
      a: await paneIdentity(daemon, a),
      b: await paneIdentity(daemon, b),
      bystander: await paneIdentity(daemon, bystander),
    };
    const { ids, result } = await confirmAndCapture(page, () => confirmButton(dialog).click());
    expect([...ids].sort()).toEqual([a.session.id, b.session.id].sort());
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.queued).toEqual([]);
    expect([...result.done].sort()).toEqual([a.session.id, b.session.id].sort());
    await expect(dialog).toBeHidden();

    // Both go dead then alive again, same row, same title, a new pane.
    await expectRestartedInPlace(page, daemon, a, paneBefore.a);
    await expectRestartedInPlace(page, daemon, b, paneBefore.b);
    for (const s of [a, b]) {
      const w = await wire(page, daemon, s.session.id);
      expect(w.alive).toBe(true);
      await expect(sessionCard(page, s.title)).not.toHaveClass(/ended/);
    }

    // The bystander was never stopped, resumed or marked.
    expect(await paneIdentity(daemon, bystander)).toBe(paneBefore.bystander);
    const after = await wire(page, daemon, bystander.session.id);
    expect(after.alive).toBe(true);
    expect(after.restartPending).toBe(false);
    expect(after.claudeVersion).toEqual({ running: INSTALLED, behind: false });

    // The new processes' first posts report the installed version; the notice is gone.
    await postRunningVersion(request, daemon, a, INSTALLED);
    await postRunningVersion(request, daemon, b, INSTALLED);
    await expect
      .poll(async () => (await wire(page, daemon, a.session.id)).claudeVersion)
      .toEqual({ running: INSTALLED, behind: false });
    await expect
      .poll(async () => (await wire(page, daemon, b.session.id)).claudeVersion)
      .toEqual({ running: INSTALLED, behind: false });
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a working behind session confirmed in the dialog is queued, then restarted when its Stop reports no background tasks (E2, REQ-4, REQ-5, REQ-9, REQ-13)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const busy = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-e2-busy",
      "2.1.317",
      "working",
    );
    const bystander = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-e2-current",
      INSTALLED,
      "idle",
    );
    await expect(noticeButton(page)).toHaveText(/^claude 2\.1\.317→318/);

    const dialog = await openRestartDialog(page);
    const later = dialogSection(dialog, "Restart when free · 1");
    await expect(later).toBeVisible();
    await expect(dialogSection(dialog, "Restart now")).toHaveCount(0);
    await expect(rowOf(later, "rs-e2-busy")).toContainText("working");
    await expect(confirmButton(dialog)).toHaveText("Queue 1");

    const busyPane = await paneIdentity(daemon, busy);
    const bystanderPane = await paneIdentity(daemon, bystander);
    const { ids, result } = await confirmAndCapture(page, () => confirmButton(dialog).click());
    expect(ids).toEqual([busy.session.id]);
    expect(result).toEqual({ done: [], queued: [busy.session.id], skipped: [], failed: [] });
    await expect(dialog).toBeHidden();

    // REQ-9: the readout reads the queue; nothing restarted yet.
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    await expect
      .poll(async () => (await wire(page, daemon, busy.session.id)).restartPending)
      .toBe(true);
    const queued = await wire(page, daemon, busy.session.id);
    expect(queued.alive).toBe(true);
    expect(queued.claudeVersion).toEqual({ running: "2.1.317", behind: true });
    expect(await paneIdentity(daemon, busy)).toBe(busyPane);

    // The panel lists the pending session with its reason, and offers no way to cancel.
    await noticeButton(page).click();
    await expect(panelHead(page)).toBeVisible();
    await expect(panel(page).getByText("Restart when free · 1", { exact: true })).toBeVisible();
    await expect(rowOf(panel(page), "rs-e2-busy")).toContainText("working");
    await expect(ignoreButton(page)).toHaveCount(0);
    await expect(panelRestartButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /cancel/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panelHead(page)).toBeHidden();

    // The turn ends with no background tasks: the daemon restarts it, once, in place.
    await stopTurn(request, daemon, busy, 0);
    await expectRestartedInPlace(page, daemon, busy, busyPane);
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));
    await expect(sessionCard(page, busy.title)).not.toHaveClass(/ended/);
    expect(await paneIdentity(daemon, bystander)).toBe(bystanderPane);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a mixed batch restarts the free session at once and queues the busy ones, each restarting only when its own session is free (REQ-4, REQ-5, REQ-8, REQ-9, REQ-13, D7, D11)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const free = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-mix-a",
      "2.1.317",
      "idle",
    );
    const working = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-mix-b",
      "2.1.317",
      "working",
    );
    const tasks = await openSession(
      page,
      request,
      daemon,
      dirs[2].path,
      "rs-mix-c",
      "2.1.316",
      "idleWithTask",
    );
    await expect(noticeButton(page)).toHaveText(/^claude 2\.1\.316→318/);

    await noticeButton(page).click();
    await expect(panelCountRow(page, "Restart now")).toHaveText(/^Restart now\s*1$/);
    await expect(panelCountRow(page, "Restart when free")).toHaveText(/^Restart when free\s*2$/);
    await panelRestartButton(page).click();
    const dialog = restartDialog(page);
    await expect(dialog).toBeVisible();

    const now = dialogSection(dialog, "Restart now · 1");
    const later = dialogSection(dialog, "Restart when free · 2");
    await expect(rowOf(now, "rs-mix-a")).toContainText("idle");
    await expect(rowOf(later, "rs-mix-b")).toContainText("working");
    await expect(rowOf(later, "rs-mix-c")).toContainText(/idle · 1 background tasks?/);
    await expect(confirmButton(dialog)).toHaveText("Restart 1, queue 2");

    const pane = {
      free: await paneIdentity(daemon, free),
      working: await paneIdentity(daemon, working),
      tasks: await paneIdentity(daemon, tasks),
    };
    const { ids, result } = await confirmAndCapture(page, () => confirmButton(dialog).click());
    expect([...ids].sort()).toEqual([free.session.id, working.session.id, tasks.session.id].sort());
    expect(result.done).toEqual([free.session.id]);
    expect([...result.queued].sort()).toEqual([working.session.id, tasks.session.id].sort());
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);

    await expectRestartedInPlace(page, daemon, free, pane.free);
    await expect(noticeButton(page)).toHaveText(/^claude ↻2 queued/);
    for (const s of [working, tasks]) {
      await expect
        .poll(async () => (await wire(page, daemon, s.session.id)).restartPending)
        .toBe(true);
      expect(await paneIdentity(daemon, s), `${s.title} is untouched while queued`).toBe(
        s === working ? pane.working : pane.tasks,
      );
    }

    // The panel lists both pending sessions under the queued heading.
    await noticeButton(page).click();
    await expect(panel(page).getByText("Restart when free · 2", { exact: true })).toBeVisible();
    await expect(rowOf(panel(page), "rs-mix-b")).toContainText("working");
    await expect(rowOf(panel(page), "rs-mix-c")).toContainText(/idle · 1 background tasks?/);
    await page.keyboard.press("Escape");

    // B's turn ends: only B restarts. C, idle with a task still running, stays queued.
    await stopTurn(request, daemon, working, 0);
    await expectRestartedInPlace(page, daemon, working, pane.working);
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    await settleFor(page, 1_000); // C must STAY pending and untouched; nothing frees it yet
    const stillPending = await wire(page, daemon, tasks.session.id);
    expect(stillPending.restartPending).toBe(true);
    expect(stillPending.alive).toBe(true);
    expect(await paneIdentity(daemon, tasks)).toBe(pane.tasks);

    // The task finishes and a Stop reports none: C restarts and the notice goes.
    await stopTurn(request, daemon, tasks, 0);
    await expectRestartedInPlace(page, daemon, tasks, pane.tasks);
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

// The stub's `--version` holds its reply for HELD_CHECK_SECONDS in both tests below, so the window
// between a daemon restart and its first installed-version result is long enough to observe:
// `claude unknown` on the readout is the oracle that the window is still open.
const HELD_CHECK_SECONDS = 6;

test("a pending restart survives a daemon restart, stays off the wire until the first installed-version result, then shows as queued and fires when the session becomes free (REQ-2, REQ-6, REQ-9, D10)", async ({
  page,
  request,
  startDaemon,
}) => {
  const daemon = await startDaemon({
    stubClaudeVersion: INSTALLED,
    stubClaudeVersionDelaySeconds: HELD_CHECK_SECONDS,
  });
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const busy = await openSession(page, request, daemon, dir, "rs-persist", "2.1.317", "working");
    const dialog = await openRestartDialog(page);
    await confirmAndCapture(page, () => confirmButton(dialog).click());
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    await expect
      .poll(async () => (await wire(page, daemon, busy.session.id)).restartPending)
      .toBe(true);
    const busyPane = await paneIdentity(daemon, busy);

    await daemon.restart();
    await page.reload();
    await waitForHello(page);
    await expect(sessionCard(page, busy.title)).toBeVisible();

    // Held: the installed version is not known yet, so the reloaded mark is off the wire. The
    // session is alive, reports its running version and is neither behind nor pending, and the
    // masthead has no queued notice.
    await expect(claudeVersionReadout(page)).toHaveText("claude unknown");
    const held = await wire(page, daemon, busy.session.id);
    expect(held.alive).toBe(true);
    expect(held.claudeVersion).toEqual({ running: "2.1.317", behind: false });
    expect(held.restartPending).toBe(false);
    await expect(noticeButton(page)).toHaveCount(0);
    expect(await paneIdentity(daemon, busy)).toBe(busyPane);

    // Released: the first installed-version result re-derives the mark. The session is behind and
    // pending again, still busy and untouched, with the queued notice shown.
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    const released = await wire(page, daemon, busy.session.id);
    expect(released.claudeVersion).toEqual({ running: "2.1.317", behind: true });
    expect(released.restartPending).toBe(true);
    expect(released.alive).toBe(true);
    expect(await paneIdentity(daemon, busy)).toBe(busyPane);

    // And the queue still fires when the session frees.
    await stopTurn(request, daemon, busy, 0);
    await expectRestartedInPlace(page, daemon, busy, busyPane);
    await expect(noticeButton(page)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a pending session that becomes free while its mark is held is not restarted until the first installed-version result, which then restarts it (REQ-6, REQ-9)", async ({
  page,
  request,
  startDaemon,
}) => {
  const daemon = await startDaemon({
    stubClaudeVersion: INSTALLED,
    stubClaudeVersionDelaySeconds: HELD_CHECK_SECONDS,
  });
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const busy = await openSession(
      page,
      request,
      daemon,
      dir,
      "rs-held-free",
      "2.1.317",
      "working",
    );
    const dialog = await openRestartDialog(page);
    await confirmAndCapture(page, () => confirmButton(dialog).click());
    await expect
      .poll(async () => (await wire(page, daemon, busy.session.id)).restartPending)
      .toBe(true);
    const busyPane = await paneIdentity(daemon, busy);

    await daemon.restart();
    await page.reload();
    await waitForHello(page);
    await expect(sessionCard(page, busy.title)).toBeVisible();
    await expect(claudeVersionReadout(page)).toHaveText("claude unknown");

    // The turn ends while the check is still running: the session is free, but its mark is held,
    // so nothing restarts it and nothing is queued on the wire.
    await stopTurn(request, daemon, busy, 0);
    await expect.poll(async () => (await wire(page, daemon, busy.session.id)).state).toBe("idle");
    await settleFor(page, 1_000); // the held mark must NOT fire inside the window
    await expect(claudeVersionReadout(page)).toHaveText("claude unknown");
    const held = await wire(page, daemon, busy.session.id);
    expect(held.alive).toBe(true);
    expect(held.restartPending).toBe(false);
    expect(held.claudeVersion).toEqual({ running: "2.1.317", behind: false });
    expect(await paneIdentity(daemon, busy)).toBe(busyPane);

    // The first installed-version result releases the mark and the free session restarts in place.
    await expectRestartedInPlace(page, daemon, busy, busyPane);
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));
  } finally {
    await cleanup();
  }
});

test("Ignore from the keyboard hides the behind notice, a reload in the tab keeps it hidden and a new tab shows it again (E3, REQ-10)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const s = await openSession(page, request, daemon, dir, "rs-ignore", "2.1.317", "idle");
    await expect(noticeButton(page)).toHaveText(/^claude 2\.1\.317→318/);

    await noticeButton(page).click();
    await ignoreButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(panelHead(page)).toBeHidden();
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));

    // Ignoring is a display choice: the session is still behind and was not touched.
    const w = await wire(page, daemon, s.session.id);
    expect(w.claudeVersion).toEqual({ running: "2.1.317", behind: true });
    expect(w.restartPending).toBe(false);

    // Same tab, reloaded: the snapshot has rendered (the card is there) and the notice is still hidden.
    await page.reload();
    await waitForHello(page);
    await expect(sessionCard(page, s.title)).toBeVisible();
    await expect(noticeButton(page)).toHaveCount(0);
    await expect(claudeVersionReadout(page)).toHaveText(versionReadoutPattern(INSTALLED));

    // A new page in the same context has its own session storage: the notice shows again.
    const second = await page.context().newPage();
    await second.goto(daemon.dashboardUrl);
    await waitForHello(second);
    await expect(noticeButton(second)).toHaveText(/^claude 2\.1\.317→318/);
  } finally {
    await cleanup();
  }
});

test("Ignore hides only the behind part: a pending session's queued notice shows regardless (REQ-10, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const busy = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-ign-busy",
      "2.1.317",
      "working",
    );
    const dialog = await openRestartDialog(page);
    await confirmAndCapture(page, () => confirmButton(dialog).click());
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);

    // A second session falls behind afterwards: the label is the behind one again, with the queue in the panel.
    const idle = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-ign-idle",
      "2.1.317",
      "idle",
    );
    await expect(noticeButton(page)).toHaveText(/^claude 2\.1\.317→318/);
    await noticeButton(page).click();
    await expect(panelCountRow(page, "Restart now")).toHaveText(/^Restart now\s*1$/);
    await expect(panel(page).getByText("Restart when free · 1", { exact: true })).toBeVisible();

    await ignoreButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(panelHead(page)).toBeHidden();

    // The behind part is gone, the pending part is not.
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    await page.reload();
    await waitForHello(page);
    await expect(sessionCard(page, idle.title)).toBeVisible();
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    await noticeButton(page).click();
    await expect(panel(page).getByText("Restart when free · 1", { exact: true })).toBeVisible();
    await expect(rowOf(panel(page), "rs-ign-busy")).toContainText("working");
    await expect(ignoreButton(page)).toHaveCount(0);
    await expect(panelRestartButton(page)).toHaveCount(0);
    expect((await wire(page, daemon, busy.session.id)).restartPending).toBe(true);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("the whole restart is drivable from the keyboard and focus survives a render tick in the panel and the dialog (REQ-7, REQ-8)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const busy = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-kbd-busy",
      "2.1.317",
      "working",
    );
    const bystander = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-kbd-current",
      INSTALLED,
      "idle",
    );
    const tag = async (locator: Locator, name: string) =>
      await locator.evaluate((el, n) => el.setAttribute("data-e2e-tag", n), name);
    const tagged = (name: string) => page.locator(`[data-e2e-tag="${name}"]`);
    const focusIsLive = async () =>
      await page.evaluate(() => {
        const a = document.activeElement;
        return a !== null && a !== document.body && a !== document.documentElement;
      });
    // A render tick: another session's status post changes its context gauge, so the dashboard re-renders.
    let pct = 40;
    const tick = async () => {
      pct += 1;
      await postRunningVersion(request, daemon, bystander, INSTALLED, { contextUsedPct: pct });
      await settleFor(page, 1_200);
    };

    // Readout: focus it, open the panel with Enter, survive a tick.
    const readout = noticeButton(page);
    await expect(readout).toHaveText(/^claude 2\.1\.317→318/);
    await readout.focus();
    await tag(readout, "readout");
    await page.keyboard.press("Enter");
    await expect(panelRestartButton(page)).toBeVisible();
    await tick();
    await expect(tagged("readout"), "the readout node survived the tick").toHaveCount(1);
    await expect(panelRestartButton(page), "the panel stayed open across the tick").toBeVisible();
    expect(await focusIsLive(), "focus did not drop to the body").toBe(true);

    // Restart…: focus it, open the dialog with Enter, survive a tick with focus inside the dialog.
    const restart = panelRestartButton(page);
    await restart.focus();
    await tag(restart, "panel-restart");
    await page.keyboard.press("Enter");
    const dialog = restartDialog(page);
    await expect(dialog).toBeVisible();
    await tag(confirmButton(dialog), "confirm");
    await tick();
    await expect(dialog).toBeVisible();
    await expect(tagged("confirm"), "the confirm button node survived the tick").toHaveCount(1);
    await expect(confirmButton(dialog)).toHaveText("Queue 1");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      "focus stays inside the open dialog across the tick",
    ).toBe(true);

    // Confirm with the keyboard.
    const busyPane = await paneIdentity(daemon, busy);
    const { result } = await confirmAndCapture(page, async () => {
      await confirmButton(dialog).focus();
      await page.keyboard.press("Enter");
    });
    expect(result.queued).toEqual([busy.session.id]);
    await expect(dialog).toBeHidden();
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);
    expect(await paneIdentity(daemon, busy)).toBe(busyPane);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a session that goes idle while the dialog is open keeps its Restart when free row and is restarted at once on confirm (edge case 28, D5)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const turning = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-late-a",
      "2.1.317",
      "working",
    );
    const free = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-late-b",
      "2.1.317",
      "idle",
    );
    const dialog = await openRestartDialog(page);
    const now = dialogSection(dialog, "Restart now · 1");
    const later = dialogSection(dialog, "Restart when free · 1");
    await expect(rowOf(now, "rs-late-b")).toContainText("idle");
    await expect(rowOf(later, "rs-late-a")).toContainText("working");
    await expect(confirmButton(dialog)).toHaveText("Restart 1, queue 1");

    const paneBefore = {
      turning: await paneIdentity(daemon, turning),
      free: await paneIdentity(daemon, free),
    };
    await stopTurn(request, daemon, turning, 0);
    await expect
      .poll(async () => (await wire(page, daemon, turning.session.id)).state)
      .toBe("idle");

    // The dialog was predicted when it opened and keeps that prediction.
    await expect(dialog).toBeVisible();
    await expect(rowOf(later, "rs-late-a")).toBeVisible();
    await expect(confirmButton(dialog)).toHaveText("Restart 1, queue 1");

    // The daemon decides at confirm: the session is free now, so it is restarted, not queued.
    const { ids, result } = await confirmAndCapture(page, () => confirmButton(dialog).click());
    expect([...ids].sort()).toEqual([turning.session.id, free.session.id].sort());
    expect([...result.done].sort()).toEqual([turning.session.id, free.session.id].sort());
    expect(result.queued).toEqual([]);
    await expectRestartedInPlace(page, daemon, turning, paneBefore.turning);
    await expectRestartedInPlace(page, daemon, free, paneBefore.free);
    await expect(noticeButton(page)).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("stopping or removing a queued session clears its pending mark with no restart, and a queued neighbour still restarts when free (REQ-5, D8, D11)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await waitForHello(page);
    const stopped = await openSession(
      page,
      request,
      daemon,
      dirs[0].path,
      "rs-clear-stop",
      "2.1.317",
      "working",
    );
    const removed = await openSession(
      page,
      request,
      daemon,
      dirs[1].path,
      "rs-clear-remove",
      "2.1.317",
      "working",
    );
    const kept = await openSession(
      page,
      request,
      daemon,
      dirs[2].path,
      "rs-clear-kept",
      "2.1.317",
      "working",
    );
    const dialog = await openRestartDialog(page);
    await expect(confirmButton(dialog)).toHaveText("Queue 3");
    const { result } = await confirmAndCapture(page, () => confirmButton(dialog).click());
    expect(result.queued).toHaveLength(3);
    await expect(noticeButton(page)).toHaveText(/^claude ↻3 queued/);
    const keptPane = await paneIdentity(daemon, kept);

    // Stop: the pending mark and the running version go with the death, and nothing is resumed.
    const stopRes = await page.request.post(
      `${daemon.baseURL}/api/sessions/${stopped.session.id}/end`,
    );
    expect(stopRes.status()).toBe(200);
    await expect.poll(async () => (await wire(page, daemon, stopped.session.id)).alive).toBe(false);
    const dead = await wire(page, daemon, stopped.session.id);
    expect(dead.restartPending).toBe(false);
    expect(dead.claudeVersion).toBeNull();
    await expect(noticeButton(page)).toHaveText(/^claude ↻2 queued/);

    // Remove: the row is gone, nothing fires.
    const delRes = await page.request.delete(
      `${daemon.baseURL}/api/sessions/${removed.session.id}`,
    );
    expect(delRes.status()).toBe(204);
    await expect(sessionCard(page, removed.title)).toHaveCount(0);
    await expect(noticeButton(page)).toHaveText(/^claude ↻1 queued/);

    // Neither was restarted; the neighbour is still queued and untouched.
    await settleFor(page, 1_000);
    const stoppedAfter = await wire(page, daemon, stopped.session.id);
    expect(stoppedAfter.alive, "a stopped pending session is not resumed").toBe(false);
    expect(await daemon.tmuxPaneExists(stopped.session.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(removed.session.tmuxTarget)).toBe(false);
    const neighbour = await wire(page, daemon, kept.session.id);
    expect(neighbour.restartPending).toBe(true);
    expect(neighbour.alive).toBe(true);
    expect(await paneIdentity(daemon, kept)).toBe(keptPane);

    // The neighbour still restarts the moment it is free.
    await stopTurn(request, daemon, kept, 0);
    await expectRestartedInPlace(page, daemon, kept, keptPane);
    await expect(noticeButton(page)).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
