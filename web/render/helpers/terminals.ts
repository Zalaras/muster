// The Terminals panel and the `shell` segment's count, in both hosts (the Focus mainhead
// and a tile footer). Pure DOM, located by the Testable UI Elements table's roles and names;
// no daemon, no fixture knowledge beyond `busySessionIds`, which reads a recorded snapshot.
import type { Locator, Page, Snapshot } from "./harness";
import { mainheadSurfaceGroup, tileSurfaceGroup } from "./surfaces";

/** Ids of the sessions with at least one busy terminal in a recorded snapshot. */
export function busySessionIds(snapshot: Snapshot): number[] {
  return Object.entries(snapshot.terminals ?? {})
    .filter(([, list]) => list.some((t) => t.busy))
    .map(([id]) => Number(id));
}

/** The ▾ opener inside a switch group (`mainheadSurfaceGroup` / `tileSurfaceGroup`). */
export function terminalsOpener(group: Locator): Locator {
  return group.getByRole("button", { name: "Terminals", exact: true });
}

export function mainheadTerminalsOpener(page: Page): Locator {
  return terminalsOpener(mainheadSurfaceGroup(page));
}

export function tileTerminalsOpener(page: Page, sessionId: number): Locator {
  return terminalsOpener(tileSurfaceGroup(page, sessionId));
}

/** The non-modal Terminals panel (`role="dialog"` named `Terminals`). */
export function terminalsPanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "Terminals", exact: true });
}

/** A terminal's row `<li>`, found by its switch button's name. */
export function terminalRow(page: Page, name: string): Locator {
  return terminalsPanel(page)
    .locator("li.trow")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
}

export function newTerminalButton(page: Page): Locator {
  return terminalsPanel(page).getByRole("button", { name: "New terminal", exact: true });
}

/** `span.shellcount` inside a `shell` segment button. */
export function shellCount(shellButton: Locator): Locator {
  return shellButton.locator("span.shellcount");
}
