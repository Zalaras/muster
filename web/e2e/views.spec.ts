import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";
import {
  expectTileGeometryMatchesTmux,
  liveTile,
  stripCard,
  TerminalSocketTracker,
  terminalOverlay,
  terminalRegion,
} from "./helpers/terminal";

// Plan m2-terminal — REQ-8 (Tiles), REQ-9 (view switcher/keyboard), REQ-10 (prefs),
// REQ-11/INV-3 (geometry moves, never duplicates), REQ-12/INV-2 (snapshots never attach).
// Plan acceptance: E5-E11, plus the INV-4 prefs-echo invariant.
//
// Every Tiles/density/promotion assertion here depends on the EXACT total number of
// sessions known to the daemon (grid membership is computed over every session, not a
// per-test subset) — so unlike sessions.spec.ts's shared-daemon pattern, every test in
// this file gets its own private scratch daemon via `withDaemon()` rather than sharing
// one across parallel tests. Prefs are also global per daemon, which is the second reason
// no daemon here is shared: one test's `PUT /api/prefs` would otherwise leak into a
// concurrently-running test's expected initial view.

async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon();
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

test("the masthead switcher persists the chosen view across a reload (E5)", async ({ page }) => {
  await withDaemon(async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "false");
  });
});

test("the chosen view survives a daemon restart (E6)", async ({ page }) => {
  await withDaemon(async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");

    await daemon.restart();

    // Reload to prove the HTTP snapshot path persisted it too, not merely a live socket
    // that never dropped.
    await page.reload();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  });
});

test("Cmd+\\ toggles the view and Cmd+1 focuses the top-priority session regardless of launch order (E7)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
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

      // Explicitly focus B first, so Cmd+1 has to move focus rather than merely leave it.
      await sessionCard(page, "prio-b").click();
      await expect(terminalRegion(page, "prio-b")).toBeVisible();

      await page.keyboard.press("Meta+1");
      await expect(terminalRegion(page, "prio-a")).toBeVisible();
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("switching density 2x2 to 3x2 promotes the next session by sort order into the grid (E8)", async ({ page }) => {
  test.setTimeout(60_000);
  await withDaemon(async (daemon) => {
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
});

test("clicking a strip card promotes it and demotes exactly the lowest-priority live tile (E9)", async ({ page }) => {
  test.setTimeout(60_000);
  await withDaemon(async (daemon) => {
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
});

test("a density change leaves a still-stripped session's tmux geometry untouched (E10, INV-3)", async ({ page }) => {
  test.setTimeout(90_000);
  await withDaemon(async (daemon) => {
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
});

test("open terminal-socket count equals the live-surface count in Focus, Tiles, and after a promotion (E11, INV-2)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await withDaemon(async (daemon) => {
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
});

// The two tests below cover new user-visible behaviour introduced by this cycle's fix
// waves (daemon-implementation.md Fix Attempt 2, web-implementation.md Fix Attempt 1),
// per the pipeline rule that e2e-specs asserts a fix wave's new DOM/protocol-visible
// behaviour even without a review issue naming it directly.

test("a live tile stays typable across the 1s render tick (REQ-8, Critical 2 regression)", async ({ page }) => {
  test.setTimeout(60_000);
  await withDaemon(async (daemon) => {
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
      await page.waitForTimeout(2_200);
      await page.keyboard.type("still-typeable");
      await page.keyboard.press("Enter");
      await expect(region).toContainText("stub-echo:still-typeable", { timeout: 15_000 });
    } finally {
      await Promise.all(dirs.map((d) => d.cleanup()));
    }
  });
});

test("killing one of several live tiles ends only that tile without misrouting keystrokes into another (REQ-2/REQ-4/REQ-13, Critical 3 regression)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await withDaemon(async (daemon) => {
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
});

test("every accepted PUT /api/prefs re-broadcasts the full object to every other UI socket (INV-4)", async ({
  page,
  browser,
}) => {
  await withDaemon(async (daemon) => {
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
});

test("GET /api/state's prefs snapshot carries both view and density (M2 protocol delta)", async ({ page }) => {
  await withDaemon(async (daemon) => {
    await page.goto(daemon.dashboardUrl);

    const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
    expect(stateRes.status()).toBe(200);
    const before = (await stateRes.json()) as { prefs: { view: string; density: string } };
    expect(before.prefs).toEqual({ view: "focus", density: "2x2" });

    const putRes = await page.request.put(`${daemon.baseURL}/api/prefs`, { data: { density: "3x2" } });
    expect(putRes.status()).toBe(204);

    const afterRes = await page.request.get(`${daemon.baseURL}/api/state`);
    const after = (await afterRes.json()) as { prefs: { view: string; density: string } };
    expect(after.prefs).toEqual({ view: "focus", density: "3x2" });
  });
});
