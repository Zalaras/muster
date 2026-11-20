import { placeAnchored, placeAtPoint } from "./anchored";

export interface PopoverOptions {
  at?: { x: number; y: number } | undefined;
  alignRight?: boolean;
  haspopup: "menu" | "dialog";
  closeOnTab: boolean;
  onViewportChange: "close" | "reposition";
  onKeydown?: (event: KeyboardEvent) => void;
  initialFocus: () => HTMLElement | null;
  onClose?: () => void;
  ignoreOpenDialogs?: boolean;
  keepOnInnerScroll?: boolean;
}

export interface Popover {
  open(opener: HTMLElement, panel: HTMLElement, options: PopoverOptions): void;
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
}

interface OpenPopover {
  panel: HTMLElement;
  opener: HTMLElement;
  atPoint: boolean;
  onClose: (() => void) | undefined;
  dispose: () => void;
}

export function createPopover(): Popover {
  let current: OpenPopover | null = null;

  function close(restoreFocus = false): void {
    const open = current;
    if (!open) return;
    current = null;
    open.dispose();
    open.panel.remove();
    if (!open.atPoint) open.opener.setAttribute("aria-expanded", "false");
    open.onClose?.();
    if (restoreFocus && open.opener.isConnected) open.opener.focus();
  }

  function open(opener: HTMLElement, panel: HTMLElement, options: PopoverOptions): void {
    const { at } = options;
    if (at === undefined && current?.opener === opener) {
      close(true);
      return;
    }
    close();
    document.body.append(panel);
    if (at === undefined) {
      placeAnchored(panel, opener, { alignRight: options.alignRight === true });
      opener.setAttribute("aria-haspopup", options.haspopup);
      opener.setAttribute("aria-expanded", "true");
    } else {
      placeAtPoint(panel, at);
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || (at === undefined && opener.contains(target))) return;
      // A click inside a modal dialog opened from the panel (its close confirmation) is not
      // an outside click.
      if (
        options.ignoreOpenDialogs === true &&
        target instanceof Element &&
        target.closest("dialog[open]")
      )
        return;
      close();
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === "Tab" && options.closeOnTab) {
        close();
      } else {
        options.onKeydown?.(event);
      }
    };
    const onViewportChange = (): void => {
      if (options.onViewportChange === "close") close();
      else if (at === undefined)
        placeAnchored(panel, opener, { alignRight: options.alignRight === true });
    };
    const onResize = onViewportChange;
    const onScroll = (event: Event): void => {
      if (
        options.keepOnInnerScroll === true &&
        event.target instanceof Node &&
        panel.contains(event.target)
      )
        return;
      onViewportChange();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    panel.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize);
    document.addEventListener("scroll", onScroll, true);
    current = {
      panel,
      opener,
      atPoint: at !== undefined,
      onClose: options.onClose,
      dispose: () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("scroll", onScroll, true);
      },
    };
    const first = options.initialFocus();
    if (first) {
      first.focus();
    } else {
      panel.tabIndex = -1;
      panel.focus();
    }
  }

  return { open, close, isOpen: () => current !== null };
}
