import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { expectedEscapedPath, uniqueContent, writeFixtureFile } from "./helpers/dropfiles";
import { envelopedSessionStart, rawUserPromptSubmit, unboundSessionStart } from "./helpers/payloads";
import { railCard } from "./helpers/railorder";
import { findSession, getState, launchSession, scratchDirectory } from "./helpers/session";
import {
  createShellViaApi,
  deadSurfaceNotice,
  expectPipUsesShellPipToken,
  mainheadSurfaceButton,
  mainheadSurfaceGroup,
  shellPip,
  shellSurfaceRegion,
  shellTmuxTarget,
  ShellSocketTracker,
  tileSurfaceButton,
} from "./helpers/shell";
import { queryEvents } from "./helpers/db";
import { dropFiles, dropNotice, liveTile, liveTileById, terminalRegion } from "./helpers/terminal";

// Plan plain-terminal-session — REQ-1 through REQ-13, INV-1 through INV-6.
// Plan acceptance: E1-E16 (E15 pairs with E7; there is no E14-numbered daemon gap here —
// the plan's own list simply orders E15 after E7/E8 rather than at the tail).
//
// The daemon and tmux are real throughout, same as terminal.spec.ts/drop.spec.ts — but
// unlike every OTHER surface this suite tests, a plain shell is a REAL interactive
// `$SHELL` process (REQ-1: "the user's $SHELL (fallback /bin/zsh)"), never the
// `-claude-bin` stub. That is not the "never launch a real claude" hard rule being
// bent — `/bin/zsh`/`/bin/sh` is not Claude Code, carries no subscription cost, and is
// exactly what REQ-1 specifies must run. The Claude side of every session here still
// only ever runs the harness's stub (no real `claude` process anywhere in this file).
//
// Every top-level test gets its OWN scratch daemon (`beforeEach`/`afterEach`), mirroring
// terminal.spec.ts's file header: Focus auto-focuses "top of sort", which is only THIS
// test's lone session when no other test's daemon is shared.

let daemon: ScratchDaemon;

test.beforeEach(async () => {
  daemon = await startScratchDaemon();
});

test.afterEach(async () => {
  await daemon.teardown();
});

test("switching to shell in Focus shows a live shell whose prompt responds to typed input, and switching back to claude shows the Claude pane again (E1)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e1" });

    // Before the first switch: claude selected, shell unselected, no pip (States: "no
    // data yet").
    const claudeBtn = mainheadSurfaceButton(page, "claude");
    const shellBtn = mainheadSurfaceButton(page, "shell");
    await expect(mainheadSurfaceGroup(page)).toBeVisible();
    await expect(claudeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(shellBtn).toHaveAttribute("aria-pressed", "false");
    await expect(shellPip(shellBtn)).toHaveCount(0);

    const claudeRegion = terminalRegion(page, "plain-shell-e1");
    await expect(claudeRegion).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Flow 1: click shell -> lazy POST -> mount -> pip lights.
    const shellPost = page.waitForResponse(
      (res) => res.request().method() === "POST" && /^\/api\/sessions\/\d+\/shell$/.test(new URL(res.url()).pathname),
    );
    await shellBtn.click();
    const res = await shellPost;
    expect(res.status()).toBe(200);
    expect((await res.json()) as { created: boolean }).toMatchObject({ created: true });

    const shellRegion = shellSurfaceRegion(page, "plain-shell-e1");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await expect(claudeRegion).toHaveCount(0);
    await expect(shellBtn).toHaveAttribute("aria-pressed", "true");
    await expect(claudeBtn).toHaveAttribute("aria-pressed", "false");
    await expect(shellPip(shellBtn)).toHaveCount(1);

    // The round trip: a real interactive shell echoes back what it's told to run.
    await shellRegion.click();
    await page.keyboard.type("echo plain-shell-e1-marker");
    await page.keyboard.press("Enter");
    await expect(shellRegion).toContainText("plain-shell-e1-marker");

    // Flow 2: click claude -> dispose the shell socket, remount Claude. Pip stays lit —
    // a shell is still running.
    await claudeBtn.click();
    await expect(terminalRegion(page, "plain-shell-e1")).toBeVisible({ timeout: 15_000 });
    await expect(shellSurfaceRegion(page, "plain-shell-e1")).toHaveCount(0);
    await expect(claudeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(shellPip(mainheadSurfaceButton(page, "shell"))).toHaveCount(1);
  } finally {
    await cleanup();
  }
});

