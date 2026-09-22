import { expect, type Locator, type Page, test } from "./helpers/fixtures";
import { launchSession, scratchDirectory } from "./helpers/session";
import { mainheadSurfaceButton, shellSurfaceRegion, shellTmuxTarget } from "./helpers/shell";
import {
  lastNonBlankLine,
  tmuxCapturePane,
  tmuxMouseOption,
  waitForAnimationFrame,
} from "./helpers/shellinput";

// Plan terminal-fixes-cleanup — REQ-7 through REQ-12, INV-2. Fixture plan: `daemon` per
// test — these assert tmux copy-mode state for the only session on the socket.
//
// The daemon and tmux are real throughout (plain-shell.spec.ts's own header applies
// unchanged): only the Claude side of a session ever runs the harness's stub, never the
// shell. A wheel gesture is synthesized with `page.mouse.wheel` after `page.mouse.move`
// puts the pointer over the shell surface first — `page.mouse.wheel` fires at the
// pointer's current position, it does not accept a target locator (reader-mermaid.spec.ts's
// diagram-zoom test is this suite's existing precedent for the same two-call shape).

/** Fills the pane with enough real history that a wheel-up has somewhere to scroll to
 * (E4/E5/E10) — the plan's own spike measured 179 real lines from ordinary use; 200
 * generated lines comfortably exceeds any Focus-pane viewport height. */
async function fillShellHistory(shellRegion: Locator): Promise<void> {
  await shellRegion.click();
  await shellRegion.page().keyboard.type("for i in $(seq 1 200); do echo hist-line-$i; done");
  await shellRegion.page().keyboard.press("Enter");
  await expect(shellRegion).toContainText("hist-line-200", { timeout: 15_000 });
}

async function wheelOverRegion(page: Page, region: Locator, deltaY: number): Promise<void> {
  const box = await region.boundingBox();
  if (!box) throw new Error("shell surface has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
}

/**
 * Reproduces review cycle 1 Major 1's measured trackpad shape: `count` small wheel events
 * of `deltaY` each, one `flushWheelScroll` per event (`waitForAnimationFrame` between
 * dispatches — see its own comment for why that's load-bearing here). `wheelOverRegion`
 * above always sends one event per call site, and every existing test in this file uses
 * deltas ≥ 300, which cross a whole line in a single flush and so never exercised the
 * accumulator's cross-frame carry at all — exactly why the reviewer's measured defect
 * (60 × `deltaY = -4` scrolling nothing) shipped past 394 green E2E tests.
 */
async function wheelSlowScroll(
  page: Page,
  region: Locator,
  deltaY: number,
  count: number,
): Promise<void> {
  const box = await region.boundingBox();
  if (!box) throw new Error("shell surface has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < count; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await waitForAnimationFrame(page);
  }
}

test("the tmux server's mouse option stays off once a shell is spawned (D7, INV-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-scroll-mouse-off" });
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "shell-scroll-mouse-off")).toBeVisible({
      timeout: 15_000,
    });

    expect(await tmuxMouseOption(daemon)).toBe("off");
  } finally {
    await cleanup();
  }
});

test("dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "shell-scroll-e13" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-e13");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("echo shell-scroll-e13-drag-target");
    await page.keyboard.press("Enter");
    // getByText's substring match resolves to every row that contains the marker: the
    // still-visible typed command line (echoing "echo shell-scroll-e13-drag-target") as
    // well as its own output row, and an interactive shell that colours its argument
    // tokens differently from the command name can even split the typed line into a span
    // whose own text is an exact match too. `.last()` always picks the output row without
    // depending on any of that: xterm.js's DOM renderer keeps one row div per screen line
    // in fixed top-to-bottom document order and rewrites a row's content in place rather
    // than reordering nodes, so the bottommost matching element is reliably the row that
    // rendered last — the command's output, one line below what produced it.
    const textLine = shellRegion.getByText("shell-scroll-e13-drag-target").last();
    await expect(textLine).toBeVisible({ timeout: 15_000 });

    // xterm's DOM renderer rewrites row content as output streams in, so a single
    // boundingBox() snapshot can land in the gap between the outgoing and incoming
    // content and read back null even though the row was visible an instant before and
    // an instant after. Poll instead of reading once: each attempt re-resolves the
    // locator against the live DOM rather than reusing a handle. The result is captured
    // on an object property, not a bare `let`, so a later null-check on it narrows
    // normally instead of TypeScript treating an outer variable only ever written inside
    // this closure as permanently `null`.
    const captured: { box: Awaited<ReturnType<Locator["boundingBox"]>> } = { box: null };
    await expect
      .poll(
        async () => {
          captured.box = await textLine.boundingBox();
          return captured.box !== null;
        },
        { message: "waiting for the drag target row to have a stable bounding box" },
      )
      .toBe(true);
    const box = captured.box;
    if (!box) throw new Error("drag target text has no bounding box");
    await page.mouse.move(box.x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    // xterm.js's DOM renderer never populates the native `window.getSelection()` — it
    // draws its own selection as `div`s appended under a `.xterm-selection` overlay
    // element (its own SelectionService, `_core.getSelection()`, is the source of truth).
    // A non-empty overlay is the real oracle for "the browser shows a drag-select".
    const selectionOverlay = shellRegion.locator(".xterm-selection");
    await expect
      .poll(() => selectionOverlay.evaluate((el) => el.childElementCount), {
        message: "waiting for xterm's selection overlay to gain a highlighted row",
      })
      .toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-scroll-e4e5",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-e4e5");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await fillShellHistory(shellRegion);

    const target = shellTmuxTarget(session.id);
    await wheelOverRegion(page, shellRegion, -300);

    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the shell pane to enter copy-mode",
      })
      .toBe("1");
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{scroll_position}"), {
        message: "waiting for a non-zero scroll position",
      })
      .not.toBe("0");

    // E5: wheeling back down to the bottom leaves copy-mode by itself (`copy-mode -e`),
    // no explicit exit frame.
    await wheelOverRegion(page, shellRegion, 3000);
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the shell pane to auto-exit copy-mode at the bottom",
      })
      .toBe("0");

    // INV-2: scrolling through copy-mode and back never turned tmux mouse tracking on.
    expect(await tmuxMouseOption(daemon)).toBe("off");
  } finally {
    await cleanup();
  }
});

