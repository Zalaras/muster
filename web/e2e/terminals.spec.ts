import { expect, settleFor, test } from "./helpers/fixtures";
import type { Page, ScratchDaemon } from "./helpers/fixtures";
import { envelopedSessionStart } from "./helpers/payloads";
import { readerRegion } from "./helpers/reader";
import { railCard } from "./helpers/railorder";
import {
  envelopeOpts,
  getState,
  launchSession,
  type SessionObject,
  scratchDirectory,
} from "./helpers/session";
import { ShellSocketTracker, shellTmuxTarget } from "./helpers/shell";
import { shellActivityIndicator } from "./helpers/shellinput";
import {
  chooseRow,
  claudeButton,
  clickClose,
  closeCancelButton,
  closeConfirm,
  closeConfirmButton,
  closeButton,
  docsButton,
  focusHost,
  newTerminal,
  newTerminalButton,
  openPanel,
  panelMatchesDaemon,
  renameButton,
  renameField,
  renameTerminal,
  expectShown,
  shellButton,
  shellCount,
  shellSurfaceRegion,
  stateTerminals,
  terminalRow,
  terminalRowBox,
  terminalsOpener,
  terminalsPanel,
  tileHost,
  tmuxAllTerminalTargets,
  tmuxForegroundCommand,
  tmuxSendKeys,
  tmuxTerminalTargets,
  type TerminalRef,
  typeInClaudePane,
  typeInTerminal,
} from "./helpers/terminals";
import { liveTileById, TerminalSocketTracker, terminalRegion } from "./helpers/terminal";

// Several terminals per session: add, switch, rename and close from the ▾ Terminals panel
// beside the `shell` segment (plan better-terminal).
//
// Fixture plan: `daemon` per test throughout — the kill-shutdown journeys restart the daemon,
// the reload and second-window journeys read daemon-held names, and every test asserts the
// daemon-global tmux list. The kill-shutdown test takes its `-on-exit=kill` policy from
// `test.use({ daemonOptions })` on its describe, not from a hand-rolled daemon.
//
// A terminal is a REAL interactive `$SHELL` (never the `-claude-bin` stub), exactly as in
// plain-shell.spec.ts; Claude Code itself is never started. `sleep N` is the silent foreground
// command whose busy-ness comes from tmux process state. Terminals are numbered from 1 and
// named `shell N` until renamed. What the panel, count and opener look like for a given list
// (order, nine-row scroll, tile-footer fit at 3×2, the disabled opener) is a render test in
// web/render/surfaces.spec.ts; the journeys here are the ones that need the daemon.

interface Started {
  session: SessionObject;
  title: string;
}

async function startSession(
  page: Page,
  daemon: ScratchDaemon,
  title: string,
  directory: string,
): Promise<Started> {
  await page.goto(daemon.dashboardUrl);
  const session = await launchSession(page, daemon, { directory, title });
  await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
  return { session, title };
}

/** Focus view: `shell` (spawning terminal 1), then New terminal until `count` run. */
async function startWithTerminals(
  page: Page,
  daemon: ScratchDaemon,
  title: string,
  directory: string,
  count: number,
): Promise<Started> {
  const started = await startSession(page, daemon, title, directory);
  const host = focusHost(page);
  await shellButton(host).click();
  await expect(shellSurfaceRegion(page, title)).toBeVisible({ timeout: 15_000 });
  for (let n = 2; n <= count; n += 1) await newTerminal(host);
  if (count >= 2) await expect(shellCount(host)).toHaveText(String(count));
  return started;
}

/** Terminal `n` of a session under its default name — what `typeInTerminal` waits on. */
function shell(sessionId: number, n: number): TerminalRef {
  return { sessionId, n, name: `shell ${n}` };
}

async function expectNoTerminals(daemon: ScratchDaemon, sessionId: number): Promise<void> {
  await expect.poll(() => tmuxTerminalTargets(daemon, sessionId)).toEqual([]);
}

test("New terminal from the panel spawns shell 2 in the session directory, shows it, and leaves terminal 1's command running (REQ-1, REQ-8, REQ-9, REQ-12, E1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e1";
    const { session } = await startSession(page, daemon, title, dir);
    const host = focusHost(page);

    const names = ["claude", "shell", "Terminals", "docs"];
    for (const [i, name] of names.entries()) {
      await expect(host.group.getByRole("button").nth(i)).toHaveAccessibleName(name);
    }
    await expect(shellCount(host)).toHaveCount(0);

    await shellButton(host).click();
    const region = shellSurfaceRegion(page, title);
    await expect(region).toBeVisible({ timeout: 15_000 });
    await typeInTerminal(host, daemon, shell(session.id, 1), region, "sleep 600");
    await expect.poll(() => tmuxForegroundCommand(daemon, session.id, 1)).toBe("sleep");

    await openPanel(host);
    await expect(terminalRow(page, "shell 1")).toHaveAttribute("aria-current", "true");
    await expect(terminalRowBox(page, "shell 1")).toContainText("running");

    const created = await newTerminal(host);
    expect(created).toEqual({ target: shellTmuxTarget(session.id, 2), n: 2, name: "shell 2" });

    await expect(terminalsPanel(page)).toBeHidden();
    await expectShown(host, "shell 2", region);
    await expect(shellButton(host)).toHaveAccessibleName("shell");
    await expect(shellCount(host)).toHaveText("2");

    await typeInTerminal(host, daemon, shell(session.id, 2), region, "pwd");
    await expect(region).toContainText(dir, { timeout: 15_000 });

    expect(await daemon.tmuxSessions()).toEqual(
      expect.arrayContaining([shellTmuxTarget(session.id, 1), shellTmuxTarget(session.id, 2)]),
    );
    expect(await tmuxForegroundCommand(daemon, session.id, 1)).toBe("sleep");
    await openPanel(host);
    await expect(terminalRowBox(page, "shell 1")).toContainText("running");
    await expect(terminalRowBox(page, "shell 2")).toContainText("idle");
    await expect(terminalRow(page, "shell 2")).toHaveAttribute("aria-current", "true");
  } finally {
    await cleanup();
  }
});

