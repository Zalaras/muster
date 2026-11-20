// diff — what the diff viewer shows for a recorded checkout: the size-row button, the viewer's
// scopes and three views, word highlight, Review flips and ticks, comments, the side panel,
// the marking in both themes, keys and the write-failure states. State is the `diff*` fixtures
// (the daemon's own recording of a real git checkout); the three diff GETs are served from the
// fixture's `diff` recording by helpers/diff.ts. The journeys — the checkout changing under an
// open viewer, a daemon restart, a second window — are web/e2e/diff*.spec.ts.
import {
  BUTTON,
  chooseView,
  contrast,
  css,
  diffButton,
  fileSection,
  openDiff,
  openViewer,
  PRAISE,
  serveManyChanges,
  tokenColour,
  viewer,
} from "./helpers/diff";
import { sessionCard } from "./helpers/focus";
import { expect, type Locator, type Page, settleFor, test } from "./helpers/harness";
import { mainheadSurfaceButton, mainheadSurfaceGroup } from "./helpers/surfaces";
import {
  mainheadTerminalsOpener,
  newTerminalButton,
  shellCount,
  terminalRow,
  terminalsPanel,
} from "./helpers/terminals";
import { liveTileById } from "./helpers/tiles";

const progress = (v: Locator) => v.locator(".dv-progress");
const row = (scope: Locator, text: string) => scope.locator(".dv-row").filter({ hasText: text });
const sizeRowBox = (page: Page) => page.locator("#sizerow").boundingBox();

async function boxes(page: Page, selector: string) {
  return await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const r = (e: Element) => {
      const b = e.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map(Math.round);
    };
    return [r(root), ...[...root.children].map(r)];
  }, selector);
}

test.describe("size row and button", () => {
  const cases: [string, string][] = [
    ["diff", "5 files +10 −6 · 💬 3 · View diff ›"],
    ["diff-branch-only", "branch · 1 file +2 −1 · View diff ›"],
    ["diff-pair", "5 files +10 −6 · 💬 1 · View diff ›"],
  ];
  for (const [scenario, text] of cases) {
    test(`${scenario} reads its specified button text (R1, REQ-9)`, async ({ page, dashboard }) => {
      await openDiff(dashboard, page, scenario);
      await expect(diffButton(page)).toHaveText(text);
      await expect(diffButton(page)).toHaveAttribute("aria-pressed", "false");
    });
  }

  test("a clean checkout shows no button, nor does a session outside a repository (R1, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-clean");
    await expect(page.locator("#sizenote")).toBeVisible();
    await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0);
    await sessionCard(page, "diff-plain").click();
    await expect(page.locator("#mainhead")).toContainText("diff-plain");
    await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0);
  });

  test("the button sits flush at the right end of a row no taller for it, at every width (R2, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    await expect(diffButton(page)).toBeVisible();
    for (let width = 1440; width >= 700; width -= 148) {
      await page.setViewportSize({ width, height: 800 });
      const rowBox = await sizeRowBox(page);
      const noteBox = await page.locator("#sizenote").boundingBox();
      const btnBox = await diffButton(page).boundingBox();
      if (!rowBox || !noteBox || !btnBox) throw new Error(`no boxes at ${width}`);
      const padRight = await page
        .locator("#sizerow")
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight));
      expect(
        Math.abs(btnBox.x + btnBox.width + padRight - (rowBox.x + rowBox.width)),
        `flush at ${width}`,
      ).toBeLessThanOrEqual(1);
      expect(noteBox.x + noteBox.width, `note left of button at ${width}`).toBeLessThanOrEqual(
        btnBox.x + 1,
      );
      expect(btnBox.height, `button no taller than the note at ${width}`).toBeLessThanOrEqual(
        noteBox.height + 1,
      );
    }
  });

  test("the row is the same height with and without the button (R2, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    await expect(diffButton(page)).toBeVisible();
    const withButton = (await sizeRowBox(page))?.height;
    await dashboard.open("diff-clean");
    await expect(page.locator("#sizenote")).toBeVisible();
    await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0);
    const without = (await sizeRowBox(page))?.height;
    expect(withButton).toBe(without);
  });

  test("the Focus header holds no diff control and is the same box as without it (R3, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await dashboard.open("focus-header-long");
    const before = await boxes(page, "#mainhead");
    await openDiff(dashboard, page, "diff-long-header");
    await expect(diffButton(page)).toBeVisible();
    await expect(page.locator("#mainhead").getByRole("button", { name: BUTTON })).toHaveCount(0);
    await expect(page.locator("#mainhead [id='diff-button'], #mainhead .diffbtn")).toHaveCount(0);
    expect(await boxes(page, "#mainhead")).toEqual(before);
  });

  test("on the docs surface the row shows holding only the button (R4, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    await expect(diffButton(page)).toBeVisible();
    const rowHeight = (await sizeRowBox(page))?.height;
    await mainheadSurfaceButton(page, "docs").click();
    await expect(mainheadSurfaceButton(page, "docs")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#sizenote")).toBeHidden();
    await expect(diffButton(page)).toBeVisible();
    expect((await sizeRowBox(page))?.height).toBe(rowHeight);
  });

  test("an ended session's row shows holding only the button (R4, REQ-1, REQ-9)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-ended");
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
    await expect(page.locator("#sizenote")).toBeHidden();
  });
});

