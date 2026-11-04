// Helpers for claude-restart.spec.ts (plan restart-latest-claude): sessions bound to a
// scratch daemon whose stub `claude` answers `--version` with INSTALLED, each reporting an
// older running version through a synthesized status-line POST, plus the locators for the
// masthead readout's notice button, its panel and the restart confirm dialog.
//
// Locators are transcribed from the plan's Testable UI Elements table: role + accessible name
// where it pins one (the notice button, Ignore, Restart…, the dialog and its two buttons),
// text where it does not (the panel head, count rows, headings, dialog rows). The panel and
// the dialog rows carry no pinned role or id, so they are reached from their pinned text
// (the panel is the nearest ancestor of its head that mentions "Restart"; a row is the parent
// of its title element) rather than from a guessed tag.
//
// The status-line `version` is a top-level key of the status post (kb:fact/status-version-matches-installed,
// kb:fact/running-session-version-sources); the builders in payloads.ts hardcode one value, so
// `postRunningVersion` overrides that single key on the envelope's payload and nothing else.
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  type ScratchDaemon,
} from "./fixtures";
import {
  envelopedSessionStart,
  envelopedStatusLineFull,
  rawStop,
  rawUserPromptSubmit,
  runningShellTask,
} from "./payloads";
import { getState, launchSession, type SessionObject } from "./session";

export { claudeVersionReadout, versionReadoutPattern, waitForHello } from "./connection";

/** What the daemon's stub `claude` answers to `--version`: the installed version every test here compares against. */
export const INSTALLED = "2.1.318";

/** The daemon's wire fields this plan adds to the Session object (kb:anchor/ws.session delta). */
export interface RestartWire {
  alive: boolean;
  state: string;
  backgroundTasks: number;
  claudeSessionId: string | null;
  claudeVersion: { running: string; behind: boolean } | null;
  restartPending: boolean;
}

/** The phase a test wants a freshly bound session left in. */
export type Phase = "idle" | "working" | "idleWithTask";

export interface RestartSession {
  session: SessionObject;
  title: string;
  claudeId: string;
}

/** The daemon's own view of one session, restricted to the fields restart reads. */
export async function wire(page: Page, daemon: ScratchDaemon, id: number): Promise<RestartWire> {
  const found = (await getState(page, daemon)).sessions.find((s) => s.id === id);
  if (!found) throw new Error(`session ${id} not found in state snapshot`);
  return found as unknown as RestartWire;
}

/** The real tmux pane id of the session's window right now (never memoised: a restart replaces the pane). */
export async function paneId(daemon: ScratchDaemon, s: RestartSession): Promise<string> {
  return await daemon.tmuxDisplay(s.session.tmuxTarget, "#{pane_id}");
}

/** The pane's id and process id: unlike the id alone it differs across a tmux server restart (a fresh server numbers its first pane `%0` again). */
export async function paneIdentity(daemon: ScratchDaemon, s: RestartSession): Promise<string> {
  return await daemon.tmuxDisplay(s.session.tmuxTarget, "#{pane_id}/#{pane_pid}");
}

/** Posts one status line reporting `version`, routed through the session's current pane. */
export async function postRunningVersion(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  s: RestartSession,
  version: string,
  opts: { contextUsedPct?: number } = {},
): Promise<void> {
  const env = envelopedStatusLineFull(s.claudeId, {
    musterSession: s.session.id,
    tmuxPane: await paneId(daemon, s),
    ...(opts.contextUsedPct !== undefined ? { contextUsedPct: opts.contextUsedPct } : {}),
  });
  (env.payload as Record<string, unknown>).version = version;
  const res = await request.post(daemon.ingestURL("status"), { data: env });
  expect(res.status(), "the ingest endpoint acknowledges every status post with 200").toBe(200);
}

async function postHook(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await request.post(daemon.ingestURL("hook"), { data: payload });
  expect(res.status(), "the ingest endpoint acknowledges every hook with 200").toBe(200);
}

/**
 * Launches a titled session through the real `POST /api/sessions`, binds it with an enveloped
 * `SessionStart`, posts the status line that reports `version`, and drives it to `phase`.
 * Returns once the daemon's own state shows the version and the phase.
 */
export async function openSession(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  directory: string,
  title: string,
  version: string,
  phase: Phase,
): Promise<RestartSession> {
  const session = await launchSession(page, daemon, { directory, title });
  const claudeId = `claude-${title}`;
  const s: RestartSession = { session, title, claudeId };
  await postHook(
    request,
    daemon,
    envelopedSessionStart(claudeId, {
      musterSession: session.id,
      tmuxPane: await paneId(daemon, s),
    }),
  );
  await postRunningVersion(request, daemon, s, version);
  await postHook(request, daemon, rawUserPromptSubmit(claudeId, { promptId: "p1" }));
  if (phase !== "working") {
    await postHook(
      request,
      daemon,
      rawStop(claudeId, {
        promptId: "p1",
        backgroundTasks: phase === "idleWithTask" ? [runningShellTask()] : [],
      }),
    );
  }
  await expect
    .poll(async () => {
      const w = await wire(page, daemon, session.id);
      return `${w.state}/${w.backgroundTasks}/${w.claudeVersion?.running}`;
    })
    .toBe(
      `${phase === "working" ? "working" : "idle"}/${phase === "idleWithTask" ? 1 : 0}/${version}`,
    );
  return s;
}

