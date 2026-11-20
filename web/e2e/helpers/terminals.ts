// Helpers for the several-terminals-per-session journeys (plan better-terminal).
//
// The surface switch reads `claude | shell | ▾ | docs` in the Focus mainhead and in every
// tile footer — one component, so every locator here takes a `TerminalHost` (the page plus
// the `.surfseg` group of the host under test) and works in both. Roles and names are the
// plan's Testable UI Elements table exactly: the ▾ opener is `button` "Terminals", its panel
// `dialog` "Terminals", a row is the `button` named for the terminal, ✎ and × are
// `Rename <name>` / `Close <name>`, the field is `textbox` "Terminal name", and the confirm
// is `dialog` "Close <name>?" with `Close terminal` / `Cancel`. The count is `span.shellcount`
// inside the `shell` button.
//
// tmux and `GET /api/state` are the independent oracles for what the daemon holds; neither
// is ever a state source for the dashboard. `tmuxSendKeys` is a stimulus (it types into a
// terminal without moving focus, so a panel can stay open while a command starts), never an
// oracle.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import {
  mainheadSurfaceGroup,
  shellSurfaceRegion,
  shellTmuxTarget,
  tileSurfaceGroup,
} from "./shell";
import { lastNonBlankLine, tmuxCapturePane } from "./shellinput";

const execFileAsync = promisify(execFile);

export interface TerminalHost {
  page: Page;
  group: Locator;
}

export function focusHost(page: Page): TerminalHost {
  return { page, group: mainheadSurfaceGroup(page) };
}

export function tileHost(page: Page, sessionId: number): TerminalHost {
  return { page, group: tileSurfaceGroup(page, sessionId) };
}

export function claudeButton(host: TerminalHost): Locator {
  return host.group.getByRole("button", { name: "claude", exact: true });
}

export function shellButton(host: TerminalHost): Locator {
  return host.group.getByRole("button", { name: "shell", exact: true });
}

export function docsButton(host: TerminalHost): Locator {
  return host.group.getByRole("button", { name: "docs", exact: true });
}

export function terminalsOpener(host: TerminalHost): Locator {
  return host.group.getByRole("button", { name: "Terminals", exact: true });
}

/** `span.shellcount` inside the `shell` button; absent (not hidden) below two terminals. */
export function shellCount(host: TerminalHost): Locator {
  return shellButton(host).locator("span.shellcount");
}

export function terminalsPanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "Terminals", exact: true });
}

export function terminalRow(page: Page, name: string): Locator {
  return terminalsPanel(page).getByRole("button", { name, exact: true });
}

/** The row container: the row button's parent, which holds the name, the state word, ✎ and ×. */
export function terminalRowBox(page: Page, name: string): Locator {
  return terminalRow(page, name).locator("xpath=..");
}

export function renameButton(page: Page, name: string): Locator {
  return terminalsPanel(page).getByRole("button", { name: `Rename ${name}`, exact: true });
}

export function closeButton(page: Page, name: string): Locator {
  return terminalsPanel(page).getByRole("button", { name: `Close ${name}`, exact: true });
}

export function renameField(page: Page): Locator {
  return terminalsPanel(page).getByRole("textbox", { name: "Terminal name", exact: true });
}

export function newTerminalButton(page: Page): Locator {
  return terminalsPanel(page).getByRole("button", { name: "New terminal", exact: true });
}

export function closeConfirm(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name: `Close ${name}?`, exact: true });
}

export function closeConfirmButton(page: Page, name: string): Locator {
  return closeConfirm(page, name).getByRole("button", { name: "Close terminal", exact: true });
}

export function closeCancelButton(page: Page, name: string): Locator {
  return closeConfirm(page, name).getByRole("button", { name: "Cancel", exact: true });
}

/** Opens ▾ when it is not already open (a click, as a user would) and waits for the panel. */
export async function openPanel(host: TerminalHost): Promise<void> {
  const opener = terminalsOpener(host);
  if ((await opener.getAttribute("aria-expanded")) !== "true") await opener.click();
  await expect(terminalsPanel(host.page)).toBeVisible();
}