test.describe("viewer", () => {
  test("no surface segment looks selected while the viewer is open (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const buttons = mainheadSurfaceGroup(page).getByRole("button");
    await expect(buttons).toHaveCount(4);
    const selected = await css(mainheadSurfaceButton(page, "claude"), "background-color");
    await openViewer(page);
    await expect(diffButton(page)).toHaveText(/Close diff ×$/);
    await expect(diffButton(page)).toHaveAttribute("aria-pressed", "true");
    for (const kind of ["claude", "shell", "docs"] as const) {
      const seg = mainheadSurfaceButton(page, kind);
      await expect(seg).toHaveAttribute("aria-pressed", "false");
      expect(await css(seg, "background-color"), `${kind} is not styled selected`).not.toBe(
        selected,
      );
    }
    // the Terminals opener is a switch member too: it carries no aria-pressed and wears the
    // same unselected ground as the three segments
    const opener = mainheadTerminalsOpener(page);
    await expect(opener).not.toHaveAttribute("aria-pressed", /.*/);
    const colours = await buttons.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).backgroundColor),
    );
    expect(new Set(colours).size, `unselected grounds: ${colours.join(" | ")}`).toBe(1);
    expect(colours[0]).not.toBe(selected);
  });

  test("opening the Terminals menu and pressing Escape leaves the viewer open with no segment pressed (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await mainheadTerminalsOpener(page).click();
    await expect(terminalsPanel(page)).toBeVisible();
    await expect(v).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(terminalsPanel(page)).toHaveCount(0);
    await expect(v).toBeVisible();
    await expect(diffButton(page)).toHaveText(/Close diff ×$/);
    await expect(diffButton(page)).toHaveAttribute("aria-pressed", "true");
    for (const kind of ["claude", "shell", "docs"] as const) {
      await expect(mainheadSurfaceButton(page, kind)).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("New terminal from the menu closes the viewer once the terminal starts and shows it (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    await page.route(/\/api\/sessions\/\d+\/shells$/, (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev: 1 }),
      }),
    );
    const v = await openViewer(page);
    await mainheadTerminalsOpener(page).click();
    await expect(terminalsPanel(page)).toBeVisible();
    await expect(v).toBeVisible();
    await newTerminalButton(page).click();
    await expect(v).toHaveCount(0);
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "true");
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
    await expect(page.locator("#sizerow")).toBeVisible();
  });

  test("picking build from the Terminals menu closes the viewer and shows that terminal with the size row back (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-terminals");
    const v = await openViewer(page);
    const note = page.locator("#sizenote");
    const before = (await note.isVisible()) ? ((await note.textContent()) ?? "").trim() : "";
    await mainheadTerminalsOpener(page).click();
    await terminalRow(page, "build").getByRole("button", { name: "build", exact: true }).click();
    await expect(v).toHaveCount(0);
    await expect(mainheadSurfaceButton(page, "shell")).toHaveAttribute("aria-pressed", "true");
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
    await expect(page.locator("#sizerow")).toBeVisible();
    await expect(note).toBeVisible();
    await expect(note).not.toHaveText(before === "" ? /^$/ : before);
  });

  test("renaming and closing a terminal from the menu leave the viewer open with no segment pressed (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-terminals");
    await page.route(/\/api\/sessions\/\d+\/shells\/\d+\/name$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ n: 2, name: "compile", rev: 1 }),
      }),
    );
    await page.route(/\/api\/sessions\/\d+\/shells\/\d+$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rev: 2 }),
      }),
    );
    const v = await openViewer(page);
    const stillOpen = async () => {
      await expect(v).toBeVisible();
      await expect(diffButton(page)).toHaveText(/Close diff ×$/);
      await expect(diffButton(page)).toHaveAttribute("aria-pressed", "true");
      for (const kind of ["claude", "shell", "docs"] as const) {
        await expect(mainheadSurfaceButton(page, kind)).toHaveAttribute("aria-pressed", "false");
      }
    };
    await mainheadTerminalsOpener(page).click();
    await terminalRow(page, "build").hover();
    await page.getByRole("button", { name: "Rename build", exact: true }).click();
    const field = terminalsPanel(page).getByRole("textbox", { name: "Terminal name", exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.type("compile");
    await page.keyboard.press("Enter");
    await expect(field).toHaveCount(0);
    await stillOpen();

    await terminalRow(page, "shell 1").hover();
    const deleted = page.waitForRequest(
      (r) => r.method() === "DELETE" && /\/api\/sessions\/\d+\/shells\/1$/.test(r.url()),
    );
    await page.getByRole("button", { name: "Close shell 1", exact: true }).click();
    await deleted;
    await stillOpen();
  });

  test("Escape closes the open Terminals menu first, then the viewer (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-terminals");
    await page.route(/\/api\/sessions\/\d+\/shells\/\d+$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rev: 1 }),
      }),
    );
    const v = await openViewer(page);
    await mainheadTerminalsOpener(page).click();
    await expect(terminalsPanel(page)).toBeVisible();
    await terminalRow(page, "shell 1").hover();
    const deleted = page.waitForRequest(
      (r) => r.method() === "DELETE" && /\/api\/sessions\/\d+\/shells\/1$/.test(r.url()),
    );
    await page.getByRole("button", { name: "Close shell 1", exact: true }).click();
    await deleted;
    await expect(terminalsPanel(page)).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(terminalsPanel(page)).toHaveCount(0);
    await expect(v).toBeVisible();
    await expect(diffButton(page)).toHaveText(/Close diff ×$/);

    await page.keyboard.press("Escape");
    await expect(v).toHaveCount(0);
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
  });

  test("the shell count badge stays shown while the viewer is open (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-terminals");
    const badge = shellCount(mainheadSurfaceButton(page, "shell"));
    await expect(badge).toHaveText("2");
    await openViewer(page);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("2");
    await expect(badge).toHaveCSS("opacity", "1");
  });

  test("each file shows status, path, counts, rename and binary note, and its fold folds it (R6, REQ-11)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await expect(v.locator(".dv-summary")).toHaveText(/^5 files · \+10 −6 · against HEAD \(\w+\)$/);
    const rename = fileSection(v, "src/helpers.ts");
    await expect(rename.locator(".dv-status")).toHaveText("renamed");
    await expect(
      rename.getByRole("button", { name: /src\/util\.ts → src\/helpers\.ts/ }),
    ).toBeVisible();
    await expect(rename.locator(".dv-counts").first()).toHaveText("+1 −0");
    await expect(fileSection(v, "src/legacy.ts").locator(".dv-status")).toHaveText("deleted");
    await expect(fileSection(v, "src/notes.md").locator(".dv-status")).toHaveText("added");
    await expect(fileSection(v, "src/legacy.ts").locator(".dv-counts").first()).toHaveText("+0 −2");
    await expect(fileSection(v, "assets/logo.bin")).toContainText("Binary file not shown");
    const fold = fileSection(v, PRAISE).getByRole("button", { name: new RegExp(PRAISE) });
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(fileSection(v, PRAISE).locator(".dv-row").first()).toBeVisible();
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(fileSection(v, PRAISE).locator(".dv-row")).toHaveCount(0);
    await v.getByRole("button", { name: /^Files$/ }).click();
    await v.locator(".dv-fjump").filter({ hasText: "src/legacy.ts" }).click();
    await expect(fileSection(v, "src/legacy.ts")).toBeInViewport();
  });

  test("a clean scope reads No changes, the viewer opening on Branch when Uncommitted is empty (R7, REQ-3, REQ-11)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-branch-only");
    const v = await openViewer(page);
    await expect(v.getByRole("button", { name: "Branch", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(v.locator(".dv-summary")).toHaveText(/^1 file · \+2 −1 · against main @ \w+$/);
    await v.getByRole("button", { name: "Uncommitted", exact: true }).click();
    await expect(v.getByText("No changes", { exact: true })).toBeVisible();
    await expect(v.locator(".dv-summary")).toHaveText(/^0 files · \+0 −0 · against HEAD/);
  });

  test("Unified is one column with both numbers, removed and added in their tokens (R8, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await expect(v.getByRole("button", { name: "Unified", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const praise = fileSection(v, PRAISE);
    const ctx = row(praise, "const list = words(score);");
    await expect(ctx.locator(".dv-num")).toHaveText(["4", "4"]);
    const del = row(praise, "let lastPraise");
    await expect(del.locator(".dv-num")).toHaveText(["5", ""]);
    const add = row(praise, "const previous = lastPraiseFor");
    await expect(add.locator(".dv-num")).toHaveText(["", "5"]);
    expect(await css(del, "background-color")).toBe(await tokenColour(page, "--diff-del-bg"));
    expect(await css(add, "background-color")).toBe(await tokenColour(page, "--diff-add-bg"));
    expect(await css(ctx, "background-color")).not.toBe(await tokenColour(page, "--diff-add-bg"));
    const x = async (l: Locator) => (await l.boundingBox())?.x ?? -1;
    expect(await x(add)).toBe(await x(del));
  });

  test("Split puts old left and new right with a change's first rows level (R9, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Split");
    const first = fileSection(v, PRAISE).locator(".dv-srow").filter({ hasText: "let lastPraise" });
    const oldCell = first.locator(".dv-cell").first();
    const newCell = first.locator(".dv-cell").nth(1);
    await expect(oldCell).toContainText("let lastPraise");
    await expect(newCell).toContainText("const previous = lastPraiseFor");
    const o = await oldCell.boundingBox();
    const n = await newCell.boundingBox();
    if (!o || !n) throw new Error("no cell boxes");
    expect(n.x).toBeGreaterThan(o.x + o.width / 2);
    expect(Math.abs(o.y - n.y)).toBeLessThanOrEqual(1);
    expect(await css(oldCell, "background-color")).toBe(await tokenColour(page, "--diff-del-bg"));
    expect(await css(newCell, "background-color")).toBe(await tokenColour(page, "--diff-add-bg"));
  });

  test("Split stacks the file sections and each row spans the scroll body, at several widths (R9, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Split");
    for (const width of [1440, 1100, 900, 700]) {
      await page.setViewportSize({ width, height: 800 });
      const m = await v.locator(".dv-scroll").evaluate((scroll) => {
        const sb = scroll.getBoundingClientRect();
        const secs = [...scroll.querySelectorAll("section.dv-file")].map((e) => {
          const b = e.getBoundingClientRect();
          return { x: b.x, y: b.y };
        });
        const rows = [...scroll.querySelectorAll(".dv-srow")].map(
          (e) => e.getBoundingClientRect().width,
        );
        const cells = [...scroll.querySelectorAll(".dv-srow")].map((e) =>
          [...e.querySelectorAll(".dv-cell")].map((c) => c.getBoundingClientRect().width),
        );
        return { sbw: sb.width, secs, rows, cells };
      });
      expect(m.secs.length, `${width}px sections`).toBeGreaterThan(1);
      const lefts = new Set(m.secs.map((e) => e.x));
      expect(lefts.size, `${width}px sections share one left edge`).toBe(1);
      const tops = m.secs.map((e) => e.y);
      expect(tops, `${width}px sections run top to bottom`).toEqual(
        [...tops].sort((a, b) => a - b),
      );
      expect(new Set(tops).size, `${width}px sections do not overlap`).toBe(tops.length);
      for (const w of m.rows) expect(w, `${width}px row width`).toBeGreaterThanOrEqual(m.sbw - 40);
      for (const [a, b] of m.cells) {
        expect(a, `${width}px old cell`).toBeGreaterThan(m.sbw / 2 - 60);
        expect(b, `${width}px new cell`).toBeGreaterThan(m.sbw / 2 - 60);
      }
    }
  });

  test("a browser with nothing stored opens Unified and keeps its chosen view across a reload (R10, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    await openViewer(page);
    await expect(page.getByRole("button", { name: "Unified", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await chooseView(page, "Split");
    await page.reload();
    await expect(diffButton(page)).toBeVisible();
    await openViewer(page);
    await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Unified", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("the one-word change is wrapped in del and ins in Unified, Split and Review (R11, REQ-13)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    const praise = fileSection(v, PRAISE);
    for (const view of ["Unified", "Split"] as const) {
      await chooseView(page, view);
      await expect(praise.locator("del", { hasText: /^stutter$/ })).toHaveCount(1);
      await expect(praise.locator("ins", { hasText: /^stammer$/ })).toHaveCount(1);
    }
    await chooseView(page, "Review");
    await expect(praise.locator("ins", { hasText: /^stammer$/ })).toHaveCount(1);
    const word = await css(praise.locator("ins").first(), "background-color");
    expect(word).toBe(await tokenColour(page, "--diff-add-word"));
    await praise.locator(".dv-change .dv-label").click();
    await expect(praise.locator("del", { hasText: /^stutter$/ })).toHaveCount(1);
  });
});

