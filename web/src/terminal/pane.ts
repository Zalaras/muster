// xterm.js wrapper + the terminal-socket bridge (kb:anchor/terminal.ws; design-system §7
// terminal rules). One TerminalSurface per live surface (Focus's pane, or one Tiles
// tile): owns the xterm.js instance, the `/ws/terminal/{id}` socket, and the single
// overlay element for the down/superseded/ended states. features/surfaces.ts's surface
// manager is the only thing that constructs/disposes these — DOM+socket code stays out of the pure
// modules (sessions/live.ts's membership math has none of this, per conventions).
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { locateDroppedFile } from "../api";
import type { Session } from "../protocol";
import { DRAG_MIME } from "../render/dragreorder";
import {
  classifyApiFailure,
  classifyDrop,
  escapePath,
  locatingText,
  MAX_DROP_BYTES,
  noticeForFailure,
} from "./drop";
import { showNotice as showNoticeOn } from "./notice";
import { overlayForCloseCode, overlayText, type OverlayKind } from "./overlay";
import type { SurfaceKind } from "./surfaceswitch";

// Debounce window for resize frames after the initial one (kb:anchor/terminal.ws / design-system
// §4.2/§7.2).
const RESIZE_DEBOUNCE_MS = 100;

export interface TerminalSurfaceGeometry {
  cols: number;
  rows: number;
}

/** Reads a design-system token off `:root` at call time — the dashboard supplies xterm's
 * own font/ground config from the same tokens as everything else (design-system §1:
 * "tokens only"), never a hard-coded font stack or hex baked into this component. */