test("choosing a row shows that terminal with its own earlier output, and the command left running keeps running (REQ-2, E2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e2";
    const { session } = await startSession(page, daemon, title, dir);
    const host = focusHost(page);
    await shellButton(host).click();
    const region = shellSurfaceRegion(page, title);
    await expect(region).toBeVisible({ timeout: 15_000 });
    await typeInTerminal(host, daemon, shell(session.id, 1), region, "echo T1-MARK-e2");
    await expect(region).toContainText("T1-MARK-e2");
    await typeInTerminal(host, daemon, shell(session.id, 1), region, "sleep 600");
    await expect.poll(() => tmuxForegroundCommand(daemon, session.id, 1)).toBe("sleep");

    await newTerminal(host);
    await expectShown(host, "shell 2", region);
    await typeInTerminal(host, daemon, shell(session.id, 2), region, "echo T2-MARK-e2");
    await expect(region).toContainText("T2-MARK-e2");

    await chooseRow(host, "shell 1");
    await expectShown(host, "shell 1", region);
    await expect(region).toContainText("T1-MARK-e2");
    await expect(region).not.toContainText("T2-MARK-e2");
    expect(await tmuxForegroundCommand(daemon, session.id, 1)).toBe("sleep");

    await chooseRow(host, "shell 2");
    await expectShown(host, "shell 2", region);
    await expect(region).toContainText("T2-MARK-e2");
    await expect(region).not.toContainText("T1-MARK-e2");
  } finally {
    await cleanup();
  }
});

test("after claude is selected one click on shell shows the terminal last shown; a reload and a second window show the lowest-numbered (REQ-3, E3)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e3";
    await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    await expectShown(host, "shell 2", region);

    await claudeButton(host).click();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await expect(shellButton(host)).not.toHaveAttribute("title", /.+/);
    await shellButton(host).click();
    await expectShown(host, "shell 2", region);

    await chooseRow(host, "shell 1");
    await expectShown(host, "shell 1", region);
    await claudeButton(host).click();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await shellButton(host).click();
    await expectShown(host, "shell 1", region);

    await chooseRow(host, "shell 2");
    await expectShown(host, "shell 2", region);

    await page.reload();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await shellButton(host).click();
    await expectShown(host, "shell 1", region);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      await shellButton(focusHost(pageB)).click();
      await expectShown(focusHost(pageB), "shell 1", shellSurfaceRegion(pageB, title));
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("when the last-shown terminal ended while claude was selected shell shows the lowest-numbered running one, and with none running it starts one (REQ-3, E3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e3-gone";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);

    await claudeButton(host).click();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await daemon.killTmuxWindow(shellTmuxTarget(session.id, 2));
    await expect(shellCount(host)).toHaveCount(0);

    await shellButton(host).click();
    await expectShown(host, "shell 1", region);
    expect(await tmuxTerminalTargets(daemon, session.id)).toEqual([shellTmuxTarget(session.id, 1)]);

    await claudeButton(host).click();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await daemon.killTmuxWindow(shellTmuxTarget(session.id, 1));
    await expectNoTerminals(daemon, session.id);

    const started = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /^\/api\/sessions\/\d+\/shell$/.test(new URL(res.url()).pathname),
    );
    await shellButton(host).click();
    const res = await started;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ n: 1, created: true });
    await expectShown(host, "shell 1", region);
  } finally {
    await cleanup();
  }
});

test("renaming shows the name in the panel in every window, as the shell title, and across a reload (REQ-4, REQ-10, E4)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e4";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);
      await expect(shellCount(hostB)).toHaveText("2");
      await openPanel(hostB);

      await openPanel(host);
      await terminalRow(page, "shell 2").hover();
      await renameButton(page, "shell 2").click();
      await expect(renameField(page)).toBeFocused();
      await expect(renameField(page)).toHaveValue("shell 2");
      await page.keyboard.type("build");
      await expect(renameField(page)).toHaveValue("build");
      await page.keyboard.press("Enter");

      await expect(renameField(page)).toHaveCount(0);
      await expect(terminalRow(page, "build")).toBeVisible();
      await expect(terminalRow(page, "shell 2")).toHaveCount(0);
      await expectShown(host, "build", region);
      await expect
        .poll(async () => (await stateTerminals(page, daemon, session.id)).map((t) => t.name))
        .toEqual(["shell 1", "build"]);

      await expect(terminalRow(pageB, "build")).toBeVisible();
      await expect(terminalRow(pageB, "shell 2")).toHaveCount(0);
    } finally {
      await contextB.close();
    }

    await page.reload();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await openPanel(host);
    await expect(terminalRow(page, "build")).toBeVisible();
    await expect(terminalRow(page, "shell 1")).toBeVisible();
    await expect(shellCount(host)).toHaveText("2");
  } finally {
    await cleanup();
  }
});