/** ▾ → New terminal; resolves with the 201 body of `POST …/shells`. */
export async function newTerminal(
  host: TerminalHost,
): Promise<{ target: string; n: number; name: string; rev: number }> {
  await openPanel(host);
  const created = host.page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /^\/api\/sessions\/\d+\/shells$/.test(new URL(res.url()).pathname),
  );
  await newTerminalButton(host.page).click();
  const res = await created;
  expect(res.status()).toBe(201);
  return (await res.json()) as { target: string; n: number; name: string; rev: number };
}

/**
 * A terminal route's `rev` (docs/protocol.md sessions.shell § Revisions): an integer >= 0,
 * and >= `floor` — pass 1 once the call's own change has been broadcast. Returns it so a
 * caller can compare it with the reply before.
 */
export function replyRev(body: { rev?: unknown }, floor = 0): number {
  expect(Number.isInteger(body.rev)).toBe(true);
  expect(body.rev as number).toBeGreaterThanOrEqual(floor);
  return body.rev as number;
}

/** ▾ → the row for `name`: the panel closes and that terminal is shown. */
export async function chooseRow(host: TerminalHost, name: string): Promise<void> {
  await openPanel(host);
  await terminalRow(host.page, name).click();
  await expect(terminalsPanel(host.page)).toBeHidden();
}

/** ▾ → hover the row → ✎ → type → Enter. The new text replaces the prefilled, selected name. */
export async function renameTerminal(
  host: TerminalHost,
  name: string,
  newName: string,
): Promise<void> {
  await openPanel(host);
  await terminalRow(host.page, name).hover();
  await renameButton(host.page, name).click();
  await expect(renameField(host.page)).toBeFocused();
  if (newName === "") await host.page.keyboard.press("Backspace");
  else await host.page.keyboard.type(newName);
  await host.page.keyboard.press("Enter");
  await expect(renameField(host.page)).toHaveCount(0);
}

/** ▾ → hover the row → ×. The caller handles a confirm for a busy terminal. */
export async function clickClose(host: TerminalHost, name: string): Promise<void> {
  await openPanel(host);
  await terminalRow(host.page, name).hover();
  await closeButton(host.page, name).click();
}

/** The shell surface is on screen for terminal `name`: `shell` selected and titled for it. */
export async function expectShown(
  host: TerminalHost,
  name: string,
  region: Locator,
): Promise<void> {
  await expect(shellButton(host)).toHaveAttribute("aria-pressed", "true");
  await expect(shellButton(host)).toHaveAttribute("title", name);
  await expect(region).toBeVisible({ timeout: 15_000 });
}

/** Clicks into a surface and sends a line with real keys. Not exported: a terminal is typed into
 * only through `typeInTerminal`, which waits until the keys can reach its shell. */
