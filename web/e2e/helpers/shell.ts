// Plain-terminal-session helpers (plan plain-terminal-session).
//
// The segmented `claude | shell` control is one component rendered in two places (REQ-4)
// — the Focus mainhead (`.mainhead .surfseg`) and every tile's footer (`.tfoot .acts
// .surfseg`, scoped through `article.tile[data-session-id]` since six tiles carry
// identically-named buttons, exactly as they already do for End — Testable UI Elements).
// Both groups expose the same two buttons, named exactly `claude` and `shell` (the pip
// inside the `shell` button is an empty `<span>`, so it never changes the button's
// accessible name).
import { expect } from "@playwright/test";
import type { Locator, Page, WebSocket } from "@playwright/test";
import { liveTileById } from "./terminal";

export type SurfaceKind = "claude" | "shell";

/** The Focus mainhead's segmented group (Testable UI Elements: `role="group"
 * aria-label="Surface"`, `.mainhead .surfseg`). */
export function mainheadSurfaceGroup(page: Page): Locator {
  return page.locator(".mainhead .surfseg");
}

/** One of the mainhead's two segment buttons, by exact accessible name. */
export function mainheadSurfaceButton(page: Page, kind: SurfaceKind): Locator {
  return mainheadSurfaceGroup(page).getByRole("button", { name: kind, exact: true });
}

/** A tile's segmented group, scoped by `data-session-id` (`liveTileById`) rather than
 * title text — the same disambiguation `helpers/session.ts`'s `tileRenameButton` and
 * `helpers/terminal.ts`'s `tileDragHandleById` already need, since every tile's footer
 * carries identically-named `claude`/`shell` buttons. */
export function tileSurfaceGroup(page: Page, sessionId: number): Locator {
  return liveTileById(page, sessionId).locator(".tfoot .acts .surfseg");
}

/** One of a tile's two segment buttons, by exact accessible name. */
export function tileSurfaceButton(page: Page, sessionId: number, kind: SurfaceKind): Locator {
  return tileSurfaceGroup(page, sessionId).getByRole("button", { name: kind, exact: true });
}

/** The pip inside a `shell` segment button — Testable UI Elements: "contains
 * `span.pip` when a shell runs". Its presence in the DOM (not merely a CSS state) is the
 * only indicator a shell is running (REQ-4), so callers assert `toHaveCount(1)` /
 * `toHaveCount(0)` on this locator rather than a visibility check. Review Major 3 /
 * decision `shell-pip-hue`: the pip's colour resolves to the `--shell-pip` token, not
 * `--teal` (`web/src/style.css`) — see `expectShellPipUsesShellPipToken` below. */
export function shellPip(segmentButton: Locator): Locator {
  return segmentButton.locator(".pip");
}

/**
 * Review Major 1: a dead surface's own `role="status"` notice (`.terminal-notice`,
 * `web/index.html`'s `#dead-surface` and `#dead-surface-template`, populated by
 * `render/dead.ts`'s `showDeadSurfaceNotice`) — REQ-12's fallback for a spawn failure on
 * a session whose `claude` segment currently shows the dead surface, not a live pane.
 * Deliberately NOT `root.getByRole("status")`: the same dead-surface root also contains
 * `<b role="status">session ended</b>` inside `.endcap` (`web/index.html`), so a bare
 * role query would match both elements (file-drop-fix's exact E9 lesson) — scope to the
 * `.terminal-notice` class instead, mirroring `helpers/terminal.ts`'s `dropNotice` for a
 * live `TerminalSurface`.
 */
export function deadSurfaceNotice(deadSurfaceRoot: Locator): Locator {
  return deadSurfaceRoot.locator(".terminal-notice");
}

/**
 * The shell surface's container, per the Testable UI Elements row: same
 * `.terminal-surface` component as the Claude pane, `aria-label="Shell: <title>"`
 * (distinct prefix from `helpers/terminal.ts`'s `terminalRegion`'s `"Terminal: "`).
 */
export function shellSurfaceRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Shell: ${title}"]`);
}

