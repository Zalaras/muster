import { expect, test } from "./helpers/fixtures";
import { launchSession, scratchDirectory } from "./helpers/session";
import {
  createShellViaApi,
  mainheadSurfaceButton,
  shellSurfaceRegion,
  shellTmuxTarget,
  tileSurfaceButton,
} from "./helpers/shell";
import { shellActivityIndicator } from "./helpers/shellinput";
import { liveTileById, terminalRegion } from "./helpers/terminal";

// Plan terminal-fixes-cleanup — REQ-2, REQ-3, REQ-4, REQ-13, REQ-14, INV-3, INV-4.
// Fixture plan: `daemon` per test — indicator assertions depend on which session is
// auto-focused, so each test needs a daemon nobody else is sharing sessions on.
//
// `sleep N` is used throughout as the "silent, zero-output foreground command" REQ-14
// names directly (`sleep`, "a quiet go build", a network-bound download) — busy-ness
// comes from tmux's own process/tty state (Protocol Contract), never from anything the
// command prints, so a command that produces no output at all is exactly the case that
// distinguishes this design from an output-activity gate (plan Implementation Notes).

test("a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer, then a tick once it finishes (REQ-2, REQ-3, REQ-14)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-activity-basic",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-activity-basic");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 2");
    await page.keyboard.press("Enter");

    // The mainhead indicator is checked here, while Focus is still the active view —
    // `main.ts`'s render dispatch (`if (app.state.view === "focus") focus.renderView(frame);
    // else tiles.renderView(frame)`) runs exactly one of the two per tick, so the mainhead's
    // own DOM (only ever written by `focus.renderView`) is frozen at whatever it last showed
    // once Tiles becomes active — pre-existing, unrelated-to-this-plan architecture (the
    // tiles feature's own "snapshot-not-live rule"), not something this test can observe
    // past a view switch. The tile footer, not the mainhead, is this test's oracle for the
    // busy→done transition once Tiles is active.
    const mainheadIndicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(mainheadIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    await page.keyboard.press("Meta+Backslash");
    await expect(liveTileById(page, session.id)).toBeVisible();
    const tileIndicator = shellActivityIndicator(tileSurfaceButton(page, session.id, "shell"));
    await expect(tileIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    await expect(tileIndicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("the spinner stays visible on the shell segment while the user is on the Claude surface, becomes a tick when the work finishes, and clicking shell clears the tick immediately (User Flows 1-4, REQ-2, REQ-3, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-activity-away" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-activity-away");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 2");
    await page.keyboard.press("Enter");

    // User Flow 2: switch to Claude while the command runs — the spinner stays on the
    // shared segment regardless of which surface is currently selected.
    await mainheadSurfaceButton(page, "claude").click();
    await expect(terminalRegion(page, "shell-activity-away")).toBeVisible({ timeout: 15_000 });

    const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    // User Flow 3: the spinner becomes a tick and stays, still on Claude.
    await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });

    // User Flow 4: selecting the shell surface clears the tick.
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await expect(indicator).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a tick clears itself about 3s later when the shell surface was already selected when the work finished (REQ-4, User Flow 5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-activity-selfclear" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-activity-selfclear");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 2");
    await page.keyboard.press("Enter");

    const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
    await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });

    // Nobody ever selects a different surface here — the tick must clear on its own.
    await expect(indicator).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a shell that exits while busy leaves no spinner and no tick behind (E7, edge case 1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-activity-e7",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-activity-e7");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 30");
    await page.keyboard.press("Enter");

    const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    await daemon.killTmuxWindow(shellTmuxTarget(session.id));

    await expect(indicator).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a daemon restart mid-command clears the shell activity indicator to nothing rather than to a tick (E8, edge case 4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-activity-e8" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-activity-e8");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 30");
    await page.keyboard.press("Enter");

    const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    // Switch back to Claude first — it's the indicator, not the currently selected
    // surface, that E8 pins; reconcile kills every muster-<n>-shell session at startup
    // regardless of which surface a window happened to be showing.
    await mainheadSurfaceButton(page, "claude").click();
    await expect(terminalRegion(page, "shell-activity-e8")).toBeVisible({ timeout: 15_000 });

    await daemon.restart();

    // The state stream resyncs without a page reload (resilience.spec.ts's own oracle).
    await expect(page.getByRole("status")).toHaveText(/connected/i, { timeout: 15_000 });
    await expect(indicator).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("with two sessions' shells busy at once, exactly those two segments show spinners and a third idle shell shows none (E11, INV-4)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB, dirC] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "shell-activity-e11-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "shell-activity-e11-b",
    });
    const sessionC = await launchSession(page, daemon, {
      directory: dirC.path,
      title: "shell-activity-e11-c",
    });

    // Every tile carries its own independent surface state, so each session's shell can
    // be opened and driven from its own tile without disturbing the others.
    await page.keyboard.press("Meta+Backslash");
    await expect(liveTileById(page, sessionA.id)).toBeVisible();
    await expect(liveTileById(page, sessionB.id)).toBeVisible();
    await expect(liveTileById(page, sessionC.id)).toBeVisible();

    await tileSurfaceButton(page, sessionA.id, "shell").click();
    const shellA = shellSurfaceRegion(page, "shell-activity-e11-a");
    await expect(shellA).toBeVisible({ timeout: 15_000 });
    await shellA.click();
    await page.keyboard.type("sleep 5");
    await page.keyboard.press("Enter");

    await tileSurfaceButton(page, sessionB.id, "shell").click();
    const shellB = shellSurfaceRegion(page, "shell-activity-e11-b");
    await expect(shellB).toBeVisible({ timeout: 15_000 });
    await shellB.click();
    await page.keyboard.type("sleep 5");
    await page.keyboard.press("Enter");

    await tileSurfaceButton(page, sessionC.id, "shell").click();
    await expect(shellSurfaceRegion(page, "shell-activity-e11-c")).toBeVisible({ timeout: 15_000 });
    // Session C's shell stays idle — no command is ever run in it.

    const indicatorA = shellActivityIndicator(tileSurfaceButton(page, sessionA.id, "shell"));
    const indicatorB = shellActivityIndicator(tileSurfaceButton(page, sessionB.id, "shell"));
    const indicatorC = shellActivityIndicator(tileSurfaceButton(page, sessionC.id, "shell"));

    await expect(indicatorA).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
    await expect(indicatorB).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
    await expect(indicatorC).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup(), dirC.cleanup()]);
  }
});

