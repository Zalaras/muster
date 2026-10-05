// The one menu builder (kb:adr/web-menu-component-single-builder): a `role="menu"` panel of
// `role="menuitem"` buttons anchored below its opener, serving the rail ⋯, every header ⋯, Move to
// and the Focus header's group control. DOM and keys only — the caller hands in the entries (their
// text and what choosing one does) and this module never decides what a menu offers.
//
// Everything about an open menu is this instance's state (one `createMenu()` per controller);
// the panel is appended to `document.body` because the rail scrolls and clips. It is built when it
// opens and discarded when it closes, so the 1s render tick never touches it, and the opener — a
// control the caller reuses across passes — only has its `aria-expanded` written.

import { placeAnchored } from "./anchored";

export type MenuEntry =
  | {
      kind: "item";
      label: string;
      onSelect: () => void;
      /** A chord shown right-aligned in mono, `aria-hidden` so the name stays the label. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Present on every item of a menu that ticks one (Move to): `true` draws the tick. */
      current?: boolean;
    }
  | { kind: "separator" }
  | { kind: "header"; label: string };

export interface Menu {
  /** Opens `entries` under `opener`, or closes the menu if `opener` already has it open. */
  open(opener: HTMLElement, entries: readonly MenuEntry[]): void;
  /** Closes the open menu. `restoreFocus` returns focus to the opener (Escape, a choice); an
   * outside click or a status change leaves focus where the user put it. */
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
}

function buildItem(entry: Extract<MenuEntry, { kind: "item" }>, ticks: boolean): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = entry.danger ? "mi danger" : "mi";
  item.setAttribute("role", "menuitem");
  item.disabled = entry.disabled === true;
  if (ticks) {
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.setAttribute("aria-hidden", "true");
    tick.textContent = entry.current === true ? "✓" : "";
    item.append(tick);
    if (entry.current === true) item.setAttribute("aria-current", "true");
  }
  const label = document.createElement("span");
  label.className = "mlabel";
  label.textContent = entry.label;
  item.append(label);
  if (entry.hint !== undefined) {
    const hint = document.createElement("span");
    hint.className = "k";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = entry.hint;
    item.append(hint);
  }
  return item;
}

function buildPanel(
  entries: readonly MenuEntry[],
  onChoose: (entry: () => void) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "menu";
  panel.setAttribute("role", "menu");
  const ticks = entries.some((e) => e.kind === "item" && e.current !== undefined);
  for (const entry of entries) {
    if (entry.kind === "separator") {
      const sep = document.createElement("div");
      sep.className = "sep";
      sep.setAttribute("role", "separator");
      panel.append(sep);
    } else if (entry.kind === "header") {
      const header = document.createElement("div");
      header.className = "hdr";
      header.setAttribute("role", "presentation");
      header.textContent = entry.label;
      panel.setAttribute("aria-label", entry.label);
      panel.append(header);
    } else {
      const item = buildItem(entry, ticks);
      item.addEventListener("click", () => onChoose(entry.onSelect));
      panel.append(item);
    }
  }
  return panel;
}

function enabledItems(panel: HTMLElement): HTMLButtonElement[] {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button.mi:not(:disabled)"));
}

/** Arrow keys, Home and End move focus among the enabled items, wrapping. */
function onPanelKeydown(panel: HTMLElement, event: KeyboardEvent): void {
  const items = enabledItems(panel);
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (event.key === "ArrowDown") next = (at + 1) % items.length;
  else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = items.length - 1;
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
}

interface OpenMenu {
  panel: HTMLElement;
  opener: HTMLElement;
  dispose: () => void;
}

export function createMenu(): Menu {
  let current: OpenMenu | null = null;

  function close(restoreFocus = false): void {
    const open = current;
    if (!open) return;
    current = null;
    open.dispose();
    open.panel.remove();
    open.opener.setAttribute("aria-expanded", "false");
    if (restoreFocus && open.opener.isConnected) open.opener.focus();
  }

  function open(opener: HTMLElement, entries: readonly MenuEntry[]): void {
    if (current?.opener === opener) {
      close(true);
      return;
    }
    close();
    // Close first (focus back on the opener) and only then run the choice, so a choice that
    // moves focus on — Rename's field, a dialog — is not undone by the close.
    const panel = buildPanel(entries, (choose) => {
      close(true);
      choose();
    });
    document.body.append(panel);
    placeAnchored(panel, opener, { alignRight: true });
    opener.setAttribute("aria-haspopup", "menu");
    opener.setAttribute("aria-expanded", "true");

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && (panel.contains(target) || opener.contains(target))) return;
      close();
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === "Tab") {
        close();
      } else {
        onPanelKeydown(panel, event);
      }
    };
    const onViewportChange = (): void => close();
    document.addEventListener("pointerdown", onPointerDown, true);
    panel.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("scroll", onViewportChange, true);
    current = {
      panel,
      opener,
      dispose: () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("resize", onViewportChange);
        document.removeEventListener("scroll", onViewportChange, true);
      },
    };
    enabledItems(panel)[0]?.focus();
  }

  return { open, close, isOpen: () => current !== null };
}
