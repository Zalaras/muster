// Drop-onto-a-surface wiring — the one concern of a terminal surface not shared with
// every other surface concern (socket, xterm lifecycle, overlay), so it lives apart from
// `terminal/pane.ts`'s `TerminalSurface`. Installed once per surface, from outside,
// mirroring `render/dragreorder.ts`'s/`render/dropguard.ts`'s `install*(root, ...)` shape.
// Pure classification/escaping/notice-text stays in `./drop.ts` (terminal/CLAUDE.md: a
// pure module takes no `HTMLElement`) — this is the DOM half. The surface itself is
// reached only through the small structural `DropSurface` interface below, never a whole
// `TerminalSurface` import.
import { locateDroppedFile } from "../api/terminal";
import { DRAG_MIME } from "../dragmime";
import {
  classifyApiFailure,
  classifyDrop,
  escapePath,
  locatingText,
  MAX_DROP_BYTES,
  noticeForFailure,
} from "./drop";

/** The one thing `installTerminalDrop` needs from a surface — deliberately narrower than
 * `TerminalSurface` itself (no socket, no xterm instance, no overlay state). */
export interface DropSurface {
  /** Whether this surface has a terminal at all (even a dead session's surface
   * installs the listeners, they just stop at `preventDefault`) — distinct from
   * `canPasteNow`, which also requires the socket to be open right now. */
  hasTerminal(): boolean;
  canPasteNow(): boolean;
  pasteText(text: string): boolean;
  showNotice(text: string | null, kind?: "outcome" | "inflight"): void;
  focus(): void;
}

/** kb:adr/drop-reorder-drag-mime-custom-type: a tile-header or rail-card reorder drag
 * carries `render/dragreorder.ts`'s own MIME, never `Files` or plain `text/plain` —
 * checking for its presence is what lets an internal reorder drag pass through to the
 * grid/rail container's own listener instead of being wrongly claimed here as a foreign
 * drop. */
function isInternalDrag(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(DRAG_MIME) ?? false;
}

async function locateAndPasteOne(
  sessionId: number,
  surface: DropSurface,
  file: File,
): Promise<void> {
  if (!surface.canPasteNow()) {
    // No request when there's nowhere to paste.
    surface.showNotice(noticeForFailure(file.name, { kind: "not_connected" }));
    return;
  }
  if (file.size > MAX_DROP_BYTES) {
    surface.showNotice(noticeForFailure(file.name, { kind: "too_large" }));
    return;
  }
  // In-flight, not an outcome — stays visible for as long as the request takes.
  surface.showNotice(locatingText(file.name), "inflight");
  const result = await locateDroppedFile(sessionId, file);
  if (!result.ok) {
    surface.showNotice(noticeForFailure(file.name, classifyApiFailure(result.error)));
    return;
  }
  if (surface.pasteText(escapePath(result.value.path) + " ")) {
    surface.showNotice(null);
    surface.focus();
  } else {
    // The session/socket died between the request and the response.
    surface.showNotice(noticeForFailure(file.name, { kind: "not_connected" }));
  }
}

/** Classifies the drop and either runs the sequential locate→paste loop
 * (files) or pastes verbatim (text-only); "none" is silently swallowed. */
async function handleDrop(
  sessionId: number,
  surface: DropSurface,
  event: DragEvent,
): Promise<void> {
  const dt = event.dataTransfer;
  if (!dt) return;
  const kind = classifyDrop(Array.from(dt.types), dt.files.length);
  if (kind === "none") return;

  if (kind === "text") {
    const text = dt.getData("text/plain");
    if (!text) return;
    if (!surface.canPasteNow()) {
      surface.showNotice(noticeForFailure("", { kind: "not_connected" }));
      return;
    }
    if (surface.pasteText(text)) {
      surface.showNotice(null);
      surface.focus();
    }
    return;
  }

  // "files": sequential, not parallel — pasted paths keep drop order and the notice
  // always names the file currently in flight.
  for (const file of Array.from(dt.files)) {
    await locateAndPasteOne(sessionId, surface, file);
  }
}

/** Installs the three drag listeners on `root` — every Focus pane and Tiles tile becomes
 * a drop target. Called unconditionally, even for a dead session's surface
 * (`hasTerminal()` false) — it just prevents the browser's default navigation and stops
 * there; no notice, no request, no drop-target styling for that case. */
export function installTerminalDrop(
  root: HTMLElement,
  sessionId: number,
  surface: DropSurface,
): void {
  root.addEventListener("dragover", (event) => {
    if (isInternalDrag(event)) return;
    event.preventDefault();
    if (!surface.hasTerminal()) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    root.classList.add("drop-target");
  });

  root.addEventListener("dragleave", (event) => {
    const related = event.relatedTarget;
    if (related instanceof Node && root.contains(related)) return;
    root.classList.remove("drop-target");
  });

  root.addEventListener("drop", (event) => {
    if (isInternalDrag(event)) return;
    event.preventDefault();
    root.classList.remove("drop-target");
    if (!surface.hasTerminal()) return;
    void handleDrop(sessionId, surface, event);
  });
}
