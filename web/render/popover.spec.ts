// popover — the shared popover's two opt-in behaviours. A plain menu (the Focus header's Session
// actions ⋯) keeps the default: it closes on a scroll anywhere, including inside itself, and on a
// pointerdown that lands inside an open <dialog>. The Terminals panel opts out of both
// (`keepOnInnerScroll`, `ignoreOpenDialogs`). Driven from `terminals-two` / `terminals-ten`.
import { expect, test } from "./helpers/harness";
import type { Page } from "./helpers/harness";
import { mainheadTerminalsOpener, terminalsPanel } from "./helpers/terminals";

/** A non-modal open <dialog> with one button, standing in for a confirmation opened from a popover. */
async function addOpenDialog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.id = "probe-dialog";
    dialog.style.cssText = "position:fixed;left:8px;bottom:8px;top:auto;z-index:99999";
    const button = document.createElement("button");
    button.textContent = "probe-dialog-button";
    dialog.append(button);
    document.body.append(dialog);
    dialog.show();
  });
}

test("a plain menu closes on a scroll inside it and on a pointerdown inside an open dialog (menus unchanged)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("terminals-two");
  const opener = page
    .locator("#mainhead")
    .getByRole("button", { name: "Session actions", exact: true });
  const menu = page.getByRole("menu");

  // scroll inside the menu closes it
  await opener.click();
  await expect(menu).toBeVisible();
  const scrolled = await menu.evaluate((el) => {
    const panel = el as HTMLElement;
    // force an overflowing menu so the scroll is real, and read the offset before the scroll event
    // closes (and detaches) the panel
    const filler = document.createElement("div");
    filler.style.height = "300px";
    panel.append(filler);
    panel.style.maxHeight = "40px";
    panel.style.overflowY = "auto";
    panel.scrollTop = 20;
    return panel.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(menu).toHaveCount(0);

  // a pointerdown landing in an open dialog closes it
  await addOpenDialog(page);
  await opener.click();
  await expect(menu).toBeVisible();
  await page.getByRole("button", { name: "probe-dialog-button" }).click();
  await expect(menu).toHaveCount(0);
});

test("the Terminals panel stays open on a scroll inside its list and on a pointerdown inside an open dialog (REQ-15)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("terminals-ten");
  await mainheadTerminalsOpener(page).click();
  const panel = terminalsPanel(page);
  await expect(panel).toBeVisible();

  const scrolled = await panel.locator(".tlist").evaluate(async (el) => {
    el.scrollTop = 40;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect(panel).toBeVisible();

  await addOpenDialog(page);
  await page.getByRole("button", { name: "probe-dialog-button" }).click();
  await expect(panel).toBeVisible();
});
