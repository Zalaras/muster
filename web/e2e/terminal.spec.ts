import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { getState, launchSession, scratchDirectory } from "./helpers/session";
import { parseSizenote, TerminalSocketTracker, terminalOverlay, terminalRegion } from "./helpers/terminal";

// Plan m2-terminal — REQ-1 (bridge), REQ-2/INV-1 (one-live-client), REQ-3 (resize),
// REQ-6 (PTY env/EOF), REQ-7 (Focus live pane), REQ-13 (degraded states).
// Plan acceptance: E1-E4, E12, E13.
//
// The terminal bridge is exercised entirely through the Focus view's live pane — the one
// terminal surface that exists with a single launched session — driven against the real
// `-claude-bin` echo-loop stub (helpers/daemon.ts, upgraded for this plan) over a real
// `/ws/terminal/{id}` socket. No real `claude` is ever launched.
//
// Every top-level test here gets its OWN scratch daemon (`beforeEach`/`afterEach`, not a
// file-shared `beforeAll`/`afterAll`): unlike sessions.spec.ts's shared-daemon tests
// (which only ever assert on a session scoped by its own title/card), most tests in this
// file launch a session and depend on Focus's default "auto-focus top of the §3.4 sort
// order" landing on THAT session — true only when it is the only session the daemon
// knows about. A file-shared daemon (the authoring-mode original) breaks that the moment
// two tests share one worker: later tests' newly launched session is no longer
// necessarily "top of sort", so its live terminal region never mounts and
// "MUSTER-STUB-READY" times out — reproduced directly (`--workers=1`, whole file
// sequential: 3/8 tests failed on exactly this depends-on-execution-order symptom; each
// test passed 5/5 in isolation). Per-test isolation removes the ordering dependency
// instead of just hiding it behind lucky worker scheduling.
let daemon: ScratchDaemon;

test.beforeEach(async () => {
  daemon = await startScratchDaemon();
});

test.afterEach(async () => {
  await daemon.teardown();
});

test("focusing a launched session streams the stub's readback and echoes typed input (E1, E2)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    // The only session in the run — Focus auto-focuses "top of the §3.4 sort order" on
    // load, so no rail click is needed to attach it.
    await launchSession(page, daemon, { directory: dir, title: "bridge-e1e2" });

    const region = terminalRegion(page, "bridge-e1e2");
    await expect(region).toBeVisible();
    // E1: the daemon-owned PTY's `tmux attach` streams the stub's startup line verbatim.
    // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // E2: typed bytes reach the stub process and its echoed line streams back — the full
    // round trip (client -> binary WS frame -> PTY -> tmux -> stub -> PTY -> WS -> xterm).
    await region.click();
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await expect(region).toContainText("stub-echo:hello");
  } finally {
    await cleanup();
  }
});