test.describe("Review", () => {
  test("a change reads after, flips to before and back, and a pure add or remove keeps a placeholder (R12, REQ-14)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const change = fileSection(v, PRAISE).locator(".dv-change");
    await expect(change.locator(".dv-label")).toHaveText("after");
    await change.locator(".dv-label").click();
    await expect(change.locator(".dv-label")).toHaveText("before");
    await expect(change).toContainText("stutter");
    await change.locator(".dv-label").click();
    await expect(change.locator(".dv-label")).toHaveText("after");
    await expect(change).toContainText("stammer");

    const removal = fileSection(v, "src/legacy.ts").locator(".dv-change");
    await expect(removal.locator(".dv-label")).toHaveText("after");
    await expect(removal.locator(".dv-placeholder")).toHaveCount(1);
    const addition = fileSection(v, "src/notes.md").locator(".dv-change");
    await addition.locator(".dv-label").click();
    await expect(addition.locator(".dv-label")).toHaveText("before");
    await expect(addition.locator(".dv-placeholder")).toHaveCount(1);
    expect((await addition.boundingBox())?.height ?? 0).toBeGreaterThan(8);
  });

  test("a change's tick folds it to one row that reopens on a click (R13, REQ-15)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const praise = fileSection(v, PRAISE);
    await expect(praise.getByRole("button", { name: "✓ reviewed · +3 −2" })).toBeVisible();
    const wrap = praise.locator('.dv-change-wrap[data-change="1"]');
    await wrap.getByRole("button", { name: "Mark change reviewed" }).click();
    const folded = wrap.getByRole("button", { name: /^✓ reviewed · \+\d+ −\d+$/ });
    await expect(folded).toHaveText("✓ reviewed · +2 −2");
    await expect(wrap.locator(".dv-change")).toHaveCount(0);
    await folded.click();
    await expect(wrap.locator(".dv-change .dv-label")).toHaveText("after");
  });

  test("a file's tick box is unchecked, mixed or checked from its changes and ticks or unticks them all (R14, REQ-15)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const tick = (path: string) =>
      fileSection(v, path).getByRole("checkbox", {
        name: new RegExp(`^Mark .*${path.split("/")[1]} reviewed$`),
      });
    const praise = fileSection(v, PRAISE);
    await expect(tick("src/legacy.ts")).not.toBeChecked();
    await expect(tick("src/helpers.ts")).toBeChecked();
    await expect(tick(PRAISE)).not.toBeChecked();
    expect(await tick(PRAISE).evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await expect(praise.locator(".dv-tickcount")).toHaveText("1/2");
    await tick(PRAISE).check();
    await expect(tick(PRAISE)).toBeChecked();
    await expect(praise.getByRole("button", { name: new RegExp(PRAISE) })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(progress(v)).toHaveText("3 / 5 changes reviewed");
    await tick(PRAISE).uncheck();
    await expect(praise.getByRole("button", { name: new RegExp(PRAISE) })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(praise.locator(".dv-change .dv-label")).toHaveCount(2);
    await expect(progress(v)).toHaveText("1 / 5 changes reviewed");
    await tick("src/legacy.ts").check();
    await tick("src/notes.md").check();
    await expect(progress(v)).toHaveText("3 / 5 changes reviewed");
  });

  test("ticking each change one by one arrives at a checked file (R14, REQ-15)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const praise = fileSection(v, PRAISE);
    await praise
      .locator('.dv-change-wrap[data-change="1"]')
      .getByRole("button", { name: "Mark change reviewed" })
      .click();
    await expect(praise.getByRole("checkbox", { name: /reviewed$/ })).toBeChecked();
  });

  test("the progress readout counts ticked changes and Reset zeroes it (R15, REQ-15)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    await expect(progress(v)).toHaveText("2 / 5 changes reviewed");
    await v.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(progress(v)).toHaveText("0 / 5 changes reviewed");
    await expect(v.getByRole("button", { name: /^✓ reviewed/ })).toHaveCount(0);
  });

  test("the change map has one mark per change and a mark's click scrolls its change into view (R16, REQ-16)", async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: 1280, height: 440 });
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const marks = v.getByRole("button", { name: /^Go to change \d+$/ });
    await expect(marks).toHaveCount(5);
    const states = await marks.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
    expect(states).toEqual(["reviewed", "unreviewed", "unreviewed", "reviewed", "unreviewed"]);
    await expect(marks.nth(4)).toHaveClass(/has-comment/);
    await expect(marks.nth(1)).not.toHaveClass(/has-comment/);
    const last = fileSection(v, PRAISE).locator('.dv-change-wrap[data-change="1"] .dv-change');
    await expect(last).not.toBeInViewport();
    await marks.nth(4).click();
    await expect(last).toBeInViewport();
    await fileSection(v, "src/legacy.ts").locator(".dv-change .dv-label").click();
    await expect(marks.nth(1)).toHaveAttribute("data-state", "flipped");
  });
});

