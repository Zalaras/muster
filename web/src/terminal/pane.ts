// xterm.js wrapper + the terminal-socket bridge (docs/protocol.md §6; design-system §7
// terminal rules). One TerminalSurface per live surface (Focus's pane, or one Tiles
// tile): owns the xterm.js instance, the `/ws/terminal/{id}` socket, and the single
// overlay element for the down/superseded/ended states. main.ts's surface manager is the
// only thing that constructs/disposes these — DOM+socket code stays out of the pure
// modules (sessions/live.ts's membership math has none of this, per conventions).
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { Session } from "../protocol";
import { overlayForCloseCode, overlayText, type OverlayKind } from "./overlay";

// Debounce window for resize frames after the initial one (protocol §6 / design-system
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
 * One live terminal surface. Constructing it for an already-dead session (`alive:
 * false`) never opens a socket (REQ-13: "no attach attempt for a session Muster already
 * knows is dead") — it renders the "session ended" overlay directly and stops there.
 */
export class TerminalSurface {
  /** The aria-labelled container the Testable UI Elements table pins
   * (`Terminal: <title>`) — callers mount this wherever the live surface belongs
   * (Focus's slot, or a Tiles tile's body slot) and never reach into its internals. */
  readonly root: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly sessionId: number;
  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private socket: WebSocket | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSentCols = 0;
  private lastSentRows = 0;
  private overlayKind: OverlayKind | null = null;
  private disposed = false;

  constructor(session: Session) {
    this.sessionId = session.id;

    this.root = document.createElement("div");
    this.root.className = "terminal-surface";
    this.root.setAttribute("aria-label", `Terminal: ${session.title ?? "untitled"}`);

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

    this.root.append(this.bodyEl, this.overlayEl);

    if (!session.alive) {
      this.setOverlay("ended");
      return;
    }

    const term = new Terminal({
      // design-system §7.4 / protocol §6: tmux owns scrollback, never xterm.
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
    const socket = new WebSocket(`${wsProtocol}//${location.host}/ws/terminal/${this.sessionId}`);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.lastSentCols = 0;
    this.lastSentRows = 0;

    socket.addEventListener("open", () => {
      this.clearOverlay();
      this.refit(true);
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      // Protocol §6: no server->client text frames in M2 — only binary PTY output.
      if (event.data instanceof ArrayBuffer) {
        this.term?.write(new Uint8Array(event.data));
      }
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      if (this.socket !== socket) return; // superseded by our own reattach already
      this.socket = null;
      if (this.disposed) return;
      this.setOverlay(overlayForCloseCode(event.code));
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
   * assignment restyles without recreating the `Terminal` instance. Called by main.ts on
   * every live surface after a `snapshot`/`prefs`/`claudeTheme` message sets the theme
   * attributes; never from the 1s render tick. A no-op for a dead session's surface
   * (`this.term` is null — it never had a terminal to restyle). */
  applyTheme(): void {
    if (!this.term) return;
    this.term.options.theme = {
      background: cssVar("--term", "Canvas"),
      foreground: cssVar("--term-fg", "CanvasText"),
    };
  }

  /** Moves DOM focus into xterm's input. Called by main.ts only on a pointer selection,
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
   * design-system §7 / protocol §6 — only a user click reclaims). */
  reattachIfDisconnected(alive: boolean): void {
    if (this.disposed || !this.term) return;
    if (!alive || this.overlayKind !== "disconnected") return;
    this.attach();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.resizeTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.term?.dispose();
    this.root.remove();
  }
}
