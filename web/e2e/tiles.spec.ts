import { expect, settleFor, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import { getState, launchSession, scratchDirectory, type SessionObject } from "./helpers/session";
import {
  dragTileOnto,
  expectAllTileGeometrySettled,
  expectTileGeometryMatchesTmux,
  liveTile,
  stripCard,
  TerminalSocketTracker,
  terminalRegion,
  tileDragHandle,
  tileStateDot,
  tilesGridOrder,
} from "./helpers/terminal";

// Plan code-breakup's E2E split (plan.md UI Specifications → E2E split) merges the
// Tiles-view tests that used to live in actions.spec.ts (End/Remove from a tile footer,
// plan m4-reconcile REQ-11/REQ-12/REQ-2/REQ-10 and their review fix-cycle follow-ups) and
// in views.spec.ts (density/promotion/socket-count/drag-reorder, plans m2-terminal and
// move-tiles) into one file scoped to the Tiles view. See actions.spec.ts's and
// views.spec.ts's file headers for what stayed in each.
//
// Daemon shape (docs/conventions.md §Testing): every test here takes the per-test
// `daemon` fixture (helpers/fixtures.ts), not a shared one — Tiles grid membership and
// density are a function of the daemon's TOTAL session count, and prefs (including the
// persisted view) are global per daemon, so a test sharing a daemon with a neighbour
// would leak into that neighbour's expected grid/density/view. Two tests also restart or
// kill their daemon.

test("Tiles: End from a tile footer keeps the tile in its slot and leaves other tiles' geometry untouched (E11)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(
    Array.from({ length: 4 }, () => scratchDirectory()),
  );
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `tile-end-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      const session = await launchSession(page, daemon, {
        directory: dir.path,
        title: titles[i] ?? "",
      });
      sessions.push(session);
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(`claude-tile-end-${i}`, {
          musterSession: session.id,
        }),
      });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const titleA = titles[0];
    const neighbourTitle = titles[1];
    const neighbourSession = sessions[1];
    if (!titleA || !neighbourTitle || !neighbourSession)
      throw new Error("expected at least two titles");

    const tileA = liveTile(page, titleA);
    await expect(tileA).toBeVisible();

    // The 2x2 grid settles as one shared reflow after the view switch, so a tmux read
    // taken the instant tileA is visible can capture a mid-reflow size and then disagree
    // with the settled one ("expected 80, received 84" under suite load). Wait until every
    // tile's footer agrees with tmux in the same poll pass before taking the baseline.
    await expectAllTileGeometrySettled(
      page,
      daemon,
      sessions.map((session, i) => ({
        title: titles[i] ?? "",
        tmuxTarget: session.tmuxTarget,
      })),
    );
    const neighbourGeometry = async (): Promise<string> => {
      const width = await daemon.tmuxDisplay(
        neighbourSession.tmuxTarget,
        "#{window_width}",
      );
      const height = await daemon.tmuxDisplay(
        neighbourSession.tmuxTarget,
        "#{window_height}",
      );
      return `${width}x${height}`;
    };
    const neighbourGeometryBefore = await neighbourGeometry();

    await tileA
      .locator(".tfoot")
      .getByRole("button", { name: "End" })
      .click();
    const dialog = page.getByRole("dialog", { name: "End session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog).toBeHidden();

    // Sticky grid membership (m2): the tile stays in its slot, not removed.
    await expect(tileA).toBeVisible({ timeout: 15_000 });
    await expect(tileA.locator(".marker")).toHaveText("stopped", {
      timeout: 15_000,
    });
    await expect(tileA.getByText(/^ended /)).toBeVisible();
    await expect(
      tileA.locator(".tfoot").getByRole("button", { name: "Resume" }),
    ).toBeVisible();
    await expect(
      tileA.locator(".tfoot").getByRole("button", { name: "Remove" }),
    ).toBeVisible();
    await expect(tileA.locator(".endcap")).toContainText(/session ended/i);

    // review m4-reconcile cycle-3 Critical 1 / Minor 2: the second of the two
    // dead-surface sites the Critical named — a dead tile's *cloned* `.dead-surface`
    // (`#dead-surface-template`), distinct from Focus's static `#dead-surface`
    // exercised by the E6 test. `toBeVisible()` alone would have stayed green through
    // the opacity-0 defect here too, so read the computed style: both the cap's
    // Resume button and its `.acts-row` must resolve to opacity 1.
    const tileResumeBtn = tileA
      .locator(".endcap")
      .getByRole("button", { name: "Resume" });
    await expect(tileResumeBtn).toBeVisible();
    await expect(tileResumeBtn).toHaveCSS("opacity", "1");
    await expect(tileA.locator(".endcap .acts-row")).toHaveCSS(
      "opacity",
      "1",
    );

    // The neighbour's tmux geometry is exactly what it was before the End (the intent is
    // unchanged: End on A never resizes B). Polled rather than read once, so a tmux read
    // that lands while the grid is still repainting the dead tile is retried; a real,
    // persistent change to B's window still fails once the expect timeout runs out.
    await expect.poll(neighbourGeometry).toBe(neighbourGeometryBefore);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("Tiles: Removing a dead tile backfills its slot from the strip and broadcasts sessionRemoved (E12)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(
    Array.from({ length: 5 }, () => scratchDirectory()),
  );
  try {
    // Observe the actual `sessionRemoved` WS frame (review m4-reconcile cycle-2 Minor
    // 7 — previously this test only inferred the broadcast from its effect on a later
    // GET /api/state). Transparently proxy the dashboard's one WebSocket and record
    // every server-to-page text frame; must be registered before navigation
    // (Playwright: "only WebSockets created after this method was called will be
    // routed"). Setting `server.onMessage` disables the route's default forwarding, so
    // each captured message is re-sent to the page manually to keep the connection
    // transparent — same pattern the E14 test above uses for interception.
    const wsFrames: string[] = [];
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        if (typeof message === "string") wsFrames.push(message);
        ws.send(message);
      });
    });

    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `tile-remove-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      const session = await launchSession(page, daemon, {
        directory: dir.path,
        title: titles[i] ?? "",
      });
      sessions.push(session);
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(`claude-tile-remove-${i}`, {
          musterSession: session.id,
        }),
      });
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 5 sessions in a 2x2 grid: 4 live, 1 stripped.
    let strippedTitle: string | undefined;
    for (const t of titles) {
      if ((await liveTile(page, t).count()) === 0) strippedTitle = t;
    }
    if (!strippedTitle)
      throw new Error("expected exactly one stripped title");
    const liveTitleToEnd = titles.find((t) => t !== strippedTitle);
    if (!liveTitleToEnd) throw new Error("expected a live title to end");
    const sessionToEnd = sessions[titles.indexOf(liveTitleToEnd)];
    if (!sessionToEnd)
      throw new Error("no session object for the title being ended");

    const endRes = await page.request.post(
      `${daemon.baseURL}/api/sessions/${sessionToEnd.id}/end`,
    );
    expect(endRes.status()).toBe(200);
    const deadTile = liveTile(page, liveTitleToEnd);
    await expect(deadTile.locator(".marker")).toHaveText("stopped", {
      timeout: 15_000,
    });

    await deadTile
      .locator(".tfoot")
      .getByRole("button", { name: "Remove" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Remove session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(dialog).toBeHidden();

    // The removed session's tile is gone; the previously-stripped session backfills the
    // slot (m2's "next by sort order" rule).
    await expect(liveTile(page, liveTitleToEnd)).toHaveCount(0);
    await expect(liveTile(page, strippedTitle)).toBeVisible({
      timeout: 15_000,
    });
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);

    const state = await getState(page, daemon);
    expect(state.sessions.some((s) => s.id === sessionToEnd.id)).toBe(false);

    // The WS broadcast itself, observed directly rather than inferred: exactly one
    // `sessionRemoved` frame for this session's id, matching kb:anchor/ws.session-removed's
    // shape (`{ "type": "sessionRemoved", "id": <number> }`).
    const removedFrames = wsFrames
      .map((raw) => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      })
      .filter(
        (msg): msg is { type: string; id: number } =>
          msg !== null &&
          typeof msg === "object" &&
          (msg as { type?: unknown }).type === "sessionRemoved",
      );
    expect(removedFrames).toHaveLength(1);
    expect(removedFrames[0]).toEqual({
      type: "sessionRemoved",
      id: sessionToEnd.id,
    });
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

// review m4-reconcile cycle-2 Major 2, tile-footer case: same defect, different
// surface — `renderTileFooterActions` also unconditionally rebuilt every 1s tick before
// the Major 1 fix. Uses a private daemon (Tiles density is session-count-sensitive, per
// this file's header) with a single live session so the tile renders at 1x1 with no
// strip involved.
test("a tile footer's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-12, Major 1, Major 2)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "kbd-tick-tile-end",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-kbd-tick-tile-end", {
        musterSession: session.id,
      }),
    });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tile = liveTile(page, "kbd-tick-tile-end");
    await expect(tile).toBeVisible();
    const endBtn = tile
      .locator(".tfoot")
      .getByRole("button", { name: "End" });
    const dialog = page.getByRole("dialog", { name: "End session?" });

    await endBtn.focus();
    await expect(endBtn).toBeFocused();

    // Outlive a render tick, then prove focus STAYED (same hold as the card test above).
    await settleFor(page, 1_400);
    await expect(endBtn).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await cleanup();
  }
});

// Plan move-tiles removes the auto-sort these two tests used to exercise together
// (`applyDensity` re-sorting `tilesLive` by priority on every render). REQ-1's grid is now
// slot-stable — a priority change updates chrome only (REQ-2) — and the only thing that
// ever moves a tile's DOM node is a user drag (REQ-3/REQ-5). Retargeted per plan Affected
// Files ("web/e2e/actions.spec.ts — e2e-specs only: ... Retarget: the reorder trigger
// becomes a drag (REQ-10), and the priority change becomes the REQ-2 'does not move'
// assertion"), split into the two independent behaviours the old single test conflated.

// review m4-reconcile cycle-4 Minor 2/3, retargeted by plan move-tiles REQ-2/E5: a
// Notification making a live tile's session needs_input must NOT move its node anymore —
// membership is unchanged, so the grid's DOM order stays exactly as it was; only the
// tile's own chrome (state class driving the dot/border colour) updates.
test("a priority change updates a live tile's chrome but never moves it in the Tiles grid (REQ-2, E5)", async ({
  page,
  request,
  daemon,
}) => {
  // Isolated daemon: switching to Tiles persists the view pref, which would leak into the
  // next test sharing the suite daemon (its rail card is hidden in Tiles view).
  const [dirA, dirB] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "tile-prio-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "tile-prio-b",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-tile-prio-a", {
        musterSession: sessionA.id,
      }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-tile-prio-b", {
        musterSession: sessionB.id,
      }),
    });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tileA = liveTile(page, "tile-prio-a");
    const tileB = liveTile(page, "tile-prio-b");
    await expect(tileA).toBeVisible();
    await expect(tileB).toBeVisible();
    await expect(tileB).not.toHaveClass(/s-blocked/);

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(2);
    expect(orderBefore).toContain("tile-prio-a");
    expect(orderBefore).toContain("tile-prio-b");

    // A genuine priority change — `needs_input` sorts first under §3.4 — used to move
    // tile B's node via a re-sorting `applyDensity`. This plan removes that re-sort.
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-tile-prio-b"),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(
        "claude-tile-prio-b",
        "p1",
        "permission_prompt",
      ),
    });

    // Chrome DOES update — REQ-2's exact carve-out ("only chrome (dot/border/timer)
    // updates") — the tile's state class flips to the needs-input token.
    await expect(tileB).toHaveClass(/s-blocked/, { timeout: 15_000 });

    // ...but the DOM order is byte-for-byte the same: no `insertBefore`, no node move.
    expect(await tilesGridOrder(page)).toEqual(orderBefore);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

// review m4-reconcile cycle-4 Minor 2/3, retargeted by plan move-tiles REQ-10/E6: the only
// thing that still moves a tile's DOM node is a user drag, so the focus-survives-a-reorder
// contract (`captureFocusedControl`/`restoreFocusedControl` inside `reconcileTilesGrid`)
// must now be exercised via a drop, not a priority change.
test("a focused tile-footer action button survives a drag-drop reorder (REQ-10, E6)", async ({
  page,
  request,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([
    scratchDirectory(),
    scratchDirectory(),
  ]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "tile-drag-focus-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "tile-drag-focus-b",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-tile-drag-focus-a", {
        musterSession: sessionA.id,
      }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-tile-drag-focus-b", {
        musterSession: sessionB.id,
      }),
    });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tileA = liveTile(page, "tile-drag-focus-a");
    const tileB = liveTile(page, "tile-drag-focus-b");
    await expect(tileA).toBeVisible();
    await expect(tileB).toBeVisible();

    const orderBefore = await tilesGridOrder(page);
    expect(orderBefore).toHaveLength(2);

    const endBtnB = tileB
      .locator(".tfoot")
      .getByRole("button", { name: "End" });
    await endBtnB.focus();
    await expect(endBtnB).toBeFocused();

    // Control: render ticks alone must not blur it (already covered by the tick test
    // above, re-asserted here so the drop below is the only variable).
    await settleFor(page, 1_400);
    await expect(endBtnB).toBeFocused();

    // Dragging A's header onto B moves A's node past B — B (and its focused button)
    // shifts in the DOM, exercising the exact `insertBefore` path REQ-10 must survive.
    await dragTileOnto(page, "tile-drag-focus-a", "tile-drag-focus-b");
    await expect
      .poll(() => tilesGridOrder(page), { timeout: 15_000 })
      .toEqual(["tile-drag-focus-b", "tile-drag-focus-a"]);

    // Focus survived the reorder, and the button is still operable from the keyboard.
    await expect(endBtnB).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "End session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
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
    // Before anything can open a terminal socket (helpers/terminal.ts: the `websocket`
    // event only fires for connections made after the listener is attached).
    const tracker = new TerminalSocketTracker(page);
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
    // Precondition for the post-kill count below: both tiles hold a live terminal socket.
    await expect.poll(() => tracker.liveCount, { message: "waiting for both tiles' terminal sockets" }).toBe(2);

    await daemon.killTmuxWindow(sessionA.tmuxTarget);

    // daemon-impl Fix Attempt 2 (Critical 3): with the spike's `detach-on-destroy off`,
    // killing A's tmux session never sent A's PTY an EOF — its attach client hopped
    // onto B's tmux session instead, so no 4001 ever arrived and keystrokes typed into
    // A's tile landed in B's pane. `detach-on-destroy on` makes the client exit, so A's
    // socket must close (4001) while B's stays open, and A's tile must settle on the
    // dead surface. Not the "session ended" overlay: that is a ~25 ms transient the
    // `alive:false` render pass replaces (it disposes A's surface and mounts the cloned
    // `.dead-surface` in A's tile body) — see terminal.spec.ts E12 for the measurements.
    await expect
      .poll(() => tracker.liveCount, { message: "waiting for A's terminal socket to close (4001); B's stays open" })
      .toBe(1);
    await expect(liveTile(page, titleA).locator(".endcap")).toContainText(/session ended/i);
    await expect(regionA).toHaveCount(0);
    // ...and web-impl's Critical 5 fix: the footer marker is alive-driven, not
    // geometry-driven, so it flips to "stopped" the same pass the ended state lands.
    await expect(liveTile(page, titleA).locator(".marker")).toHaveText("stopped");

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