test.describe("change map reach", () => {
  test("with 200 changes every mark lies inside the map and the last is clickable (R16, REQ-16)", async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDiff(dashboard, page, "diff");
    await serveManyChanges(page, 200);
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const marks = v.getByRole("button", { name: /^Go to change \d+$/ });
    await expect(marks).toHaveCount(200);
    const outside = await v.locator(".dv-map").evaluate((m) => {
      const b = m.getBoundingClientRect();
      return [...m.querySelectorAll(".dv-mark")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5;
      }).length;
    });
    expect(outside).toBe(0);
    const box = await marks.nth(199).boundingBox();
    if (!box) throw new Error("no mark box");
    await page.mouse.click(box.x + box.width / 2, box.y + Math.max(box.height / 2, 0.5));
    await expect(v.locator('.dv-change-wrap[data-change="199"] .dv-change')).toBeInViewport();
  });
});

test.describe("comments", () => {
  async function openUnified(page: Page, dashboard: Parameters<typeof openDiff>[0], opts = {}) {
    await openDiff(dashboard, page, "diff", opts);
    return await openViewer(page);
  }

  test("hovering a line shows its plus and a click opens the box under the line (R17, REQ-17)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    const line = row(fileSection(v, PRAISE), "const list = words(score);");
    const plus = line.getByRole("button", { name: "Comment on line 4" });
    await expect(plus).toHaveCSS("opacity", "0");
    await line.hover();
    await expect(plus).toHaveCSS("opacity", "1");
    await plus.click();
    await expect(v.getByText(/^Commenting on line 4$/)).toBeVisible();
    await expect(v.getByRole("textbox", { name: "Comment" })).toBeVisible();
    await v.getByRole("button", { name: "Cancel" }).click();
    await expect(v.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
  });

  test("a drag over lines selects a range in its own tint (R17, REQ-17)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    const praise = fileSection(v, PRAISE);
    const from = row(praise, "export function pickPraise");
    const to = row(praise, "const list = words(score);");
    await from.hover();
    const start = await from.getByRole("button", { name: "Comment on line 3" }).boundingBox();
    const end = await to.boundingBox();
    if (!start || !end) throw new Error("no boxes");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + 200, end.y + end.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(v.getByText(/^Commenting on lines 3–4$/)).toBeVisible();
    await expect(praise.locator(".dv-row.sel")).toHaveCount(2);
    expect(await css(praise.locator(".dv-row.sel").first(), "background-color")).toBe(
      await tokenColour(page, "--diff-sel"),
    );
  });

  test("a line number then shift-click on another selects a range (R17, REQ-17)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    const praise = fileSection(v, PRAISE);
    await row(praise, "export function pickPraise").locator(".dv-num").last().click();
    await row(praise, "const list = words(score);")
      .locator(".dv-num")
      .last()
      .click({ modifiers: ["Shift"] });
    await expect(v.getByText(/^Commenting on lines 3–4$/)).toBeVisible();
    await expect(praise.locator(".dv-row.sel")).toHaveCount(2);
  });

  test("selecting in Review flips no change (R17, REQ-14, REQ-17)", async ({ page, dashboard }) => {
    const v = await openUnified(page, dashboard);
    await chooseView(page, "Review");
    const change = fileSection(v, PRAISE).locator('.dv-change-wrap[data-change="1"] .dv-change');
    await row(change, "stammer").locator(".dv-num").last().click();
    await row(change, "return fresh")
      .locator(".dv-num")
      .last()
      .click({ modifiers: ["Shift"] });
    await expect(v.getByText(/^Commenting on lines 9–10$/)).toBeVisible();
    await expect(change.locator(".dv-label")).toHaveText("after");
    await expect(change).toContainText("stammer");
  });

  test("a saved comment shows its lines, Edit and Resolve and a bar on its lines (R18, REQ-18)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    const card = v.locator('.dv-card[data-cid="c-range"]');
    await expect(card.locator(".dv-card-lines")).toHaveText("Lines 5–6");
    await expect(card).toContainText("Why look the previous word up by score?");
    await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    const bars = fileSection(v, PRAISE).locator(".dv-row.has-comment");
    await expect(bars.first()).toBeVisible();
    expect(await css(bars.first(), "box-shadow")).toContain(
      await tokenColour(page, "--diff-comment"),
    );
    await card.getByRole("button", { name: "Resolve", exact: true }).click();
    const folded = v.getByRole("button", { name: /^✓ Resolved · Lines 5–6 · / });
    await expect(folded).toBeVisible();
    await expect(v.locator('.dv-card[data-cid="c-range"]')).toHaveCount(0);
    await expect(
      v.locator('[data-cid="c-range"]').getByRole("button", { name: "Reopen" }),
    ).toBeVisible();
  });

  test("a resolved comment expands to Delete, which removes it (R18, REQ-18)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    const resolved = v.locator('.dv-resolved[data-cid="c-resolved"]');
    const rowBtn = resolved.getByRole("button", { name: /^✓ Resolved · Line 5 · / });
    await expect(rowBtn).toHaveAttribute("aria-expanded", "false");
    await expect(resolved.getByRole("button", { name: "Reopen" })).toBeVisible();
    await rowBtn.click();
    await expect(rowBtn).toHaveAttribute("aria-expanded", "true");
    await resolved.getByRole("button", { name: "Delete" }).click();
    await expect(v.locator('[data-cid="c-resolved"]')).toHaveCount(0);
    await expect(v.getByRole("button", { name: /^Comments \(3\)$/ })).toBeVisible();
  });

  test("Comments lists open comments with path, quote and body, resolved ones closed beneath (R19, REQ-19)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    await v.getByRole("button", { name: /^Comments \(3\)$/ }).click();
    await expect(v.getByRole("button", { name: /^Comments \(3\)$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const range = v
      .locator(".dv-centry")
      .filter({ hasText: "Why look the previous word up by score?" });
    await expect(range).toHaveText(/^src\/praise\.ts:5–6/);
    await expect(range).toContainText("const previous = lastPraiseFor(score);");
    const single = v.locator(".dv-centry").filter({ hasText: "Should this fall back" });
    await expect(single).toHaveText(/^src\/praise\.ts:10/);
    const resolved = v.locator("details.dv-resolved-section");
    await expect(resolved.locator("summary")).toHaveText("Resolved (1)");
    expect(await resolved.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    await expect(resolved.locator(".dv-resolved-list")).toBeHidden();
  });

  test("a list entry's click unfolds a folded change to its comment in Review (R19, REQ-19)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    await chooseView(page, "Review");
    const praise = fileSection(v, PRAISE);
    await expect(praise.getByRole("button", { name: "✓ reviewed · +3 −2" })).toBeVisible();
    await expect(praise.locator('.dv-card[data-cid="c-range"]')).toHaveCount(0);
    await v.getByRole("button", { name: /^Comments \(3\)$/ }).click();
    await v
      .locator(".dv-centry")
      .filter({ hasText: "Why look the previous word up by score?" })
      .click();
    await expect(praise.locator('.dv-card[data-cid="c-range"]')).toBeVisible();
    await expect(praise.locator('.dv-card[data-cid="c-range"]')).toBeInViewport();
  });

  test("an outdated comment is listed with its first quoted line and has no card in the body (R20, REQ-7)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard);
    await v.getByRole("button", { name: /^Comments \(3\)$/ }).click();
    const entry = v.locator(".dv-centry").filter({ hasText: "This line has since gone." });
    await expect(entry).toContainText("outdated");
    await expect(entry).toContainText("return PRAISE[index];");
    await expect(v.locator(".dv-scroll")).not.toContainText("This line has since gone.");
    await expect(v.locator('[data-cid="c-outdated"]')).toHaveCount(0);
  });

  test("a comment write that overlaps a Refresh leaves exactly one card, before and after (R18, REQ-18, REQ-28)", async ({
    page,
    dashboard,
  }) => {
    const fixture = await openDiff(dashboard, page, "diff");
    const review = fixture.diff[0]?.review as { comments: unknown[]; ticks: string[] };
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let written: Record<string, unknown> | null = null;
    await page.route(/\/api\/sessions\/\d+\/diff\/comments\/[^/]+$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      const id = route.request().url().split("/").pop();
      written = {
        resolved: false,
        createdAt: "2026-01-01T00:09:00Z",
        ...route.request().postDataJSON(),
        id,
      };
      await held;
      await route.fulfill({ status: 204 });
    });
    await page.route(/\/api\/sessions\/\d+\/diff\/review$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...review,
          comments: [...review.comments, ...(written ? [written] : [])],
        }),
      }),
    );
    const v = await openViewer(page);
    const line = row(fileSection(v, PRAISE), "const list = words(score);");
    await line.hover();
    await line.getByRole("button", { name: "Comment on line 4" }).click();
    await v.getByRole("textbox", { name: "Comment" }).fill("overlapping write");
    await v.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => written).not.toBeNull();
    const refreshed = page.waitForResponse(/\/diff\/review$/);
    await v.getByRole("button", { name: "Refresh", exact: true }).click();
    await refreshed;
    const cards = v.locator(".dv-card").filter({ hasText: "overlapping write" });
    // a Refresh that overlaps a comment write keeps the local list (the write is still in
    // flight), so the card may not be shown yet; it is never shown twice
    expect(await cards.count()).toBeLessThanOrEqual(1);
    release();
    await expect(cards).toHaveCount(1);
    await settleFor(page, 500);
    await expect(cards).toHaveCount(1);
    await expect(v.getByRole("button", { name: /^Comments \(\d+\)$/ })).toHaveText("Comments (4)");
  });

  test("a Resolve that overlaps a Refresh lands on the card shown (R18, REQ-18, REQ-28)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let seen = false;
    await page.route(/\/api\/sessions\/\d+\/diff\/comments\/c-range$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      seen = true;
      await held;
      await route.fulfill({ status: 204 });
    });
    const v = await openViewer(page);
    const card = v.locator('.dv-card[data-cid="c-range"]');
    await card.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect.poll(() => seen).toBe(true);
    const refreshed = page.waitForResponse(/\/diff\/review$/);
    await v.getByRole("button", { name: "Refresh", exact: true }).click();
    await refreshed;
    await expect(v.locator('[data-cid="c-range"]')).toHaveCount(1);
    release();
    await expect(v.getByRole("button", { name: /^✓ Resolved · Lines 5–6 · / })).toBeVisible();
    await expect(v.locator('.dv-card[data-cid="c-range"]')).toHaveCount(0);
    await expect(v.locator('[data-cid="c-range"]')).toHaveCount(1);
  });

  test("a tick made after a Refresh's review read but before its diff read lands survives the load (R18, REQ-15, REQ-28)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    await expect(progress(v)).toHaveText("2 / 5 changes reviewed");
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route(/\/api\/sessions\/\d+\/diff\?/, async (route) => {
      await held;
      await route.fallback();
    });
    const reviewRead = page.waitForResponse(/\/diff\/review$/);
    await v.getByRole("button", { name: "Refresh", exact: true }).click();
    await reviewRead;
    const tickPosted = page.waitForResponse(
      (r) => /\/diff\/ticks$/.test(r.url()) && r.request().method() !== "GET",
    );
    await fileSection(v, "src/legacy.ts")
      .getByRole("checkbox", { name: /^Mark .*legacy\.ts reviewed$/ })
      .check();
    await tickPosted;
    release();
    await expect(progress(v)).toHaveText("3 / 5 changes reviewed");
    await settleFor(page, 500);
    await expect(progress(v)).toHaveText("3 / 5 changes reviewed");
  });

  test("a failed save keeps the box open with its text (R26, REQ-28)", async ({
    page,
    dashboard,
  }) => {
    const v = await openUnified(page, dashboard, { writes: "fail" });
    const line = row(fileSection(v, PRAISE), "const list = words(score);");
    await line.hover();
    await line.getByRole("button", { name: "Comment on line 4" }).click();
    await v.getByRole("textbox", { name: "Comment" }).fill("keep this text");
    await v.getByRole("button", { name: "Save", exact: true }).click();
    await expect(v.getByText("Not saved, musterd unreachable")).toBeVisible();
    await expect(v.getByRole("textbox", { name: "Comment" })).toHaveValue("keep this text");
    await expect(v.getByText(/^Commenting on line 4$/)).toBeVisible();
  });
});

