import { placeAnchored } from "./anchored";

export const POPOVER_DELAY_MS = 350;

export interface HoverTip<M> {
  show(anchor: HTMLElement, model: () => M | null): void;
  attachHover(anchor: HTMLElement, model: () => M | null): () => void;
  refresh(): void;
  close(): void;
}

interface Open<M> {
  panel: HTMLElement;
  anchor: HTMLElement;
  model: () => M | null;
  key: string;
}

export function createHoverTip<M>(build: (model: M) => HTMLElement): HoverTip<M> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let open: Open<M> | null = null;

  function close(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    open?.panel.remove();
    open = null;
  }

  function mount(anchor: HTMLElement, model: () => M | null, current: M): void {
    const panel = build(current);
    document.body.append(panel);
    placeAnchored(panel, anchor);
    open = { panel, anchor, model, key: JSON.stringify(current) };
  }

  function show(anchor: HTMLElement, model: () => M | null): void {
    close();
    const current = model();
    if (current !== null) mount(anchor, model, current);
  }

  function refresh(): void {
    if (open === null) return;
    const { anchor, model, key, panel } = open;
    const current = model();
    if (current === null) {
      close();
      return;
    }
    if (JSON.stringify(current) === key) return;
    panel.remove();
    mount(anchor, model, current);
  }

  function attachHover(anchor: HTMLElement, model: () => M | null): () => void {
    const onEnter = (): void => {
      close();
      timer = setTimeout(() => show(anchor, model), POPOVER_DELAY_MS);
    };
    anchor.addEventListener("mouseenter", onEnter);
    anchor.addEventListener("mouseleave", close);
    anchor.addEventListener("pointerdown", close);
    return () => {
      anchor.removeEventListener("mouseenter", onEnter);
      anchor.removeEventListener("mouseleave", close);
      anchor.removeEventListener("pointerdown", close);
    };
  }

  return { show, attachHover, refresh, close };
}
