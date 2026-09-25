// Connection status readout, daemon-down banner, protocol mismatch, and the Claude Code
// version readout (kb:adr/process-one-name-per-feature: "connection"). Owns `everConnected` —
// only true once a `hello` has ever been received, so a socket that hasn't connected yet
// reads "connecting…" rather than flashing "musterd unreachable" on first load. Also owns
// whether a mismatched hello actually shows the mismatch screen: a window mid update-restart
// reload suppresses it (kb:adr/update-restart-reloads-dashboard), decided here via
// `ConnectionDeps.reloading` rather than by the WS-message caller.
import type { App, ConnectionStatus } from "../app";
import { requireElement } from "../dom";
import { isRestorableControl, shouldRestoreFocus } from "./connectionrestore";
import { describeClaudeVersion } from "./connectionversion";
import { DAEMON_ABSENCE_CLAUSE, renderBanner, renderBannerContent } from "../render/banner";
import { renderClaudeVersion, renderConnectionStatus } from "../render/masthead";
import type { ClaudeCodeInfo } from "../protocol/hello";

const DAEMON_DOWN_TEXT = `musterd unreachable — ${DAEMON_ABSENCE_CLAUSE}`;

/** features/updaterestart.ts's implementation, typed structurally per convention (no
 * controller imports a sibling) — this is the one cross-feature contact point
 * update-restart state crosses through, as data rather than a second module reaching into
 * this module's elements or decisions (kb:adr/update-restart-reloads-dashboard).
 * `restartBanner` returns `null` for "no override", so this module falls through to its
 * own ordinary daemon-down text; this module stays the banner's sole writer. `reloading`
 * is read by `showProtocolMismatch` below, so the mismatch-suppression decision has the
 * same one home as the banner override. */
export interface ConnectionDeps {
  restartBanner(now: Date, status: ConnectionStatus): { text: string; neutral: boolean } | null;
  /** True once this window has kicked off its update-restart reload for a held record.
   * `location.reload()` only schedules the navigation, so a protocol-mismatched hello on
   * the same tick that triggered it would otherwise still reach `showProtocolMismatch`
   * (kb:adr/update-restart-reloads-dashboard) — checked first thing there, so it is a
   * no-op for that hello. */
  reloading(): boolean;
}

export interface ConnectionHandle {
  /** WS `onHello`: marks the daemon reachable, sets status "connected", and renders the
   * version readout. */
  connected(claudeCode: ClaudeCodeInfo | null): void;
  /** WS `onConnecting`/`onDisconnected`: "reconnecting" once we've ever seen a `hello`,
   * else still "connecting" — this is the only place that ternary is decided. */
  disconnected(): void;
  /** The shell vanishes under this fatal state; moving focus onto the (fatal,
   * tabindex="-1") mismatch element gives a keyboard/screen-reader user somewhere
   * sensible to land. A no-op while `deps.reloading()` is true — that hello is about to
   * be superseded by an update-restart reload, not a real mismatch
   * (kb:adr/update-restart-reloads-dashboard). */
  showProtocolMismatch(): void;
}

/** The DOM-free half of connection tracking: writes `app.state.connection` and holds
 * `everConnected` (true only once a `hello` has ever arrived, so a socket that hasn't
 * connected yet reads "connecting" rather than flashing "reconnecting"/unreachable on
 * first load). `initConnection` below wraps this with the dashboard's masthead/banner
 * rendering; `doc.ts` (the pop-out had no writer for
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

export function initConnection(app: App, deps: ConnectionDeps): ConnectionHandle {
  const connectionStatusEl = requireElement<HTMLElement>("#connection-status");
  const bannerEl = requireElement<HTMLElement>("#banner");
  const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
  const shellEl = requireElement<HTMLElement>("#app");
  const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

  // No hello has arrived yet — same "unknown, not empty" honesty rule as any other
  // no-data-yet readout (design-system §6).
  renderClaudeVersion(claudeVersionEl, describeClaudeVersion(null));

  // The one control the socket dropped focus off of, remembered by node identity
  // across the disconnect->reconnect pair of renders — never per-site.
  let remembered: (HTMLButtonElement | HTMLSelectElement) | null = null;

  // The banner's own last-written text/neutral/visible, held by this instance
  // (render/CLAUDE.md's render-state rule: a builder's cross-call state belongs to the
  // caller that holds refs it built once, not the builder itself) — `null` never equals
  // a real string, so the first tick always writes. Read by the render phase below to
  // skip a DOM write when nothing changed, so a steady daemon-down produces no
  // `#banner` mutations for its `role="alert"` to re-announce.
  let lastBannerText: string | null = null;
  let lastBannerNeutral = false;
  let lastBannerVisible = false;

  const state = createConnectionState(app, (status) => {
    renderConnectionStatus(connectionStatusEl, status);
    // Broadcasts every non-connected status (disconnected, daemon down) so any open
    // dialog can close itself — each dialog controller subscribes to this event
    // itself rather than being reached from here.
    if (status !== "connected") app.emit("status", status);
    if (status !== "connected") {
      // Captured before the render below disables it — a disabled control loses focus
      // to `body` the instant `.disabled` is set, so this is the last moment it's still
      // `document.activeElement` (a second drop's `activeElement` is
      // already `body`, so this is a no-op and the first remembered element survives).
      const active = document.activeElement;
      remembered = isRestorableControl(active)
        ? (active as HTMLButtonElement | HTMLSelectElement)
        : remembered;
    }
    // Every already-drawn surface carries `connected` baked
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

  // Its own render phase, not folded into the `onChange` callback above: the restart
  // fallback and confirmation hide (kb:adr/update-restart-reloads-dashboard) are
  // time-based, not status-change-based, so the banner needs re-evaluating on every tick
  // (main.ts's `setInterval(app.render, 1000)`), not only when `state.connection`
  // changes. `onChange`'s own unconditional `app.render()` call above still covers every
  // status change through this same phase.
  app.onRender((frame) => {
    const override = deps.restartBanner(frame.now, frame.connection);
    const text = override?.text ?? DAEMON_DOWN_TEXT;
    const neutral = override?.neutral ?? false;
    const visible = override !== null || frame.connection === "reconnecting";
    if (text !== lastBannerText || neutral !== lastBannerNeutral) {
      renderBannerContent(bannerEl, text, neutral);
      lastBannerText = text;
      lastBannerNeutral = neutral;
    }
    if (visible !== lastBannerVisible) {
      renderBanner(bannerEl, visible);
      lastBannerVisible = visible;
    }
  });

  return {
    connected(claudeCode) {
      state.connected();
      renderClaudeVersion(claudeVersionEl, describeClaudeVersion(claudeCode));
    },
    disconnected() {
      state.disconnected();
    },
    showProtocolMismatch() {
      if (deps.reloading()) return;
      shellEl.hidden = true;
      mismatchEl.hidden = false;
      mismatchEl.focus();
    },
  };
}
