// surfaces — the display properties of the shell segment's activity indicator: plan
// terminal-fixes-cleanup INV-3 (an idle shell shows nothing and the segment's name stays
// "shell"), plan rail-card-improvements-2 REQ-6 (the busy circle's and the done tick's
// computed geometry, E7, E8) and plan shell-pane-fixes REQ-2 (the spinner under reduced
// motion), re-levelled on 2026-10-20 from web/e2e/shell-activity.spec.ts
// (plans/_audit/relevel/misc-core.md). The indicator is driven by `snapshot.shellsBusy`
// (web/src/features/surfaces.ts): `shell-busy` records the daemon's own poller judging the
// session's shell busy, `shell-idle` the same shell idle, each under both views. A render
// test pushes the idle twin's snapshot after the busy one to see the done tick — the
// dashboard shows it whenever a snapshot stops listing a busy shell
// (kb:adr/surfaces-snapshot-restored-tick-always-self-clears), and the shell surface is
// never selected here, so the tick stays for its self-clear window. The view is a pref the
// dashboard adopts only from the broadcast, so the tile-footer halves run on the `-tiles`
// twins (or the `prefs` frame they recorded) rather than the Meta+Backslash chord, whose
// `PUT /api/prefs` the harness answers 404. The journeys — tmux judging a real `sleep`
// busy, the tick clearing on a shell click or 3 s after, a shell exiting or the daemon
// restarting mid-command, two busy shells, a superseded surface — stay in
// web/e2e/shell-activity.spec.ts.
import { type Dashboard, expect, type Locator, loadFixture, test } from "./helpers/harness";
import {
  mainheadSurfaceButton,
  shellActivityIndicator,
  tileSurfaceButton,
} from "./helpers/surfaces";
import { liveTileById } from "./helpers/tiles";

/** The indicator's pre-transform box. REQ-6/Implementation Notes ("the tick is computed
 * width against computed height"): the indicator carries `transform: rotate(-45deg)`, and a
 * 45°-rotated box's getBoundingClientRect always reports a square regardless of its own
 * aspect ratio (cos45 == sin45, so bbox width == bbox height for ANY w×h at exactly 45°) —
 * the pre-transform box read via getComputedStyle is the only oracle that can actually
 * distinguish a circle from a tick. */
function computedBox(indicator: Locator) {
  return indicator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { width: Number.parseFloat(cs.width), height: Number.parseFloat(cs.height) };
  });
}

/** Opens `shell-busy` (or its Tiles twin) and returns the session id the poller marked busy. */
async function openBusy(dashboard: Dashboard, tiles: boolean): Promise<number> {
  const fixture = await dashboard.open(tiles ? "shell-busy-tiles" : "shell-busy");
  expect(fixture.snapshot.prefs.view).toBe(tiles ? "tiles" : "focus");
  const busy = fixture.snapshot.shellsBusy ?? [];
  expect(busy).toHaveLength(1);
  const [id] = busy;
  if (id === undefined) throw new Error("unreachable: toHaveLength(1) just passed");
  expect(fixture.snapshot.sessions.map((s) => s.id)).toEqual([id]);
  return id;
}

/** The snapshot of the idle twin, pushed to end the busy stretch. */
async function idleSnapshot(tiles: boolean) {
  const idle = await loadFixture(tiles ? "shell-idle-tiles" : "shell-idle");
  expect(idle.snapshot.shellsBusy).toEqual([]);
  return idle.snapshot;
}

test("createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline)", async ({
  page,
  dashboard,
}) => {
  // `shell-idle` holds a shell spawned through the real route and never busy.
  const fixture = await dashboard.open("shell-idle");
  expect(fixture.snapshot.shellsBusy).toEqual([]);

  // The shell button's accessible name stays exactly "shell" (INV-3) — the indicator
  // is aria-hidden and never contributes to it — in the one indicator state reachable
  // without ever opening the surface: absent.
  const shellBtn = mainheadSurfaceButton(page, "shell");
  await expect(shellBtn).toHaveAccessibleName("shell");
  await expect(shellActivityIndicator(shellBtn)).toHaveCount(0);
});