/** The turn's `Stop` with `tasks` background tasks still running (0 = the session is free). */
export async function stopTurn(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  s: RestartSession,
  tasks: number,
): Promise<void> {
  await postHook(
    request,
    daemon,
    rawStop(s.claudeId, {
      promptId: "p1",
      backgroundTasks: tasks === 0 ? [] : [runningShellTask()],
    }),
  );
}

/**
 * Waits until the daemon has replaced the session's pane (the Stop-then-Resume ran) and the row is alive again, in place.
 * `identityBefore` is `paneIdentity()` taken before the restart: a lone session's restart also
 * restarts the tmux server, whose first pane is `%0` again, so the pane id alone cannot tell the
 * new pane from the old. Resume also mints a new window id under the same tmux session, so the
 * row's tmux target is re-read from the daemon and kept on `s` for the oracles that follow.
 */
export async function expectRestartedInPlace(
  page: Page,
  daemon: ScratchDaemon,
  s: RestartSession,
  identityBefore: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const w = await wire(page, daemon, s.session.id);
        if (!w.alive) return "not alive yet";
        const target = (w as unknown as { tmuxTarget: string }).tmuxTarget;
        try {
          if (!(await daemon.tmuxPaneExists(target))) return "not alive yet";
          const now = await daemon.tmuxDisplay(target, "#{pane_id}/#{pane_pid}");
          // Mid-restart, with other sessions on the socket, tmux answers a killed target with empty fields rather than an error.
          if (!/^%\d+\/\d+$/.test(now)) return "not alive yet";
          if (now === identityBefore) return "same pane";
          s.session.tmuxTarget = target;
          return "restarted";
        } catch {
          // Stop killed the socket's only session, so the tmux server is gone until Resume starts a new one.
          return "not alive yet";
        }
      },
      { message: `${s.title}: the session's pane is replaced and the row is alive again` },
    )
    .toBe("restarted");
  const w = await wire(page, daemon, s.session.id);
  expect(w.claudeVersion, `${s.title}: a restart clears the running version`).toBeNull();
  expect(w.restartPending, `${s.title}: the restart cleared the pending mark`).toBe(false);
}

/** The masthead readout as the notice button (`aria-label` "Claude Code update"). */
export function noticeButton(page: Page): Locator {
  return page.getByRole("button", { name: "Claude Code update" });
}

/** The panel's head: the text `Claude Code <installed>`. */
export function panelHead(page: Page): Locator {
  return page.getByText(`Claude Code ${INSTALLED}`, { exact: true });
}

/**
 * The readout panel: the nearest ancestor of its head that mentions "Restart" (a count row,
 * a heading or the Restart… button — every non-empty panel has one).
 */
export function panel(page: Page): Locator {
  return panelHead(page).locator("xpath=ancestor::*[contains(., 'Restart')][1]");
}

/** A panel count row (`Restart now` / `Restart when free`): the parent of its label, which also holds the count. */
export function panelCountRow(page: Page, label: "Restart now" | "Restart when free"): Locator {
  return panel(page).getByText(label, { exact: true }).locator("xpath=..");
}

export function ignoreButton(page: Page): Locator {
  return page.getByRole("button", { name: "Ignore", exact: true });
}

export function panelRestartButton(page: Page): Locator {
  return page.getByRole("button", { name: "Restart…", exact: true });
}

/** `dialog.modal.confirm` named by its h2. */
export function restartDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: `Restart sessions on Claude Code ${INSTALLED}` });
}

/** A dialog section: `<details><summary>` whose summary reads `label · count`. */
export function dialogSection(dialog: Locator, label: string): Locator {
  return dialog
    .locator("details")
    .filter({ has: dialog.page().locator("summary", { hasText: label }) });
}

/** The row of a session inside `scope`: the parent of its title element (title and reason are separate elements). */
export function rowOf(scope: Locator, title: string): Locator {
  return scope.getByText(title, { exact: true }).locator("xpath=..");
}

export function confirmButton(dialog: Locator): Locator {
  return dialog.getByRole("button", {
    name: /^(Restart \d+, queue \d+|Restart \d+|Queue \d+)$/,
  });
}

/** Opens the panel with the pointer, then the dialog through Restart…; returns the dialog. */
export async function openRestartDialog(page: Page): Promise<Locator> {
  await noticeButton(page).click();
  await panelRestartButton(page).click();
  const dialog = restartDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The `POST /api/sessions/restart` response body, captured while `confirm` runs. */
export async function confirmAndCapture(
  page: Page,
  confirm: () => Promise<void>,
): Promise<{
  ids: number[];
  result: { done: number[]; queued: number[]; skipped: number[]; failed: number[] };
}> {
  const isRestart = (url: string, method: string) =>
    new URL(url).pathname === "/api/sessions/restart" && method === "POST";
  const requestPromise = page.waitForRequest((r) => isRestart(r.url(), r.method()));
  const responsePromise = page.waitForResponse((r) => isRestart(r.url(), r.request().method()));
  await confirm();
  const request = await requestPromise;
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return {
    ids: (request.postDataJSON() as { ids: number[] }).ids,
    result: (await response.json()) as {
      done: number[];
      queued: number[];
      skipped: number[];
      failed: number[];
    },
  };
}
