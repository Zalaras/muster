// Connection status readout, daemon-down banner, protocol mismatch, and the Claude Code
// version readout (plan code-breakup vocabulary: "connection"). Owns `everConnected` —
// only true once a `hello` has ever been received, so a socket that hasn't connected yet
// reads "connecting…" rather than flashing "musterd unreachable" on first load.
import type { App } from "../app";
import { requireElement } from "../dom";
import { renderBanner } from "../render/banner";
import {
  renderClaudeVersion,
  renderConnectionStatus,
  type ConnectionStatus,
} from "../render/masthead";
import type { ClaudeCodeInfo } from "../protocol";

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

export function initConnection(app: App): ConnectionHandle {
  const connectionStatusEl = requireElement<HTMLElement>("#connection-status");
  const bannerEl = requireElement<HTMLElement>("#banner");
  const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
  const shellEl = requireElement<HTMLElement>("#app");
  const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

  let everConnected = false;
  // No hello has arrived yet — same "unknown, not empty" honesty rule as any other
  // no-data-yet readout (design-system §6).
  renderClaudeVersion(claudeVersionEl, null);

  function set(status: ConnectionStatus): void {
    if (status === "connected") everConnected = true;
    app.state.connection = status;
    renderConnectionStatus(connectionStatusEl, status);
    renderBanner(bannerEl, everConnected && status !== "connected");
    // States (m4-reconcile): "Daemon down ... Dialogs, if open, close" — every dialog
    // controller subscribes to this event itself rather than being reached from here.
    if (status !== "connected") app.emit("status", status);
    // review m4-reconcile Major 3: every already-drawn surface carries `connected` baked
    // into its last render call — re-render on every transition (down and back up) so
    // button-disabled state never goes stale.
    app.render();
  }

  return {
    connected(claudeCode) {
      set("connected");
      renderClaudeVersion(claudeVersionEl, claudeCode);
    },
    disconnected() {
      set(everConnected ? "reconnecting" : "connecting");
    },
    showProtocolMismatch() {
      shellEl.hidden = true;
      mismatchEl.hidden = false;
      mismatchEl.focus();
    },
  };
}
