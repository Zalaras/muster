// terminals — the display properties of a session's several terminals: the Focus switch
// `claude | shell | ▾ | docs` with the count on `shell`, the Terminals panel's rows, state
// words, hover affordance and scroll, the tile footer's fit at 3×2, the daemon-down state
// and the one-terminal state with no count. Driven by `snapshot.terminals`, recorded in
// `terminals-two` (Focus, `shell 1` idle + `build` busy), `terminals-two-tiles`,
// `terminals-ten` and `shell-idle-tiles`. The journeys — adding, switching, renaming and
// closing a terminal against the daemon — are web/e2e/terminals.spec.ts's.
import { expect, test } from "./helpers/harness";
import { dropDaemon, recordSockets } from "./helpers/restart";
import { mainheadSurfaceButton, mainheadSurfaceGroup, tileSurfaceButton } from "./helpers/surfaces";
import {
  mainheadTerminalsOpener,
  newTerminalButton,
  shellCount,
  terminalRow,
  terminalsPanel,
  tileTerminalsOpener,
} from "./helpers/terminals";
import { liveTileById } from "./helpers/tiles";

test("the Focus switch reads claude, shell, ▾, docs and the shell button holds count 2 and the name shell (R1, REQ-8, REQ-9)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("terminals-two");

  const buttons = mainheadSurfaceGroup(page).getByRole("button");
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(0)).toHaveAccessibleName("claude");
  await expect(buttons.nth(1)).toHaveAccessibleName("shell");
  await expect(buttons.nth(2)).toHaveAccessibleName("Terminals");
  await expect(buttons.nth(3)).toHaveAccessibleName("docs");

  const shell = mainheadSurfaceButton(page, "shell");
  const count = shellCount(shell);
  await expect(count).toHaveText("2");
  await expect(count).toHaveAttribute("aria-hidden", "true");
  await expect(shell).toContainText("shell");
  await expect(mainheadTerminalsOpener(page)).toHaveAttribute("aria-haspopup", "dialog");
});

test("every tile footer's switch and actions fit without horizontal overflow at 3x2, across the width range (R2, REQ-16)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("terminals-two-tiles");
  const ids = fixture.snapshot.sessions.map((s) => s.id);
  expect(ids).toHaveLength(6);
  for (const id of ids) await expect(liveTileById(page, id)).toBeVisible();
  // the two-terminal session shows its count in the tile footer
  await expect(shellCount(tileSurfaceButton(page, 1, "shell"))).toHaveText("2");

  for (const width of [1600, 1440, 1280, 1100, 960]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ids) {
      const tile = liveTileById(page, id);
      for (const sel of [".tfoot", ".tfoot .acts", ".tfoot .acts .surfseg"]) {
        const fits = await tile.locator(sel).evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(fits, `${sel} of session ${id} at ${width}px`).toBe(true);
      }
    }
  }
});

test("the open panel shows nine of ten rows, its list scrolls and New terminal is visible without scrolling (R3, REQ-18)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("terminals-ten");
  await mainheadTerminalsOpener(page).click();
  const panel = terminalsPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel.locator("li.trow")).toHaveCount(10);

  const list = panel.locator(".tlist");
  const m = await list.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll("li.trow")].map((r) => r.getBoundingClientRect());
    return {
      scrolls: el.scrollHeight > el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
      shown: rows.filter((r) => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5).length,
    };
  });
  expect(m.overflowY).toBe("auto");
  expect(m.scrolls).toBe(true);
  expect(m.shown).toBe(9);

  const newBtn = newTerminalButton(page);
  await expect(newBtn).toBeVisible();
  await expect(newBtn).toBeInViewport({ ratio: 1 });
  // New terminal stays outside the scroll area
  expect(await list.evaluate((el, b) => !el.contains(b), await newBtn.elementHandle())).toBe(true);
});

test("with the daemon connection down the opener is disabled and an open panel closes (R4, REQ-14)", async ({
  page,
  dashboard,
}) => {
  await recordSockets(page);
  await dashboard.open("terminals-two");
  await mainheadTerminalsOpener(page).click();
  await expect(terminalsPanel(page)).toBeVisible();

  await dropDaemon(page);
  await expect(page.getByRole("status")).not.toHaveText(/^connected/i);
  await expect(mainheadTerminalsOpener(page)).toBeDisabled();
  await expect(terminalsPanel(page)).toHaveCount(0);

  await mainheadTerminalsOpener(page).click({ force: true });
  await expect(terminalsPanel(page)).toHaveCount(0);
});

test("the panel lists shell 1 idle and build running with the spinner, rename on row hover, the shown row highlighted (R5, REQ-11)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("terminals-two");
  // The fixture is Focus on claude, so nothing is on screen. Putting `shell 1` on screen is the
  // shell button's POST, which the harness answers 404; stub it (no fixture changes).
  await page.route(/\/api\/sessions\/\d+\/shell$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ target: "muster-1-shell", n: 1, created: false }),
    }),
  );
  await mainheadSurfaceButton(page, "shell").click();
  await mainheadTerminalsOpener(page).click();
  await expect(terminalsPanel(page)).toBeVisible();
  await expect(terminalsPanel(page).getByText("Terminals", { exact: true })).toBeVisible();

  const idle = terminalRow(page, "shell 1");
  const busy = terminalRow(page, "build");
  await expect(idle.locator(".tstate")).toHaveText("idle");
  await expect(busy.locator(".tstate")).toHaveText("running");
  await expect(busy.locator(".tstate .shellact")).toHaveAttribute("data-act", "busy");
  await expect(idle.locator(".shellact")).toHaveCount(0);

  // ✎ is hidden until the row is hovered or focused; hiding is opacity, so assert the computed
  // value. The shown row holds the panel's initial focus, so its ✎ is already out; `build` is not.
  const rename = (row: typeof idle, name: string) =>
    row.getByRole("button", { name: `Rename ${name}`, exact: true });
  await expect(rename(idle, "shell 1")).toHaveCSS("opacity", "1");
  await expect(rename(busy, "build")).toHaveCSS("opacity", "0");
  await busy.hover();
  await expect(rename(busy, "build")).toHaveCSS("opacity", "1");
  await expect(idle.getByRole("button", { name: "Close shell 1", exact: true })).toBeVisible();

  // the shown row carries aria-current and the hover ground; the other row carries neither
  await expect(idle.getByRole("button", { name: "shell 1", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(busy.locator("button.tname")).not.toHaveAttribute("aria-current", /.*/);
  const token = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--bg-hover)";
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  });
  await page.mouse.move(0, 0);
  await expect(idle).toHaveCSS("background-color", token);
  await expect(busy).not.toHaveCSS("background-color", token);
});

test("a session with one terminal shows no count in any shell button (R6, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("shell-idle-tiles");
  for (const s of fixture.snapshot.sessions) {
    const shell = tileSurfaceButton(page, s.id, "shell");
    await expect(shell).toBeVisible();
    await expect(shellCount(shell)).toHaveCount(0);
    await expect(tileTerminalsOpener(page, s.id)).toBeEnabled();
  }
  await expect(page.locator(".shellcount")).toHaveCount(0);
});
