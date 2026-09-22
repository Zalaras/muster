// Oracles and locators for plan terminal-fixes-cleanup: the shell surface's word/line-jump
// keys (REQ-5, REQ-6), wheel-driven copy-mode scrolling (REQ-7 through REQ-12) and the
// busy/done activity indicator that replaces the running-shell pip (REQ-1 through REQ-4,
// REQ-13, REQ-14). Deliberately a separate file from helpers/shell.ts: this plan's
// Affected Files assigns removing that file's pip locator to web-impl, not e2e-specs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Locator, Page, WebSocket } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";

const execFileAsync = promisify(execFile);

// ── Activity indicator ─────────────────────────────────────────────────────────────────

/**
 * The shell segment's busy/done indicator — Testable UI Elements: `span.shellact` inside
 * the `shell` button, carrying `data-act="busy"` or `data-act="done"`, `aria-hidden` (the
 * button's own accessible name stays exactly "shell" in every indicator state, INV-3).
 * Presence and `data-act` are the contract, as `span.pip`'s presence was; absence
 * (`toHaveCount(0)`) is REQ-1's "no data yet"/idle state, deliberately indistinguishable
 * from "no shell has ever existed for this session".
 */
export function shellActivityIndicator(segmentButton: Locator): Locator {
  return segmentButton.locator("span.shellact");
}

// ── tmux oracles — never a display/state source (CLAUDE.md hard rule): these only
// observe copy-mode and mouse state the daemon already applied via internal/tmux. ───────

/**
 * Waits for exactly one animation frame in `page` — the same `requestAnimationFrame`
 * `pane.ts`'s `installShellInputHandlers` schedules `flushWheelScroll` on (W4). A caller
 * that awaits this between two `page.mouse.wheel` dispatches forces each into its own
 * flush, reproducing a slow trackpad's one-event-per-frame cadence rather than letting
 * Playwright's fast CDP round-trips batch several wheel events into a single flush — the
 * exact gap that let review cycle 1 Major 1 (a discarded sub-line remainder) ship past
 * E4/E5/E6, which all use deltas large enough to cross a whole line in one flush.
 */
export async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

/**
 * `tmux capture-pane -p`: the pane's currently rendered text, for E1/E2's word/line-jump
 * cursor assertions and E6's "no stray characters landed on the live command line" check.
 */
export async function tmuxCapturePane(daemon: ScratchDaemon, target: string): Promise<string> {
  const { stdout } = await execFileAsync("tmux", [
    "-S",
    daemon.tmuxSocket,
    "capture-pane",
    "-p",
    "-t",
    target,
  ]);
  return stdout;
}

/**
 * The last non-blank line of a `capture-pane` dump — the live command line's own
 * content (prompt plus whatever's typed), trimmed of the blank rows tmux pads a pane
 * with. E6's oracle for "the wheel never touched the live line" needs this rather than a
 * substring search over the whole capture, since the pane's scrollback legitimately
 * already contains the same marker text as real command output.
 */
export function lastNonBlankLine(capture: string): string {
  const lines = capture.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trimEnd() ?? "";
    if (line.length > 0) return line;
  }
  return "";
}

/**
 * `tmux show-options -g mouse`: INV-2/D7's oracle that Muster never turns tmux mouse
 * tracking on for a shell pane (`internal/tmux`'s `serverOptions` stays untouched by this
 * plan) — resolves to `"on"` or `"off"`.
 */
export async function tmuxMouseOption(daemon: ScratchDaemon): Promise<string> {
  const { stdout } = await execFileAsync("tmux", [
    "-S",
    daemon.tmuxSocket,
    "show-options",
    "-g",
    "mouse",
  ]);
  const value = stdout.trim().split(/\s+/)[1];
  return value ?? stdout.trim();
}

// ── WS byte-level oracle — INV-1: the Claude surface's key handling is untouched. ───────

/**
 * Records raw binary client→server frames on a socket whose URL contains
 * `urlSubstring` (`/ws/terminal/` or `/ws/shell/`) — INV-1's most direct oracle for
 * whether a keypress reached the daemon as xterm's own raw escape bytes or as this
 * plan's translated readline bytes. Must be constructed before the action that opens the
 * socket (Playwright's `websocket` event only fires for connections made after the
 * listener is registered), mirroring helpers/terminal.ts's `TerminalSocketTracker`.
 */
export class WsByteRecorder {
  readonly sent: Buffer[] = [];

  constructor(page: Page, urlSubstring: string) {
    page.on("websocket", (ws: WebSocket) => {
      if (!ws.url().includes(urlSubstring)) return;
      ws.on("framesent", (frame) => {
        if (typeof frame.payload !== "string") this.sent.push(Buffer.from(frame.payload));
      });
    });
  }
}

/**
 * xterm.js's own default CSI-u encoding for Option+Left/Right (spike S7:
 * "xterm.js emits ESC[1;3D for Option+Left ... Cmd+Arrow emits nothing at all today") —
 * the raw bytes a Claude surface must still send, unchanged by this plan (INV-1).
 */
export const OPTION_LEFT_RAW = Buffer.from([0x1b, 0x5b, 0x31, 0x3b, 0x33, 0x44]);
export const OPTION_RIGHT_RAW = Buffer.from([0x1b, 0x5b, 0x31, 0x3b, 0x33, 0x43]);

/**
 * The shell surface's readline translation (Protocol Contract / Affected Files > Web):
 * Option+Left/Right → `ESC b` / `ESC f`; Cmd+Left/Right → `0x01` / `0x05`.
 */
export const ESC_B = Buffer.from([0x1b, 0x62]);
export const ESC_F = Buffer.from([0x1b, 0x66]);
export const CTRL_A = Buffer.from([0x01]);
export const CTRL_E = Buffer.from([0x05]);