test.describe("keys", () => {
  async function review(page: Page, dashboard: Parameters<typeof openDiff>[0]) {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    await chooseView(page, "Review");
    return v;
  }

  test("j and k move the current change, Space flips it, x ticks it and Shift+X ticks its file (R21, REQ-20)", async ({
    page,
    dashboard,
  }) => {
    const v = await review(page, dashboard);
    await v.locator(".dv-scroll").focus();
    const current = v.locator(".dv-change.current");
    await page.keyboard.press("j");
    await expect(current).toHaveCount(1);
    const first = await current.getAttribute("data-change");
    const firstFile = await current
      .locator("xpath=ancestor::section[contains(@class,'dv-file')]")
      .getAttribute("data-fi");
    await page.keyboard.press("j");
    const second = await v
      .locator(".dv-change.current")
      .evaluate((el) => [
        el.getAttribute("data-change"),
        el.closest("section")?.getAttribute("data-fi"),
      ]);
    expect(second).not.toEqual([first, firstFile]);
    await page.keyboard.press("k");
    await expect(current).toHaveCount(1);
    expect(await current.getAttribute("data-change")).toBe(first);
    await expect(current.locator(".dv-label")).toHaveText("after");
    await page.keyboard.press("Space");
    await expect(current.locator(".dv-label")).toHaveText("before");
    await page.keyboard.press("Space");
    await expect(current.locator(".dv-label")).toHaveText("after");
    const before = await progress(v).innerText();
    await page.keyboard.press("x");
    await expect(progress(v)).not.toHaveText(before);
    await page.keyboard.press("Shift+X");
    await expect(v.getByRole("checkbox", { checked: true }).first()).toBeVisible();
  });

  test("a change reached by j folds when ticked with x and x again unfolds it (R21, REQ-15, REQ-20)", async ({
    page,
    dashboard,
  }) => {
    const v = await review(page, dashboard);
    await v.locator(".dv-scroll").focus();
    const folded = v.locator(".dv-folded");
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await expect(v.locator(".dv-change.current")).toHaveCount(1);
    const before = await folded.count();
    const was = await progress(v).innerText();
    await page.keyboard.press("x");
    await expect(progress(v)).not.toHaveText(was);
    await expect(folded).toHaveCount(before + 1);
    await page.keyboard.press("x");
    await expect(progress(v)).toHaveText(was);
    await expect(folded).toHaveCount(before);
  });

  test("no Review key acts while focus is in the comment text field (R22, REQ-20)", async ({
    page,
    dashboard,
  }) => {
    const v = await review(page, dashboard);
    const line = row(fileSection(v, PRAISE), "const list = words(score);");
    await line.hover();
    await line.getByRole("button", { name: "Comment on line 4" }).click();
    const box = v.getByRole("textbox", { name: "Comment" });
    await box.focus();
    const before = await progress(v).innerText();
    await page.keyboard.type("jk x X");
    await page.keyboard.press("Space");
    await expect(box).toHaveValue("jk x X ");
    await expect(progress(v)).toHaveText(before);
    await expect(v.locator(".dv-change .dv-label", { hasText: "before" })).toHaveCount(0);
    await expect(v.locator(".dv-change.current")).toHaveCount(0);
  });

  test("Escape closes the comment box, then clears the selection, then closes the viewer (R23, REQ-20)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    const praise = fileSection(v, PRAISE);
    await row(praise, "export function pickPraise").locator(".dv-num").last().click();
    await row(praise, "const list = words(score);")
      .locator(".dv-num")
      .last()
      .click({ modifiers: ["Shift"] });
    await expect(v.getByRole("textbox", { name: "Comment" })).toBeVisible();
    await expect(praise.locator(".dv-row.sel")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(v.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
    await expect(praise.locator(".dv-row.sel")).toHaveCount(2);
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(praise.locator(".dv-row.sel")).toHaveCount(0);
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
  });
});

test.describe("themes and density", () => {
  for (const scenario of ["diff-light", "diff-dark"]) {
    test(`${scenario} marks added, removed, word, selection and comment each apart, each readable (R24, REQ-21)`, async ({
      page,
      dashboard,
    }) => {
      await openDiff(dashboard, page, scenario);
      const v = await openViewer(page);
      const praise = fileSection(v, PRAISE);
      await row(praise, "export function pickPraise").locator(".dv-num").last().click();
      await row(praise, "const list = words(score);")
        .locator(".dv-num")
        .last()
        .click({ modifiers: ["Shift"] });
      await expect(praise.locator(".dv-row.sel")).toHaveCount(2);
      const add = row(praise, "const previous = lastPraiseFor");
      const del = row(praise, "let lastPraise");
      const sel = praise.locator(".dv-row.sel").first();
      const word = praise.locator("ins").first();
      const delWord = praise.locator("del").first();
      const bg = {
        add: await css(add, "background-color"),
        del: await css(del, "background-color"),
        sel: await css(sel, "background-color"),
        word: await css(word, "background-color"),
        delWord: await css(delWord, "background-color"),
        comment: await tokenColour(page, "--diff-comment"),
      };
      expect(new Set(Object.values(bg)).size, JSON.stringify(bg)).toBe(Object.keys(bg).length);
      expect(bg.add).toBe(await tokenColour(page, "--diff-add-bg"));
      expect(bg.word).toBe(await tokenColour(page, "--diff-add-word"));
      expect(bg.delWord).toBe(await tokenColour(page, "--diff-del-word"));
      expect(await css(praise.locator(".dv-row.has-comment").first(), "box-shadow")).toContain(
        bg.comment,
      );
      const ground = await css(v.locator(".dv-scroll"), "background-color");
      const page_bg = await css(page.locator("body"), "background-color");
      for (const [name, fg, back] of [
        ["add", await css(add.locator(".dv-code"), "color"), bg.add],
        ["del", await css(del.locator(".dv-code"), "color"), bg.del],
        ["sel", await css(sel.locator(".dv-code"), "color"), bg.sel],
        ["word", await css(word, "color"), bg.word],
        ["delWord", await css(delWord, "color"), bg.delWord],
      ] as const) {
        expect(contrast(fg, back), `${name} text on its marking`).toBeGreaterThanOrEqual(4.5);
      }
      const opaque = ground === "rgba(0, 0, 0, 0)" ? page_bg : ground;
      expect(contrast(bg.comment, opaque), "comment bar on its ground").toBeGreaterThanOrEqual(3);
    });
  }

  test("Unified's rows are the same height as Split's (R25, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    const praise = fileSection(v, PRAISE);
    const closing = (scope: Locator, rows: string) =>
      scope.locator(rows).filter({ has: page.locator(".dv-code", { hasText: /^\}$/ }) });
    const unified = closing(praise, ".dv-row");
    const uHeight = (await unified.boundingBox())?.height;
    const uLine = await css(unified.locator(".dv-code"), "line-height");
    await chooseView(page, "Split");
    const split = closing(praise, ".dv-srow");
    expect((await split.boundingBox())?.height).toBe(uHeight);
    expect(await css(split.locator(".dv-code").first(), "line-height")).toBe(uLine);
  });

  test("a long line wraps no more than its column's width needs in Split (R25, REQ-12)", async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    const praise = fileSection(v, PRAISE);
    const longRow = (rows: string) =>
      praise.locator(rows).filter({ hasText: "pick a praise word that is not the previous one" });
    const unifiedCode = longRow(".dv-row").locator(".dv-code").first();
    const lineHeight = Number.parseFloat(await css(unifiedCode, "line-height"));
    await chooseView(page, "Split");
    const split = longRow(".dv-srow").first();
    const h = (await split.boundingBox())?.height ?? 0;
    // a 110-character line fits a half-width column in at most three lines; a squashed
    // column wraps it a word or a character per line, many more
    expect(h).toBeLessThanOrEqual(lineHeight * 3 + 2);
    expect((await split.locator(".dv-cell").first().boundingBox())?.width ?? 0).toBeGreaterThan(
      300,
    );
  });
});