test("clicking a rail card swaps the live terminal to the newly focused session (REQ-7)", async ({ page }) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-swap-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "focus-swap-b" });

    // Exactly one live terminal region exists at a time in Focus.
    await expect(page.locator('[aria-label^="Terminal: "]')).toHaveCount(1);

    await page.getByTestId("session-card").filter({ hasText: "focus-swap-b" }).click();

    const regionB = terminalRegion(page, "focus-swap-b");
    await expect(regionB).toBeVisible();
    await expect(regionB).toContainText("MUSTER-STUB-READY");
    // The old surface is gone from the DOM entirely, not merely hidden — REQ-12/INV-2:
    // a session that is not the live surface never keeps an open terminal socket.
    await expect(terminalRegion(page, "focus-swap-a")).toHaveCount(0);
    await expect(page.locator('[aria-label^="Terminal: "]')).toHaveCount(1);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("focusing the same session from a second browser context supersedes the first (E3, INV-1)", async ({
  page,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "takeover-e3" });

    const regionA = terminalRegion(page, "takeover-e3");
    await expect(regionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // A second window authenticates via the same UI token URL (auth.spec.ts's pattern)
    // and, being the only session, also auto-focuses it — claiming the one-live-client
    // slot out from under the first window (INV-1: second-browser-context source state).
    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      const regionB = terminalRegion(pageB, "takeover-e3");
      await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

      // E3: the superseded overlay appears on the OLDER window's surface.
      await expect(terminalOverlay(regionA)).toHaveText(/another window/i);

      // The reclaimed surface must still round-trip input after supersede.
      await regionB.click();
      await page.keyboard.type("noop"); // typed into the (still-focused) old page — must not reach B
      await pageB.keyboard.type("hello");
      await pageB.keyboard.press("Enter");
      await expect(regionB).toContainText("stub-echo:hello");
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("supersede reclaims cleanly even when the older client was mid-keystroke (INV-1)", async ({
  page,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "takeover-midtype" });
    const regionA = terminalRegion(page, "takeover-midtype");
    await expect(regionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Start typing in the first window but do not submit — it is "mid-typing" when the
    // second window claims the socket (INV-1's fourth named source state).
    await regionA.click();
    await page.keyboard.type("still-typ");

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      const regionB = terminalRegion(pageB, "takeover-midtype");
      await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
      await expect(terminalOverlay(regionA)).toHaveText(/another window/i);

      // The new owner's own round trip still works — the mid-typing takeover left the
      // bridge in a healthy state, not a stuck one. Window A's unsubmitted "still-typ"
      // is still sitting in the real tty's canonical-mode line buffer (REQ-1: the daemon
      // transforms nothing — supersede swaps which socket owns the PTY, it does not, and
      // must not, touch the underlying line discipline's pending input), so Ctrl+U
      // (POSIX VKILL) clears it first — observed directly: without this, "world"+Enter
      // concatenates onto the pending buffer and echoes "stub-echo:still-typworld"
      // instead, which is correct raw-tty behaviour but would make this assertion an
      // accident of what window A happened to type rather than a clean proof that
      // window B's own round trip works.
      await regionB.click();
      await pageB.keyboard.press("Control+U");
      await pageB.keyboard.type("world");
      await pageB.keyboard.press("Enter");
      await expect(regionB).toContainText("stub-echo:world");
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("the tmux oracle's window geometry matches the terminal's own fitted size (E4)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "geometry-e4" });

    const region = terminalRegion(page, "geometry-e4");
    // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // REQ-15's sizenote line renders "<cols>×<rows> · one live client · ...".
    const sizenote = page.getByText(/one live client/i);
    await expect(sizenote).toBeVisible();

    // Re-read the sizenote on every poll attempt rather than parsing it once: main.ts's
    // render pass calls `surface.refit()` (main.ts:175) on every render tick BEFORE the
    // sizenote line is first unhidden, so the very first fit can measure the terminal
    // slot at its pre-sizenote height (one row taller than its steady state); the next
    // tick's refit (main.ts's documented "1s tick keeps ... geometry ... current")
    // corrects both the sizenote text and the resize frame sent to tmux to the settled
    // value. Parsing the sizenote exactly once right after it appears can therefore
    // capture that transient value and then poll forever for a tmux geometry the app
    // never intended to converge on. Re-parsing each attempt lets both sides settle
    // together, which is what E4 actually asserts: the two stay equal once both are
    // read fresh, not that a single early snapshot survives unchanged.
    await expect
      .poll(
        async () => {
          const { cols } = parseSizenote((await sizenote.textContent()) ?? "");
          const width = await daemon.tmuxDisplay(session.tmuxTarget, "#{window_width}");
          return width === cols;
        },
        { message: "waiting for the sizenote's fitted cols and tmux's #{window_width} to converge" },
      )
      .toBe(true);
    await expect
      .poll(
        async () => {
          const { rows } = parseSizenote((await sizenote.textContent()) ?? "");
          const height = await daemon.tmuxDisplay(session.tmuxTarget, "#{window_height}");
          return height === rows;
        },
        { message: "waiting for the sizenote's fitted rows and tmux's #{window_height} to converge" },
      )
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("killing the stub's tmux session shows the ended placeholder on its live surface (E12)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "pane-ended-e12" });
    const region = terminalRegion(page, "pane-ended-e12");
    // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await daemon.killTmuxWindow(session.tmuxTarget);

    await expect(terminalOverlay(region)).toHaveText(/session ended/i, { timeout: 15_000 });

    // REQ-6: PTY EOF also nudges the liveness poll, so `alive` eventually flips too —
    // corroborating evidence that this is the EOF path, not a hung/broken bridge.
    await expect
      .poll(
        async () => {
          const state = await getState(page, daemon);
          return state.sessions.find((s) => s.id === session.id)?.alive;
        },
        { message: "waiting for the liveness poll to notice the killed pane", timeout: 10_000 },
      )
      .toBe(false);
  } finally {
    await cleanup();
  }
});

test("focusing a dead session shows the ended placeholder without ever attempting a socket (REQ-13)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "dead-on-focus" });
    const region = terminalRegion(page, "dead-on-focus");
    // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await daemon.killTmuxWindow(session.tmuxTarget);
    await expect
      .poll(async () => {
        const state = await getState(page, daemon);
        return state.sessions.find((s) => s.id === session.id)?.alive;
      })
      .toBe(false);

    // Track terminal-socket opens from here on, then navigate away and back to force a
    // fresh focus decision against the now-dead session (the only session in this run, so
    // it is still "top of sort" and gets refocused).
    const tracker = new TerminalSocketTracker(page);
    await page.reload();
    await expect(terminalOverlay(terminalRegion(page, "dead-on-focus"))).toHaveText(/session ended/i, {
      timeout: 15_000,
    });
    // REQ-13: "no attach attempt" — the client must never even request /ws/terminal/ for
    // a session it already knows is dead (409 not_attachable is the server-side backstop).
    expect(tracker.liveCount).toBe(0);
  } finally {
    await cleanup();
  }
});

test.describe.serial("daemon down while a terminal is attached (E13)", () => {
  let restartDaemon: ScratchDaemon;

  test.beforeAll(async () => {
    restartDaemon = await startScratchDaemon();
  });

  test.afterAll(async () => {
    await restartDaemon.teardown();
  });

  test("shows the disconnected overlay while the daemon is down, and streams again after restart", async ({
    page,
  }) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(restartDaemon.dashboardUrl);
      await launchSession(page, restartDaemon, { directory: dir, title: "daemon-down-term" });
      const region = terminalRegion(page, "daemon-down-term");
      // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

      await restartDaemon.kill();

      const banner = page.getByRole("alert");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(terminalOverlay(region)).toHaveText(/disconnected/i, { timeout: 15_000 });

      await restartDaemon.restart();
      await expect(banner).toBeHidden({ timeout: 15_000 });

      // REQ-13: on `hello` the client reattaches its current live surface; tmux itself
      // survived the daemon restart (a separate process), so the pane repaints intact.
      await expect(terminalOverlay(region)).toBeHidden({ timeout: 15_000 });
      // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
    // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
    // Chromium) is occasionally slower than the default assertion timeout — observed
    // directly (5/5 passes in isolation, transient timeouts only under full-suite
    // parallelism) — never a case where the readback fails to arrive at all.
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });
});