test("a shell surface superseded by a second window while busy still tracks the spinner through /ws (E12)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-activity-e12" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegionA = shellSurfaceRegion(page, "shell-activity-e12");
    await expect(shellRegionA).toBeVisible({ timeout: 15_000 });

    await shellRegionA.click();
    await page.keyboard.type("sleep 5");
    await page.keyboard.press("Enter");

    const indicatorA = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicatorA).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await mainheadSurfaceButton(pageB, "shell").click();
      await expect(shellSurfaceRegion(pageB, "shell-activity-e12")).toBeVisible({
        timeout: 15_000,
      });

      // Window A's own shell PTY socket is now superseded (the plain-shell "another
      // window" overlay), but the activity indicator is driven by /ws, not the shell
      // socket (Protocol Contract), so it keeps tracking the same busy flag regardless.
      await expect(shellRegionA.getByText(/another window/i)).toBeVisible({ timeout: 15_000 });
      await expect(indicatorA).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

      const indicatorB = shellActivityIndicator(mainheadSurfaceButton(pageB, "shell"));
      await expect(indicatorB).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

      await expect(indicatorA).toHaveAttribute("data-act", "done", { timeout: 15_000 });
      await expect(indicatorB).toHaveAttribute("data-act", "done", { timeout: 15_000 });
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-activity-idle",
    });
    await createShellViaApi(page, daemon.baseURL, session.id);

    // The shell button's accessible name stays exactly "shell" (INV-3) — the indicator
    // is aria-hidden and never contributes to it — in the one indicator state reachable
    // without ever opening the surface: absent.
    const shellBtn = mainheadSurfaceButton(page, "shell");
    await expect(shellBtn).toHaveAccessibleName("shell");
    await expect(shellActivityIndicator(shellBtn)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// Plan rail-card-improvements-2 — REQ-6 (#51: the done indicator's glyph geometry).
// Plan acceptance: E7, E8, INV-3. Same fixture plan header as above.

test("the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-geometry-mainhead" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-geometry-mainhead");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("sleep 2");
    await page.keyboard.press("Enter");

    const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
    // REQ-6/Implementation Notes ("the tick is computed width against computed height"):
    // the indicator carries `transform: rotate(-45deg)`, and a 45°-rotated box's
    // getBoundingClientRect always reports a square regardless of its own aspect ratio
    // (cos45 == sin45, so bbox width == bbox height for ANY w×h at exactly 45°) — the
    // pre-transform box read via getComputedStyle is the only oracle that can actually
    // distinguish a circle from a tick.
    const busyBox = await indicator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: Number.parseFloat(cs.width), height: Number.parseFloat(cs.height) };
    });
    expect(busyBox.width).toBeCloseTo(busyBox.height, 1);
    expect(busyBox.width).toBeGreaterThan(0);

    await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
    // REQ-6/E7: the reshaped tick's own box is wider than tall (Overview: the pre-fix box
    // was 9×9, a symmetric chevron rather than a tick).
    const doneBox = await indicator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: Number.parseFloat(cs.width), height: Number.parseFloat(cs.height) };
    });
    expect(doneBox.width).toBeGreaterThan(doneBox.height);
  } finally {
    await cleanup();
  }
});

test("the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-geometry-tile",
    });
    await page.keyboard.press("Meta+Backslash");
    await expect(liveTileById(page, session.id)).toBeVisible();

    await tileSurfaceButton(page, session.id, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-geometry-tile");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await shellRegion.click();
    await page.keyboard.type("sleep 2");
    await page.keyboard.press("Enter");

    const indicator = shellActivityIndicator(tileSurfaceButton(page, session.id, "shell"));
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
    // INV-3: `.tfoot .surfseg .shellact` carries its own size override, so the busy
    // circle must stay equal-sided there too, independently of the mainhead assertion.
    // getComputedStyle, not getBoundingClientRect — see the mainhead test's own comment:
    // a 45°-rotated box's bounding rect is always square regardless of its own shape.
    const busyBox = await indicator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: Number.parseFloat(cs.width), height: Number.parseFloat(cs.height) };
    });
    expect(busyBox.width).toBeCloseTo(busyBox.height, 1);
    expect(busyBox.width).toBeGreaterThan(0);

    await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
    const doneBox = await indicator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: Number.parseFloat(cs.width), height: Number.parseFloat(cs.height) };
    });
    expect(doneBox.width).toBeGreaterThan(doneBox.height);
  } finally {
    await cleanup();
  }
});
