import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { pinButton, railCard, railOrderIds, railSortSelect } from "./helpers/railorder";
import { getState, launchSession, scratchDirectory, stateBadge } from "./helpers/session";
import {
  activeElementInsideAnyTerminal,
  activeElementInsideTerminal,
  parseSizenote,
  TerminalSocketTracker,
  terminalOverlay,
  terminalRegion,
} from "./helpers/terminal";

// Plan m2-terminal — REQ-1 (bridge), REQ-2/INV-1 (one-live-client), REQ-3 (resize),
// REQ-6 (PTY env/EOF), REQ-7 (Focus live pane), REQ-13 (degraded states).
// Plan acceptance: E1-E4, E12, E13.
//
// The terminal bridge is exercised entirely through the Focus view's live pane — the one
// terminal surface that exists with a single launched session — driven against the real
// `-claude-bin` echo-loop stub (helpers/daemon.ts, upgraded for this plan) over a real
// `/ws/terminal/{id}` socket. No real `claude` is ever launched.
//
// Every test here takes the `daemon` fixture (./helpers/fixtures — a fresh scratch daemon
// per test), never a file-shared one: unlike sessions.spec.ts's shared-daemon tests (which
// only ever assert on a session scoped by its own title/card), most tests in this file
// launch a session and depend on Focus's default "auto-focus top of the §3.4 sort order"
// landing on THAT session — true only when it is the only session the daemon knows about.
// A file-shared daemon (the authoring-mode original) breaks that the moment two tests share
// one worker: later tests' newly launched session is no longer necessarily "top of sort",
// so its live terminal region never mounts and "MUSTER-STUB-READY" times out — reproduced
// directly (`--workers=1`, whole file sequential: 3/8 tests failed on exactly this
// depends-on-execution-order symptom; each test passed 5/5 in isolation). Per-test
// isolation removes the ordering dependency instead of just hiding it behind lucky worker
// scheduling. The E13 restart test below needs it for a second reason: it kills and
// restarts its daemon, which no neighbour test could tolerate.