test("a session never switched to shell has no muster-<id>-shell tmux session (E2)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e2" });
    await expect(terminalRegion(page, "plain-shell-e2")).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    expect(await daemon.tmuxSessions()).not.toContain(shellTmuxTarget(session.id));
  } finally {
    await cleanup();
  }
});

test("the shell runs in the session's own directory (E3)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e3" });

    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "plain-shell-e3");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await shellRegion.click();
    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");
    await expect(shellRegion).toContainText(dir, { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a shell started in Focus is still running after switching to Tiles and back (REQ-6, E4)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e4" });

    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "plain-shell-e4")).toBeVisible({ timeout: 15_000 });
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await expect(liveTile(page, "plain-shell-e4")).toBeVisible();

    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-focus")).toBeVisible();

    // Still running: the tmux session survived, the pip is still lit, and reattaching
    // (a fresh click of the shell segment) repaints the same session's scrollback.
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));
    await expect(shellPip(mainheadSurfaceButton(page, "shell"))).toHaveCount(1);
  } finally {
    await cleanup();
  }
});

test("a shell can be started on a session whose alive is false, and the claude segment still shows the dead surface (E5, edge case 13)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "plain-shell-e5-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "plain-shell-e5-b" });
    await expect(terminalRegion(page, "plain-shell-e5-a")).toBeVisible();

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-plain-shell-e5-b", { musterSession: sessionB.id }),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionB.id}/end`);
    expect(endRes.status()).toBe(200);

    const cardB = railCard(page, "plain-shell-e5-b");
    await expect(cardB.getByText(/^ended /)).toBeVisible({ timeout: 15_000 });
    await cardB.click();

    // Claude segment selected on a dead session shows the dead surface, not a terminal.
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });
    await expect(mainheadSurfaceButton(page, "claude")).toHaveAttribute("aria-pressed", "true");

    // REQ-7: the shell route never consults `alive` — spawning on a dead session works.
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "plain-shell-e5-b");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(sessionB.id));

    // Switching back to claude still shows the dead surface, not a live pane.
    await mainheadSurfaceButton(page, "claude").click();
    await expect(page.locator("#dead-surface")).toBeVisible();
    await expect(shellSurfaceRegion(page, "plain-shell-e5-b")).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("typing exit closes the shell socket, swaps the visible surface back to Claude and clears the pip (E6, REQ-8)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e6" });

    const tracker = new ShellSocketTracker(page);
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "plain-shell-e6");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => tracker.liveCount).toBe(1);

    await shellRegion.click();
    await page.keyboard.type("exit");
    await page.keyboard.press("Enter");

    await expect.poll(() => tracker.liveCount, { message: "waiting for the shell socket to close (4001)" }).toBe(0);
    await expect(terminalRegion(page, "plain-shell-e6")).toBeVisible({ timeout: 15_000 });
    await expect(shellSurfaceRegion(page, "plain-shell-e6")).toHaveCount(0);
    await expect(mainheadSurfaceButton(page, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "false");
    await expect(shellPip(mainheadSurfaceButton(page, "shell"))).toHaveCount(0);

    // REQ-8's respawn: the next switch to shell spawns a fresh one.
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "plain-shell-e6")).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("running claude inside a shell leaves the parent session's state, stateSince, claudeSessionId and context untouched, and persists its events unrouted with a NULL session_id (E7, E15, INV-6, edge case 1)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e7" });
    const parentClaudeId = "claude-plain-shell-e7-parent";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(parentClaudeId, { musterSession: session.id }),
    });

    const before = await getState(page, daemon);
    const parentBefore = findSession(before, session.id);

    // Spawn the shell (isolation is asserted from this source state too — INV-1's "spawned
    // after the parent was Resumed" is separate; this is the plain "freshly spawned" one).
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "plain-shell-e7")).toBeVisible({ timeout: 15_000 });

    // Simulate a `claude` run inside the shell pane: it fires hooks (the directory
    // already carries Muster's settings.local.json from the parent's own launch) but
    // with NO enveloping musterSession/tmuxPane — exactly the raw, unbound shape a
    // nested claude process would produce from a pane whose environment has no
    // MUSTER_SESSION (Implementation Notes: "isolation is structural"). A never-before-
    // seen claude_session_id proves `Resolve` finds no existing binding for it either.
    const nestedClaudeId = "claude-plain-shell-e7-nested";
    await request.post(daemon.ingestURL("hook"), {
      data: unboundSessionStart(nestedClaudeId),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(nestedClaudeId) });

    // Give the async ingest pipeline a moment to persist, then assert the parent is
    // untouched — polling on the NESTED claude id specifically (not a plain "any event
    // exists" count, which the parent's own earlier SessionStart already satisfies), so
    // this never races the daemon's own asynchronous processing (CLAUDE.md: "return 200
    // immediately and process asynchronously").
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, nestedClaudeId)).length > 0, {
        message: "waiting for the nested hook to be persisted",
      })
      .toBe(true);

    const after = await getState(page, daemon);
    const parentAfter = findSession(after, session.id);
    expect(parentAfter.state).toBe(parentBefore.state);
    expect(parentAfter.stateSince).toBe(parentBefore.stateSince);
    expect(parentAfter.claudeSessionId).toBe(parentBefore.claudeSessionId);
    expect(parentAfter.context).toEqual(parentBefore.context);

    // E15: the nested events land with a NULL session_id — neither dropped nor routed to
    // the parent's own claude_session_id.
    const nestedRows = await queryEvents(daemon.dbPath, nestedClaudeId);
    expect(nestedRows.length).toBeGreaterThan(0);
    for (const row of nestedRows) {
      expect(row.muster_session).toBeNull();
    }
    const parentRows = await queryEvents(daemon.dbPath, parentClaudeId);
    // The parent's own event stream must not have gained the nested session's rows.
    expect(parentRows.every((r) => r.claude_session_id === parentClaudeId)).toBe(true);
  } finally {
    await cleanup();
  }
});