async function pressLine(page: Page, region: Locator, command: string): Promise<void> {
  await region.click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

/** Types a line into the Claude pane. The caller has already seen the stub's `MUSTER-STUB-READY`
 * and a live socket, the Claude surface's own readiness signal. */
export async function typeInClaudePane(page: Page, region: Locator, line: string): Promise<void> {
  await pressLine(page, region, line);
}

/** One terminal of one session: `n` is its number, `name` what the switch's title reads. */
export interface TerminalRef {
  sessionId: number;
  n: number;
  name: string;
}

/**
 * Keys typed into a terminal reach its shell only when three things hold, and none is visible
 * from a count or a title: the surface for `name` is on screen, the daemon holds an attached
 * client on its tmux session (`pane.ts` drops input until the socket is OPEN, and the daemon
 * attaches when the socket opens), and the shell has drawn its prompt (keys sent before the
 * shell reads stdin sit unrun). The prompt's first token must also reach the browser's own
 * surface, which shows the socket is delivering frames to this xterm and not to a
 * still-mounted sibling. Every type-after-spawn or type-after-switch waits here first.
 */
export async function awaitTerminalReady(
  host: TerminalHost,
  daemon: ScratchDaemon,
  terminal: TerminalRef,
  region: Locator,
): Promise<void> {
  await expectShown(host, terminal.name, region);
  const target = shellTmuxTarget(terminal.sessionId, terminal.n);
  await expect
    .poll(async () => Number(await daemon.tmuxDisplay(target, "#{session_attached}")) >= 1, {
      message: `a client is attached to ${target}`,
    })
    .toBe(true);
  let prompt = "";
  await expect
    .poll(
      async () => {
        const line = lastNonBlankLine(await tmuxCapturePane(daemon, target)).trim();
        prompt = line.split(/\s+/)[0] ?? "";
        return prompt;
      },
      { message: `${target}'s shell has drawn its prompt` },
    )
    .not.toBe("");
  await expect(region).toContainText(prompt, { timeout: 15_000 });
}

/** Waits until `terminal` is on screen, attached and at its prompt, then types like a user. */
export async function typeInTerminal(
  host: TerminalHost,
  daemon: ScratchDaemon,
  terminal: TerminalRef,
  region: Locator,
  command: string,
): Promise<void> {
  await awaitTerminalReady(host, daemon, terminal, region);
  await pressLine(host.page, region, command);
}

export { shellSurfaceRegion };

// ── oracles ────────────────────────────────────────────────────────────────────────────

export interface TerminalEntry {
  n: number;
  name: string;
  busy: boolean;
}

/** `GET /api/state`'s `terminals[<id>]` — the daemon's own list (snapshot shape). */
export async function stateTerminals(
  page: Page,
  daemon: ScratchDaemon,
  sessionId: number,
): Promise<TerminalEntry[]> {
  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  if (res.status() !== 200) throw new Error(`GET /api/state failed: ${res.status()}`);
  const body = (await res.json()) as { terminals?: Record<string, TerminalEntry[]> };
  return body.terminals?.[String(sessionId)] ?? [];
}

/** Every terminal tmux session of one session id on the daemon's socket, sorted. */
export async function tmuxTerminalTargets(
  daemon: ScratchDaemon,
  sessionId: number,
): Promise<string[]> {
  const pattern = new RegExp(`^muster-${sessionId}-shell(-\\d+)?$`);
  return (await daemon.tmuxSessions()).filter((name) => pattern.test(name)).sort();
}

/** Every terminal tmux session of any session on the socket. */
export async function tmuxAllTerminalTargets(daemon: ScratchDaemon): Promise<string[]> {
  return (await daemon.tmuxSessions()).filter((name) => /^muster-\d+-shell(-\d+)?$/.test(name));
}

/** The foreground command tmux reports for a terminal's pane (`sleep` while one runs). */
export async function tmuxForegroundCommand(
  daemon: ScratchDaemon,
  sessionId: number,
  n: number,
): Promise<string> {
  return await daemon.tmuxDisplay(shellTmuxTarget(sessionId, n), "#{pane_current_command}");
}

/** Types into a terminal through tmux — a stimulus that never moves browser focus. */
export async function tmuxSendKeys(
  daemon: ScratchDaemon,
  sessionId: number,
  n: number,
  ...keys: string[]
): Promise<void> {
  await execFileAsync("tmux", [
    "-S",
    daemon.tmuxSocket,
    "send-keys",
    "-t",
    shellTmuxTarget(sessionId, n),
    ...keys,
  ]);
}

/**
 * INV-2: this window's open panel rows and count equal the daemon's list. Both sides are
 * re-read inside the retry so a stale display times out instead of passing. The panel must
 * be open in `host.page`.
 */
export async function panelMatchesDaemon(
  host: TerminalHost,
  daemon: ScratchDaemon,
  sessionId: number,
): Promise<string> {
  const list = await stateTerminals(host.page, daemon, sessionId);
  const panel = terminalsPanel(host.page);
  if ((await panel.count()) === 0) return "panel not open";
  const rows = await panel.getByRole("button", { name: /^Rename / }).count();
  if (rows !== list.length) return `rows ${rows} vs daemon ${list.length}`;
  for (const entry of list) {
    const present = await terminalRow(host.page, entry.name).count();
    if (present !== 1) return `row "${entry.name}" present ${present} times`;
  }
  const counts = await shellCount(host).count();
  if (list.length >= 2) {
    if (counts !== 1) return `count missing for ${list.length} terminals`;
    const text = (await shellCount(host).textContent())?.trim();
    if (text !== String(list.length)) return `count ${text} vs daemon ${list.length}`;
  } else if (counts !== 0) {
    return `count shown for ${list.length} terminals`;
  }
  const tmux = await tmuxTerminalTargets(daemon, sessionId);
  if (tmux.length !== list.length) return `tmux ${tmux.length} vs daemon ${list.length}`;
  return "ok";
}
