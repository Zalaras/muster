import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { MAX_DROP_BYTES, expectedEscapedPath, uniqueContent, writeFixtureFile } from "./helpers/dropfiles";
import { getState, launchSession, scratchDirectory } from "./helpers/session";
import {
  activeElementInsideTerminal,
  dragoverThenDropFiles,
  dropFiles,
  dropNotice,
  dropText,
  terminalOverlay,
  terminalRegion,
} from "./helpers/terminal";

// Plan file-drop-fix — REQ-1 (foreign-drag swallow), REQ-2/REQ-11 (locate→paste→focus),
// REQ-4 (Terminal.app-style escaping), REQ-6 (in-flight/outcome notices), REQ-7 (size
// cap), REQ-8 (dead/disconnected surfaces), REQ-10 (text drop).
// Plan acceptance: E1-E9, E11. E10 (INV-3, "the existing rail/tile reorder specs keep
// passing with the guard installed") is deliberately NOT re-authored here — it is already
// covered by rail-order.spec.ts and the move-tiles reorder tests in views.spec.ts, which
// this plan's Affected Files section names as the regression pin; re-running those files
// (unmodified) is this plan's proof for E10, not a new test in this file.
//
// The daemon and tmux are real throughout (the `-claude-bin` echo-loop stub, same as
// terminal.spec.ts) — nothing here is Claude-Code-shaped, so no hook/status-line payload
// is synthesized anywhere in this file. What IS synthesized is the dropped `File`/
// `DataTransfer` a real Finder drag would hand the page — built in-page via
// `page.evaluateHandle` (helpers/terminal.ts's `dropFiles`/`dropText`), never a real OS
// drag. Fixture file bytes are unique random content (helpers/dropfiles.ts) written to
// real paths under each test's own scratch directory, which — per the plan's own
// Implementation Notes — sits under `os.tmpdir()` and is therefore never Spotlight-
// indexed, so every locate call in this suite exercises the daemon's directory-walk path,
// never `mdfind`.
//
// Every test gets its own scratch daemon (`beforeEach`/`afterEach`), mirroring
// terminal.spec.ts: most tests here launch into Focus, where a newly launched session
// only becomes the live pane when it is "top of sort" — true only when it is the sole (or
// first) session the daemon knows about, which a shared daemon across parallel tests
// cannot guarantee.
//
// review cycle 1, Critical 1: these 11 tests each spawn their own scratch `musterd` PLUS
// a real tmux session, and `fullyParallel: true` at up to 6 workers let all of them spin
// up at once — enough added peak load on a 12-core machine to tip marginal assertions in
// OTHER spec files (terminal.spec.ts, theme.spec.ts, actions.spec.ts) into failure, 3
// times in 6 measured full-suite runs, with 0 failures across 3 branch-minus-drop.spec.ts
// runs and 5 main runs at the old 203-test load. None of those three files' assertions
// are this plan's to fix (routed to TODO.md instead), so the fix that stays in scope here
// is cutting drop.spec.ts's own contribution to that peak: serial mode makes these 11
// tests run one at a time in a single worker instead of fanning out across up to 6, so
// only one scratch daemon/tmux pair from this file is ever alive at once. Each test still
// gets its own fully independent daemon via beforeEach/afterEach above — this only serializes
// their wall-clock scheduling, it does not share state between them.
test.describe.configure({ mode: "serial" });

let daemon: ScratchDaemon;

test.beforeEach(async () => {
  daemon = await startScratchDaemon();
});

test.afterEach(async () => {
  await daemon.teardown();
});

