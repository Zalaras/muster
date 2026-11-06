// notes-places — per-session pop-out: which session's panel shows, at which rectangle, how a
// popped panel moves across the whole window, what Close and Escape do, and the three-control
// header at 260px. State comes from the `notes` fixture (notes-plain / -short / -long / -ended).
// The journeys — a save reaching the daemon, a second window, a restart — stay in web/e2e.
import { focusSession, sessionCard } from "./helpers/focus";
import { expect, type Page, settleFor, test } from "./helpers/harness";
import {
  type Box,
  boxOf,
  closeNote,
  escapes,
  noteGlyph,
  notePanel,
  noteStatus,
  openNoteInWindow,
  popInNote,
  popOutNote,
  viewportBox,
} from "./helpers/notes";
import { cardMenu, openCardMenu } from "./helpers/rail";
import { activeElementInsideTerminal, terminalRegion } from "./helpers/surfaces";

const LONG = "notes-long";
const SHORT = "notes-short";
const PLAIN = "notes-plain";

async function popOut(page: Page, title: string): Promise<void> {
  await focusSession(page, title);
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
}

/** Drags the panel by its header label so the label's centre moves by (dx, dy). */
async function dragPanel(page: Page, dx: number, dy: number): Promise<void> {
  const label = await boxOf(notePanel(page).locator(".ph .lab"));
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
}

/** Waits for the panel's box to stop changing, then returns it. */
async function settledBox(page: Page): Promise<Box> {
  let last = await boxOf(notePanel(page));
  await expect
    .poll(async () => {
      const now = await boxOf(notePanel(page));
      const same = now.x === last.x && now.y === last.y && now.width === last.width;
      last = now;
      return same;
    })
    .toBe(true);
  return last;
}

function near(a: Box, b: Box): void {
  expect(a.x).toBeCloseTo(b.x, 0);
  expect(a.y).toBeCloseTo(b.y, 0);
  expect(a.width).toBeCloseTo(b.width, 0);
  expect(a.height).toBeCloseTo(b.height, 0);
}

/** Pops notes-short and notes-long out at two different rectangles. */
async function twoPopped(page: Page): Promise<{ short: Box; long: Box }> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, SHORT);
  await dragPanel(page, -180, 160);
  const short = await settledBox(page);
  await popOut(page, LONG);
  await dragPanel(page, -60, 40);
  const long = await settledBox(page);
  expect(Math.abs(short.x - long.x) + Math.abs(short.y - long.y)).toBeGreaterThan(40);
  return { short, long };
}

test("popped-out sessions show their own panel at their own rectangle and an unpopped session shows none (R1, REQ-1, REQ-2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const { short, long } = await twoPopped(page);

  await focusSession(page, PLAIN);
  await expect(notePanel(page)).toHaveCount(0);
  await expect(noteGlyph(page)).toHaveAttribute("aria-expanded", "false");

  await focusSession(page, SHORT);
  await expect(popInNote(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("Waiting on review.");
  near(await settledBox(page), short);

  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  await expect(notePanel(page)).not.toContainText("Waiting on review.");
  near(await settledBox(page), long);
  await expect(notePanel(page)).toHaveCount(1);
});

test("popping one session in leaves the other popped out and popping it out again returns it to its rectangle (R2, REQ-4)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const { short, long } = await twoPopped(page);

  await focusSession(page, SHORT);
  await popInNote(page).click();
  await expect(popOutNote(page)).toBeVisible();
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  near(await settledBox(page), long);

  await focusSession(page, SHORT);
  await expect(notePanel(page)).toHaveCount(0);
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  near(await settledBox(page), short);
});

test("closing a popped panel with Close or Escape leaves the other session popped out at its rectangle (R3, REQ-4)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const { long } = await twoPopped(page);

  await focusSession(page, SHORT);
  await expect(popInNote(page)).toBeVisible();
  await closeNote(page).click();
  await expect(notePanel(page)).toBeHidden();
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  near(await settledBox(page), long);

  // Escape inside the panel closes this one; the short session is popped out again first.
  await focusSession(page, SHORT);
  await expect(notePanel(page)).toHaveCount(0);
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  await popInNote(page).focus();
  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  near(await settledBox(page), long);
});

