// The hover popover a rail header shows: the group's name and `n sessions`, then one row per state
// present with that state's session titles. DOM only — `sessions/sections.ts`'s `popoverModel`
// supplies every string. `role="tooltip"`, `pointer-events: none` (style.css), appended to
// `document.body` because the rail scrolls and clips, so it never steals a click.
//
// One controller per rail (`createGroupPopover()`), holding the timer and the open panel — the
// instance's own state. A header calls `attach` once, when it is built, with a getter for its
// *current* model: headers are updated in place across the 1s tick, so the model is read when the
// popover opens, never captured.
import type { PopoverModel } from "../sessions/sections";
import { placeAnchored } from "./anchored";

/** How long a header is hovered before its popover opens. */
export const POPOVER_DELAY_MS = 350;

export interface GroupPopover {
  /** Hover opens it after `POPOVER_DELAY_MS`; `focusTarget` taking keyboard focus opens it at
   * once. Leaving, blur and a pointerdown close it. Returns the detach function. */
  attach(anchor: HTMLElement, focusTarget: HTMLElement, model: () => PopoverModel): () => void;
  /** Closes the open popover, if any (the header it describes is going away). */
  close(): void;
}

/** One state's row: its header line (dot, word, count), then each session in it as a `.pt`. */
function buildRow(row: PopoverModel["rows"][number]): HTMLElement {
  const block = document.createElement("div");
  block.className = "pr";
  block.dataset["state"] = row.state;
  const head = document.createElement("div");
  head.className = "prh";
  const dot = document.createElement("i");
  dot.className = "dot";
  const word = document.createElement("b");
  word.textContent = row.word;
  const count = document.createElement("span");
  count.textContent = String(row.n);
  head.append(dot, word, count);
  const titles = row.titles.map((title) => {
    const line = document.createElement("div");
    line.className = "pt";
    line.textContent = title;
    return line;
  });
  block.append(head, ...titles);
  return block;
}

function buildPanel(model: PopoverModel): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "pop";
  panel.setAttribute("role", "tooltip");
  const head = document.createElement("div");
  head.className = "ph";
  const name = document.createElement("b");
  name.textContent = model.name;
  const phrase = document.createElement("span");
  phrase.textContent = model.sessions;
  head.append(name, phrase);
  panel.append(head);
  if (model.rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pt";
    empty.textContent = "empty";
    panel.append(empty);
  }
  for (const row of model.rows) panel.append(buildRow(row));
  return panel;
}

export function createGroupPopover(): GroupPopover {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let panel: HTMLElement | null = null;

  function close(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    panel?.remove();
    panel = null;
  }

  function show(anchor: HTMLElement, model: () => PopoverModel): void {
    close();
    panel = buildPanel(model());
    document.body.append(panel);
    placeAnchored(panel, anchor);
  }

  function attach(
    anchor: HTMLElement,
    focusTarget: HTMLElement,
    model: () => PopoverModel,
  ): () => void {
    const onEnter = (): void => {
      close();
      timer = setTimeout(() => show(anchor, model), POPOVER_DELAY_MS);
    };
    const onFocus = (): void => {
      // Only a keyboard focus opens it: a click focuses the caret too, and the popover would then
      // sit over the section the click just folded.
      if (focusTarget.matches(":focus-visible")) show(anchor, model);
    };
    anchor.addEventListener("mouseenter", onEnter);
    anchor.addEventListener("mouseleave", close);
    anchor.addEventListener("pointerdown", close);
    focusTarget.addEventListener("focus", onFocus);
    focusTarget.addEventListener("blur", close);
    return () => {
      anchor.removeEventListener("mouseenter", onEnter);
      anchor.removeEventListener("mouseleave", close);
      anchor.removeEventListener("pointerdown", close);
      focusTarget.removeEventListener("focus", onFocus);
      focusTarget.removeEventListener("blur", close);
    };
  }

  return { attach, close };
}
