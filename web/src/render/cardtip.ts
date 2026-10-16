import { placeAnchored } from "./anchored";
import { POPOVER_DELAY_MS } from "./grouppopover";

export interface CardTip {
  attach(card: HTMLElement, timer: HTMLElement): void;
  refresh(): void;
  close(): void;
}

function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "cardtip";
  panel.setAttribute("role", "tooltip");
  return panel;
}

function warmthText(timer: HTMLElement): string {
  return timer.getAttribute("aria-description") ?? "";
}

export function createCardTip(): CardTip {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let panel: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;

  function cancelPending(): void {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  }

  function close(): void {
    cancelPending();
    panel?.remove();
    panel = null;
    anchor = null;
  }

  function show(timer: HTMLElement): void {
    close();
    panel = buildPanel();
    panel.textContent = warmthText(timer);
    anchor = timer;
    document.body.append(panel);
    placeAnchored(panel, timer);
  }

  function refresh(): void {
    if (!panel || !anchor) return;
    if (anchor.getClientRects().length === 0) {
      close();
      return;
    }
    const text = warmthText(anchor);
    if (panel.textContent !== text) panel.textContent = text;
    placeAnchored(panel, anchor);
  }

  function attach(card: HTMLElement, timer: HTMLElement): void {
    timer.addEventListener("mouseenter", () => {
      if (anchor === timer) return;
      close();
      pending = setTimeout(() => show(timer), POPOVER_DELAY_MS);
    });
    timer.addEventListener("mouseleave", cancelPending);
    card.addEventListener("mouseleave", close);
    card.addEventListener("pointerdown", close);
  }

  return { attach, refresh, close };
}
