// surfaces — the display properties of the shell segment's activity indicator: an idle shell
// shows nothing and the segment's name stays "shell", the busy circle's and the done tick's
// computed geometry, and the spinner under reduced
// motion, re-levelled on 2026-10-20 from web/e2e/shell-activity.spec.ts
// (plans/_audit/relevel/misc-core.md). The indicator is driven by `snapshot.terminals` (each terminal's `busy` flag)
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
import {
  type Dashboard,
  expect,
  type Locator,
  loadFixture,
  type Page,
  test,
} from "./helpers/harness";
import {
  mainheadSurfaceButton,
  shellActivityIndicator,
  tileSurfaceButton,
} from "./helpers/surfaces";
import { busySessionIds } from "./helpers/terminals";
import { liveTileById } from "./helpers/tiles";

/** The indicator's pre-transform box. The geometry spec ("the tick is computed
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
  const busy = busySessionIds(fixture.snapshot);
  expect(busy).toHaveLength(1);
  const [id] = busy;
  if (id === undefined) throw new Error("unreachable: toHaveLength(1) just passed");
  expect(fixture.snapshot.sessions.map((s) => s.id)).toEqual([id]);
  return id;
}

/** The snapshot of the idle twin, pushed to end the busy stretch. */
async function idleSnapshot(tiles: boolean) {
  const idle = await loadFixture(tiles ? "shell-idle-tiles" : "shell-idle");
  expect(busySessionIds(idle.snapshot)).toEqual([]);
  return idle.snapshot;
}

test("createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline)", async ({
  page,
  dashboard,
}) => {
  // `shell-idle` holds a shell spawned through the real route and never busy.
  const fixture = await dashboard.open("shell-idle");
  expect(busySessionIds(fixture.snapshot)).toEqual([]);

  // The shell button's accessible name stays exactly "shell" — the indicator
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
  // The reshaped tick's own box is wider than tall (Overview: the pre-fix box
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
  // `.tfoot .surfseg .shellact` carries its own size override, so the busy
  // circle must stay equal-sided there too, independently of the mainhead assertion.
  const busyBox = await computedBox(indicator);
  expect(busyBox.width).toBeCloseTo(busyBox.height, 1);
  expect(busyBox.width).toBeGreaterThan(0);

  dashboard.send(await idleSnapshot(true));
  await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  const doneBox = await computedBox(indicator);
  expect(doneBox.width).toBeGreaterThan(doneBox.height);
});

// The busy spinner stops under prefers-reduced-motion and
// is unchanged when no preference is emulated.

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

// #126 — the busy spinner turns in place. The oracle is the ring's ink bounds (pixels that differ
// from the button background) at four angles: a ring with an empty quarter has bounds that shift
// with the angle and sit off the box centre; a complete ring (a faint track under the arc) has
// stable bounds centred on the box. Ink weight is deliberately not measured.
const SPIN_PERIOD_MS = 700;
/** Half a device pixel: the ring snaps to the pixel grid, and the 7 px tile indicator's box sits on
 * a half pixel, so a perfectly round ring still reads up to 0.5 px off the box centre. An empty
 * quarter moves the bounds by a pixel or more. */
const CENTRE_TOLERANCE = 0.51;
/** Margin around the indicator's box in the clip: wide enough to hold the ring's antialiasing,
 * narrow enough to leave the tile footer's segment border outside it. */
const CLIP_MARGIN = 1.5;

interface InkBounds {
  width: number;
  height: number;
  /** centre of the bounds minus the box centre, in CSS px */
  dx: number;
  dy: number;
}

/** Pauses the indicator's animations at `deg` of a turn, screenshots a clip around its box and
 * measures the ink bounds against the clip's corner pixel (the button background). */
async function inkBoundsAt(page: Page, indicator: Locator, deg: number): Promise<InkBounds> {
  await indicator.evaluate(
    (el, ms) => {
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = ms;
      }
    },
    (SPIN_PERIOD_MS * deg) / 360,
  );
  const box = await indicator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
  });
  const half = Math.ceil(box.w / 2 + CLIP_MARGIN);
  const x0 = Math.floor(box.cx) - half;
  const y0 = Math.floor(box.cy) - half;
  const png = await page.screenshot({
    clip: { x: x0, y: y0, width: half * 2, height: half * 2 },
    scale: "css",
  });
  const ink = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bmp, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const bg = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
    const xs: number[] = [];
    const ys: number[] = [];
    for (let p = 0; p < width * height; p++) {
      const diff = Math.max(...bg.map((v, k) => Math.abs((data[p * 4 + k] ?? 0) - v)));
      if (diff > 6) {
        xs.push(p % width);
        ys.push(Math.floor(p / width));
      }
    }
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: xs.length ? Math.max(...xs) : -1,
      maxY: ys.length ? Math.max(...ys) : -1,
      pxWidth: bmp.width,
    };
  }, png.toString("base64"));
  expect(ink.maxX, "no ink found around the busy indicator").toBeGreaterThanOrEqual(0);
  const s = ink.pxWidth / (half * 2);
  const left = ink.minX / s;
  const right = (ink.maxX + 1) / s;
  const top = ink.minY / s;
  const bottom = (ink.maxY + 1) / s;
  return {
    width: right - left,
    height: bottom - top,
    dx: x0 + (left + right) / 2 - box.cx,
    dy: y0 + (top + bottom) / 2 - box.cy,
  };
}

async function expectRingStable(page: Page, indicator: Locator): Promise<void> {
  const seen: InkBounds[] = [];
  for (const deg of [0, 90, 180, 270]) {
    const b = await inkBoundsAt(page, indicator, deg);
    expect(Math.abs(b.dx), `ring centre x offset at ${deg}deg`).toBeLessThanOrEqual(
      CENTRE_TOLERANCE,
    );
    expect(Math.abs(b.dy), `ring centre y offset at ${deg}deg`).toBeLessThanOrEqual(
      CENTRE_TOLERANCE,
    );
    seen.push(b);
  }
  const widths = seen.map((b) => b.width);
  const heights = seen.map((b) => b.height);
  expect(Math.max(...widths) - Math.min(...widths), "ring width across angles").toBeLessThanOrEqual(
    0.5,
  );
  expect(
    Math.max(...heights) - Math.min(...heights),
    "ring height across angles",
  ).toBeLessThanOrEqual(0.5);
}

test("the busy spinner's ring stays centred on its box at every angle, on the Focus mainhead (#126, REQ-1)", async ({
  page,
  dashboard,
}) => {
  await openBusy(dashboard, false);
  const mainhead = shellActivityIndicator(mainheadSurfaceButton(page, "shell"));
  await expect(mainhead).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  await expectRingStable(page, mainhead);
});

test("the busy spinner's ring stays centred on its box at every angle, in a tile footer (#126, REQ-1)", async ({
  page,
  dashboard,
}) => {
  const id = await openBusy(dashboard, true);
  await expect(liveTileById(page, id)).toBeVisible();
  const tile = shellActivityIndicator(tileSurfaceButton(page, id, "shell"));
  await expect(tile).toHaveAttribute("data-act", "busy", { timeout: 15_000 });
  await expectRingStable(page, tile);
});
