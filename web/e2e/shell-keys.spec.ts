import { expect, settleFor, test } from "./helpers/fixtures";
import { launchSession, scratchDirectory } from "./helpers/session";
import { mainheadSurfaceButton, shellSurfaceRegion, shellTmuxTarget } from "./helpers/shell";
import { terminalRegion } from "./helpers/terminal";
import { OPTION_LEFT_RAW, tmuxCapturePane, WsByteRecorder } from "./helpers/shellinput";

// Plan terminal-fixes-cleanup — REQ-5, REQ-6, REQ-9, INV-1. Fixture plan: `daemon` per
// test — auto-focus needs the sole session, mirroring plain-shell.spec.ts's own header.
//
// Every test drives a REAL interactive $SHELL (as plain-shell.spec.ts already does for
// the shell surface) inside a real tmux pane; only the Claude side of each session ever
// runs the harness's `-claude-bin` stub — no real `claude` process anywhere in this file.
// The word/line-jump assertions read the pane back through `tmux capture-pane`, the
// plan's own named oracle for E1/E2, rather than the rendered DOM: a wrong insertion
// point still renders as *some* text, and only the pane's actual line-editor state can
// distinguish "landed at the word boundary" from "landed at the end of the line".

test("Option+Left twice, then a typed character, lands at the previous word boundary in a shell surface, verified against tmux capture-pane (E1, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "shell-keys-e1" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-keys-e1");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("foo bar");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.type("X");

    const target = shellTmuxTarget(session.id);
    await expect
      .poll(async () => (await tmuxCapturePane(daemon, target)).includes("Xfoo bar"), {
        message: "waiting for the word-jump insertion to land as 'Xfoo bar'",
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("Option+Right, after Option+Left twice, lands a typed character at the next word boundary in a shell surface (REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-keys-optright",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-keys-optright");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("foo bar");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.type("Q");

    // zsh's ZLE `forward-word` (the widget `ESC f` invokes) lands at the START of the
    // NEXT word, skipping the separating space — unlike bash/GNU readline's
    // end-of-current-word landing this test originally assumed. Measured directly
    // against this fixture's own spawned pane: cursor after "foo " + "Q" typed there
    // reads back as "foo Qbar", never "fooQ bar".
    const target = shellTmuxTarget(session.id);
    await expect
      .poll(async () => (await tmuxCapturePane(daemon, target)).includes("foo Qbar"), {
        message: "waiting for the word-jump insertion to land as 'foo Qbar'",
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("Cmd+Left, then a typed character, lands at the start of the line in a shell surface (E2, REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "shell-keys-e2" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-keys-e2");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("foo bar");
    await page.keyboard.press("Meta+ArrowLeft");
    await page.keyboard.type("Y");

    const target = shellTmuxTarget(session.id);
    await expect
      .poll(async () => (await tmuxCapturePane(daemon, target)).includes("Yfoo bar"), {
        message: "waiting for the line-start insertion to land as 'Yfoo bar'",
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("Cmd+Right, after Cmd+Left, lands a typed character at the end of the line in a shell surface (REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-keys-cmdright",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-keys-cmdright");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("foo bar");
    await page.keyboard.press("Meta+ArrowLeft");
    await page.keyboard.press("Meta+ArrowRight");
    await page.keyboard.type("Z");

    const target = shellTmuxTarget(session.id);
    await expect
      .poll(async () => (await tmuxCapturePane(daemon, target)).includes("foo barZ"), {
        message: "waiting for the line-end insertion to land as 'foo barZ'",
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("Option+Left and Cmd+Left over a Claude surface are sent as xterm's own raw, untranslated bytes — both before any shell exists and after switching back from a shell on the same session (E3, INV-1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    // Constructed before launchSession, since the Claude surface's socket opens as soon
    // as the session's tile/mainhead mounts (Playwright's `websocket` event only fires
    // for connections made after the listener is registered).
    const recorder = new WsByteRecorder(page, "/ws/terminal/");
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-keys-e3" });
    const claudeRegion = terminalRegion(page, "shell-keys-e3");
    await expect(claudeRegion).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Source state 1: no shell has ever existed for this session.
    await claudeRegion.click();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect
      .poll(() => recorder.sent.at(-1)?.equals(OPTION_LEFT_RAW) ?? false, {
        message: "waiting for the raw Option+Left CSI sequence on the Claude socket",
      })
      .toBe(true);

    // Cmd+Left over Claude sends nothing at all today (spike S7) — a stays-unchanged
    // check over a bounded window, hence settleFor rather than a web-first expect.
    const beforeMeta = recorder.sent.length;
    await page.keyboard.press("Meta+ArrowLeft");
    await settleFor(page, 500);
    expect(recorder.sent.length).toBe(beforeMeta);

    // Source state 2: a shell has since been opened (and is still running) on the SAME
    // session, then the user switches back to Claude — INV-1's "with a shell open on the
    // same session" source state.
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "shell-keys-e3")).toBeVisible({ timeout: 15_000 });
    await mainheadSurfaceButton(page, "claude").click();
    await expect(claudeRegion).toBeVisible({ timeout: 15_000 });

    await claudeRegion.click();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect
      .poll(() => recorder.sent.at(-1)?.equals(OPTION_LEFT_RAW) ?? false, {
        message: "waiting for the raw Option+Left CSI sequence after returning from the shell",
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});