test("focusing a launched session streams the stub's readback and echoes typed input (E1, E2)", async ({
  page,
  daemon,
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

test("clicking a rail card swaps the live terminal to the newly focused session (REQ-7)", async ({ page, daemon }) => {
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
  daemon,
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
  daemon,
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

test("the tmux oracle's window geometry matches the terminal's own fitted size (E4)", async ({ page, daemon }) => {
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

test("killing the stub's tmux session ends its live surface: socket closed, dead surface shown, region unmounted (E12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    // Constructed before anything can open a terminal socket (helpers/terminal.ts: the
    // `websocket` event only fires for connections made after the listener is attached).
    const tracker = new TerminalSocketTracker(page);
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

    // Durable oracles only. This test used to assert the pane's `4001` "session ended"
    // overlay, which is a ~25 ms transient: the same PTY-EOF branch that closes the socket
    // with 4001 (`internal/server/terminal.go` pumpPTYToSocket) then nudges the liveness
    // poll, and the resulting `alive:false` upsert makes `render()` dispose the
    // TerminalSurface and show `#dead-surface` instead. Measured 2026-09-11 (timed probe):
    // overlay 5–9 ms after kill-window, dead surface ~30 ms after, and 1 of 15 kills never
    // rendered the overlay at all because the browser handled the state upsert before the
    // terminal socket's `close` event — a failure no timeout can fix. The close *code* is
    // unit-covered by TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness;
    // here we assert the socket actually closed and the UI settled where the product means
    // it to (same shape as the REQ-13 test below and actions.spec.ts's End tests).
    await expect
      .poll(() => tracker.liveCount, { message: "waiting for the terminal socket to close (4001) after kill-window" })
      .toBe(0);
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible();
    await expect(deadSurface.locator(".endbar")).toHaveText(/^ended /);
    await expect(deadSurface.locator(".endcap")).toContainText(/session ended/i);
    await expect(terminalRegion(page, "pane-ended-e12")).toHaveCount(0);

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

test("focusing a dead session shows the dead surface, never the terminal region, without ever attempting a socket (REQ-13)", async ({
  page,
  daemon,
}) => {
  // Sanctioned breakage (plan m4-reconcile, validate-mode step 5): this test originally
  // asserted a "session ended" overlay INSIDE the mounted terminal region
  // (`terminalOverlay(terminalRegion(...))`). m4-reconcile's approved delta (REQ-13,
  // UI Specifications "Dead surface", States: "never an empty terminal pretending to be
  // live") replaces that with a dedicated `#dead-surface` — `renderFocusView` in
  // `web/src/main.ts` now hides/clears `mainSlotEl` entirely for `alive:false` and never
  // opens a terminal surface for it (`aliveOnly` filters focus's desired-live set before
  // diffing against open surfaces). The old assertion is strengthened, not weakened: it
  // now also asserts the terminal region never mounts at all (a stronger claim than "no
  // attach attempt"), plus checks the richer dead-surface content (endbar/endcap/snapshot)
  // the plan's Testable UI Elements table pins.
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

    // Wait for at least one liveness-poll snapshot capture to land WHILE the pane is still
    // alive (REQ-4: captured on every tick the pane exists) before killing it — otherwise
    // killing races the ~5s poll interval and the capture can land empty, same trap as
    // actions.spec.ts's E13 ("killed before the first tick"). Polling the pane endpoint
    // itself (rather than a fixed sleep) is exact regardless of the poll's real interval.
    await expect
      .poll(
        async () => (await page.request.get(`${daemon.baseURL}/api/sessions/${session.id}/pane`)).status(),
        { message: "waiting for the first pane snapshot to be captured while the pane is alive", timeout: 15_000 },
      )
      .toBe(200);

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

    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });
    await expect(deadSurface.locator(".endbar")).toHaveText(/^ended /);
    await expect(deadSurface.locator(".endcap")).toContainText(/session ended/i);
    await expect(deadSurface.locator("pre.snapshot")).toContainText("MUSTER-STUB-READY");

    // The terminal region itself never mounts for a dead session (m4-reconcile REQ-13) —
    // stronger than "no attach attempt": there is no live-surface DOM at all to attach to.
    await expect(terminalRegion(page, "dead-on-focus")).toHaveCount(0);

    // REQ-13: "no attach attempt" — the client must never even request /ws/terminal/ for
    // a session it already knows is dead (409 not_attachable is the server-side backstop).
    // totalOpened, not liveCount: a socket that opened and then closed nets to zero on the
    // live gauge, but "no attempt" means the gross count must be zero too.
    expect(tracker.totalOpened).toBe(0);
    expect(tracker.liveCount).toBe(0);
  } finally {
    await cleanup();
  }
});

// A plain describe (not serial): it holds one test, which takes its own fresh `daemon`
// like every other test here — the kill/restart below never touches a neighbour's daemon.
test.describe("daemon down while a terminal is attached (E13)", () => {
  test("shows the disconnected overlay while the daemon is down, and streams again after restart", async ({
    page,
    daemon,
  }) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      await launchSession(page, daemon, { directory: dir, title: "daemon-down-term" });
      const region = terminalRegion(page, "daemon-down-term");
      // 15s, not the default 5s: attaching a real tmux/PTY bridge under this suite's fully
      // parallel scratch-daemon load (each test spins up its own musterd + tmux server +
      // Chromium) is occasionally slower than the default assertion timeout — observed
      // directly (5/5 passes in isolation, transient timeouts only under full-suite
      // parallelism) — never a case where the readback fails to arrive at all.
      await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

      await daemon.kill();

      const banner = page.getByRole("alert");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      // Assert it is the daemon-down banner specifically, not just any alert (the
      // protocol-mismatch element is also role="alert").
      await expect(banner).toContainText(/musterd unreachable/);
      await expect(terminalOverlay(region)).toHaveText(/disconnected/i, { timeout: 15_000 });

      await daemon.restart();
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

// Plan terminal-focus — REQ-1 through REQ-8, INV-1 through INV-4.
// Plan acceptance: E1-E9. Every INV-1 source state (a-f) and every INV-4 source state
// (i-iii) is asserted from, not just the acceptance IDs' convenient subset — the
// Invariants section names them explicitly and the m1-sessions lesson in the e2e-specs
// brief is exactly this: assert every listed source state, not the convenient one.
//
// Not covered here, on purpose (Scope decisions, plan terminal-focus): the Tiles strip's
// promote click, ⌥⌘1–9 (`focusNth`), and any keyboard-activation path other than Enter on
// a card — none of them move focus into a terminal, and none of them are in scope for
// this plan to change.

test("clicking a rail card in Focus moves keyboard focus into its terminal with no second click, and the typed round trip proves it end to end (E1, E2, E9, REQ-1, REQ-4)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-e1-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "focus-e1-b" });

    // A is launched first, so it is manual order's top-of-rail and the session Focus
    // auto-selects on load (main.ts's default-focus fallback in `render()`) — "two live
    // sessions A (focused) and B" per the plan's E1 setup, with no click needed to
    // establish A as the live pane's session.
    await expect(terminalRegion(page, "focus-e1-a")).toBeVisible();
    // Auto-focus on load never moves keyboard focus into the terminal — only a pointer
    // click on a rail card does that (REQ-1's deliberately narrow scope).
    expect(await activeElementInsideTerminal(page, "focus-e1-a")).toBe(false);

    await railCard(page, "focus-e1-b").click();

    // REQ-1: the click alone — no second click on the region — lands keyboard focus
    // inside B's terminal container.
    expect(await activeElementInsideTerminal(page, "focus-e1-b")).toBe(true);
    // E9/INV-2: exactly one live terminal exists — the old surface is gone, not hidden.
    await expect(page.locator('[aria-label^="Terminal: "]')).toHaveCount(1);

    const regionB = terminalRegion(page, "focus-e1-b");
    await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // E2 (behavioural proof): typing with NO click on the region at all proves the whole
    // path end to end — the callback moved DOM focus, not just some internal flag.
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await expect(regionB).toContainText("stub-echo:hello");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("re-clicking the already-focused session's card returns keyboard focus to its terminal after focus moved elsewhere (E3, REQ-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "focus-e3-solo" });
    const region = terminalRegion(page, "focus-e3-solo");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // First click puts focus in the terminal (REQ-1).
    await railCard(page, "focus-e3-solo").click();
    expect(await activeElementInsideTerminal(page, "focus-e3-solo")).toBe(true);

    // Move focus away deliberately (User Flow 2: "the rail-sort select, say") before the
    // re-click under test.
    await railSortSelect(page).focus();
    await expect(railSortSelect(page)).toBeFocused();
    expect(await activeElementInsideTerminal(page, "focus-e3-solo")).toBe(false);

    // Edge Case 1, "I clicked away, bring me back": the re-click's surface diff is a
    // no-op (the surface is already mounted), but `focus()` must still fire.
    await railCard(page, "focus-e3-solo").click();
    expect(await activeElementInsideTerminal(page, "focus-e3-solo")).toBe(true);
  } finally {
    await cleanup();
  }
});

test("clicking a card's pin button pins the session, leaves the live pane unchanged, and never moves focus into a terminal (E4, REQ-5, INV-3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-e4-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "focus-e4-b" });
    await expect(terminalRegion(page, "focus-e4-a")).toBeVisible();

    const cardB = railCard(page, "focus-e4-b");
    const btn = pinButton(cardB);
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();

    // REQ-5: pinning B doesn't select it — the live pane stays on A — and INV-3: focus
    // never lands in any terminal from a card-control click. The pin button is icon-only
    // (its accessible name lives in `aria-label`, not text content — `pinButton`'s
    // role/name locator already proves that), so the state flip is asserted the same way
    // rail-order.spec.ts does: `aria-pressed` plus the accessible-name change surfaced via
    // `getByRole`'s name filter finding the button at all.
    await expect(cardB.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#mainhead .name")).toHaveText("focus-e4-a");
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("clicking a live card's End button opens the confirm dialog without selecting the session or moving focus into a terminal (REQ-5, INV-3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-inv3-end-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "focus-inv3-end-b" });
    await expect(terminalRegion(page, "focus-inv3-end-a")).toBeVisible();

    const cardB = railCard(page, "focus-inv3-end-b");
    await cardB.getByRole("button", { name: "End" }).click();

    const dialog = page.getByRole("dialog", { name: "End session?" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#mainhead .name")).toHaveText("focus-inv3-end-a");
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("clicking Resume or Remove on an ended card never selects the session or moves focus into a terminal (REQ-5, INV-3)", async ({
  page,
  daemon,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-inv3-dead-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "focus-inv3-dead-b" });
    await expect(terminalRegion(page, "focus-inv3-dead-a")).toBeVisible();

    // Give B a claudeSessionId (via a real SessionStart) so its Resume button is enabled
    // (sessions/card.ts: Resume is disabled while `claudeSessionId` is null), then end it
    // so the card's `.acts-row` switches to the ended pair (REQ-11: Resume + Remove).
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-inv3-dead-b", { musterSession: sessionB.id }),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionB.id}/end`);
    expect(endRes.status()).toBe(200);

    const cardB = railCard(page, "focus-inv3-dead-b");
    const removeBtn = cardB.getByRole("button", { name: "Remove" });
    const resumeBtn = cardB.getByRole("button", { name: "Resume" });
    await expect(removeBtn).toBeVisible({ timeout: 15_000 });
    await expect(resumeBtn).toBeVisible();

    await removeBtn.click();
    const removeDialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(removeDialog).toBeVisible();
    await expect(page.locator("#mainhead .name")).toHaveText("focus-inv3-dead-a");
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
    await removeDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(removeDialog).toBeHidden();

    // Resume has no confirm dialog (User Flow 3) — its `stopPropagation()` still runs
    // synchronously in the same click, strictly before the async relaunch even starts.
    await resumeBtn.click();
    await expect(page.locator("#mainhead .name")).toHaveText("focus-inv3-dead-a");
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("clicking an ended session's card shows the dead surface and leaves keyboard focus on that card, never in a terminal (E5, REQ-6)", async ({
  page,
  daemon,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-e5-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "focus-e5-b" });
    await expect(terminalRegion(page, "focus-e5-a")).toBeVisible();

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e5-b", { musterSession: sessionB.id }),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionB.id}/end`);
    expect(endRes.status()).toBe(200);

    const cardB = railCard(page, "focus-e5-b");
    await expect(cardB.getByRole("button", { name: "Resume" })).toBeVisible({ timeout: 15_000 });

    await cardB.click();

    // REQ-6/Edge Case 2: the dead surface replaces the terminal slot entirely; no
    // Terminal container ever mounts for a dead session, and (browser default click
    // focus on the tabindex="0" card, un-overridden since `surfaces.get(id)` is
    // undefined) keyboard focus lands, and stays, on the clicked card.
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[aria-label="Terminal: focus-e5-b"]')).toHaveCount(0);
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
    await expect(cardB).toBeFocused();
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("dragging a rail card onto another in manual mode reorders the rail without changing focusedId or stealing focus from the terminal (E6, REQ-7, INV-4 source state (i): focus in the live terminal)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirs[0]?.path ?? "", title: "focus-e6-a" });
    const b = await launchSession(page, daemon, { directory: dirs[1]?.path ?? "", title: "focus-e6-b" });
    const c = await launchSession(page, daemon, { directory: dirs[2]?.path ?? "", title: "focus-e6-c" });
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);
    await expect(railSortSelect(page)).toHaveValue("manual");

    // A is the default-focused, top-of-manual-order session — click its own card to put
    // keyboard focus inside its terminal before dragging (INV-4 source state (i)).
    await railCard(page, "focus-e6-a").click();
    expect(await activeElementInsideTerminal(page, "focus-e6-a")).toBe(true);

    await railCard(page, "focus-e6-c").dragTo(railCard(page, "focus-e6-a"));
    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);

    // The drag never changes focusedId (the live pane stays on A, REQ-7) and never
    // leaves keyboard focus inside any terminal (Edge Case 4: the drag's `mousedown`
    // blurs the terminal; nothing re-throws focus into it afterwards, INV-4).
    await expect(page.locator("#mainhead .name")).toHaveText("focus-e6-a");
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("dragging a rail card leaves focus untouched whether it started on an uninvolved card or the rail-sort select (INV-4 source states (ii), (iii))", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirs[0]?.path ?? "", title: "focus-inv4-a" });
    const b = await launchSession(page, daemon, { directory: dirs[1]?.path ?? "", title: "focus-inv4-b" });
    const c = await launchSession(page, daemon, { directory: dirs[2]?.path ?? "", title: "focus-inv4-c" });
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // (ii) focus starts on a card not involved in the drag.
    await railCard(page, "focus-inv4-b").focus();
    await expect(railCard(page, "focus-inv4-b")).toBeFocused();
    await railCard(page, "focus-inv4-c").dragTo(railCard(page, "focus-inv4-a"));
    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);

    // (iii) focus starts on the rail-sort select.
    await railSortSelect(page).focus();
    await expect(railSortSelect(page)).toBeFocused();
    await railCard(page, "focus-inv4-b").dragTo(railCard(page, "focus-inv4-c"));
    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([b.id, c.id, a.id]);
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("Enter on a keyboard-focused rail card selects the session but leaves focus on the card (E7, REQ-8)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "focus-e7-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "focus-e7-b" });
    await expect(terminalRegion(page, "focus-e7-a")).toBeVisible();

    const cardB = railCard(page, "focus-e7-b");
    // The "Tab to a card" precondition, via `focus()` on the card's own `tabindex="0"`
    // — the control genuinely under test here is the keyboard activation (Enter),
    // driven with a real keypress, not `.click()`.
    await cardB.focus();
    await expect(cardB).toBeFocused();

    await page.keyboard.press("Enter");

    // REQ-8: the live pane swaps to B, but focus stays on B's card — never the terminal.
    await expect(page.locator("#mainhead .name")).toHaveText("focus-e7-b");
    await expect(cardB).toBeFocused();
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a 1s render tick never moves focus into a terminal when it starts outside one, and never steals it once inside (E8, INV-1 source state (a))", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "focus-e8-solo" });
    const region = terminalRegion(page, "focus-e8-solo");
    await expect(region).toBeVisible();

    // On load the session is auto-focused (the live pane shows it) but keyboard focus is
    // deliberately NOT moved there — only a pointer click does that (REQ-1's scope).
    expect(await activeElementInsideTerminal(page, "focus-e8-solo")).toBe(false);
    // 2.5s spans at least two of main.ts's 1s render ticks — a hold so the negative check
    // below can prove focus STAYED outside the terminal, not a wait for anything to happen.
    await settleFor(page, 2_500);
    expect(await activeElementInsideTerminal(page, "focus-e8-solo")).toBe(false);

    // Now click in — the tick must neither steal focus away nor need to "re-assert" it;
    // the exact same DOM node stays focused across two more ticks (tagged so identity,
    // not just "some element under this aria-label", is what's checked).
    await railCard(page, "focus-e8-solo").click();
    expect(await activeElementInsideTerminal(page, "focus-e8-solo")).toBe(true);
    await page.evaluate(() => {
      const active = document.activeElement as (HTMLElement & { dataset: DOMStringMap }) | null;
      if (active) active.dataset.e2eFocusMarker = "terminal-focus-e8";
    });

    // Same hold, other direction: two more ticks, then prove the focused node STAYED put.
    await settleFor(page, 2_500);

    expect(await activeElementInsideTerminal(page, "focus-e8-solo")).toBe(true);
    const stillSameNode = await page.evaluate(
      () =>
        (document.activeElement as (HTMLElement & { dataset: DOMStringMap }) | null)?.dataset.e2eFocusMarker ===
        "terminal-focus-e8",
    );
    expect(stillSameNode).toBe(true);
  } finally {
    await cleanup();
  }
});

test("a sessionUpsert for the focused session doesn't move keyboard focus into its terminal (INV-1 source state (b))", async ({
  page,
  daemon,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "focus-inv1b-solo" });
    await expect(terminalRegion(page, "focus-inv1b-solo")).toBeVisible();

    const initialBadge = await stateBadge(railCard(page, "focus-inv1b-solo")).textContent();

    // Focus deliberately outside any terminal beforehand (INV-1's precondition).
    await railSortSelect(page).focus();
    await expect(railSortSelect(page)).toBeFocused();

    // A turn-activity hook for the FOCUSED session's own claude id triggers a
    // sessionUpsert (state moves off its initial value) and a `render()` pass, with no
    // card click anywhere in this test.
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-inv1b-solo", { musterSession: session.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-inv1b-solo") });

    await expect.poll(() => stateBadge(railCard(page, "focus-inv1b-solo")).textContent()).not.toBe(initialBadge);

    // The render pass this state change caused must not have moved focus.
    await expect(railSortSelect(page)).toBeFocused();
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await cleanup();
  }
});

test("a rail reorder from a state change in attention mode doesn't move keyboard focus into a terminal (INV-1 source state (c))", async ({
  page,
  daemon,
  request,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const a = await launchSession(page, daemon, { directory: dirs[0]?.path ?? "", title: "focus-inv1c-a" });
    const b = await launchSession(page, daemon, { directory: dirs[1]?.path ?? "", title: "focus-inv1c-b" });
    const c = await launchSession(page, daemon, { directory: dirs[2]?.path ?? "", title: "focus-inv1c-c" });
    await expect(terminalRegion(page, "focus-inv1c-a")).toBeVisible();

    await page.locator("#rail-sort").selectOption("attention");
    await expect(railSortSelect(page)).toHaveValue("attention");
    await expect.poll(() => railOrderIds(page)).toEqual([a.id, b.id, c.id]);

    // Focus deliberately outside any terminal beforehand (INV-1's precondition).
    await railSortSelect(page).focus();
    await expect(railSortSelect(page)).toBeFocused();

    // Drive C to needs-input — attention mode's pinned-then-need-sorted order (order-
    // sidebar REQ-7) puts it first, reordering the rail with no click anywhere.
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-inv1c-c", { musterSession: c.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-inv1c-c") });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification("claude-inv1c-c", "p1", "permission_prompt"),
    });

    await expect.poll(() => railOrderIds(page), { timeout: 15_000 }).toEqual([c.id, a.id, b.id]);

    // The reorder must not have moved focus off the select or into any terminal.
    await expect(railSortSelect(page)).toBeFocused();
    expect(await activeElementInsideAnyTerminal(page)).toBe(false);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
