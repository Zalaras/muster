// Locators and oracles for the restart-onto-the-latest-Claude surfaces (plan restart-latest-claude):
// the masthead readout as the notice button, its panel and the confirm dialog with its two
// collapsible sections. Shapes follow the plan's Testable UI Elements table, as
// web/e2e/helpers/claude-restart.ts does: role + name where the table pins one, text where it
// does not (the panel is reached from its head, a row from its title element).
import { expect, type Locator, type Page } from "./harness";
import { tokenColor } from "./style";

export const INSTALLED = "2.1.318";

/** The readout as the notice button (`aria-label` "Claude Code update"). */
export function noticeButton(page: Page): Locator {
  return page.getByRole("button", { name: "Claude Code update" });
}

export function panelHead(page: Page): Locator {
  return page.getByText(`Claude Code ${INSTALLED}`, { exact: true });
}

/** The panel: the nearest ancestor of its head that mentions "Restart". */
export function panel(page: Page): Locator {
  return panelHead(page).locator("xpath=ancestor::*[contains(., 'Restart')][1]");
}

/** A panel count row: the parent of its label, which also holds the count. */
export function panelCountRow(page: Page, label: "Restart now" | "Restart when free"): Locator {
  return panel(page).getByText(label, { exact: true }).locator("xpath=..");
}

export function ignoreButton(page: Page): Locator {
  return page.getByRole("button", { name: "Ignore", exact: true });
}

export function panelRestartButton(page: Page): Locator {
  return page.getByRole("button", { name: "Restart…", exact: true });
}

/** `dialog.modal.confirm` named by its h2. */
export function restartDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: `Restart sessions on Claude Code ${INSTALLED}` });
}

/** A dialog section: the `<details>` whose summary reads `label · count`. */
export function dialogSection(page: Page, label: string): Locator {
  return restartDialog(page)
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: label }) });
}

/** The row of a session inside `scope`: the parent of its title element. */
export function rowOf(scope: Locator, title: string): Locator {
  return scope.getByText(title, { exact: true }).locator("xpath=..");
}

export function confirmButton(page: Page): Locator {
  return restartDialog(page).getByRole("button", {
    name: /^(Restart \d+, queue \d+|Restart \d+|Queue \d+)$/,
  });
}

/** Opens the panel with the pointer, then the dialog through Restart…. */
export async function openRestartDialog(page: Page): Promise<Locator> {
  await noticeButton(page).click();
  await panelRestartButton(page).click();
  const dialog = restartDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The readout box's rendered width, whichever shape (span or button) it is in. */
export async function readoutWidth(page: Page): Promise<number> {
  return await page.locator("#claude-version").evaluate((el) => el.getBoundingClientRect().width);
}

/** Records every WebSocket the page opens so a test can drop the connection afterwards. Must
 * run before `dashboard.open`; the harness's own routes are unaffected. */
export async function recordSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __sockets: WebSocket[] };
    w.__sockets = [];
    // The harness replaces window.WebSocket with Playwright's mock, so record sockets where the
    // app subscribes to them instead of wrapping the constructor.
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      ...args: Parameters<EventTarget["addEventListener"]>
    ) {
      const ws = this as WebSocket;
      if (
        typeof ws.send === "function" &&
        typeof ws.url === "string" &&
        !w.__sockets.includes(ws)
      ) {
        w.__sockets.push(ws);
      }
      return add.apply(this, args);
    };
  });
}

/** Fires `close` on the page's `/ws` socket (a mocked socket never completes a client-side
 * close()): the dashboard sees the daemon go away.
 * The clock is pinned, so the reconnect timer never fires. */
export async function dropDaemon(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __sockets: WebSocket[] };
    for (const s of w.__sockets)
      if (new URL(s.url).pathname === "/ws") s.dispatchEvent(new Event("close"));
  });
}

const FORBIDDEN_TOKENS = [
  "--rose",
  "--violet",
  "--rose-line",
  "--violet-line",
  "--rose-note",
  "--amber",
  "--amber-line",
  "--amber-note",
];

/** Every use of a rose, violet or amber colour (text, ground, borders) by `root` and its
 * descendants other than inside `.btn.key`, as readable strings. Empty = none. */
export async function stateColoursUsed(page: Page, root: Locator): Promise<string[]> {
  const forbidden: Record<string, string> = {};
  for (const token of FORBIDDEN_TOKENS) {
    forbidden[await tokenColor(page, token)] = token;
    forbidden[await tokenColor(page, token, "background-color")] = token;
  }
  return await root.evaluate((el, table) => {
    const hits: string[] = [];
    const props = [
      "color",
      "backgroundColor",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
    ] as const;
    for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
      if (node.closest(".btn.key")) continue;
      const cs = getComputedStyle(node);
      for (const p of props) {
        const token = table[cs[p]];
        if (token) hits.push(`${node.tagName.toLowerCase()}.${node.className} ${p} = ${token}`);
      }
    }
    return hits;
  }, forbidden);
}
