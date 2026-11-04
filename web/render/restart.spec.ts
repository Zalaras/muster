// restart — the display properties of the restart-onto-the-latest-Claude notice
// (plan restart-latest-claude): the masthead readout as a button with its neutral dot, the
// panel under it, the confirm dialog with two collapsible sections, the queued readout and the
// disabled readout while the daemon is down. State comes from the `claude-restart`,
// `claude-restart-queued` and `claude-restart-down` fixtures (installed 2.1.318); the journeys
// (confirming, the queue firing, Ignore across a reload) are web/e2e/claude-restart.spec.ts's.
import { claudeVersionReadout } from "./helpers/connection";
import { expect, loadFixture, settleFor, test, type Page } from "./helpers/harness";
import {
  confirmButton,
  dialogSection,
  dropDaemon,
  ignoreButton,
  noticeButton,
  openRestartDialog,
  panel,
  panelCountRow,
  panelHead,
  panelRestartButton,
  readoutWidth,
  recordSockets,
  restartDialog,
  rowOf,
  stateColoursUsed,
} from "./helpers/restart";
import { tokenColor } from "./helpers/style";

const WIDTHS = [1024, 1280, 1440, 1920];

test("the readout is a button reading claude 2.1.316→318 with a neutral dot (R1, REQ-7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");

  const button = noticeButton(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("opacity", "1");
  await expect(button).toHaveText("claude 2.1.316→318");
  await expect(button).toBeEnabled();

  // The dot: 6px, neutral (--fg-muted), in the button's top-right.
  const dot = button.locator(".update-dot");
  await expect(dot).toBeVisible();
  await expect(dot).toHaveCSS("width", "6px");
  await expect(dot).toHaveCSS("height", "6px");
  await expect(dot).toHaveCSS(
    "background-color",
    await tokenColor(page, "--fg-muted", "background-color"),
  );
  const b = await button.boundingBox();
  const d = await dot.boundingBox();
  if (!b || !d) throw new Error("the readout button and its dot have boxes");
  expect(d.x + d.width / 2).toBeGreaterThan(b.x + b.width / 2);
  expect(d.y + d.height / 2).toBeLessThan(b.y + b.height / 2);
});

test("the readout keeps one fixed width in the plain, notice and queued shapes at every width (R1, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const widths: Record<string, number[]> = {};
  for (const name of ["three-states", "claude-restart", "claude-restart-queued"]) {
    widths[name] = [];
    await dashboard.open(name);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      await expect(claudeVersionReadout(page)).toBeVisible();
      widths[name]?.push(await readoutWidth(page));
    }
  }
  const plain = widths["three-states"] ?? [];
  for (const name of ["claude-restart", "claude-restart-queued"]) {
    const got = widths[name] ?? [];
    for (const [i, w] of got.entries()) {
      expect(w, `${name} at ${WIDTHS[i]}px`).toBeCloseTo(plain[i] ?? -1, 1);
    }
  }
});