/**
 * The `muster-<id>-shell` tmux session name (Protocol Contract / REQ-1) — the single
 * definition every test in this file uses, mirroring the daemon's own
 * `ShellSessionName(id)` (plan Affected Files: `internal/tmux/tmux.go`). Never re-derive
 * this string ad hoc elsewhere in a test.
 */
export function shellTmuxTarget(sessionId: number): string {
  return `muster-${sessionId}-shell`;
}

/**
 * `POST /api/sessions/{id}/shell` directly (Protocol Contract) — used to build a
 * "shell already running" starting configuration without re-deriving it through a
 * segment click in every test that needs one, mirroring `helpers/railorder.ts`'s
 * `pinViaApi`. Returns the decoded 200 body; throws on anything else so a caller's own
 * setup failure is never silently swallowed.
 */
export async function createShellViaApi(
  page: Page,
  daemonBaseURL: string,
  sessionId: number,
): Promise<{ target: string; created: boolean }> {
  const res = await page.request.post(`${daemonBaseURL}/api/sessions/${sessionId}/shell`);
  if (res.status() !== 200) {
    throw new Error(`POST .../shell failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { target: string; created: boolean };
}

/**
 * Tracks open `/ws/shell/` sockets — same shape as `helpers/terminal.ts`'s
 * `TerminalSocketTracker`, scoped to the shell route so a test can assert INV-3 (a
 * session's Claude socket and its shell socket are independent attach targets) without
 * the two trackers ever double-counting each other's opens. Must be constructed before
 * the action that opens the socket(s) under test (Playwright's `websocket` event only
 * fires for connections made after the listener is registered).
 */
export class ShellSocketTracker {
  private openSockets = new Set<WebSocket>();
  private opened = 0;

  constructor(page: Page) {
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/ws/shell/")) return;
      this.opened += 1;
      this.openSockets.add(ws);
      ws.on("close", () => this.openSockets.delete(ws));
      ws.on("socketerror", () => this.openSockets.delete(ws));
    });
  }

  get liveCount(): number {
    return this.openSockets.size;
  }

  /** Cumulative opens since construction — see `TerminalSocketTracker.totalOpened`'s
   * same rationale (a net gauge back at zero after open-then-close isn't "never opened"). */
  get totalOpened(): number {
    return this.opened;
  }
}

/**
 * Waits for the mainhead's `shell` segment to become selected (`aria-pressed="true"`)
 * with a pip present — the settled "a shell is running and is the visible surface" state
 * — using `expect.poll`-free `expect(locator)` matchers directly, since both are DOM
 * attributes Playwright already retries on.
 */
export async function expectMainheadShellSelectedAndRunning(page: Page): Promise<void> {
  const shellBtn = mainheadSurfaceButton(page, "shell");
  await expect(shellBtn).toHaveAttribute("aria-pressed", "true");
  await expect(shellPip(shellBtn)).toHaveCount(1);
}

/**
 * Review Major 3 / decision `shell-pip-hue`: asserts a lit pip's computed
 * `background-color` resolves to the page's own `--shell-pip` custom property, and that
 * this differs from `--teal` — pinning that the design-system decision (Option B: the
 * pip gets its own token instead of reusing `--teal`, which §3 reserves for the Working
 * state) actually shipped, in whichever theme the page is currently rendering. Resolves
 * both tokens through a throwaway probe element in the SAME document (so the browser's
 * own `var()` resolution and colour-format normalisation apply identically to the token
 * and to the pip), rather than comparing the pip's `rgb(...)` against the token's `#hex`
 * string literally.
 */
export async function expectPipUsesShellPipToken(pip: Locator): Promise<void> {
  const pipColor = await pip.evaluate((el) => getComputedStyle(el).backgroundColor);
  const tokens = await pip.page().evaluate(() => {
    const probe = document.createElement("div");
    probe.style.display = "none";
    document.body.appendChild(probe);
    probe.style.backgroundColor = "var(--shell-pip)";
    const shellPipToken = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = "var(--teal)";
    const tealToken = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { shellPipToken, tealToken };
  });
  expect(pipColor).toBe(tokens.shellPipToken);
  expect(pipColor).not.toBe(tokens.tealToken);
}
