// xterm.js wrapper + the terminal-socket bridge (kb:anchor/terminal.ws; design-system §7
// terminal rules). One TerminalSurface per live surface (Focus's pane, or one Tiles
// tile): owns the xterm.js instance, the `/ws/terminal/{id}` socket, and the single
// overlay element for the down/superseded/ended states. features/surfaces.ts's surface
// manager is the only thing that constructs/disposes these — DOM+socket code stays out of the pure
// modules (sessions/live.ts's membership math has none of this, per conventions).
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { Session } from "../protocol/session";
import { wsUrl } from "../ws";
import { showNotice as showNoticeOn } from "./notice";
import { overlayForCloseCode, overlayText, type OverlayKind } from "./overlay";
import { PIXELS_PER_LINE, shellKeyBytes, wheelDeltaToScrollLines } from "./shellkeys";
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

/** The one place xterm's theme colors are read off the design-system tokens — both the
 * constructor and `applyTheme()` call this rather than each building the object
 * themselves. */
function terminalThemeColors(): { background: string; foreground: string } {
  return {
    background: cssVar("--term", "Canvas"),
    foreground: cssVar("--term-fg", "CanvasText"),
  };
}

/**
 * One live terminal surface — the Claude pane (`/ws/terminal/{id}`, kb:anchor/terminal.ws) or
 * a session's plain shell (`/ws/shell/{id}`, kb:anchor/terminal.shell-ws,
 * kb:adr/surfaces-shell-is-attach-target-not-session). `kind` picks the WS path and the
 * aria-label prefix; every other behaviour — drop handling, resize, overlays, theming — is
 * shared unchanged. Constructing a `"claude"` surface for an already-dead session
 * (`alive: false`) never opens a socket — it renders the "session ended" overlay directly
 * and stops there. A `"shell"` surface is never constructed for a session with no running
 * shell (features/surfaces.ts only mounts one after `POST .../shell` succeeds), so it has
 * no equivalent dead-on-arrival check — the shell route never consults `alive` either.
 */