test("a slow trackpad-shaped wheel gesture — many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-scroll-slow",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-slow");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await fillShellHistory(shellRegion);

    const target = shellTmuxTarget(session.id);
    // The reviewer's own measured repro: 60 events of deltaY = -4 (240px of intent,
    // 12 lines at PIXELS_PER_LINE = 20), each landing in its own animation frame so no
    // single flush ever accumulates enough deltaY on its own to round to a whole line —
    // pre-fix, `flushWheelScroll` zeroed the accumulator on every one of those 60 no-op
    // flushes and the pane never moved at all.
    await wheelSlowScroll(page, shellRegion, -4, 60);

    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the slow gesture's accumulated sub-line deltas to enter copy-mode",
      })
      .toBe("1");
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{scroll_position}"), {
        message: "waiting for a non-zero scroll position from the accumulated gesture",
      })
      .not.toBe("0");
  } finally {
    await cleanup();
  }
});

test("a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "shell-scroll-e6" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-e6");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    // A history entry the old cursor-key fallback would recall onto the empty prompt
    // below (Up-arrow history navigation) if the wheel still leaked as cursor keys.
    await shellRegion.click();
    await page.keyboard.type("echo e6-history-marker");
    await page.keyboard.press("Enter");
    await expect(shellRegion).toContainText("e6-history-marker", { timeout: 15_000 });

    const target = shellTmuxTarget(session.id);
    await wheelOverRegion(page, shellRegion, -300);
    // Return to the live bottom before reading the command line, so a still-scrolled
    // copy-mode viewport is never mistaken for the live prompt.
    await wheelOverRegion(page, shellRegion, 3000);
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting to return to the live bottom before reading the prompt",
      })
      .toBe("0");

    await expect
      .poll(
        async () =>
          lastNonBlankLine(await tmuxCapturePane(daemon, target)).includes("e6-history-marker"),
        { message: "the live command line must stay clear of any recalled history" },
      )
      .toBe(false);
  } finally {
    await cleanup();
  }
});

test("wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "shell-scroll-e9" });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-e9");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    const target = shellTmuxTarget(session.id);
    // A freshly spawned pane: `#{history_size}` is 1 (edge case 10), so there's
    // essentially nothing to scroll to — the guard is "greater than zero", not "enough".
    await wheelOverRegion(page, shellRegion, -6000);
    await wheelOverRegion(page, shellRegion, 6000);

    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the pane to settle out of copy-mode after clamped scrolling",
      })
      .toBe("0");
  } finally {
    await cleanup();
  }
});

test("typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "shell-scroll-e10",
    });
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "shell-scroll-e10");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await fillShellHistory(shellRegion);

    const target = shellTmuxTarget(session.id);
    await wheelOverRegion(page, shellRegion, -300);
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the shell pane to enter copy-mode",
      })
      .toBe("1");

    await shellRegion.click();
    await page.keyboard.type("e");
    await expect
      .poll(() => daemon.tmuxDisplay(target, "#{pane_in_mode}"), {
        message: "waiting for the keystroke to cancel copy-mode and return to the bottom",
      })
      .toBe("0");

    await page.keyboard.type("cho e10-scrolled-marker");
    await page.keyboard.press("Enter");
    await expect(shellRegion).toContainText("e10-scrolled-marker", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});