test("Esc and blur cancel a rename, an empty or whitespace-only save restores shell N, and the field stops at 40 characters (REQ-4, REQ-19, E4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e4-edit";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const names = async () => (await stateTerminals(page, daemon, session.id)).map((t) => t.name);

    await renameTerminal(host, "shell 2", "build");
    await expect.poll(names).toEqual(["shell 1", "build"]);

    await terminalRow(page, "build").hover();
    await renameButton(page, "build").click();
    await expect(renameField(page)).toBeFocused();
    await page.keyboard.type("zzz");
    await page.keyboard.press("Escape");
    await expect(renameField(page)).toHaveCount(0);
    await expect(terminalsPanel(page)).toBeVisible();
    await expect(terminalRow(page, "build")).toBeVisible();
    await expect(terminalRow(page, "zzz")).toHaveCount(0);

    await renameButton(page, "build").click();
    await expect(renameField(page)).toBeFocused();
    await page.keyboard.type("blurred");
    await page.keyboard.press("Tab");
    await expect(renameField(page)).toHaveCount(0);
    await expect(terminalRow(page, "build")).toBeVisible();
    await expect(terminalRow(page, "blurred")).toHaveCount(0);
    expect(await names()).toEqual(["shell 1", "build"]);

    await renameTerminal(host, "build", "");
    await expect(terminalRow(page, "shell 2")).toBeVisible();
    await expect.poll(names).toEqual(["shell 1", "shell 2"]);

    await renameTerminal(host, "shell 2", "build");
    await expect.poll(names).toEqual(["shell 1", "build"]);
    await renameTerminal(host, "build", "   ");
    await expect(terminalRow(page, "shell 2")).toBeVisible();
    await expect.poll(names).toEqual(["shell 1", "shell 2"]);

    await openPanel(host);
    await terminalRow(page, "shell 2").hover();
    await renameButton(page, "shell 2").click();
    await expect(renameField(page)).toBeFocused();
    await page.keyboard.type("a".repeat(45));
    await expect(renameField(page)).toHaveValue("a".repeat(40));
    await page.keyboard.press("Enter");
    await expect(terminalRow(page, "a".repeat(40))).toBeVisible();
    expect((await names())[1]).toBe("a".repeat(40));
  } finally {
    await cleanup();
  }
});

test("a rename in progress keeps its field, focus and typed text while another terminal's busy flip is broadcast (REQ-4, REQ-17)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-rename-tick";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);

    await openPanel(host);
    await terminalRow(page, "shell 2").hover();
    await renameButton(page, "shell 2").click();
    const field = renameField(page);
    await expect(field).toBeFocused();
    await field.evaluate((el) => {
      (el as HTMLElement & { __kept?: boolean }).__kept = true;
    });
    await page.keyboard.type("bu");

    await tmuxSendKeys(daemon, session.id, 1, "sleep 4", "Enter");
    await expect(terminalRowBox(page, "shell 1")).toContainText("running");
    await settleFor(page, 1_500);

    await expect(field).toBeFocused();
    await expect(field).toHaveValue("bu");
    expect(
      await field.evaluate(
        (el) =>
          document.activeElement === el &&
          (el as HTMLElement & { __kept?: boolean }).__kept === true,
      ),
    ).toBe(true);

    await page.keyboard.type("ild");
    await page.keyboard.press("Enter");
    await expect(terminalRow(page, "build")).toBeVisible();
    await expect(terminalRowBox(page, "shell 1")).toContainText("idle");
  } finally {
    await cleanup();
  }
});