export class TerminalSurface {
  /** The aria-labelled container, always labelled `Terminal: <title>` / `Shell: <title>` —
   * callers mount this wherever the live surface belongs (Focus's slot, or a Tiles tile's
   * body slot) and never reach into its internals. */
  readonly root: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly overlayEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly sessionId: number;
  private readonly kind: SurfaceKind;
  /** Fired only for a `"shell"` surface whose socket closes with `4001
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
  // kb:adr/surfaces-shell-scroll-via-daemon-copy-mode: one animation frame's worth of
  // accumulated wheel `deltaY`, for `kind === "shell"` only — coalesced so a fast wheel
  // gesture sends at most one `scroll` frame per frame rather than one per native `wheel`
  // event.
  private wheelAccumDeltaY = 0;
  private wheelFlushScheduled = false;

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

    // Lives alongside `.terminal-overlay`, toggled the same way (the `hidden` attribute).
    this.noticeEl = document.createElement("div");
    this.noticeEl.className = "terminal-notice";
    this.noticeEl.setAttribute("role", "status");
    this.noticeEl.hidden = true;

    this.root.append(this.bodyEl, this.overlayEl, this.noticeEl);

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
      // Neutral CSS system-color keywords, not a literal duplicate of --term/--term-fg's
      // hex values — these only ever apply if the token read itself comes back empty,
      // which in practice never happens since both are always declared on :root.
      // --term-fg (not --fg, kb:adr/theme-terminal-ground-follows-claude-family): the
      // pane's foreground follows Claude Code's own theme family, independent of the
      // Muster chrome theme (design-system §7.5).
      theme: terminalThemeColors(),
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

    // Installed for `kind === "shell"` only — a `claude` surface never attaches either
    // handler, so xterm's own key/wheel handling (which Claude Code itself reads
    // correctly) is completely unreached for it.
    if (kind === "shell") this.installShellInputHandlers(term);

    this.attach();
  }

  /** The shell surface's readline key translation and wheel-driven copy-mode scroll
   * (kb:adr/surfaces-shell-scroll-via-daemon-copy-mode), both via xterm.js's own
   * custom-handler hooks so neither handler contends with xterm's internal key/wheel
   * processing (rather than a second DOM listener racing it). Called once, from the
   * constructor, only when `kind === "shell"`. */
  private installShellInputHandlers(term: Terminal): void {
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const bytes = shellKeyBytes(event);
      if (!bytes) return true;
      event.preventDefault();
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(bytes);
      return false; // xterm never sees this keystroke — no raw CSI byte also goes out.
    });

    term.attachCustomWheelEventHandler((event) => {
      event.preventDefault();
      this.wheelAccumDeltaY += event.deltaY;
      if (!this.wheelFlushScheduled) {
        this.wheelFlushScheduled = true;
        requestAnimationFrame(() => this.flushWheelScroll());
      }
      return false; // Never falls through to xterm's own cursor-key wheel fallback.
    });
  }

  /** The coalesced `scroll` frame — reads the accumulator built up by every `wheel`
   * event since the last animation frame. A `0` conversion (the gesture accumulated to
   * date is too small to round to a whole line — a slow trackpad's per-event `deltaY` is
   * routinely under `PIXELS_PER_LINE`) sends no frame and leaves the accumulator
   * untouched, so the next frame's events add to the same sub-line remainder rather than
   * starting over from it (zeroing unconditionally here discarded that remainder every
   * frame, so a gentle scroll never reached a whole line at all).
   * When a frame *is* sent, only the pixel amount that rounded into `lines` comes back
   * out — `lines * PIXELS_PER_LINE` signed opposite to `deltaY` per
   * `wheelDeltaToScrollLines`'s convention (negative `deltaY` yields positive `lines`), so
   * adding it here is what removes it — leaving any true remainder (below the rounding
   * threshold, or beyond the daemon's 200-line clamp) queued for the next flush instead of
   * silently dropped. */
  private flushWheelScroll(): void {
    this.wheelFlushScheduled = false;
    const lines = wheelDeltaToScrollLines(this.wheelAccumDeltaY);
    if (lines === 0) return;
    this.wheelAccumDeltaY += lines * PIXELS_PER_LINE;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "scroll", lines }));
    }
  }

  /** Opens (or reopens, on a superseded-overlay reclaim click, or after the daemon
   * connection is restored) the `/ws/terminal/{id}` socket. Never called for a dead
   * session — guarded in the constructor, and `reattachIfDisconnected` re-checks it. */
  private attach(): void {
    if (this.disposed) return;
    const path = this.kind === "shell" ? "shell" : "terminal";
    const socket = new WebSocket(wsUrl(`/ws/${path}/${this.sessionId}`));
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.lastSentCols = 0;
    this.lastSentRows = 0;

    socket.addEventListener("open", () => {
      this.clearOverlay();
      this.refit(true);
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      // kb:anchor/terminal.ws: no server->client text frames — only binary PTY output.
      if (event.data instanceof ArrayBuffer) {
        this.term?.write(new Uint8Array(event.data));
      }
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      if (this.socket !== socket) return; // superseded by our own reattach already
      this.socket = null;
      if (this.disposed) return;
      this.setOverlay(overlayForCloseCode(event.code));
      // PTY EOF on a shell surface (`exit`, or an external kill) — never fired for
      // `4000 superseded` (kb:adr/surfaces-one-live-client-per-attach-target: a
      // superseded shell tab stays on `shell`, showing the overlay, since the shell
      // itself is still running elsewhere).
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

  // ── drag-and-drop onto this surface ──────────────────────────────────────────────────
  // The DOM/fetch wiring lives in `./dropwire.ts`'s `installTerminalDrop`, installed by
  // features/surfaces.ts (the one place a `TerminalSurface` is constructed) — this class
  // exposes only the small `DropSurface` surface it needs (`hasTerminal`/`canPasteNow`/
  // `pasteText`/`showNotice`/`focus`, all below).

  /** Whether this surface has ever constructed an xterm instance — `dropwire.ts`'s outer
   * drag guard (a dead `"claude"` surface still swallows the browser's default drop
   * navigation, but shows no drop-target styling and attempts no paste). `canPasteNow`
   * below is the stricter "and the socket is open right now" check the per-drop logic uses. */
  hasTerminal(): boolean {
    return this.term !== null;
  }

  canPasteNow(): boolean {
    return this.term !== null && this.socket?.readyState === WebSocket.OPEN;
  }

  /** Pastes `text` through xterm's own paste routine (normalises line endings, wraps in
   * bracketed-paste markers iff the application enabled mode 2004), which routes through
   * the same `onData` → socket-send path as typed input. Returns false and sends nothing
   * when there's no terminal or the socket isn't open — the caller shows the
   * not-connected notice in that case. */
  pasteText(text: string): boolean {
    if (!this.canPasteNow()) return false;
    this.term?.paste(text);
    return true;
  }

  /** Shows (or, given `null`, clears) the one `role="status"` notice this surface owns —
   * a new outcome always replaces whatever text was there, cancelling any pending
   * auto-hide timer first. Delegates to `terminal/notice.ts`: an `"outcome"` text (the
   * default — every caller but `dropwire.ts`'s in-flight locate text) auto-hides after
   * ~5s; an `"inflight"` text stays up until something else replaces it; `null` hides
   * immediately with no timer either way. */
  showNotice(text: string | null, kind: "outcome" | "inflight" = "outcome"): void {
    if (this.disposed) return;
    showNoticeOn(this.noticeEl, text, kind);
  }

  /**
   * Re-fits to the container's current size and sends a `resize` frame if the fitted
   * geometry changed. `immediate` skips the ~100ms debounce for the one-time initial
   * resize the protocol requires right after open. Safe to call on every render pass —
   * a no-op unless the container's size actually changed (design-system §4.2 — only
   * sessions whose live surface changed are ever resized).
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

  /** The pane's own fitted geometry, consumed by the sizenote / tile footer, or `null`
   * before the terminal has ever been laid out (a dead session never gets one). */
  get geometry(): TerminalSurfaceGeometry | null {
    if (!this.term) return null;
    return { cols: this.term.cols, rows: this.term.rows };
  }

  /** Re-themes a live terminal in place — xterm.js 6's `term.options.theme`
   * assignment restyles without recreating the `Terminal` instance. Called on every live
   * surface by `features/surfaces.ts`'s `themeChanged` subscriber, which `features/theme.ts`
   * emits after a `snapshot`/`prefs`/`claudeTheme` message sets the theme attributes; never
   * from the 1s render tick. A no-op for a dead session's surface
   * (`this.term` is null — it never had a terminal to restyle). */
  applyTheme(): void {
    if (!this.term) return;
    this.term.options.theme = terminalThemeColors();
  }

  /** Moves DOM focus into xterm's input. Called via features/surfaces.ts's
   * `focusSelected`: by features/rail.ts on a pointer selection, and by
   * features/launch.ts after a successful launch — never from a render pass
   * (kb:adr/focus-rail-click-focuses-terminal). A silent no-op for a dead session's
   * surface (`term` is null — never had a terminal to focus) and for a disposed surface.
   * Never opens, closes or otherwise touches the socket. */
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