test("the panel shows the head, the counts, Ignore, Restart… and the queued list (R2, REQ-7, REQ-9)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  await noticeButton(page).click();

  await expect(panelHead(page)).toBeVisible();
  await expect(panelHead(page)).toHaveCSS("opacity", "1");
  await expect(panelCountRow(page, "Restart now")).toHaveText(/^Restart now\s*2$/);
  // The pending planning session is excluded from the behind counts: 3 busy, not 4.
  await expect(panelCountRow(page, "Restart when free")).toHaveText(/^Restart when free\s*3$/);
  await expect(ignoreButton(page)).toBeVisible();
  await expect(panelRestartButton(page)).toBeVisible();

  await expect(panel(page).getByText("Restart when free · 1", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("auth-rework-plan", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("planning", { exact: true })).toBeVisible();
  // No cancel anywhere in the panel.
  await expect(panel(page).getByRole("button", { name: /cancel/i })).toHaveCount(0);
});

test("the panel closes on Escape and on an outside click, and Restart… closes it for the dialog (R2, REQ-7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  await noticeButton(page).click();
  await expect(panelHead(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panelHead(page)).toBeHidden();

  await noticeButton(page).click();
  await expect(panelHead(page)).toBeVisible();
  await page.locator("#sessions").click({ position: { x: 2, y: 2 }, force: true });
  await expect(panelHead(page)).toBeHidden();

  await openRestartDialog(page);
  await expect(panelHead(page)).toBeHidden();
});

test("the dialog lists both sections open, rows with reasons, and the mixed confirm label (R3, REQ-8, REQ-13)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  const dialog = await openRestartDialog(page);

  await expect(
    dialog.getByRole("heading", { name: "Restart sessions on Claude Code 2.1.318" }),
  ).toBeVisible();
  const now = dialogSection(page, "Restart now · 2");
  const free = dialogSection(page, "Restart when free · 3");
  await expect(now).toHaveJSProperty("open", true);
  await expect(free).toHaveJSProperty("open", true);

  await expect(rowOf(now, "flaky-e2e-hunt")).toContainText("idle");
  await expect(rowOf(now, "migration-dry-run")).toContainText("failed");
  await expect(rowOf(free, "rail-card-polish")).toContainText("working");
  await expect(rowOf(free, "log-tail-watch")).toContainText("idle · 2 background tasks");
  await expect(rowOf(free, "deploy-approval")).toContainText("waiting on you");
  // Pending, current and ended sessions are not offered.
  await expect(dialog.getByText("auth-rework-plan")).toHaveCount(0);
  await expect(dialog.getByText("already-current")).toHaveCount(0);
  await expect(dialog.getByText("retired-spike")).toHaveCount(0);

  await expect(
    dialog.getByText("Queued sessions restart as soon as each is idle with no background tasks."),
  ).toBeVisible();
  await expect(confirmButton(page)).toHaveText("Restart 2, queue 3");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("the dialog is 520px wide and its list box scrolls inside a 280px ceiling (R3, REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  const dialog = await openRestartDialog(page);
  await expect(dialog).toHaveCSS("width", "520px");
  const box = dialog.locator(".rscroll");
  await expect(box).toHaveCSS("max-height", "280px");
  await expect(box).toHaveCSS("overflow-y", "auto");
  const h = await box.evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThanOrEqual(280);
  // Both summaries stay reachable: they sit inside the scroll box.
  await expect(dialogSection(page, "Restart now · 2").locator("summary")).toBeVisible();
  await expect(dialogSection(page, "Restart when free · 3").locator("summary")).toBeVisible();
});

test("with 14 behind sessions the dialog box scrolls and both summaries stay reachable (R3, REQ-8, edge 29)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart-many");
  const dialog = await openRestartDialog(page);
  const now = dialogSection(page, "Restart now · 7");
  const free = dialogSection(page, "Restart when free · 7");
  await expect(now).toHaveJSProperty("open", true);
  await expect(free).toHaveJSProperty("open", true);
  const box = dialog.locator(".rscroll");
  await expect(box).toHaveCSS("max-height", "280px");
  const m = await box.evaluate((el) => ({
    sh: el.scrollHeight,
    ch: el.clientHeight,
    h: el.getBoundingClientRect().height,
  }));
  expect(m.sh).toBeGreaterThan(m.ch);
  expect(m.h).toBeLessThanOrEqual(280);
  // Both summaries sit inside the box (reachable); the last row needs a scroll to be seen.
  const inBox = (loc: ReturnType<typeof free.locator>) =>
    Promise.all([loc.boundingBox(), box.boundingBox()]).then(
      ([l, b]) => !!l && !!b && l.y >= b.y && l.y + l.height <= b.y + b.height + 1,
    );
  await box.evaluate((el) => {
    el.scrollTop = 0;
  });
  expect(await inBox(now.locator("summary"))).toBe(true);
  await box.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await inBox(free.locator("summary"))).toBe(true);
  expect(await inBox(now.locator("summary"))).toBe(false);
  await box.evaluate((el) => {
    el.scrollTop = 0;
  });
  expect(await inBox(free.locator("summary"))).toBe(true);
  // The dialog's own buttons stay on screen below the scrolling list.
  await expect(confirmButton(page)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("clicking a section's summary collapses and expands it independently (R4, REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  await openRestartDialog(page);
  const now = dialogSection(page, "Restart now · 2");
  const free = dialogSection(page, "Restart when free · 3");

  await now.locator("summary").click();
  await expect(now).toHaveJSProperty("open", false);
  await expect(now.getByText("flaky-e2e-hunt", { exact: true })).toBeHidden();
  await expect(free).toHaveJSProperty("open", true);
  await expect(free.getByText("rail-card-polish", { exact: true })).toBeVisible();

  await now.locator("summary").click();
  await expect(now).toHaveJSProperty("open", true);
  await expect(now.getByText("flaky-e2e-hunt", { exact: true })).toBeVisible();

  await free.locator("summary").click();
  await expect(free).toHaveJSProperty("open", false);
  await expect(now).toHaveJSProperty("open", true);
});

test("Escape closes the dialog and the focus returns to the readout button (R3, REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  await openRestartDialog(page);
  await page.keyboard.press("Escape");
  await expect(restartDialog(page)).toBeHidden();
  await expect(noticeButton(page)).toBeFocused();
});

test("only pending sessions read claude ↻2 queued and the panel lists both with no controls (R5, REQ-9)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart-queued");
  const button = noticeButton(page);
  await expect(button).toHaveText("claude ↻2 queued");
  await button.click();

  await expect(panelHead(page)).toBeVisible();
  await expect(panel(page).getByText("Restart when free · 2", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("queue-one", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("queue-two", { exact: true })).toBeVisible();
  await expect(ignoreButton(page)).toHaveCount(0);
  await expect(panelRestartButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /cancel/i })).toHaveCount(0);
  await expect(panelCountRow(page, "Restart now")).toBeHidden();
});