test("× on an idle terminal ends it at once; × on a busy one asks first and ends it only on Close terminal (REQ-5, E8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e8";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    await typeInTerminal(host, daemon, shell(session.id, 2), region, "sleep 600");
    await openPanel(host);
    await expect(terminalRowBox(page, "shell 2")).toContainText("running");

    await clickClose(host, "shell 2");
    const dialog = closeConfirm(page, "shell 2");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "shell 2 is running a command. Closing it ends the command.",
    );
    expect(await tmuxTerminalTargets(daemon, session.id)).toContain(shellTmuxTarget(session.id, 2));

    const cancel = closeCancelButton(page, "shell 2");
    await cancel.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    expect(await tmuxTerminalTargets(daemon, session.id)).toContain(shellTmuxTarget(session.id, 2));
    await expect(terminalRowBox(page, "shell 2")).toContainText("running");

    await clickClose(host, "shell 2");
    await expect(dialog).toBeVisible();
    const confirm = closeConfirmButton(page, "shell 2");
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => tmuxTerminalTargets(daemon, session.id))
      .toEqual([shellTmuxTarget(session.id, 1)]);
    await expect(dialog).toBeHidden();
    await expect(shellCount(host)).toHaveCount(0);

    await newTerminal(host);
    await expect(shellCount(host)).toHaveText("2");
    await clickClose(host, "shell 1");
    await expect
      .poll(() => tmuxTerminalTargets(daemon, session.id))
      .toEqual([shellTmuxTarget(session.id, 2)]);
    await expect(closeConfirm(page, "shell 1")).toHaveCount(0);
    await expect(terminalRow(page, "shell 1")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("closing the terminal on screen in Focus shows the lowest-numbered other, and closing the last returns to claude (REQ-6, INV-5, E5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e5-focus";
    const { session } = await startWithTerminals(page, daemon, title, dir, 3);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    await expectShown(host, "shell 3", region);

    await clickClose(host, "shell 3");
    await expectShown(host, "shell 1", region);
    await expect(shellCount(host)).toHaveText("2");

    await chooseRow(host, "shell 2");
    await expectShown(host, "shell 2", region);
    await clickClose(host, "shell 2");
    await expectShown(host, "shell 1", region);
    await expect(shellCount(host)).toHaveCount(0);

    await clickClose(host, "shell 1");
    await expect(claudeButton(host)).toHaveAttribute("aria-pressed", "true");
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await expect(region).toHaveCount(0);
    await expect(shellButton(host)).not.toHaveAttribute("title", /.+/);
    await expectNoTerminals(daemon, session.id);

    await openPanel(host);
    await expect(terminalsPanel(page).getByRole("button", { name: /^shell \d+$/ })).toHaveCount(0);
    await expect(newTerminalButton(page)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("closing the terminal on screen in a tile shows the lowest-numbered other, and closing the last returns to claude (REQ-6, INV-5, E5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e5-tile";
    const { session } = await startSession(page, daemon, title, dir);
    await page.keyboard.press("Meta+Backslash");
    const tile = liveTileById(page, session.id);
    await expect(tile).toBeVisible();
    const host = tileHost(page, session.id);
    const region = tile.locator(`[aria-label="Shell: ${title}"]`);

    await shellButton(host).click();
    await expect(region).toBeVisible({ timeout: 15_000 });
    await newTerminal(host);
    await expectShown(host, "shell 2", region);
    await expect(shellCount(host)).toHaveText("2");

    await clickClose(host, "shell 2");
    await expectShown(host, "shell 1", region);
    await expect(shellCount(host)).toHaveCount(0);

    await clickClose(host, "shell 1");
    await expect(claudeButton(host)).toHaveAttribute("aria-pressed", "true");
    await expect(region).toHaveCount(0);
    await expect(tile.locator(`[aria-label="Terminal: ${title}"]`)).toBeVisible({
      timeout: 15_000,
    });
    await expectNoTerminals(daemon, session.id);
  } finally {
    await cleanup();
  }
});

test("exit typed in the terminal on screen drops its row from an open panel and the count in a second window, and the first window falls back (REQ-6, E6)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e6";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    await expectShown(host, "shell 2", region);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);
      await expect(shellCount(hostB)).toHaveText("2");
      await openPanel(hostB);
      await expect(terminalRow(pageB, "shell 2")).toBeVisible();

      await typeInTerminal(host, daemon, shell(session.id, 2), region, "exit");

      await expect(terminalRow(pageB, "shell 2")).toHaveCount(0);
      await expect(terminalRow(pageB, "shell 1")).toBeVisible();
      await expect(shellCount(hostB)).toHaveCount(0);
      await expect(terminalsPanel(pageB)).toBeVisible();
    } finally {
      await contextB.close();
    }

    await expectShown(host, "shell 1", region);
    await expect(shellCount(host)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a terminal killed outside Muster while docs is selected leaves the panel and count and the reader stays (REQ-6, edge 6, E6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e6-docs";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);

    await docsButton(host).click();
    await expect(readerRegion(page, title)).toBeVisible({ timeout: 15_000 });
    await openPanel(host);
    await expect(terminalRow(page, "shell 2")).toBeVisible();

    await daemon.killTmuxWindow(shellTmuxTarget(session.id, 2));

    await expect(terminalRow(page, "shell 2")).toHaveCount(0);
    await expect(shellCount(host)).toHaveCount(0);
    await expect(terminalsPanel(page)).toBeVisible();
    await expect(docsButton(host)).toHaveAttribute("aria-pressed", "true");
    await expect(readerRegion(page, title)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("with the panel open a command starting and finishing flips its row between idle and running without reopening (REQ-17, E9)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e9";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);

    await openPanel(host);
    await expect(terminalRowBox(page, "shell 1")).toContainText("idle");
    await expect(terminalRowBox(page, "shell 2")).toContainText("idle");

    await tmuxSendKeys(daemon, session.id, 1, "sleep 3", "Enter");
    await expect(terminalRowBox(page, "shell 1")).toContainText("running");
    await expect(terminalRowBox(page, "shell 2")).toContainText("idle");

    await expect(terminalRowBox(page, "shell 1")).toContainText("idle");
    await expect(terminalsPanel(page)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("the shell segment stays busy while any terminal is busy and turns to a tick only when the last one finishes (REQ-13, INV-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-inv4";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    await claudeButton(host).click();
    await expect(terminalRegion(page, title)).toBeVisible({ timeout: 15_000 });
    const indicator = shellActivityIndicator(shellButton(host));
    await expect(indicator).toHaveCount(0);

    await tmuxSendKeys(daemon, session.id, 1, "sleep 600", "Enter");
    await expect(indicator).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    await tmuxSendKeys(daemon, session.id, 2, "sleep 600", "Enter");
    await openPanel(host);
    await expect(terminalRowBox(page, "shell 2")).toContainText("running");

    await tmuxSendKeys(daemon, session.id, 1, "C-c");
    await expect(terminalRowBox(page, "shell 1")).toContainText("idle");
    await expect(terminalRowBox(page, "shell 2")).toContainText("running");
    await settleFor(page, 1_500);
    await expect(indicator).toHaveAttribute("data-act", "busy");

    await tmuxSendKeys(daemon, session.id, 2, "C-c");
    await expect(indicator).toHaveAttribute("data-act", "done", { timeout: 15_000 });
  } finally {
    await cleanup();
  }
});

test("ending one terminal leaves a sibling attached in another window and the Claude pane untouched (INV-1, D3)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-inv1-focus";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const claudeSockets = new TerminalSocketTracker(page);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      const shellSockets = new ShellSocketTracker(pageB);
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);
      await shellButton(hostB).click();
      const regionB = shellSurfaceRegion(pageB, title);
      await expectShown(hostB, "shell 1", regionB);
      await expect.poll(() => shellSockets.liveCount).toBe(1);

      await claudeButton(host).click();
      const claudeRegion = terminalRegion(page, title);
      await expect(claudeRegion).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
      await expect.poll(() => claudeSockets.liveCount).toBe(1);

      const res = await page.request.delete(
        `${daemon.baseURL}/api/sessions/${session.id}/shells/2`,
      );
      expect(res.status()).toBe(204);
      await expect
        .poll(() => tmuxTerminalTargets(daemon, session.id))
        .toEqual([shellTmuxTarget(session.id, 1)]);
      await expect(shellCount(hostB)).toHaveCount(0);

      await settleFor(page, 1_500);
      expect(shellSockets.liveCount).toBe(1);
      expect(claudeSockets.liveCount).toBe(1);
      await expect(regionB.getByText(/another window|disconnected/i)).toHaveCount(0);
      await typeInTerminal(hostB, daemon, shell(session.id, 1), regionB, "echo inv1-sibling-alive");
      await expect(regionB).toContainText("inv1-sibling-alive");

      await expect(terminalRegion(page, title)).toBeVisible();
      await typeInClaudePane(page, terminalRegion(page, title), "hello");
      await expect(terminalRegion(page, title)).toContainText("stub-echo:hello");
      const state = await getState(page, daemon);
      expect(state.sessions.find((s) => s.id === session.id)?.alive).toBe(true);
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("closing a terminal in one session's tile leaves another session's busy terminal and both Claude panes untouched (INV-1, D3)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "terminals-inv1-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "terminals-inv1-b",
    });
    await page.keyboard.press("Meta+Backslash");
    const tileA = liveTileById(page, sessionA.id);
    const tileB = liveTileById(page, sessionB.id);
    await expect(tileA).toBeVisible();
    await expect(tileB).toBeVisible();
    const hostA = tileHost(page, sessionA.id);
    const hostB = tileHost(page, sessionB.id);

    await shellButton(hostB).click();
    const regionB = tileB.locator('[aria-label="Shell: terminals-inv1-b"]');
    await expect(regionB).toBeVisible({ timeout: 15_000 });
    await typeInTerminal(hostB, daemon, shell(sessionB.id, 1), regionB, "sleep 600");
    const indicatorB = shellActivityIndicator(shellButton(hostB));
    await expect(indicatorB).toHaveAttribute("data-act", "busy", { timeout: 15_000 });

    await shellButton(hostA).click();
    const regionA = tileA.locator('[aria-label="Shell: terminals-inv1-a"]');
    await expect(regionA).toBeVisible({ timeout: 15_000 });
    await newTerminal(hostA);
    await expectShown(hostA, "shell 2", regionA);

    await clickClose(hostA, "shell 2");
    await expectShown(hostA, "shell 1", regionA);
    await expect
      .poll(() => tmuxTerminalTargets(daemon, sessionA.id))
      .toEqual([shellTmuxTarget(sessionA.id, 1)]);

    await settleFor(page, 1_500);
    await expect(shellButton(hostB)).toHaveAttribute("aria-pressed", "true");
    await expect(shellButton(hostB)).toHaveAttribute("title", "shell 1");
    await expect(indicatorB).toHaveAttribute("data-act", "busy");
    await expect(regionB.getByText(/another window|disconnected/i)).toHaveCount(0);
    expect(await tmuxTerminalTargets(daemon, sessionB.id)).toEqual([
      shellTmuxTarget(sessionB.id, 1),
    ]);
    expect(await tmuxForegroundCommand(daemon, sessionB.id, 1)).toBe("sleep");
    expect(await daemon.tmuxPaneExists(sessionA.tmuxTarget)).toBe(true);
    expect(await daemon.tmuxPaneExists(sessionB.tmuxTarget)).toBe(true);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("the same terminal in a second window supersedes the first, and a different terminal does not (REQ-1, edge 12, E10)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-e10";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const regionA = shellSurfaceRegion(page, title);
    await expectShown(focusHost(page), "shell 2", regionA);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);
      const regionB = shellSurfaceRegion(pageB, title);

      await chooseRow(hostB, "shell 1");
      await expectShown(hostB, "shell 1", regionB);
      await settleFor(page, 1_500);
      await expect(regionA.getByText(/another window/i)).toHaveCount(0);
      await typeInTerminal(
        focusHost(page),
        daemon,
        shell(session.id, 2),
        regionA,
        "echo e10-different-alive",
      );
      await expect(regionA).toContainText("e10-different-alive");

      await chooseRow(hostB, "shell 2");
      await expectShown(hostB, "shell 2", regionB);
      await expect(regionA.getByText(/another window/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("Remove of a session with three terminals ends all of them and leaves another session's terminal (REQ-7, INV-3, E7)", async ({
  page,
  daemon,
  request,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "terminals-e7-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "terminals-e7-b",
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-terminals-e7-a", await envelopeOpts(sessionA, daemon)),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${sessionA.id}/end`);
    expect(endRes.status()).toBe(200);

    const base = `${daemon.baseURL}/api/sessions`;
    expect((await page.request.post(`${base}/${sessionA.id}/shell`)).status()).toBe(200);
    expect((await page.request.post(`${base}/${sessionA.id}/shells`)).status()).toBe(201);
    expect((await page.request.post(`${base}/${sessionA.id}/shells`)).status()).toBe(201);
    expect((await page.request.post(`${base}/${sessionB.id}/shell`)).status()).toBe(200);
    expect(await tmuxTerminalTargets(daemon, sessionA.id)).toEqual([
      shellTmuxTarget(sessionA.id, 1),
      shellTmuxTarget(sessionA.id, 2),
      shellTmuxTarget(sessionA.id, 3),
    ]);
    await expect.poll(async () => (await stateTerminals(page, daemon, sessionA.id)).length).toBe(3);

    const removeRes = await page.request.delete(`${base}/${sessionA.id}`);
    expect(removeRes.status()).toBe(204);

    await expectNoTerminals(daemon, sessionA.id);
    expect(await tmuxTerminalTargets(daemon, sessionB.id)).toEqual([
      shellTmuxTarget(sessionB.id, 1),
    ]);
    await expect.poll(async () => (await stateTerminals(page, daemon, sessionA.id)).length).toBe(0);
    expect((await stateTerminals(page, daemon, sessionB.id)).map((t) => t.n)).toEqual([1]);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a daemon restart kills every terminal, closes an open panel, disables the switch while down and lists no terminals after reconnect (REQ-7, REQ-14, INV-3, edges 13 and 17)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-restart";
    const { session } = await startWithTerminals(page, daemon, title, dir, 3);
    const host = focusHost(page);
    await openPanel(host);
    await expect(terminalRow(page, "shell 3")).toBeVisible();
    expect(await tmuxTerminalTargets(daemon, session.id)).toHaveLength(3);

    await daemon.kill();

    await expect(terminalsOpener(host)).toBeDisabled();
    await expect(terminalsPanel(page)).toBeHidden();
    await expect(claudeButton(host)).toBeDisabled();
    await expect(shellButton(host)).toBeDisabled();
    await expect(docsButton(host)).toBeDisabled();

    await daemon.restart();

    await expect(page.getByRole("status")).toHaveText(/connected/i, { timeout: 15_000 });
    await expect(terminalsOpener(host)).toBeEnabled();
    await expect(shellCount(host)).toHaveCount(0);
    await expectNoTerminals(daemon, session.id);
    expect(await stateTerminals(page, daemon, session.id)).toEqual([]);

    await openPanel(host);
    await expect(terminalsPanel(page).getByRole("button", { name: /^shell \d+$/ })).toHaveCount(0);
    await expect(newTerminalButton(page)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test.describe("kill shutdown", () => {
  test.use({ daemonOptions: { onExit: "kill" } });

  test("the restart-impact list and a kill shutdown cover every terminal of every session (REQ-7, INV-3, D6, E11)", async ({
    page,
    daemon,
  }) => {
    const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
    try {
      await page.goto(daemon.dashboardUrl);
      const sessionA = await launchSession(page, daemon, {
        directory: dirA.path,
        title: "terminals-e11-a",
      });
      const sessionB = await launchSession(page, daemon, {
        directory: dirB.path,
        title: "terminals-e11-b",
      });
      const base = `${daemon.baseURL}/api/sessions`;
      expect((await page.request.post(`${base}/${sessionA.id}/shell`)).status()).toBe(200);
      expect((await page.request.post(`${base}/${sessionA.id}/shells`)).status()).toBe(201);
      expect((await page.request.post(`${base}/${sessionA.id}/shells`)).status()).toBe(201);
      expect((await page.request.post(`${base}/${sessionB.id}/shell`)).status()).toBe(200);
      expect(await tmuxAllTerminalTargets(daemon)).toHaveLength(4);

      // The on-exit prompt's count and this endpoint's list read the same set of terminal
      // tmux sessions, one entry each; the prompt itself needs a TTY the harness never has.
      const impact = await page.request.get(`${daemon.baseURL}/api/update/restart-impact`);
      expect(impact.status()).toBe(200);
      const body = (await impact.json()) as { shells: { sessionId: number }[] };
      expect(body.shells.map((s) => s.sessionId).sort()).toEqual(
        [sessionA.id, sessionA.id, sessionA.id, sessionB.id].sort(),
      );

      await daemon.restart();

      expect(await tmuxAllTerminalTargets(daemon)).toEqual([]);
    } finally {
      await Promise.all([dirA.cleanup(), dirB.cleanup()]);
    }
  });
});

test("the lowest free number is reused after a close, and a renamed terminal's number comes back as shell N (REQ-12, edges 3 and 4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-lowest";
    const { session } = await startWithTerminals(page, daemon, title, dir, 3);
    const host = focusHost(page);

    await renameTerminal(host, "shell 2", "build");
    await clickClose(host, "build");
    await expect
      .poll(() => tmuxTerminalTargets(daemon, session.id))
      .toEqual([shellTmuxTarget(session.id, 1), shellTmuxTarget(session.id, 3)]);

    const created = await newTerminal(host);
    expect(created).toMatchObject({ n: 2, name: "shell 2" });
    await openPanel(host);
    await expect(terminalRow(page, "shell 2")).toBeVisible();
    await expect(terminalRow(page, "build")).toHaveCount(0);
    expect((await stateTerminals(page, daemon, session.id)).map((t) => t.name)).toEqual([
      "shell 1",
      "shell 2",
      "shell 3",
    ]);
  } finally {
    await cleanup();
  }
});

test("two windows choosing New terminal at once get distinct numbers, and two clicking shell on an empty session get one terminal (edges 1 and 2, D2)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-race";
    const { session } = await startSession(page, daemon, title, dir);
    const host = focusHost(page);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);

      await Promise.all([shellButton(host).click(), shellButton(hostB).click()]);
      await expect(shellSurfaceRegion(page, title)).toBeVisible({ timeout: 15_000 });
      await expect(shellSurfaceRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      expect(await tmuxTerminalTargets(daemon, session.id)).toEqual([
        shellTmuxTarget(session.id, 1),
      ]);

      await openPanel(host);
      await openPanel(hostB);
      await Promise.all([newTerminalButton(page).click(), newTerminalButton(pageB).click()]);
      await expect
        .poll(async () => (await stateTerminals(page, daemon, session.id)).map((t) => t.n))
        .toEqual([1, 2, 3]);
      expect(await tmuxTerminalTargets(daemon, session.id)).toHaveLength(3);
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("every window's panel rows and count equal the daemon's list after a spawn, rename, close and exit (INV-2, REQ-17)", async ({
  page,
  daemon,
  browser,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-inv2";
    const { session } = await startSession(page, daemon, title, dir);
    const host = focusHost(page);

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(terminalRegion(pageB, title)).toBeVisible({ timeout: 15_000 });
      const hostB = focusHost(pageB);
      await openPanel(hostB);

      const settled = async () => {
        await openPanel(host);
        await expect
          .poll(() => panelMatchesDaemon(host, daemon, session.id), { message: "window A" })
          .toBe("ok");
        await expect
          .poll(() => panelMatchesDaemon(hostB, daemon, session.id), { message: "window B" })
          .toBe("ok");
      };

      await shellButton(host).click();
      await expect(shellSurfaceRegion(page, title)).toBeVisible({ timeout: 15_000 });
      await settled();

      await newTerminal(host);
      await settled();

      await renameTerminal(host, "shell 2", "build");
      await settled();

      const base = `${daemon.baseURL}/api/sessions/${session.id}`;
      expect((await page.request.post(`${base}/shells`)).status()).toBe(201);
      await settled();

      await clickClose(host, "shell 1");
      await settled();

      await daemon.killTmuxWindow(shellTmuxTarget(session.id, 3));
      await settled();

      await chooseRow(host, "build");
      await typeInTerminal(
        host,
        daemon,
        { sessionId: session.id, n: 2, name: "build" },
        shellSurfaceRegion(page, title),
        "exit",
      );
      await expect(terminalRow(pageB, "build")).toHaveCount(0);
      await settled();
      await expectNoTerminals(daemon, session.id);
    } finally {
      await contextB.close();
    }
  } finally {
    await cleanup();
  }
});

test("terminals open, run and list on a dead session as on a live one (REQ-1, dead-session state)", async ({
  page,
  daemon,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-dead";
    const { session } = await startSession(page, daemon, title, dir);
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-terminals-dead", await envelopeOpts(session, daemon)),
    });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(railCard(page, title).getByText(/^ended /)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#dead-surface")).toBeVisible({ timeout: 15_000 });

    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    await shellButton(host).click();
    await expectShown(host, "shell 1", region);
    await newTerminal(host);
    await expectShown(host, "shell 2", region);
    await expect(shellCount(host)).toHaveText("2");
    await typeInTerminal(host, daemon, shell(session.id, 2), region, "echo dead-session-terminal");
    await expect(region).toContainText("dead-session-terminal");
    await openPanel(host);
    await expect(terminalRow(page, "shell 1")).toBeVisible();
    expect(await tmuxTerminalTargets(daemon, session.id)).toHaveLength(2);
  } finally {
    await cleanup();
  }
});

test("the terminal endpoints answer as the contract says for spawn, rename, close and an unauthenticated caller (REQ-4, REQ-12, REQ-19, D2, D4)", async ({
  page,
  daemon,
  request,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "terminals-api" });
    const base = `${daemon.baseURL}/api/sessions/${session.id}`;
    const id = session.id;

    const first = await page.request.post(`${base}/shell`);
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ target: shellTmuxTarget(id, 1), n: 1, created: true });
    const again = await page.request.post(`${base}/shell`);
    expect(await again.json()).toEqual({ target: shellTmuxTarget(id, 1), n: 1, created: false });

    const two = await page.request.post(`${base}/shells`);
    expect(two.status()).toBe(201);
    expect(await two.json()).toEqual({ target: shellTmuxTarget(id, 2), n: 2, name: "shell 2" });
    const three = await page.request.post(`${base}/shells`);
    expect(await three.json()).toEqual({ target: shellTmuxTarget(id, 3), n: 3, name: "shell 3" });

    const named = await page.request.put(`${base}/shells/2/name`, { data: { name: "  build  " } });
    expect(named.status()).toBe(200);
    expect(await named.json()).toEqual({ n: 2, name: "build" });
    const cleared = await page.request.put(`${base}/shells/2/name`, { data: { name: "   " } });
    expect(await cleared.json()).toEqual({ n: 2, name: "shell 2" });
    const longest = await page.request.put(`${base}/shells/2/name`, {
      data: { name: "x".repeat(40) },
    });
    expect(longest.status()).toBe(200);
    const tooLong = await page.request.put(`${base}/shells/2/name`, {
      data: { name: "x".repeat(41) },
    });
    expect(tooLong.status()).toBe(400);
    expect(await tooLong.json()).toEqual({
      error: { code: "name_too_long", message: "a terminal name is at most 40 characters" },
    });
    const notString = await page.request.put(`${base}/shells/2/name`, { data: { name: 5 } });
    expect(notString.status()).toBe(400);
    expect(((await notString.json()) as { error: { code: string } }).error.code).toBe(
      "bad_request",
    );
    const missingTerminal = await page.request.put(`${base}/shells/9/name`, {
      data: { name: "x" },
    });
    expect(missingTerminal.status()).toBe(404);
    expect(((await missingTerminal.json()) as { error: { code: string } }).error.code).toBe(
      "no_shell",
    );
    const missingSession = await page.request.put(
      `${daemon.baseURL}/api/sessions/99999/shells/1/name`,
      { data: { name: "x" } },
    );
    expect(missingSession.status()).toBe(404);
    expect(((await missingSession.json()) as { error: { code: string } }).error.code).toBe(
      "unknown_session",
    );

    await page.request.put(`${base}/shells/2/name`, { data: { name: "build" } });
    expect((await page.request.delete(`${base}/shells/2`)).status()).toBe(204);
    const missing = await page.request.delete(`${base}/shells/2`);
    expect(missing.status()).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("no_shell");
    const noSession = await page.request.delete(`${daemon.baseURL}/api/sessions/99999/shells/1`);
    expect(noSession.status()).toBe(404);
    expect(((await noSession.json()) as { error: { code: string } }).error.code).toBe(
      "unknown_session",
    );

    const reused = await page.request.post(`${base}/shells`);
    expect(await reused.json()).toEqual({ target: shellTmuxTarget(id, 2), n: 2, name: "shell 2" });

    const anonymous = await request.post(`${base}/shells`);
    expect(anonymous.status()).toBe(401);
    expect(((await anonymous.json()) as { error: { code: string } }).error.code).toBe(
      "unauthorized",
    );
    expect(await tmuxTerminalTargets(daemon, id)).toHaveLength(3);
  } finally {
    await cleanup();
  }
});

