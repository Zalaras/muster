// Pure close-code -> overlay mapping for the terminal bridge (kb:anchor/terminal.ws close
// codes; design-system §7 terminal rules). Kept separate from pane.ts's DOM/socket code
// so it's Vitest-testable without a real WebSocket (docs/conventions.md).
export type OverlayKind = "disconnected" | "superseded" | "ended";

/** `4000 superseded` / `4001 pane_ended` are the only server-initiated codes with their
 * own meaning; every other close (1000/1001 shutdown, 1006 abnormal/daemon-down, or any
 * other value) reads as "disconnected" — the bridge is down, not the session. */
export function overlayForCloseCode(code: number): OverlayKind {
  if (code === 4000) return "superseded";
  if (code === 4001) return "ended";
  return "disconnected";
}

/** Testable UI Elements: one overlay element per live surface matching
 * `/disconnected|another window|session ended/`. */
export function overlayText(kind: OverlayKind): string {
  switch (kind) {
    case "superseded":
      return "live view opened in another window — click to take back";
    case "ended":
      return "session ended";
    case "disconnected":
      return "disconnected — daemon down";
  }
}