test("a popped panel dragged over the rail, the masthead and the Focus header sits there with its header on top (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, LONG);

  const targets: [string, () => Promise<{ x: number; y: number }>, string][] = [
    ["rail", async () => ({ x: 150, y: 450 }), "#sessions"],
    [
      "masthead",
      async () => {
        const b = await boxOf(page.locator("header.masthead"));
        return { x: 700, y: b.y + b.height / 2 };
      },
      "header.masthead",
    ],
    [
      "Focus header",
      async () => {
        const b = await boxOf(page.locator("#mainhead"));
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      },
      "#mainhead",
    ],
  ];
  for (const [name, where, host] of targets) {
    const target = await where();
    const label = await boxOf(notePanel(page).locator(".ph .lab"));
    await dragPanel(
      page,
      target.x - (label.x + label.width / 2),
      target.y - (label.y + label.height / 2),
    );
    const box = await settledBox(page);
    const hostBox = await boxOf(page.locator(host));
    // The panel sits over the surface it was dragged to: it overlaps that surface's box ...
    const overlaps =
      box.x < hostBox.x + hostBox.width &&
      box.x + box.width > hostBox.x &&
      box.y < hostBox.y + hostBox.height &&
      box.y + box.height > hostBox.y;
    expect(overlaps, `${name}: the panel overlaps ${host}`).toBe(true);
    expect(escapes(box, viewportBox(page)), `${name}: inside the window`).toBeNull();
    // ... and its header centre is the topmost thing there.
    const head = await boxOf(notePanel(page).locator(".ph"));
    const top = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest(".npanel") != null,
      [head.x + head.width / 2, head.y + head.height / 2],
    );
    expect(top, `${name}: elementFromPoint at the header centre is inside the panel`).toBe(true);
  }
});

test("Escape pressed outside the popped panel, which sits over the rail, leaves it open and unmoved (R6, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, LONG);
  await dragPanel(page, -900, 100);
  const before = await settledBox(page);
  const rail = await boxOf(page.locator("#sessions"));
  expect(before.x).toBeLessThan(rail.x + rail.width);

  await terminalRegion(page, LONG).click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(() => activeElementInsideTerminal(page, LONG)).toBe(true);
  await page.keyboard.press("Escape");
  await settleFor(page, 600);
  await expect(popInNote(page)).toBeVisible();
  near(await boxOf(notePanel(page)), before);
});

test("at 260px wide with the unsaved status showing, every control of both forms lies inside its panel (R7, REQ-7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await focusSession(page, LONG);
  await page.route("**/api/sessions/*/note", (route) => route.abort("connectionrefused"));
  await noteGlyph(page).click();
  await notePanel(page).locator(".bd").click();
  await notePanel(page).getByRole("textbox", { name: "Note text" }).fill("an unsaved draft");
  await page.keyboard.press("Escape");
  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");

  const inside = async (names: string[], form: string) => {
    for (const name of names) {
      const control = notePanel(page).getByRole("button", { name });
      await expect(control, `${form}: ${name}`).toBeVisible();
      // Poll: the panel's box and its control's box are read together until they settle.
      await expect
        .poll(
          async () => {
            const panel = await boxOf(notePanel(page));
            return escapes(await boxOf(control), panel);
          },
          { message: `${form}: ${name} inside the panel` },
        )
        .toBeNull();
    }
  };
  // Anchored: 400px capped at the window less 16px, so a 276px window makes it 260px wide.
  await page.setViewportSize({ width: 276, height: 800 });
  await expect.poll(async () => Math.round((await boxOf(notePanel(page))).width)).toBe(260);
  await inside(["Pop out note", "Open note in window", "Close note"], "anchored");

  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  const west = await boxOf(notePanel(page).locator(".rz.w"));
  await page.mouse.move(west.x + west.width / 2, west.y + west.height / 2);
  await page.mouse.down();
  await page.mouse.move(west.x + 3000, west.y + west.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await boxOf(notePanel(page))).width)).toBe(260);
  await inside(["Pop in note", "Open note in window", "Close note"], "popped");
});