test.describe("controls", () => {
  test("Save, Cancel, Reset and Refresh carry no aria-pressed; the view buttons do (R5, REQ-10)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff");
    const v = await openViewer(page);
    for (const name of ["Unified", "Split", "Review"]) {
      await expect(v.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-pressed",
        /true|false/,
      );
    }
    await chooseView(page, "Review");
    for (const name of ["Reset", "Refresh"]) {
      const b = v.getByRole("button", { name, exact: true });
      await expect(b).toBeVisible();
      await expect(b).not.toHaveAttribute("aria-pressed", /.*/);
    }
    await chooseView(page, "Unified");
    const line = row(fileSection(v, PRAISE), "const list = words(score);");
    await line.hover();
    await line.getByRole("button", { name: "Comment on line 4" }).click();
    for (const name of ["Save", "Cancel"]) {
      const b = v.getByRole("button", { name, exact: true });
      await expect(b).toBeVisible();
      await expect(b).not.toHaveAttribute("aria-pressed", /.*/);
    }
  });
});

test.describe("hosts", () => {
  test("no tile shows a diff button (R27, REQ-23)", async ({ page, dashboard }) => {
    await openDiff(dashboard, page, "diff-tiles");
    await expect(liveTileById(page, 1)).toBeVisible();
    await expect(page.locator("#diff-button")).toBeHidden();
    await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0);
    await expect(page.locator("article.tile .diffbtn")).toHaveCount(0);
  });

  test("focusing the second session shows its own counts, comment and viewer (R28, REQ-27)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff-pair");
    await expect(diffButton(page)).toBeVisible();
    await sessionCard(page, "diff-second").click();
    await expect(page.locator("#mainhead")).toContainText("diff-second");
    await expect(diffButton(page)).toHaveText("5 files +10 −6 · 💬 1 · View diff ›");
    const v = await openViewer(page);
    await v.getByRole("button", { name: /^Comments \(1\)$/ }).click();
    await expect(v.locator(".dv-centry", { hasText: "Comment on diff-second." })).toBeVisible();
    await expect(v.getByText("Comment on diff-first.")).toHaveCount(0);
    await sessionCard(page, "diff-first").click();
    await expect(page.locator("#mainhead")).toContainText("diff-first");
    await expect(viewer(page)).toHaveCount(0);
    await expect(diffButton(page)).toHaveText(/View diff ›$/);
    const first = await openViewer(page);
    await first.getByRole("button", { name: /^Comments \(1\)$/ }).click();
    await expect(first.locator(".dv-centry", { hasText: "Comment on diff-first." })).toBeVisible();
    await expect(first.getByText("Comment on diff-second.")).toHaveCount(0);
  });

  test("a diff read that fails says so with Refresh (R29, REQ-28)", async ({ page, dashboard }) => {
    await openDiff(dashboard, page, "diff", { failReads: true });
    const v = await openViewer(page);
    await expect(v.getByText(/^Couldn't read the diff: .+$/)).toBeVisible();
    await expect(v.getByRole("button", { name: "Refresh" }).first()).toBeVisible();
  });

  test("a tick whose write fails stays shown with the failure by the progress readout (R30, REQ-28)", async ({
    page,
    dashboard,
  }) => {
    await openDiff(dashboard, page, "diff", { writes: "fail" });
    const v = await openViewer(page);
    await chooseView(page, "Review");
    const wrap = fileSection(v, PRAISE).locator('.dv-change-wrap[data-change="1"]');
    await wrap.getByRole("button", { name: "Mark change reviewed" }).click();
    await expect(wrap.getByRole("button", { name: /^✓ reviewed/ })).toBeVisible();
    await expect(
      v.locator(".dv-review-tools").getByText("Not saved, musterd unreachable"),
    ).toBeVisible();
    await expect(progress(v)).toHaveText("3 / 5 changes reviewed");
  });
});