test("the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3)", async ({
  page,
  dashboard,
}) => {
  await openBusy(dashboard, false);

  const indicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
  await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  const busyBox = await computedBox(indicator);
  expect(busyBox.width).toBeCloseTo(busyBox.height, 1);
  expect(busyBox.width).toBeGreaterThan(0);

  dashboard.send(await idleSnapshot(false));
  await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  // REQ-6/E7: the reshaped tick's own box is wider than tall (Overview: the pre-fix box
  // was 9×9, a symmetric chevron rather than a tick).
  const doneBox = await computedBox(indicator);
  expect(doneBox.width).toBeGreaterThan(doneBox.height);
});

test("the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3)", async ({
  page,
  dashboard,
}) => {
  const id = await openBusy(dashboard, true);
  await expect(liveTileById(page, id)).toBeVisible();

  const indicator = shellActivityIndicator(tileSurfaceButton(page, id, "shell"));
  await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  // INV-3: `.tfoot .surfseg .shellact` carries its own size override, so the busy
  // circle must stay equal-sided there too, independently of the mainhead assertion.
  const busyBox = await computedBox(indicator);
  expect(busyBox.width).toBeCloseTo(busyBox.height, 1);
  expect(busyBox.width).toBeGreaterThan(0);

  dashboard.send(await idleSnapshot(true));
  await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  const doneBox = await computedBox(indicator);
  expect(doneBox.width).toBeGreaterThan(doneBox.height);
});

// Plan shell-pane-fixes — REQ-2 (the busy spinner stops under prefers-reduced-motion) and
// its edge case 1 (no preference emulated: the spin is unchanged).

// Reads data-act and the computed animation-name in one evaluate, so the animation is only
// ever judged while the indicator is still busy: the done tick has no animation, and a
// separate read after the state flipped would pass `none` without the reduced-motion rule.
function busyAnimationName(indicator: Locator) {
  return indicator.evaluate((el) => ({
    act: (el as HTMLElement).dataset.act,
    name: getComputedStyle(el).animationName,
  }));
}

/** Switches the open page to Tiles the way the dashboard adopts a view: from the `prefs`
 * broadcast, here the frame the `shell-busy-tiles` fixture recorded. */
async function switchToTiles(dashboard: Dashboard): Promise<void> {
  const tiles = (await loadFixture("shell-busy-tiles")).snapshot.prefs;
  expect(tiles.view).toBe("tiles");
  dashboard.send({ type: "prefs", prefs: tiles });
}

test("under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2)", async ({
  page,
  dashboard,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await openBusy(dashboard, false);

  const mainheadIndicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
  await expect(mainheadIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  await expect(mainheadIndicator).toBeVisible();
  expect(await busyAnimationName(mainheadIndicator)).toEqual({ act: "busy", name: "none" });

  await switchToTiles(dashboard);
  await expect(liveTileById(page, id)).toBeVisible();
  const tileIndicator = shellActivityIndicator(tileSurfaceButton(page, id, "shell"));
  await expect(tileIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  await expect(tileIndicator).toBeVisible();
  expect(await busyAnimationName(tileIndicator)).toEqual({ act: "busy", name: "none" });

  dashboard.send(await idleSnapshot(true));
  await expect(tileIndicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  await expect(tileIndicator).toBeVisible();
});

test("without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1)", async ({
  page,
  dashboard,
}) => {
  const id = await openBusy(dashboard, false);

  const mainheadIndicator = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
  await expect(mainheadIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  expect(await busyAnimationName(mainheadIndicator)).toEqual({
    act: "busy",
    name: "shellact-spin",
  });

  await switchToTiles(dashboard);
  await expect(liveTileById(page, id)).toBeVisible();
  const tileIndicator = shellActivityIndicator(tileSurfaceButton(page, id, "shell"));
  await expect(tileIndicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  expect(await busyAnimationName(tileIndicator)).toEqual({ act: "busy", name: "shellact-spin" });
});