test("two simultaneous POST shell calls on a session with no terminal produce one (D2, edge 1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "terminals-idem" });
    const url = `${daemon.baseURL}/api/sessions/${session.id}/shell`;

    const results = await Promise.all([page.request.post(url), page.request.post(url)]);
    const bodies = await Promise.all(results.map((r) => r.json() as Promise<{ created: boolean }>));
    expect(results.map((r) => r.status())).toEqual([200, 200]);
    expect(bodies.filter((b) => b.created)).toHaveLength(1);
    expect(await tmuxTerminalTargets(daemon, session.id)).toEqual([shellTmuxTarget(session.id, 1)]);
  } finally {
    await cleanup();
  }
});

test("a keyboard user opens ▾ with Enter and closes it with Esc, and focus returns to the same ▾ node across render ticks (REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-kbd-opener";
    await startWithTerminals(page, daemon, title, dir, 1);
    const host = focusHost(page);
    const opener = terminalsOpener(host);

    await opener.focus();
    await opener.evaluate((el) => {
      (el as HTMLElement & { __kept?: boolean }).__kept = true;
    });
    const stillTheOpener = () =>
      opener.evaluate(
        (el) =>
          document.activeElement === el &&
          (el as HTMLElement & { __kept?: boolean }).__kept === true,
      );
    expect(await stillTheOpener()).toBe(true);
    await settleFor(page, 1_500);
    expect(await stillTheOpener()).toBe(true);

    await page.keyboard.press("Enter");
    await expect(terminalsPanel(page)).toBeVisible();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    await settleFor(page, 1_500);
    await expect(terminalsPanel(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(terminalsPanel(page)).toBeHidden();
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    await expect(opener).toBeFocused();
    expect(await stillTheOpener()).toBe(true);
    await settleFor(page, 1_500);
    expect(await stillTheOpener()).toBe(true);
  } finally {
    await cleanup();
  }
});