test("after daemon.restart(), no muster-<n>-shell tmux session remains on the socket (E8, edge case 3)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const restartDaemon = await startScratchDaemon();
  try {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(restartDaemon.dashboardUrl);
      const session = await launchSession(page, restartDaemon, { directory: dir, title: "plain-shell-e8" });
      await mainheadSurfaceButton(page, "shell").click();
      await expect(shellSurfaceRegion(page, "plain-shell-e8")).toBeVisible({ timeout: 15_000 });
      expect(await restartDaemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));

      await restartDaemon.restart();

      expect(await restartDaemon.tmuxSessions()).not.toContain(shellTmuxTarget(session.id));
    } finally {
      await cleanup();
    }
  } finally {
    await restartDaemon.teardown();
  }
});

test("switching to shell with the directory removed shows the daemon's error in the surface's status notice and leaves the segment on claude (E9, REQ-12, edge case 4)", async ({
  page,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  let cleaned = false;
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e9" });

    // Remove the directory out from under the session before the first switch — the
    // daemon checks it exists before spawning (409 directory_missing), not after.
    await cleanup();
    cleaned = true;

    await mainheadSurfaceButton(page, "shell").click();

    // The surface stays on claude — no shell tab is left behind (REQ-12: "no
    // half-created shell tab").
    await expect(mainheadSurfaceButton(page, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "false");
    await expect(shellSurfaceRegion(page, "plain-shell-e9")).toHaveCount(0);

    // `dropNotice` locates the one `role="status"` element `TerminalSurface` owns per
    // surface (helpers/terminal.ts) — REQ-12 reuses that exact element for the spawn
    // failure's `message`, not a distinct notice of its own.
    const claudeRegion = terminalRegion(page, "plain-shell-e9");
    await expect(dropNotice(claudeRegion)).toBeVisible({ timeout: 15_000 });
    await expect(dropNotice(claudeRegion)).toContainText(dir);
  } finally {
    if (!cleaned) await cleanup();
  }
});

test("switching to shell on a DEAD session with its directory removed shows the daemon's error in the dead surface's own notice, leaving the segment on claude (review Major 1, dead-session REQ-12 variant, edge cases 4+13)", async ({
  page,
}) => {
  // Review Major 1: E9 above only covers the live-session half of REQ-12 — a live
  // `TerminalSurface` is mounted for `claude`, so `handleSurfaceSelect`'s error routes
  // through its `showNotice`. A DEAD session showing `claude` has NO `TerminalSurface`
  // mounted at all (`#dead-surface` replaces it, REQ-13), which the web-impl fix
  // addresses via `findDeadSurfaceRefs`/`showDeadSurfaceNotice` (`web/src/main.ts`,
  // `web/src/render/dead.ts`). This is edge case 13 (start a shell on a dead session,
  // REQ-7) combined with edge case 4 (the directory is gone) — exactly the combination
  // the review measured producing zero visible feedback before this fix.
  const { path: dir, cleanup } = await scratchDirectory();
  let cleaned = false;
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e9-dead" });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    const deadSurface = page.locator("#dead-surface");
    await expect(deadSurface).toBeVisible({ timeout: 15_000 });

    // Remove the directory only after the session is dead — mirrors E9's own ordering
    // (the daemon checks existence at spawn time, not before).
    await cleanup();
    cleaned = true;

    await mainheadSurfaceButton(page, "shell").click();

    // The segment reverts to claude with no half-created shell tab (REQ-12), and the
    // dead surface stays mounted throughout — it was never replaced by a live pane.
    await expect(mainheadSurfaceButton(page, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "false");
    await expect(shellSurfaceRegion(page, "plain-shell-e9-dead")).toHaveCount(0);
    await expect(deadSurface).toBeVisible();

    // Deliberately NOT `deadSurface.getByRole("status")` — the same root also contains
    // `<b role="status">session ended</b>` inside `.endcap`; `deadSurfaceNotice` scopes to
    // `.terminal-notice` specifically (see its own doc comment for the file-drop-fix
    // lesson this repeats).
    await expect(deadSurfaceNotice(deadSurface)).toBeVisible({ timeout: 15_000 });
    await expect(deadSurfaceNotice(deadSurface)).toContainText(dir);
  } finally {
    if (!cleaned) await cleanup();
  }
});

test("switching to shell on a DEAD tile with its directory removed shows the daemon's error in that tile's own dead-surface notice, and a neighbouring tile is unaffected (review Major 1, dead-session REQ-12 variant, tile path)", async ({
  page,
}) => {
  // Same Major 1 fix, exercised through the tile-cloned `.dead-surface`
  // (`#dead-surface-template`) rather than Focus's static one — `findDeadSurfaceRefs`
  // falls back to requerying `tileElements`, a distinct code path from the Focus branch
  // above. A live neighbour session proves the notice is scoped to the one tile whose
  // spawn failed, not broadcast to every dead-surface instance on screen.
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const deadSession = await launchSession(page, daemon, { directory: dirA.path, title: "plain-shell-tile-dead" });
    const liveSession = await launchSession(page, daemon, { directory: dirB.path, title: "plain-shell-tile-live" });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${deadSession.id}/end`);
    expect(endRes.status()).toBe(200);

    await page.keyboard.press("Meta+Backslash");
    const deadTile = liveTileById(page, deadSession.id);
    const liveTile = liveTileById(page, liveSession.id);
    const deadTileSurface = deadTile.locator(".dead-surface");
    await expect(deadTileSurface).toBeVisible({ timeout: 15_000 });

    await dirA.cleanup();

    await tileSurfaceButton(page, deadSession.id, "shell").click();

    await expect(tileSurfaceButton(page, deadSession.id, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(tileSurfaceButton(page, deadSession.id, "shell")).toHaveAttribute("aria-pressed", "false");
    await expect(deadTileSurface).toBeVisible();
    await expect(deadSurfaceNotice(deadTileSurface)).toBeVisible({ timeout: 15_000 });
    await expect(deadSurfaceNotice(deadTileSurface)).toContainText(dirA.path);

    // The neighbour's own segment and dead-surface state (it's alive, so it has none)
    // are untouched — the notice did not leak onto a different tile.
    await expect(tileSurfaceButton(page, liveSession.id, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(liveTile.locator(".dead-surface")).toHaveCount(0);
  } finally {
    await Promise.all([dirB.cleanup()]);
  }
});

test("tmux kill-session on a live shell closes its socket and does not change the parent session's state or alive (E10, edge case 6)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e10" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-plain-shell-e10", { musterSession: session.id }),
    });
    const before = await getState(page, daemon);
    const parentBefore = findSession(before, session.id);

    const tracker = new ShellSocketTracker(page);
    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "plain-shell-e10")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => tracker.liveCount).toBe(1);

    await daemon.killTmuxWindow(shellTmuxTarget(session.id));

    await expect.poll(() => tracker.liveCount, { message: "waiting for the shell socket to close" }).toBe(0);

    // No liveness nudge on the parent (unlike the Claude pane's own 4001) — assert this
    // repeatedly over a short window rather than once, since a false pass on the very
    // first read would not catch a delayed, wrongly-fired nudge.
    await page.waitForTimeout(1_000);
    const after = await getState(page, daemon);
    const parentAfter = findSession(after, session.id);
    expect(parentAfter.alive).toBe(parentBefore.alive);
    expect(parentAfter.state).toBe(parentBefore.state);
  } finally {
    await cleanup();
  }
});

test("resuming a dead session that has a live shell leaves the shell running (E11, edge case 8)", async ({
  page,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e11" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-plain-shell-e11", { musterSession: session.id }),
    });

    await mainheadSurfaceButton(page, "shell").click();
    await expect(shellSurfaceRegion(page, "plain-shell-e11")).toBeVisible({ timeout: 15_000 });
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));

    // Switch back to claude, then end the parent session.
    await mainheadSurfaceButton(page, "claude").click();
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    // The shell survives ending.
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));

    // Resume the parent (dead surface's own Resume button).
    const resumeBtn = page.locator("#dead-surface .endcap").getByRole("button", { name: "Resume" });
    await resumeBtn.click();
    await expect(terminalRegion(page, "plain-shell-e11")).toBeVisible({ timeout: 15_000 });

    // The shell is untouched — still running, throughout.
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(session.id));
  } finally {
    await cleanup();
  }
});

test("a second tab on the same session's shell supersedes the first, while a tab on that session's claude surface stays open (E12, INV-3)", async ({
  page,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e12" });
    const claudeRegionA = terminalRegion(page, "plain-shell-e12");
    await expect(claudeRegionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    // Window A: switch to shell.
    await mainheadSurfaceButton(page, "shell").click();
    const shellRegionA = shellSurfaceRegion(page, "plain-shell-e12");
    await expect(shellRegionA).toBeVisible({ timeout: 15_000 });

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      // Window B lands on claude by default (per-window UI state) — switch it to shell
      // too, claiming the one-live-client slot for the shell attach target out from
      // under window A.
      await mainheadSurfaceButton(pageB, "shell").click();
      const shellRegionB = shellSurfaceRegion(pageB, "plain-shell-e12");
      await expect(shellRegionB).toBeVisible({ timeout: 15_000 });

      // Window A's shell surface shows the superseded overlay.
      await expect(shellRegionA.getByText(/another window/i)).toBeVisible({ timeout: 15_000 });

      // Window B's own round trip still works.
      await shellRegionB.click();
      await pageB.keyboard.type("echo plain-shell-e12-marker");
      await pageB.keyboard.press("Enter");
      await expect(shellRegionB).toContainText("plain-shell-e12-marker");

      // Meanwhile, window A's Claude surface (a different attach target) was never
      // touched — switch A back to claude and prove it still streams.
      await mainheadSurfaceButton(page, "claude").click();
      await expect(claudeRegionA).toBeVisible();
      await expect(claudeRegionA).toContainText("MUSTER-STUB-READY");
      await claudeRegionA.click();
      await page.keyboard.type("hello");
      await page.keyboard.press("Enter");
      await expect(claudeRegionA).toContainText("stub-echo:hello");
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("removing one session kills only its own shell; a second session's shell keeps running (E13, INV-4)", async ({
  page,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "plain-shell-e13-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "plain-shell-e13-b" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-plain-shell-e13-a", { musterSession: sessionA.id }),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionA.id}/end`);
    expect(endRes.status()).toBe(200);

    // Both sessions get a shell via the API directly (no need to click through the UI
    // for this INV-4 setup).
    await createShellViaApi(page, daemon.baseURL, sessionA.id);
    await createShellViaApi(page, daemon.baseURL, sessionB.id);
    expect(await daemon.tmuxSessions()).toEqual(
      expect.arrayContaining([shellTmuxTarget(sessionA.id), shellTmuxTarget(sessionB.id)]),
    );

    const removeRes = await page.request.delete(`${daemon.baseURL}/api/sessions/${sessionA.id}`);
    expect(removeRes.status()).toBe(204);

    expect(await daemon.tmuxSessions()).not.toContain(shellTmuxTarget(sessionA.id));
    expect(await daemon.tmuxSessions()).toContain(shellTmuxTarget(sessionB.id));
    // Session A's own Claude tmux session is gone too (ordinary Remove behaviour).
    expect(await daemon.tmuxPaneExists(sessionA.tmuxTarget)).toBe(false);
    expect(await daemon.tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a file dropped on a shell surface pastes its escaped path (E14, REQ-11)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const content = uniqueContent();
    const resolvedPath = await writeFixtureFile(join(dir, "plain-shell-e14.png"), content);
    const expected = expectedEscapedPath(resolvedPath);

    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-e14" });

    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "plain-shell-e14");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    await dropFiles(shellRegion, [{ name: "plain-shell-e14.png", bytes: content }]);

    await expect(shellRegion).toContainText(expected, { timeout: 15_000 });
    await expect(dropNotice(shellRegion)).toBeHidden({ timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("a shell surface's reported geometry matches its tmux window's geometry (E16, REQ-11)", async ({ page }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "plain-shell-e16" });

    await mainheadSurfaceButton(page, "shell").click();
    const shellRegion = shellSurfaceRegion(page, "plain-shell-e16");
    await expect(shellRegion).toBeVisible({ timeout: 15_000 });

    const sizenote = page.getByText(/one live client/i);
    await expect(sizenote).toBeVisible({ timeout: 15_000 });

    const shellTarget = shellTmuxTarget(session.id);
    await expect
      .poll(
        async () => {
          const text = (await sizenote.textContent()) ?? "";
          const match = /(\d+)\s*×\s*(\d+)/.exec(text);
          if (!match) return false;
          const [, cols, rows] = match;
          const width = await daemon.tmuxDisplay(shellTarget, "#{window_width}");
          const height = await daemon.tmuxDisplay(shellTarget, "#{window_height}");
          return cols === width && rows === height;
        },
        { message: "waiting for the shell sizenote and tmux's #{window_width}/#{window_height} to converge" },
      )
      .toBe(true);
  } finally {
    await cleanup();
  }
});

test("a tile footer renders the same segment as the mainhead, scoped per session (REQ-4)", async ({ page }) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "plain-shell-tile-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "plain-shell-tile-b" });

    await page.keyboard.press("Meta+Backslash");
    await expect(liveTileById(page, sessionA.id)).toBeVisible();
    await expect(liveTileById(page, sessionB.id)).toBeVisible();

    // Six tiles carry identically-named claude/shell buttons — scoping by
    // data-session-id must disambiguate correctly for BOTH tiles.
    await expect(tileSurfaceButton(page, sessionA.id, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(tileSurfaceButton(page, sessionA.id, "shell")).toHaveAttribute("aria-pressed", "false");
    await expect(tileSurfaceButton(page, sessionB.id, "claude")).toHaveAttribute("aria-pressed", "true");

    await tileSurfaceButton(page, sessionB.id, "shell").click();
    // Only B's segment flips; A's is untouched.
    await expect(tileSurfaceButton(page, sessionB.id, "shell")).toHaveAttribute("aria-pressed", "true");
    await expect(tileSurfaceButton(page, sessionA.id, "claude")).toHaveAttribute("aria-pressed", "true");
    await expect(tileSurfaceButton(page, sessionA.id, "shell")).toHaveAttribute("aria-pressed", "false");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a running shell's pip resolves to the --shell-pip token, not --teal (review Major 3, decision shell-pip-hue)", async ({
  page,
}) => {
  // Settled by Damian as Option B (review.md Major 3): the pip gets its own token
  // instead of reusing `--teal`, which design-system §3 reserves for the Working state.
  // Pin this so the decision can't silently regress back to `--teal` — see
  // `expectPipUsesShellPipToken`'s own doc comment for how it resolves both tokens
  // through the live document rather than comparing against a hardcoded hex literal.
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "plain-shell-pip-color" });

    const shellBtn = mainheadSurfaceButton(page, "shell");
    await shellBtn.click();
    await expect(shellSurfaceRegion(page, "plain-shell-pip-color")).toBeVisible({ timeout: 15_000 });

    const pip = shellPip(shellBtn);
    await expect(pip).toHaveCount(1);
    await expectPipUsesShellPipToken(pip);
  } finally {
    await cleanup();
  }
});
