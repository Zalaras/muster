// Connection status readout, daemon-down banner, protocol mismatch, and the Claude Code
// version readout (plan code-breakup vocabulary: "connection"). Owns `everConnected` —
// only true once a `hello` has ever been received, so a socket that hasn't connected yet
// reads "connecting…" rather than flashing "musterd unreachable" on first load.
import type { App, ConnectionStatus } from "../app";
import { requireElement } from "../dom";
import { isRestorableControl, shouldRestoreFocus } from "../render/focusrestore";
import { renderBanner } from "../render/banner";
import { renderClaudeVersion, renderConnectionStatus } from "../render/masthead";
import type { ClaudeCodeInfo } from "../protocol/hello";

export interface ConnectionHandle {
  /** WS `onHello`: marks the daemon reachable, sets status "connected", and renders the
   * version readout. */
  connected(claudeCode: ClaudeCodeInfo | null): void;
  /** WS `onConnecting`/`onDisconnected`: "reconnecting" once we've ever seen a `hello`,
   * else still "connecting" — this is the only place that ternary is decided. */
  disconnected(): void;
  /** The shell vanishes under this fatal state; moving focus onto the (fatal,
   * tabindex="-1") mismatch element gives a keyboard/screen-reader user somewhere
   * sensible to land (review m1-sessions Minor 7). */
  showProtocolMismatch(): void;
}

/** The DOM-free half of connection tracking: writes `app.state.connection` and holds
 * `everConnected` (true only once a `hello` has ever arrived, so a socket that hasn't
 * connected yet reads "connecting" rather than flashing "reconnecting"/unreachable on
 * first load). `initConnection` below wraps this with the dashboard's masthead/banner
 * rendering; `doc.ts` (review cycle 5 Critical 1 — the pop-out had no writer for
 * `app.state.connection` at all, so its reader stayed permanently "unreachable") uses it
 * directly, since `/doc.html` has none of the elements `initConnection` requires. */
export interface ConnectionState {
  connected(): void;
  disconnected(): void;
}

export function createConnectionState(
  app: App,
  onChange?: (status: ConnectionStatus) => void,
): ConnectionState {
  let everConnected = false;

  function set(status: ConnectionStatus): void {
    if (status === "connected") everConnected = true;
    app.state.connection = status;
    onChange?.(status);
  }

  return {
    connected() {
      set("connected");
    },
    disconnected() {
      set(everConnected ? "reconnecting" : "connecting");
    },
  };
}

export function initConnection(app: App): ConnectionHandle {
  const connectionStatusEl = requireElement<HTMLElement>("#connection-status");
  const bannerEl = requireElement<HTMLElement>("#banner");
  const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
  const shellEl = requireElement<HTMLElement>("#app");
  const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

  // No hello has arrived yet — same "unknown, not empty" honesty rule as any other
  // no-data-yet readout (design-system §6).
  renderClaudeVersion(claudeVersionEl, null);

  // REQ-7: the one control the socket dropped focus off of, remembered by node identity
  // across the disconnect->reconnect pair of renders — never per-site (R1).
  let remembered: (HTMLButtonElement | HTMLSelectElement) | null = null;

  const state = createConnectionState(app, (status) => {
    renderConnectionStatus(connectionStatusEl, status);
    // Equivalent to the original `everConnected && status !== "connected"`: `disconnected()`
    // can only produce "reconnecting" when a hello has ever arrived, and only "connecting"
    // when it hasn't, so the banner condition collapses to this one comparison.
    renderBanner(bannerEl, status === "reconnecting");
    // States (m4-reconcile): "Daemon down ... Dialogs, if open, close" — every dialog
    // controller subscribes to this event itself rather than being reached from here.
    if (status !== "connected") app.emit("status", status);
    if (status !== "connected") {
      // Captured before the render below disables it — a disabled control loses focus
      // to `body` the instant `.disabled` is set, so this is the last moment it's still
      // `document.activeElement` (edge case 11: a second drop's `activeElement` is
      // already `body`, so this is a no-op and the first remembered element survives).
      const active = document.activeElement;
      remembered = isRestorableControl(active)
        ? (active as HTMLButtonElement | HTMLSelectElement)
        : remembered;
    }
    // review m4-reconcile Major 3: every already-drawn surface carries `connected` baked
    // into its last render call — re-render on every transition (down and back up) so
    // button-disabled state never goes stale.
    app.render();
    if (status === "connected") {
      if (
        shouldRestoreFocus({
          activeIsBody: document.activeElement === document.body,
          stillInDocument: remembered?.isConnected ?? false,
          disabled: remembered?.disabled ?? true,
        })
      ) {
        remembered?.focus();
      }
      remembered = null; // once, by element identity — never chased on a later render
    }
  });

  return {
    connected(claudeCode) {
      state.connected();
      renderClaudeVersion(claudeVersionEl, claudeCode);
    },
    disconnected() {
      state.disconnected();
    },
    showProtocolMismatch() {
      shellEl.hidden = true;
      mismatchEl.hidden = false;
      mismatchEl.focus();
    },
  };
}