test("a keyboard user can rename, switch, add and close terminals with Enter and Space, and the ▾ node survives the broadcasts (REQ-1, REQ-2, REQ-4, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const title = "terminals-kbd";
    const { session } = await startWithTerminals(page, daemon, title, dir, 2);
    const host = focusHost(page);
    const region = shellSurfaceRegion(page, title);
    const opener = terminalsOpener(host);
    await opener.evaluate((el) => {
      (el as HTMLElement & { __kept?: boolean }).__kept = true;
    });

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(terminalsPanel(page)).toBeVisible();

    await renameButton(page, "shell 2").focus();
    await page.keyboard.press("Enter");
    await expect(renameField(page)).toBeFocused();
    await page.keyboard.type("build");
    await page.keyboard.press("Enter");
    await expect(terminalRow(page, "build")).toBeVisible();

    await terminalRow(page, "shell 1").focus();
    await page.keyboard.press("Enter");
    await expect(terminalsPanel(page)).toBeHidden();
    await expectShown(host, "shell 1", region);

    await opener.focus();
    await page.keyboard.press("Enter");
    await newTerminalButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(terminalsPanel(page)).toBeHidden();
    await expectShown(host, "shell 3", region);

    await opener.focus();
    await page.keyboard.press("Enter");
    await closeButton(page, "build").focus();
    await page.keyboard.press("Space");
    await expect
      .poll(() => tmuxTerminalTargets(daemon, session.id))
      .toEqual([shellTmuxTarget(session.id, 1), shellTmuxTarget(session.id, 3)]);

    await settleFor(page, 1_500);
    expect(
      await opener.evaluate(
        (el) => (el as HTMLElement & { __kept?: boolean }).__kept === true && el.isConnected,
      ),
    ).toBe(true);
  } finally {
    await cleanup();
  }
});
