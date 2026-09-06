import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { launchSession, scratchDirectory, type SessionObject, sessionCard, stateBadge } from "./helpers/session";
import {
  dragTileOnto,
  expectAllTileGeometrySettled,
  expectTileGeometryMatchesTmux,
  liveTile,
  stripCard,
  TerminalSocketTracker,
  terminalOverlay,
  terminalRegion,
  tileDragHandle,
  tileStateDot,
  tilesGridOrder,
} from "./helpers/terminal";

// Plan m2-terminal — REQ-8 (Tiles), REQ-9 (view switcher/keyboard), REQ-10 (prefs),
// REQ-11/INV-3 (geometry moves, never duplicates), REQ-12/INV-2 (snapshots never attach).
// Plan acceptance: E5-E11, plus the INV-4 prefs-echo invariant.
//
// Every Tiles/density/promotion assertion here depends on the EXACT total number of
// sessions known to the daemon (grid membership is computed over every session, not a
// per-test subset) — so unlike sessions.spec.ts's shared-daemon pattern, every test in
// this file takes the per-test `daemon` fixture (helpers/fixtures.ts). Prefs are also
// global per daemon, which is the second reason no daemon here is shared: one test's
// `PUT /api/prefs` would otherwise leak into a concurrently-running test's expected
// initial view. Two tests also restart or kill their daemon.

test("the masthead switcher persists the chosen view across a reload (E5)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "false");
});

test("the chosen view survives a daemon restart (E6)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

  await daemon.restart();

  // Reload to prove the HTTP snapshot path persisted it too, not merely a live socket
  // that never dropped.
  await page.reload();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
});