test("with browser storage blocked, per-session pop-out, switching focus and Close work with no page error (R8, REQ-13)", async ({
  page,
  dashboard,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    for (const name of ["sessionStorage", "localStorage"] as const) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    }
  });
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, SHORT);
  await popOut(page, LONG);

  await focusSession(page, PLAIN);
  await expect(notePanel(page)).toHaveCount(0);
  await focusSession(page, SHORT);
  await expect(popInNote(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("Waiting on review.");
  await closeNote(page).click();
  await expect(notePanel(page)).toBeHidden();
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Close on the anchored panel closes it and focus lands in the Claude terminal, or on the glyph for an ended session (R11, REQ-6)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, SHORT);
  await expect(terminalRegion(page, SHORT)).toBeVisible();
  await noteGlyph(page).click();
  await expect(openNoteInWindow(page)).toBeVisible();
  await closeNote(page).click();
  await expect(notePanel(page)).toBeHidden();
  await expect.poll(() => activeElementInsideTerminal(page, SHORT)).toBe(true);

  await focusSession(page, "notes-ended");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await closeNote(page).click();
  await expect(notePanel(page)).toBeHidden();
  await expect(noteGlyph(page)).toBeFocused();
});

test("a stored rectangle that no longer fits stays inside the window after a shrink, a focus switch and a reload (R5, REQ-5, INV-2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, SHORT);
  await popOut(page, LONG);
  // Move LONG to the bottom-right corner of the window.
  await dragPanel(page, 3000, 3000);
  await settledBox(page);

  const inside = async (what: string) => {
    await expect
      .poll(async () => escapes(await boxOf(notePanel(page)), viewportBox(page)), {
        message: `${what}: the panel lies inside the window`,
      })
      .toBeNull();
  };
  await inside("dragged to the corner");

  // Shrink while the other session is focused, then focus the moved one.
  await focusSession(page, SHORT);
  await expect(popInNote(page)).toBeVisible();
  await page.setViewportSize({ width: 700, height: 500 });
  await inside("the shrink, other session focused");
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  await inside("focus switch to the session whose rectangle no longer fit");

  // Reload at the small size (the stored rectangle is still the big one).
  await page.reload();
  await page.locator("#sessions").waitFor({ state: "attached" });
  await focusSession(page, LONG);
  await expect(notePanel(page)).toBeVisible();
  await inside("after a reload");
});

test("a card menu opened over a popped panel dragged across the rail draws above it: every item is the hit target at its centre (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, LONG);
  const label = await boxOf(notePanel(page).locator(".ph .lab"));
  await dragPanel(page, 150 - (label.x + label.width / 2), 450 - (label.y + label.height / 2));
  await settledBox(page);

  await openCardMenu(page, sessionCard(page, PLAIN));
  const menu = await boxOf(cardMenu(page));
  const panel = await boxOf(notePanel(page));
  const overlaps =
    menu.x < panel.x + panel.width &&
    menu.x + menu.width > panel.x &&
    menu.y < panel.y + panel.height &&
    menu.y + menu.height > panel.y;
  expect(overlaps, "the menu overlaps the popped panel").toBe(true);

  const items = cardMenu(page).getByRole("menuitem");
  const count = await items.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const b = await boxOf(item);
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('[role="menuitem"]') != null,
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(hit, `menu item ${i} is the hit target at its centre`).toBe(true);
  }
});

test("a drag of one popped panel cut short by a focus switch never moves it later: the other session's drag moves only that panel (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const { short, long } = await twoPopped(page);

  // Start dragging LONG's panel (focused) and leave the pointer down.
  const label = await boxOf(notePanel(page).locator(".ph .lab"));
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 2 });

  // Switch focus mid-drag with a click event only (no pointer events, so nothing ends the drag).
  await sessionCard(page, SHORT).evaluate((el) => (el as HTMLElement).click());
  await expect(notePanel(page)).toContainText("Waiting on review.");
  // Moving while still pressed must not move any panel on LONG's stale gesture.
  await page.mouse.move(from.x + 200, from.y + 200, { steps: 4 });
  await page.mouse.up();
  near(await settledBox(page), short);

  // Drag SHORT's panel by an exact amount.
  await dragPanel(page, 30, 20);
  const moved = await settledBox(page);
  expect(moved.x).toBeCloseTo(short.x + 30, 0);
  expect(moved.y).toBeCloseTo(short.y + 20, 0);

  // LONG is where it was when its drag began, plus at most the 10px it moved before the switch.
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  const after = await settledBox(page);
  expect(Math.abs(after.x - long.x)).toBeLessThanOrEqual(10.5);
  expect(Math.abs(after.y - long.y)).toBeLessThanOrEqual(10.5);
});

/** Pops LONG out, drags its panel so its box top-left sits at (x, y) (clamped by the app), then
 * reloads against a socket that says hello, sends the snapshot and drops — the dashboard's real
 * daemon-down state. The panel's rectangle survives in session storage; focusing LONG reopens it. */