test("dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const content = uniqueContent();
    const resolvedPath = await writeFixtureFile(join(dir, "shot.png"), content);
    const expected = expectedEscapedPath(resolvedPath);

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e1" });
    const region = terminalRegion(page, "drop-e1");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Precondition: a mounted-but-unclicked live pane never has keyboard focus (plan
    // terminal-focus's REQ-1, untouched by this plan) — the paste below is what should
    // move it, not anything upstream of the drop.
    expect(await activeElementInsideTerminal(page, "drop-e1")).toBe(false);

    await dropFiles(region, [{ name: "shot.png", bytes: content }]);

    // REQ-2: the escaped path lands at the cursor.
    await expect(region).toContainText(expected, { timeout: 15_000 });
    // REQ-6: the in-flight notice clears on success.
    await expect(dropNotice(region)).toBeHidden({ timeout: 15_000 });
    // REQ-11: focus follows a successful paste with no click on the region.
    expect(await activeElementInsideTerminal(page, "drop-e1")).toBe(true);

    // E1: pressing Enter submits the pasted (trailing-space-terminated) line; the stub's
    // echo proves the bytes reached the pty, not just the DOM.
    await page.keyboard.press("Enter");
    await expect(region).toContainText(`stub-echo:${expected}`, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const content = uniqueContent();
    const resolvedPath = await writeFixtureFile(join(dir, "my file.png"), content);
    const expected = expectedEscapedPath(resolvedPath);
    // Sanity on the oracle itself, not the product: this test is worthless if the fixture
    // filename doesn't actually exercise the escaping rule.
    expect(expected).toContain("my\\ file.png");

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e2" });
    const region = terminalRegion(page, "drop-e2");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await dropFiles(region, [{ name: "my file.png", bytes: content }]);

    await expect(region).toContainText(expected, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    // Deliberately never written to disk anywhere — E2E always exercises the walk (see
    // file header), which therefore finds no candidate for content that exists nowhere.
    const content = uniqueContent();

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e3" });
    const region = terminalRegion(page, "drop-e3");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await dropFiles(region, [{ name: "ghost.png", bytes: content }]);

    await expect(dropNotice(region)).toHaveText("Can't locate ghost.png on disk — paste its path instead", {
      timeout: 15_000,
    });
    // REQ-11 only fires on a successful paste — a failed locate must not move focus.
    expect(await activeElementInsideTerminal(page, "drop-e3")).toBe(false);

    // E3: the user still presses Enter out of habit; since nothing was pasted, the pty
    // receives (and echoes back) an empty line, never a path. Scoped to `.terminal-body`
    // (the xterm rendering element), not the whole surface: the still-visible failure
    // notice (`.terminal-notice`, REQ-6's ~5s hold) is a DOM sibling that legitimately
    // contains "ghost.png" in its own text, and xterm pads each row to full column width
    // with trailing spaces — `region`'s normalized textContent collapses that padding plus
    // the notice's adjacent text into "stub-echo: Can't locate ghost.png…", which a
    // `region`-scoped regex would misread as a pasted path. `.terminal-body` never
    // contains the notice, so it can't produce that false match.
    const terminalBody = region.locator(".terminal-body");
    await region.click();
    await page.keyboard.press("Enter");
    await expect(terminalBody).toContainText("stub-echo:", { timeout: 15_000 });
    await expect(terminalBody).not.toContainText(/stub-echo:.*ghost\.png/);
  } finally {
    await cleanup();
  }
});

test("dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const content = uniqueContent();
    // Same basename, two different subdirectories of the session directory, byte-
    // identical content (REQ-3/REQ-5) — the walk's own ambiguity case, since a single
    // directory cannot hold two entries with the same name.
    await writeFixtureFile(join(dir, "a", "dup.png"), content);
    await writeFixtureFile(join(dir, "b", "dup.png"), content);

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e4" });
    const region = terminalRegion(page, "drop-e4");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await dropFiles(region, [{ name: "dup.png", bytes: content }]);

    await expect(dropNotice(region)).toHaveText("dup.png matches 2 identical files — paste the path of the one you mean", {
      timeout: 15_000,
    });
    expect(await activeElementInsideTerminal(page, "drop-e4")).toBe(false);
  } finally {
    await cleanup();
  }
});

test("shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const content = uniqueContent();
    await writeFixtureFile(join(dir, "slow.png"), content);

    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "drop-locating" });
    const region = terminalRegion(page, "drop-locating");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Holds the real request open (not a fabricated response) so the otherwise sub-second
    // in-flight window is observable — same technique as actions.spec.ts's "loading last
    // screen…" Minor-9 regression test.
    let releaseLocate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseLocate = resolve;
    });
    await page.route(`**/api/sessions/${session.id}/locate`, async (route) => {
      await gate;
      await route.continue();
    });

    await dropFiles(region, [{ name: "slow.png", bytes: content }]);

    await expect(dropNotice(region)).toHaveText("Locating slow.png…", { timeout: 15_000 });

    releaseLocate();
    await expect(dropNotice(region)).toBeHidden({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e5" });
    await expect(terminalRegion(page, "drop-e5")).toBeVisible();

    const urlBefore = page.url();
    // dragover THEN drop (not a bare dispatched drop) — Implementation Notes: this is the
    // one case that must exercise the document-level guard's real `dragover` listener,
    // since a plain `drop`-only dispatch would never prove the guard claims the gesture
    // before any browser-native navigation attempt would.
    await dragoverThenDropFiles(page.locator("#mainhead"), [{ name: "anything.png", size: 16 }]);

    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("#sessions")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("dropping text/plain with no files pastes the text verbatim (E6, REQ-10)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-e6" });
    const region = terminalRegion(page, "drop-e6");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await dropText(region, "hello there");
    await page.keyboard.press("Enter");
    // REQ-10: no escaping is applied to a text drop — a file drop of the same string
    // would never reach the pty verbatim like this (spaces would gain backslashes).
    await expect(region).toContainText("stub-echo:hello there", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a file over 50 MiB shows the too-large notice and issues no locate request (E7)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "drop-e7" });
    const region = terminalRegion(page, "drop-e7");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    let locateRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes(`/api/sessions/${session.id}/locate`)) locateRequests += 1;
    });

    // Size-only fixture (no `bytes`) — REQ-7 is a client-side size check before any
    // upload, so the actual content is irrelevant and never needs to cross the CDP wire.
    await dropFiles(region, [{ name: "huge.bin", size: MAX_DROP_BYTES + 1 }]);

    await expect(dropNotice(region)).toHaveText("huge.bin is over 50 MiB — paste its path instead", {
      timeout: 15_000,
    });
    expect(locateRequests).toBe(0);
  } finally {
    await cleanup();
  }
});