test("with the daemon down the readout button is disabled and an open panel closes (R6, REQ-12)", async ({
  page,
  dashboard,
}) => {
  await recordSockets(page);
  await dashboard.open("claude-restart-down");
  await expect(noticeButton(page)).toBeEnabled();
  await noticeButton(page).click();
  await expect(panelHead(page)).toBeVisible();

  await dropDaemon(page);
  await expect(page.getByRole("status")).not.toHaveText(/^connected/i);
  await expect(noticeButton(page)).toBeDisabled();
  await expect(panelHead(page)).toBeHidden();
});

test("with the daemon down a click on the readout opens no panel (R6, REQ-12)", async ({
  page,
  dashboard,
}) => {
  await recordSockets(page);
  await dashboard.open("claude-restart-down");
  await dropDaemon(page);
  await expect(noticeButton(page)).toBeDisabled();
  await noticeButton(page).click({ force: true });
  await expect(panelHead(page)).toBeHidden();
});

test("no notice surface uses amber outside its one key button, nor rose or violet (R7, REQ-11)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  expect(await stateColoursUsed(page, noticeButton(page))).toEqual([]);

  await noticeButton(page).click();
  expect(await stateColoursUsed(page, panel(page))).toEqual([]);
  await expect(panel(page).locator(".btn.key:visible")).toHaveCount(1);
  await expect(panelRestartButton(page)).toHaveClass(/\bkey\b/);

  await panelRestartButton(page).click();
  const dialog = restartDialog(page);
  await expect(dialog).toBeVisible();
  expect(await stateColoursUsed(page, dialog)).toEqual([]);
  await expect(dialog.locator(".btn.key")).toHaveCount(1);
  await expect(confirmButton(page)).toHaveClass(/\bkey\b/);
});

test("the queued readout and its panel use neutral tokens only (R7, REQ-11)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart-queued");
  expect(await stateColoursUsed(page, noticeButton(page))).toEqual([]);
  await noticeButton(page).click();
  expect(await stateColoursUsed(page, panel(page))).toEqual([]);
  await expect(panel(page).locator(".btn.key:visible")).toHaveCount(0);
});

// The glyph shapes: plain (three-states), plain+warning (`claude-version-above`'s own claudeCode
// frame sent on top), notice (`claude-restart`) and notice+warning (the same frame on it).
async function readoutBox(page: Page): Promise<{ right: number; width: number }> {
  return await page.locator("#claude-version").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { right: r.right, width: r.width };
  });
}

test("the warning glyph in the notice shape clears Settings and the readout keeps one width and right edge in all four shapes (R1, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const above = (await loadFixture("claude-version-above")).hello.claudeCode;
  expect(above.status).toBe("above");

  await page.setViewportSize({ width: 1280, height: 900 });
  const boxes: { right: number; width: number }[] = [];

  await dashboard.open("three-states");
  await expect(claudeVersionReadout(page)).toBeVisible();
  boxes.push(await readoutBox(page));
  dashboard.send({ type: "claudeCode", claudeCode: above });
  await expect(claudeVersionReadout(page).getByRole("img")).toBeVisible();
  boxes.push(await readoutBox(page));

  await dashboard.open("claude-restart");
  await expect(noticeButton(page)).toBeVisible();
  boxes.push(await readoutBox(page));
  dashboard.send({ type: "claudeCode", claudeCode: above });
  const glyph = claudeVersionReadout(page).getByRole("img");
  await expect(glyph).toBeVisible();
  await expect(noticeButton(page)).toBeVisible();
  boxes.push(await readoutBox(page));

  const first = boxes[0];
  if (!first) throw new Error("no readout box");
  expect(first.width).toBeCloseTo(137.28, 1);
  for (const [i, b] of boxes.entries()) {
    expect(b.width, `shape ${i} width`).toBeCloseTo(first.width, 1);
    expect(b.right, `shape ${i} right edge`).toBeCloseTo(first.right, 1);
  }

  // Notice + warning: the glyph box sits wholly right of Settings, and Settings' right edge
  // still hits Settings.
  const g = await glyph.boundingBox();
  const s = await page.locator("#settings-button").boundingBox();
  if (!g || !s) throw new Error("glyph and Settings have boxes");
  expect(g.x).toBeGreaterThanOrEqual(s.x + s.width);
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("#settings-button") != null,
    { x: s.x + s.width - 1, y: s.y + s.height / 2 },
  );
  expect(hit).toBe(true);
});

test("Ignore with no notice left puts focus on the Settings button, not the body (R2, REQ-10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart-many");
  await noticeButton(page).click();
  await ignoreButton(page).click();

  await expect(noticeButton(page)).toHaveCount(0);
  await expect(page.locator("#settings-button")).toBeFocused();
  await settleFor(page, 300);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("settings-button");
});

test("Ignore with a pending session left keeps focus on the notice button (R2, REQ-9, REQ-10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("claude-restart");
  await noticeButton(page).click();
  await ignoreButton(page).click();

  // The planning session is pending, so the queued notice stays and holds focus.
  await expect(noticeButton(page)).toHaveText(/↻1 queued/);
  await expect(noticeButton(page)).toBeFocused();
  await settleFor(page, 300);
  await expect(noticeButton(page)).toBeFocused();
});