function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * One live terminal surface — the Claude pane (`/ws/terminal/{id}`, kb:anchor/terminal.ws) or,
 * since plan plain-terminal-session, a session's plain shell (`/ws/shell/{id}`,
 * kb:anchor/terminal.shell-ws). `kind` picks the WS path and the aria-label prefix; every other behaviour —
 * drop handling, resize, overlays, theming — is shared unchanged (plan Affected Files).
 * Constructing a `"claude"` surface for an already-dead session (`alive: false`) never
 * opens a socket (REQ-13: "no attach attempt for a session Muster already knows is
 * dead") — it renders the "session ended" overlay directly and stops there. A `"shell"`
 * surface is never constructed for a session with no running shell (features/surfaces.ts
 * only mounts one after `POST .../shell` succeeds), so it has no equivalent dead-on-arrival check —
 * REQ-7's "the shell route never consults `alive`" applies here too.
 */
export class TerminalSurface {
  /** The aria-labelled container the Testable UI Elements table pins
   * (`Terminal: <title>` / `Shell: <title>`) — callers mount this wherever the live
   * surface belongs (Focus's slot, or a Tiles tile's body slot) and never reach into its
   * internals. */
  readonly root: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly sessionId: number;
  private readonly kind: SurfaceKind;
  /** REQ-8: fired only for a `"shell"` surface whose socket closes with `4001
   * pane_ended` (the shell exited or was killed externally) — features/surfaces.ts's hook to revert
   * the surface-switch state (`shellEnded`) and re-render, which is what actually swaps
   * the visible surface back to Claude and disposes this one. Never fired for `"claude"`
   * (the liveness poll already covers that pane's own 4001) or for `4000 superseded`
   * (nothing auto-reconnects/reverts on that code — design-system §7 / kb:anchor/terminal.ws). */
  private readonly onShellEnded: (() => void) | undefined;
  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private socket: WebSocket | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSentCols = 0;
  private lastSentRows = 0;
  private overlayKind: OverlayKind | null = null;
  private disposed = false;

  constructor(session: Session, kind: SurfaceKind = "claude", onShellEnded?: () => void) {
    this.sessionId = session.id;
    this.kind = kind;
    this.onShellEnded = onShellEnded;

    this.root = document.createElement("div");
    this.root.className = "terminal-surface";
    this.root.setAttribute(
      "aria-label",
      `${kind === "shell" ? "Shell" : "Terminal"}: ${session.title ?? "untitled"}`,
    );

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "terminal-body";

    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "terminal-overlay";
    this.overlayEl.hidden = true;
    // The one interactive overlay affordance (design-system States: "clicking reclaims")
    // — a no-op for every other overlay kind, and for the empty (no overlay) state.
    this.overlayEl.addEventListener("click", () => {
      if (this.overlayKind === "superseded") this.attach();
    });

    // Plan file-drop-fix, UI Specifications > DOM: lives alongside `.terminal-overlay`,
    // toggled the same way (the `hidden` attribute).
    this.noticeEl = document.createElement("div");
    this.noticeEl.className = "terminal-notice";
    this.noticeEl.setAttribute("role", "status");
    this.noticeEl.hidden = true;

    this.root.append(this.bodyEl, this.overlayEl, this.noticeEl);
    this.installDropHandlers();

    if (kind === "claude" && !session.alive) {
      this.setOverlay("ended");
      return;
    }

    const term = new Terminal({
      // design-system §7.4 / kb:anchor/terminal.ws: tmux owns scrollback, never xterm.
      scrollback: 0,
      // Type roles §2: terminal text is --mono at 12.5px/1.65 — read from the token so
      // nothing here hard-codes a font stack.
      fontFamily: cssVar("--mono", "monospace"),
      fontSize: 12.5,
      lineHeight: 1.65,
      theme: {
        // Neutral CSS system-color keywords, not a literal duplicate of --term/--term-fg's
        // hex values (review m2-terminal Minor 5) — these only ever apply if the token
        // read itself comes back empty, which in practice never happens since both are
        // always declared on :root. --term-fg (not --fg, plan new-ui-design-colors REQ-1):
        // the pane's foreground follows Claude Code's own theme family, independent of
        // the Muster chrome theme (design-system §7.5).
        background: cssVar("--term", "Canvas"),
        foreground: cssVar("--term-fg", "CanvasText"),
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(this.bodyEl);
    term.onData((data) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(new TextEncoder().encode(data));
      }
    });
    this.term = term;
    this.fitAddon = fitAddon;

    this.attach();
  }

  /** Opens (or reopens, on a superseded-overlay reclaim click, or after the daemon
   * connection is restored) the `/ws/terminal/{id}` socket. Never called for a dead
   * session — guarded in the constructor, and `reattachIfDisconnected` re-checks it. */
  private attach(): void {
    if (this.disposed) return;
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    const path = this.kind === "shell" ? "shell" : "terminal";
    const socket = new WebSocket(`${wsProtocol}//${location.host}/ws/${path}/${this.sessionId}`);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.lastSentCols = 0;
    this.lastSentRows = 0;

    socket.addEventListener("open", () => {
      this.clearOverlay();
      this.refit(true);
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      // kb:anchor/terminal.ws: no server->client text frames in M2 — only binary PTY output.
      if (event.data instanceof ArrayBuffer) {
        this.term?.write(new Uint8Array(event.data));
      }
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      if (this.socket !== socket) return; // superseded by our own reattach already
      this.socket = null;
      if (this.disposed) return;
      this.setOverlay(overlayForCloseCode(event.code));
      // REQ-8: PTY EOF on a shell surface (`exit`, or an external kill) — never fired for
      // `4000 superseded` (E12: a superseded shell tab stays on `shell`, showing the
      // overlay, since the shell itself is still running elsewhere).
      if (this.kind === "shell" && event.code === 4001) this.onShellEnded?.();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private setOverlay(kind: OverlayKind): void {
    this.overlayKind = kind;
    this.overlayEl.hidden = false;
    this.overlayEl.textContent = overlayText(kind);
  }

  private clearOverlay(): void {
    this.overlayKind = null;
    this.overlayEl.hidden = true;
    this.overlayEl.textContent = "";
  }

  // ── file-drop-fix: drag-and-drop onto this surface ──────────────────────────────────

  /** Edge case 1 / INV-3: a tile-header or rail-card reorder drag carries
   * `render/dragreorder.ts`'s own MIME, never `Files` or plain `text/plain` — checking
   * for its presence (rather than sniffing the absence of `Files`/`text/plain`, which a
   * real text drop would satisfy identically) is what lets an internal reorder drag pass
   * straight through a terminal surface it happens to cross (Tiles: a tile header dragged
   * over another tile's body) to the grid/rail container's own listener further up the
   * bubble chain, instead of being wrongly claimed here as a foreign drop. */
  private isInternalDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(DRAG_MIME) ?? false;
  }

  /** Installs the three drag listeners on `root` (UI Specifications: "Focus pane and
   * Tiles tiles ... become a drop target"). Called unconditionally from the constructor —
   * REQ-8: even a dead session's surface (`this.term` still null when these fire) installs
   * the handlers, they just prevent the browser's default navigation and stop there; no
   * notice, no request, no drop-target styling for that case. */
  private installDropHandlers(): void {
    this.root.addEventListener("dragover", (event) => {
      if (this.isInternalDrag(event)) return;
      event.preventDefault();
      if (!this.term) return;
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      this.root.classList.add("drop-target");
    });

    this.root.addEventListener("dragleave", (event) => {
      const related = event.relatedTarget;
      if (related instanceof Node && this.root.contains(related)) return;
      this.root.classList.remove("drop-target");
    });

    this.root.addEventListener("drop", (event) => {
      if (this.isInternalDrag(event)) return;
      event.preventDefault();
      this.root.classList.remove("drop-target");
      if (!this.term) return;
      void this.handleDrop(event);
    });
  }

  /** REQ-2/REQ-10: classifies the drop and either runs the sequential locate→paste loop
   * (files) or pastes verbatim (text-only). A `"none"` classification (neither files nor
   * text) is silently swallowed — nothing here for this feature to do, and the drop was
   * already prevented above. */
  private async handleDrop(event: DragEvent): Promise<void> {
    const dt = event.dataTransfer;
    if (!dt) return;
    const kind = classifyDrop(Array.from(dt.types), dt.files.length);
    if (kind === "none") return;

    if (kind === "text") {
      const text = dt.getData("text/plain");
      if (!text) return;
      if (!this.canPasteNow()) {
        this.showNotice(noticeForFailure("", { kind: "not_connected" }));
        return;
      }
      if (this.pasteText(text)) {
        this.showNotice(null);
        this.focus();
      }
      return;
    }

    // "files": sequential, not parallel (Implementation Notes) — pasted paths keep drop
    // order and the notice always names the file currently in flight.
    for (const file of Array.from(dt.files)) {
      await this.locateAndPasteOne(file);
    }
  }

  private async locateAndPasteOne(file: File): Promise<void> {
    if (!this.canPasteNow()) {
      // REQ-8: no request when there's nowhere to paste — checked before the size cap
      // and before the network call, so a disconnected pane never issues either.
      this.showNotice(noticeForFailure(file.name, { kind: "not_connected" }));
      return;
    }
    if (file.size > MAX_DROP_BYTES) {
      this.showNotice(noticeForFailure(file.name, { kind: "too_large" }));
      return;
    }
    // REQ-13: in-flight, not an outcome — stays visible for as long as the request
    // takes, however long that is, instead of vanishing at 5s while it's still running.
    this.showNotice(locatingText(file.name), "inflight");
    const result = await locateDroppedFile(this.sessionId, file);
    if (!result.ok) {
      this.showNotice(noticeForFailure(file.name, classifyApiFailure(result.error)));
      return;
    }
    if (this.pasteText(escapePath(result.value.path) + " ")) {
      this.showNotice(null);
      this.focus();
    } else {
      // Edge case 3: the session/socket died between the request and the response.
      this.showNotice(noticeForFailure(file.name, { kind: "not_connected" }));
    }
  }

  private canPasteNow(): boolean {
    return this.term !== null && this.socket?.readyState === WebSocket.OPEN;
  }

  /** Pastes `text` through xterm's own paste routine (normalises line endings, wraps in
   * bracketed-paste markers iff the application enabled mode 2004 — Implementation
   * Notes), which routes through the same `onData` → socket-send path as typed input.
   * Returns false and sends nothing when there's no terminal or the socket isn't open
   * (W8) — the caller shows the not-connected notice in that case. */
  pasteText(text: string): boolean {
    if (!this.canPasteNow()) return false;
    this.term?.paste(text);
    return true;
  }

  /** Shows (or, given `null`, clears) the one `role="status"` notice this surface owns —
   * a new outcome always replaces whatever text was there (edge case 19), cancelling any
   * pending auto-hide timer first. Delegates to `terminal/notice.ts` (plan v1-cleanup
   * REQ-12): an `"outcome"` text (the default — every caller but the in-flight locate
   * text in `locateAndPasteOne` above) auto-hides after ~5s (REQ-6); an `"inflight"` text
   * stays up until something else replaces it (REQ-13); `null` hides immediately with no
   * timer either way. */
  showNotice(text: string | null, kind: "outcome" | "inflight" = "outcome"): void {
    if (this.disposed) return;
    showNoticeOn(this.noticeEl, text, kind);
  }

  /**
   * Re-fits to the container's current size and sends a `resize` frame if the fitted
   * geometry changed. `immediate` skips the ~100ms debounce for the one-time initial
   * resize the protocol requires right after open. Safe to call on every render pass —
   * a no-op unless the container's size actually changed (design-system §4.2 / REQ-11:
   * only sessions whose live surface changed are ever resized).
   */
  refit(immediate = false): void {
    if (!this.term || !this.fitAddon) return;
    try {
      this.fitAddon.fit();
    } catch {
      return; // container not yet laid out (zero size) — nothing to fit
    }
    const { cols, rows } = this.term;
    if (cols <= 0 || rows <= 0) return;

    const send = (): void => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      if (cols === this.lastSentCols && rows === this.lastSentRows) return;
      this.lastSentCols = cols;
      this.lastSentRows = rows;
      this.socket.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    clearTimeout(this.resizeTimer);
    if (immediate) send();
    else this.resizeTimer = setTimeout(send, RESIZE_DEBOUNCE_MS);
  }

  /** The pane's own fitted geometry (REQ-15's sizenote / tile footer), or `null` before
   * the terminal has ever been laid out (a dead session never gets one). */
  get geometry(): TerminalSurfaceGeometry | null {
    if (!this.term) return null;
    return { cols: this.term.cols, rows: this.term.rows };
  }

  /** REQ-12: re-themes a live terminal in place — xterm.js 6's `term.options.theme`
   * assignment restyles without recreating the `Terminal` instance. Called on every live
   * surface by `features/surfaces.ts`'s `applyTheme()`, itself invoked by `features/theme.ts`
   * after a `snapshot`/`prefs`/`claudeTheme` message sets the theme attributes; never from
   * the 1s render tick. A no-op for a dead session's surface
   * (`this.term` is null — it never had a terminal to restyle). */
  applyTheme(): void {
    if (!this.term) return;
    this.term.options.theme = {
      background: cssVar("--term", "Canvas"),
      foreground: cssVar("--term-fg", "CanvasText"),
    };
  }

  /** Moves DOM focus into xterm's input. Called by features/rail.ts (via
   * features/surfaces.ts's `focusSelected`) only on a pointer selection,
   * never from a render pass (REQ-4/INV-1). A silent no-op for a dead session's surface
   * (`term` is null — never had a terminal to focus) and for a disposed surface. Never
   * opens, closes or otherwise touches the socket. */
  focus(): void {
    if (this.disposed || !this.term) return;
    this.term.focus();
  }

  /** Called after the daemon connection is restored (`hello`): reattaches only if this
   * surface is currently showing the "disconnected" overlay for a still-alive session —
   * never for "ended" (still dead) or "superseded" (nothing auto-reconnects on 4000,
   * design-system §7 / kb:anchor/terminal.ws — only a user click reclaims). */
  reattachIfDisconnected(alive: boolean): void {
    if (this.disposed || !this.term) return;
    if (!alive || this.overlayKind !== "disconnected") return;
    this.attach();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.resizeTimer);
    // Cancels any pending auto-hide timer notice.ts holds against this.noticeEl — this
    // surface is going away, so nothing should fire against it later.
    showNoticeOn(this.noticeEl, null);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.term?.dispose();
    this.root.remove();
  }
}