test("in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4)", async ({
  page,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    const content = uniqueContent();
    const resolvedPath = await writeFixtureFile(join(dirB.path, "in-b.png"), content);
    const expected = expectedEscapedPath(resolvedPath);

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "drop-e8-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "drop-e8-b" });

    await page.getByRole("button", { name: "Tiles" }).click();
    // Default density is 2×2 (views.spec.ts E11) — two launched sessions are both live
    // tiles with no further setup.
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const regionA = terminalRegion(page, "drop-e8-a");
    const regionB = terminalRegion(page, "drop-e8-b");
    await expect(regionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const beforeA = await regionA.textContent();

    // The fixture file lives only in B's session directory (REQ-5: locate walks THAT
    // session's directory), so a routing bug that located it via A's directory instead
    // would fail this drop outright rather than silently mis-target.
    await dropFiles(regionB, [{ name: "in-b.png", bytes: content }]);

    await expect(regionB).toContainText(expected, { timeout: 15_000 });
    expect(await regionA.textContent()).toBe(beforeA);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "drop-e9" });
    const region = terminalRegion(page, "drop-e9");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Wait for at least one pane snapshot to be captured while still alive (same trap as
    // terminal.spec.ts's dead-surface test: killing before the first liveness-poll tick
    // can otherwise race an empty snapshot).
    await expect
      .poll(async () => (await page.request.get(`${daemon.baseURL}/api/sessions/${session.id}/pane`)).status(), {
        timeout: 15_000,
      })
      .toBe(200);

    await daemon.killTmuxWindow(session.tmuxTarget);
    await expect
      .poll(async () => {
        const state = await getState(page, daemon);
        return state.sessions.find((s) => s.id === session.id)?.alive;
      })
      .toBe(false);

    await page.reload();
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });

    let locateRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/locate")) locateRequests += 1;
    });
    const urlBefore = page.url();

    await dragoverThenDropFiles(deadSurface, [{ name: "anything.png", size: 16 }]);

    expect(page.url()).toBe(urlBefore);
    // REQ-8: "nothing to paste into, by design" — the drop must leave no visible trace
    // anywhere on the page, not just inside `#dead-surface`.
    //
    // review cycle 1, Major 3: the previous clause here, `deadSurface.locator(
    // ".terminal-notice")` having count 0, is unfalsifiable — `.terminal-notice` is only
    // ever created inside `TerminalSurface`'s constructor (web/src/terminal/pane.ts),
    // which never runs for `#dead-surface`'s static markup regardless of what the
    // implementation does, so that count is 0 by construction whether or not REQ-8 is
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
      // "session ended" label (web/index.html, plan m4-reconcile) — only the phrases
      // file-drop-fix's own notices actually use (REQ-6's exact strings elsewhere in
      // this file), so a real leak of any of them is what fails this loop.
      expect(text).not.toMatch(/locating|can't locate|matches \d+ identical|over 50 mib|isn't connected/i);
    }
    expect(locateRequests).toBe(0);
  } finally {
    await cleanup();
  }
});

test("a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "drop-notconn" });
    const region = terminalRegion(page, "drop-notconn");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Same fixture as terminal.spec.ts's E13 ("daemon down while a terminal is
    // attached"): killing the daemon closes the terminal WS out from under the still-
    // mounted surface, which is exactly REQ-8's "socket not open" half (distinct from the
    // dead-session half above, where the surface never mounts at all).
    await daemon.kill();
    await expect(terminalOverlay(region)).toHaveText(/disconnected/i, { timeout: 15_000 });

    let locateRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/locate")) locateRequests += 1;
    });

    await dropFiles(region, [{ name: "whatever.png", size: 16 }]);

    await expect(dropNotice(region)).toHaveText("Pane isn't connected — nothing pasted", { timeout: 15_000 });
    expect(locateRequests).toBe(0);
  } finally {
    await cleanup();
  }
});