async function poppedThenDaemonDown(
  page: Page,
  fixture: { hello: object; snapshot: object },
  at: { x: number; y: number },
): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, LONG);
  const box = await boxOf(notePanel(page));
  await dragPanel(page, at.x - box.x, at.y - box.y);
  await settledBox(page);
  await page.routeWebSocket("**/ws", (ws) => {
    ws.send(JSON.stringify(fixture.hello));
    ws.send(JSON.stringify(fixture.snapshot));
    ws.close();
  });
  await page.reload();
  await focusSession(page, LONG);
  await expect(popInNote(page)).toBeVisible();
  await expect(page.locator("#banner")).toBeVisible();
  await expect(page.locator("#banner")).toContainText("musterd unreachable");
}

/** Whether `elementFromPoint` at (x, y) lies inside the selector's element. */
async function hitIn(page: Page, x: number, y: number, selector: string): Promise<boolean> {
  return await page.evaluate(
    ([px, py, sel]) => document.elementFromPoint(px ?? 0, py ?? 0)?.closest(sel ?? "") != null,
    [x, y, selector] as const,
  );
}

test("a popped panel placed under the daemon-down banner leaves the banner's words the hit target (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  await poppedThenDaemonDown(page, fixture, { x: 0, y: 0 });
  const banner = page.locator("#banner");
  const panel = await boxOf(notePanel(page));
  const b = await boxOf(banner);
  const overlaps =
    b.x < panel.x + panel.width &&
    b.x + b.width > panel.x &&
    b.y < panel.y + panel.height &&
    b.y + b.height > panel.y;
  expect(overlaps, "the panel lies under the banner").toBe(true);
  const y = b.y + b.height / 2;
  const x = Math.max(panel.x, b.x) + 40;
  expect(await hitIn(page, x, y, "#banner"), "banner text is the hit, not the panel").toBe(true);
});

test("a popped panel placed under the masthead's connection readout leaves the readout the hit target at its centre (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  const readout = await boxOf(page.locator("#connection-status"));
  await poppedThenDaemonDown(page, fixture, { x: readout.x - 40, y: 0 });
  const r = await boxOf(page.locator("#connection-status"));
  const panel = await boxOf(notePanel(page));
  expect(r.x >= panel.x && r.x + r.width <= panel.x + panel.width, "readout under panel").toBe(
    true,
  );
  expect(r.y >= panel.y && r.y + r.height <= panel.y + panel.height, "readout under panel").toBe(
    true,
  );
  expect(await hitIn(page, r.x + r.width / 2, r.y + r.height / 2, "#connection-status")).toBe(true);
});

test("a drag in progress across Pop in leaves the session popped in: nothing shows popped on return and the rectangle is unchanged (R5, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await popOut(page, LONG);
  await dragPanel(page, -120, 80);
  const before = await settledBox(page);

  const label = await boxOf(notePanel(page).locator(".ph .lab"));
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await popInNote(page).focus();
  await page.keyboard.press("Enter");
  await expect(popOutNote(page)).toBeVisible();
  await page.mouse.move(from.x + 150, from.y + 150, { steps: 4 });
  await page.mouse.up();

  await focusSession(page, SHORT);
  await expect(notePanel(page)).toHaveCount(0);
  await focusSession(page, LONG);
  await expect(notePanel(page)).toHaveCount(0);

  // Popping out again returns to the rectangle it had before the stale drag.
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  near(await settledBox(page), before);
});

test("a popped panel placed over the masthead's connection readout while musterd is connected is the hit target there (#116)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  const readout = await boxOf(page.locator("#connection-status"));
  await popOut(page, LONG);
  const box = await boxOf(notePanel(page));
  await dragPanel(page, readout.x - 40 - box.x, -box.y);
  await settledBox(page);
  await expect(page.locator("#connection-status")).toHaveAttribute("data-health", "ok");
  const r = await boxOf(page.locator("#connection-status"));
  const panel = await boxOf(notePanel(page));
  expect(r.x >= panel.x && r.x + r.width <= panel.x + panel.width, "readout under panel").toBe(
    true,
  );
  expect(r.y >= panel.y && r.y + r.height <= panel.y + panel.height, "readout under panel").toBe(
    true,
  );
  expect(await hitIn(page, r.x + r.width / 2, r.y + r.height / 2, ".npanel")).toBe(true);
});