test("Cmd+\\ toggles the view and Opt+Cmd+1 focuses the top-priority session regardless of launch order (E7)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    // Launch B first, A second — but only A gets a permission prompt, so it must sort
    // to the top (M1's needs-input-first rule) regardless of launch order.
    await launchSession(page, daemon, { directory: dirB.path, title: "prio-b" });
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "prio-a" });

    const claudeA = "claude-prio-a";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeA, { musterSession: sessionA.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeA) });
    await request.post(daemon.ingestURL("hook"), { data: rawNotification(claudeA, "p1", "permission_prompt") });
    await expect(stateBadge(sessionCard(page, "prio-a"))).toHaveText(/needs input/i);

    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Meta+Backslash");
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Meta+Backslash");
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

    // Explicitly focus B first, so Opt+Cmd+1 has to move focus rather than merely leave it.
    await sessionCard(page, "prio-b").click();
    await expect(terminalRegion(page, "prio-b")).toBeVisible();

    // order-sidebar's approved protocol delta + decision `cmd-n-ordering` (Option A):
    // Opt+Cmd+1 now indexes into `orderRail`'s CURRENT order, which depends on `railSort`.
    // REQ-5's default is "manual" (creation order here: B launched first, then A), so
    // in manual mode Opt+Cmd+1 would now focus B, not A. Switch to Attention (needs-input
    // sorts first) before the Opt+Cmd+1 assertion below — same repair class as
    // actions.spec.ts #3-#5 (select Attention mode before the priority assertion,
    // assertion preserved verbatim).
    await page.locator("#rail-sort").selectOption("attention");
    await expect(page.locator("#rail-sort")).toHaveValue("attention");

    await page.keyboard.press("Alt+Meta+Digit1");
    await expect(terminalRegion(page, "prio-a")).toBeVisible();
    // The old surface must be unmounted, not merely covered — ⌘1 moves focus the same
    // way a rail-card click does (one live surface at a time, INV-2).
    await expect(terminalRegion(page, "prio-b")).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("switching density 2x2 to 3x2 promotes the next session by sort order into the grid (E8)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `density-${i}`);
    const sessions = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    // Should-have REQ-15: tile footers show real geometry.
    await expect(liveTile(page, titles[0] ?? "").getByText(/\d+\s*×\s*\d+/)).toBeVisible();

    // Critical 6 (review cycle 1): the pattern check above is satisfied by a stale or
    // fabricated value. Cross-check against the tmux oracle to prove the Focus->Tiles
    // view switch actually moved this session's real geometry into its new tile.
    const firstSession = sessions[0];
    if (!firstSession) throw new Error("expected a session object for titles[0]");
    await expectTileGeometryMatchesTmux(page, daemon, titles[0] ?? "", firstSession.tmuxTarget);

    const liveBefore: string[] = [];
    const strippedBefore: string[] = [];
    for (const t of titles) {
      if ((await liveTile(page, t).count()) > 0) liveBefore.push(t);
      else strippedBefore.push(t);
    }
    expect(liveBefore).toHaveLength(4);
    expect(strippedBefore).toHaveLength(1);
    const strippedTitle = strippedBefore[0];
    if (!strippedTitle) throw new Error("expected exactly one stripped title");
    await expect(stripCard(page, strippedTitle)).toBeVisible();

    await page.getByRole("button", { name: "3×2" }).click();
    await expect(page.getByRole("button", { name: "3×2" })).toHaveAttribute("aria-pressed", "true");

    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }

    // Critical 6 (review cycle 1): the density change (2x2 -> 3x2) is also this
    // session's promotion into the grid — its tmux window must actually be resized to
    // this tile's geometry, not just render a plausible-looking footer string.
    const strippedIdx = titles.indexOf(strippedTitle);
    const strippedSession = sessions[strippedIdx];
    if (!strippedSession) throw new Error(`no session object for ${strippedTitle}`);
    await expectTileGeometryMatchesTmux(page, daemon, strippedTitle, strippedSession.tmuxTarget);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("clicking a strip card promotes it and demotes exactly the lowest-priority live tile (E9)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `promote-${i}`);
    const sessions = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const liveTitlesBefore: string[] = [];
    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) > 0) liveTitlesBefore.push(t);
      else strippedTitle = t;
    }
    expect(liveTitlesBefore).toHaveLength(4);
    if (!strippedTitle) throw new Error("expected exactly one stripped title");

    await stripCard(page, strippedTitle).click();

    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);

    // Critical 6 (review cycle 1): the promoted session's tmux window must actually be
    // resized to its new tile's geometry — a footer-pattern check alone can't tell a
    // real resize from a stale value carried over from before the promotion.
    const promotedIdx = titles.indexOf(strippedTitle);
    const promotedSession = sessions[promotedIdx];
    if (!promotedSession) throw new Error(`no session object for ${strippedTitle}`);
    await expectTileGeometryMatchesTmux(page, daemon, strippedTitle, promotedSession.tmuxTarget);

    // Exactly one previously-live title is demoted — grid size stays fixed at N.
    const demoted: string[] = [];
    for (const t of liveTitlesBefore) {
      if ((await liveTile(page, t).count()) === 0) demoted.push(t);
    }
    expect(demoted).toHaveLength(1);
    const demotedTitle = demoted[0];
    if (!demotedTitle) throw new Error("expected exactly one demoted title");
    await expect(stripCard(page, demotedTitle)).toBeVisible();

    let liveCount = 0;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) > 0) liveCount++;
    }
    expect(liveCount).toBe(4);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a density change leaves a still-stripped session's tmux geometry untouched (E10, INV-3)", async ({ page, daemon }) => {
  test.setTimeout(90_000);
  const dirs = await Promise.all(Array.from({ length: 7 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `geo-${i}`);
    const sessions = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const strippedBefore: string[] = [];
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedBefore.push(t);
    }
    expect(strippedBefore).toHaveLength(3);

    const baselineWidth = new Map<string, string>();
    for (const t of strippedBefore) {
      const idx = titles.indexOf(t);
      const session = sessions[idx];
      if (!session) throw new Error(`no session object for ${t}`);
      baselineWidth.set(t, await daemon.tmuxDisplay(session.tmuxTarget, "#{window_width}"));
    }

    // Critical 6 (review cycle 1): INV-3 has a second half this test never asserted —
    // a session that stays LIVE across the density change must have its geometry
    // actually moved (2x2's grid has 2 columns, 3x2 has 3, so a continuing tile's
    // fitted width changes), not merely re-render a stale footer string. Pick a live
    // (non-stripped) title and capture its pre-change baseline the same way.
    const continuingLive = titles.find((t) => !strippedBefore.includes(t));
    if (!continuingLive) throw new Error("expected at least one live title before the density change");
    const continuingIdx = titles.indexOf(continuingLive);
    const continuingSession = sessions[continuingIdx];
    if (!continuingSession) throw new Error(`no session object for ${continuingLive}`);
    const continuingBaselineWidth = await daemon.tmuxDisplay(continuingSession.tmuxTarget, "#{window_width}");

    await page.getByRole("button", { name: "3×2" }).click();
    await expect(page.getByRole("button", { name: "3×2" })).toHaveAttribute("aria-pressed", "true");

    // The "moves" half: the continuing-live tile's footer must equal a FRESH tmux
    // reading (proving the surface actually refit into the new grid), and that fresh
    // reading must differ from the pre-change baseline (proving it moved at all, not
    // just that footer and tmux happen to still agree on an untouched value).
    await expectTileGeometryMatchesTmux(page, daemon, continuingLive, continuingSession.tmuxTarget);
    const continuingAfterWidth = await daemon.tmuxDisplay(continuingSession.tmuxTarget, "#{window_width}");
    expect(continuingAfterWidth).not.toBe(continuingBaselineWidth);

    const strippedAfter: string[] = [];
    for (const t of strippedBefore) {
      if ((await liveTile(page, t).count()) === 0) strippedAfter.push(t);
    }
    expect(strippedAfter).toHaveLength(1);
    const stillStripped = strippedAfter[0];
    if (!stillStripped) throw new Error("expected exactly one still-stripped title");

    const idx = titles.indexOf(stillStripped);
    const session = sessions[idx];
    if (!session) throw new Error(`no session object for ${stillStripped}`);
    const before = baselineWidth.get(stillStripped);
    const after = await daemon.tmuxDisplay(session.tmuxTarget, "#{window_width}");
    expect(after).toBe(before);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("open terminal-socket count equals the live-surface count in Focus, Tiles, and after a promotion (E11, INV-2)", async ({
  page,
  daemon,
}) => {
  test.setTimeout(90_000);
  const tracker = new TerminalSocketTracker(page);
  const dirs = await Promise.all(Array.from({ length: 7 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `sock-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    // Focus: exactly one live surface exists — the other six are snapshot rail cards.
    await expect(page.locator('[aria-label^="Terminal: "]')).toHaveCount(1);
    await expect.poll(() => tracker.liveCount).toBe(1);
    // Minor 7 (review cycle 1): the browser-side socket count alone can't see a
    // server-side divergence — e.g. Critical 4's leaked attach client, which the
    // browser had already stopped counting once it closed its own socket. Cross-check
    // with a daemon-side tmux oracle (`#{session_attached}` summed across every
    // session on this run's socket) at every step this test already checks.
    await expect.poll(() => daemon.totalAttachedClients()).toBe(1);

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tracker.liveCount).toBe(4);
    await expect.poll(() => daemon.totalAttachedClients()).toBe(4);

    await page.getByRole("button", { name: "3×2" }).click();
    await expect(page.getByRole("button", { name: "3×2" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tracker.liveCount).toBe(6);
    await expect.poll(() => daemon.totalAttachedClients()).toBe(6);

    // Promote the one remaining strip session — total live surfaces stays at 6.
    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
    }
    if (!strippedTitle) throw new Error("expected exactly one stripped title at 3x2 with 7 sessions");
    await stripCard(page, strippedTitle).click();
    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect.poll(() => tracker.liveCount).toBe(6);
    await expect.poll(() => daemon.totalAttachedClients()).toBe(6);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

// The two tests below cover new user-visible behaviour introduced by this cycle's fix
// waves (daemon-implementation.md Fix Attempt 2, web-implementation.md Fix Attempt 1),
// per the pipeline rule that e2e-specs asserts a fix wave's new DOM/protocol-visible
// behaviour even without a review issue naming it directly.

test("a live tile stays typable across the 1s render tick (REQ-8, Critical 2 regression)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 2 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `typeable-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const region = terminalRegion(page, titles[0] ?? "");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // web-impl Fix Attempt 1 (Critical 2): before the fix, `renderTilesView` rebuilt
    // the whole grid on every 1s `setInterval(render, 1000)` tick, re-parenting the
    // mounted surface and blurring its textarea within ~1s of a user clicking in
    // (measured by the reviewer: keystrokes typed after 1.6s never reached the pane).
    // Click in, then outlast two full render ticks before typing, so a regression of
    // the whole-grid-rebuild bug would reliably drop these keystrokes.
    await region.click();
    await settleFor(page, 2_200);
    await page.keyboard.type("still-typeable");
    await page.keyboard.press("Enter");
    await expect(region).toContainText("stub-echo:still-typeable", { timeout: 15_000 });
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("killing one of several live tiles ends only that tile without misrouting keystrokes into another (REQ-2/REQ-4/REQ-13, Critical 3 regression)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 2 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `kill-${i}`);
    const sessions = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    const [titleA, titleB] = titles;
    const [sessionA, sessionB] = sessions;
    if (!titleA || !titleB || !sessionA || !sessionB) throw new Error("expected two launched sessions");

    const regionA = terminalRegion(page, titleA);
    const regionB = terminalRegion(page, titleB);
    await expect(regionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    await daemon.killTmuxWindow(sessionA.tmuxTarget);

    // daemon-impl Fix Attempt 2 (Critical 3): with the spike's `detach-on-destroy off`,
    // killing A's tmux session never sent A's PTY an EOF — its attach client hopped
    // onto B's tmux session instead, so no 4001 ever arrived and keystrokes typed into
    // A's tile landed in B's pane. `detach-on-destroy on` makes the client exit, so A's
    // tile must now show the real ended state...
    await expect(terminalOverlay(regionA)).toHaveText(/session ended/i, { timeout: 15_000 });
    // ...and web-impl's Critical 5 fix: the footer marker is alive-driven, not
    // geometry-driven, so it flips to "stopped" the same pass the ended state lands.
    await expect(liveTile(page, titleA).locator(".marker")).toHaveText("stopped", { timeout: 15_000 });

    // ...and, the actual misrouting bug: B must still have exactly ONE attach client
    // (never two from A's client hopping over), and typing into B's own tile must
    // still reach only B.
    await expect
      .poll(() => daemon.tmuxDisplay(sessionB.tmuxTarget, "#{session_attached}"), {
        message: "waiting for B to still have exactly one attach client, not two",
      })
      .toBe("1");

    await regionB.click();
    await page.keyboard.type("TYPED-INTO-B");
    await page.keyboard.press("Enter");
    await expect(regionB).toContainText("stub-echo:TYPED-INTO-B");
    await expect(liveTile(page, titleB).locator(".marker")).toHaveText("live");
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("every accepted PUT /api/prefs re-broadcasts the full object to every other UI socket (INV-4)", async ({
  page,
  browser,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);
    await expect(pageB.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

    // Window B never clicked anything — its switcher must flip purely from the `prefs`
    // WS broadcast (INV-4), not from any action of its own.
    await expect(pageB.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
    await expect(pageB.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "false");
  } finally {
    await contextB.close();
  }
});

test("GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);

  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  // `usageModel` was added by plan usage-model-bar (protocol §3.3/§5.5 delta, merged
  // into docs/protocol.md on approval; default "Fable" before any PUT) — included
  // here so this M2 assertion tracks the merged protocol contract rather than going
  // stale the moment usage-model-bar ships, same rationale as density's own addition.
  // `railSort` was added by plan order-sidebar (protocol §3.3 delta, merged into
  // docs/protocol.md on approval; default "manual" before any PUT) — same rationale.
  // `theme` was added by plan new-ui-design-colors (protocol §3.3 delta, merged into
  // docs/protocol.md on approval; default "follow" before any PUT) — same rationale.
  const before = (await stateRes.json()) as {
    prefs: { view: string; density: string; usageModel: string; railSort: string; theme: string };
  };
  expect(before.prefs).toEqual({
    view: "focus",
    density: "2x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
  });

  const putRes = await page.request.put(`${daemon.baseURL}/api/prefs`, { data: { density: "3x2" } });
  expect(putRes.status()).toBe(204);

  const afterRes = await page.request.get(`${daemon.baseURL}/api/state`);
  const after = (await afterRes.json()) as {
    prefs: { view: string; density: string; usageModel: string; railSort: string; theme: string };
  };
  expect(after.prefs).toEqual({
    view: "focus",
    density: "3x2",
    usageModel: "Fable",
    railSort: "manual",
    theme: "follow",
  });
});

// Plan move-tiles — REQ-1 through REQ-10, INV-3/6/7. The Tiles grid stops re-sorting
// itself on every render (m2-terminal's `promote`/`applyDensity` auto-sort, the same
// re-sort behind the m4-reconcile focus-on-reorder Minor); only a drag reorders it. Every
// test below takes the `daemon` fixture for the same reason as the rest of this file:
// order and density are both functions of the daemon's total session count/state, which
// would leak across parallel tests sharing one daemon.

test("dragging a tile's header onto another tile reorders forward, preserves tmux geometry, and clears drag classes (E1, E3, E4)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `mv-fwd-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }));
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(4);
    const [slot1, slot2, slot3, slot4] = orderBefore;
    if (!slot1 || !slot2 || !slot3 || !slot4) throw new Error("expected 4 distinct tile titles");

    // E3/INV-6 baseline: every live tile's real tmux geometry before the drop.
    //
    // A freshly-launched 2x2 grid does not arrive at its final fitted size the instant
    // its tiles become visible: the initial refit reaches tmux asynchronously (same race
    // `expectTileGeometryMatchesTmux`'s doc comment describes for a density change), and
    // it settles as one shared reflow across all four tiles together rather than tile by
    // tile — a diagnostic trace read tmux=130x25 (pre-fit) -> 84x11 (footer already ahead,
    // reading 10) -> 84x10 (both agree, held for 9+ subsequent seconds), on every tile at
    // once. Capturing "before" synchronously right after `toBeVisible()` (as this test
    // originally did) races that settle. Waiting per tile in a sequential loop is *also*
    // insufficient — an early-matched tile can still be invalidated by a later shared
    // reflow that finishes while a later tile in the loop is still being waited on; this
    // reproduced an off-by-one "before" vs "after" height on 8/8 repeated runs. Waiting
    // for every tile to agree with a fresh tmux read *simultaneously*
    // (`expectAllTileGeometrySettled`) closes both races: it only returns once no tile is
    // mid-reflow. This changes when the baseline is captured, not what is asserted — the
    // invariant under test (a pure reorder never touches geometry) is unchanged.
    const byTitle = new Map(titles.map((t, i) => [t, sessions[i]]));
    const geometryEntries = titles.map((t) => {
      const s = byTitle.get(t);
      if (!s) throw new Error(`no session object for ${t}`);
      return { title: t, tmuxTarget: s.tmuxTarget };
    });
    await expectAllTileGeometrySettled(page, daemon, geometryEntries);

    const widthBefore = new Map<string, string>();
    const heightBefore = new Map<string, string>();
    for (const t of titles) {
      const s = byTitle.get(t);
      if (!s) throw new Error(`no session object for ${t}`);
      widthBefore.set(t, await daemon.tmuxDisplay(s.tmuxTarget, "#{window_width}"));
      heightBefore.set(t, await daemon.tmuxDisplay(s.tmuxTarget, "#{window_height}"));
    }

    // Edge Case 2 forward case: [A,B,C,D], drop A on C -> [B,C,A,D].
    await dragTileOnto(page, slot1, slot3);

    await expect.poll(() => tilesGridOrder(page), { timeout: 15_000 }).toEqual([slot2, slot3, slot1, slot4]);

    // E4: both drag-feedback classes are cleared once the drop completes.
    await expect(page.locator("article.tile.dragging")).toHaveCount(0);
    await expect(page.locator("article.tile.drop-target")).toHaveCount(0);

    // E3/INV-6: geometry is untouched by a pure reorder — read the tmux oracle fresh on
    // both sides (not the tile footer, which a stale value would satisfy just as well).
    for (const t of titles) {
      const s = byTitle.get(t);
      if (!s) throw new Error(`no session object for ${t}`);
      const widthAfter = await daemon.tmuxDisplay(s.tmuxTarget, "#{window_width}");
      const heightAfter = await daemon.tmuxDisplay(s.tmuxTarget, "#{window_height}");
      expect(widthAfter).toBe(widthBefore.get(t));
      expect(heightAfter).toBe(heightBefore.get(t));
    }
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("dragging a tile's header onto an earlier tile reorders backward (E2)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `mv-bwd-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(4);
    const [slot1, slot2, slot3, slot4] = orderBefore;
    if (!slot1 || !slot2 || !slot3 || !slot4) throw new Error("expected 4 distinct tile titles");

    // Edge Case 2 backward case: [A,B,C,D], drop D on B -> [A,D,B,C].
    await dragTileOnto(page, slot4, slot2);

    await expect.poll(() => tilesGridOrder(page), { timeout: 15_000 }).toEqual([slot1, slot4, slot2, slot3]);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("clicking a strip card at capacity places the promoted tile into the demoted tile's former index (E7, REQ-1)", async ({
  page,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `mv-prm-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
    }
    if (!strippedTitle) throw new Error("expected exactly one stripped title at 2x2 with 5 sessions");

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(4);

    await stripCard(page, strippedTitle).click();
    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);

    const orderAfter = await tilesGridOrder(page);
    expect(orderAfter).toHaveLength(4);

    // REQ-1: the promoted id lands in the demoted (worst-ranked) member's slot, and
    // every other index is untouched — assert both halves at once by reconstructing the
    // expected array from `orderBefore` with only the demoted slot swapped.
    const demotedTitle = orderBefore.find((t) => !orderAfter.includes(t));
    if (!demotedTitle) throw new Error("expected exactly one demoted title");
    const expectedOrder = orderBefore.map((t) => (t === demotedTitle ? strippedTitle : t));
    expect(orderAfter).toEqual(expectedOrder);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a drag released over the strip leaves the tile order unchanged (E8)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `mv-strip-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
    }
    if (!strippedTitle) throw new Error("expected exactly one stripped title at 2x2 with 5 sessions");

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(4);
    const draggedTitle = orderBefore[0];
    if (!draggedTitle) throw new Error("expected a live tile to drag");

    // Edge Case 3: `dragover` is never prevented outside `#tiles-grid`, so the browser's
    // own `drop` never fires here — `dragTo` still completes the mouse gesture either way.
    // The drop target is the strip card itself (outside the grid), not another tile, so
    // this drags the raw `.thead` handle directly rather than going through
    // `dragTileOnto` (which always targets a live tile).
    await tileDragHandle(page, draggedTitle).dragTo(stripCard(page, strippedTitle));

    await expect(page.locator("article.tile.dragging")).toHaveCount(0);
    await expect(page.locator("article.tile.drop-target")).toHaveCount(0);
    expect(await tilesGridOrder(page)).toEqual(orderBefore);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a drag still reorders the grid while the daemon is down (E9, REQ-8)", async ({ page, daemon }) => {
  const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `mv-down-${i}`);
    for (const [i, dir] of dirs.entries()) {
      await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    for (const t of titles) {
      await expect(liveTile(page, t)).toBeVisible();
    }

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(4);
    const [slot1, slot2, slot3, slot4] = orderBefore;
    if (!slot1 || !slot2 || !slot3 || !slot4) throw new Error("expected 4 distinct tile titles");

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // REQ-8: ordering is client-only state — a drag while the banner shows still
    // reorders the grid, exactly per Edge Case 2's forward case.
    await dragTileOnto(page, slot1, slot3);
    await expect.poll(() => tilesGridOrder(page), { timeout: 15_000 }).toEqual([slot2, slot3, slot1, slot4]);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a tile's state dot title tracks the state word, and updates on a real state change (E10, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "mv-dot" });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
    await expect(liveTile(page, "mv-dot")).toBeVisible();

    const dot = tileStateDot(page, "mv-dot");
    await expect(dot).toHaveAttribute("title", "started");

    const claudeId = "claude-mv-dot";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });

    await expect(dot).toHaveAttribute("title", "needs input", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});
