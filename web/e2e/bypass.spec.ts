import { basename } from "node:path";
import { expect, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawNotification,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import {
  childEntry,
  crumbButton,
  launchDialog,
  launchTargetPath,
  openLaunchDialog,
  recentButton,
} from "./helpers/picker";
import { railCard } from "./helpers/railorder";
import { bypassChip, bypassRadio, bypassWarning, launchPrimaryButton } from "./helpers/resume";
import {
  browseScratchDirectory,
  envelopeOpts,
  findSession,
  getState,
  launchSession,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { activeElementInsideTerminal, liveTile } from "./helpers/terminal";

// Plan resume-and-dangerously-allow (closes #61) — REQ-1..5, INV-1..3. Fixture plan
// header: this file takes the per-test `daemon` fixture (a launch opens the launched
// session — auto-focus is daemon-global — and the chip is asserted on the rail's only
// card and its only tile, so a neighbour session sharing a daemon would corrupt both).
//
// The Resume-tab half of this plan (past sessions, resuming from the list) lives in
// past-sessions.spec.ts; this file covers only the New tab's bypass segment and the
// chip it leaves behind on every hosting surface.

test('checking "bypass" shows the warning and turns Launch into a danger "Launch without checks"; launching posts permissionMode: bypassPermissions and spawns the flag verbatim (REQ-1, REQ-2, E1)', async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-launch-");
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await expect(launchTargetPath(dialog)).toHaveText(dir.path);

    // Not checked yet: the ordinary amber, non-danger face.
    await expect(bypassWarning(dialog)).toBeHidden();
    await expect(launchPrimaryButton(dialog)).toHaveText("Launch");
    await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);

    await bypassRadio(dialog).check();
    await expect(bypassWarning(dialog)).toBeVisible();
    await expect(bypassWarning(dialog)).toHaveText(
      "Bypass permissions — every tool call runs without asking: edits, shell commands, network. Nothing stops a bad command.",
    );
    await expect(launchPrimaryButton(dialog)).toHaveText("Launch without checks");
    await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);

    await dialog.getByLabel("Title").fill("bypass-launch-e1");
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    // E1: daemon API oracle — the launched session's own permissionMode, not the
    // dialog's rendering of what it thinks it sent.
    const state = await getState(page, daemon);
    const launchedMatches = state.sessions.filter((s) => s.title === "bypass-launch-e1");
    expect(launchedMatches, "exactly one session launched, no spurious extra").toHaveLength(1);
    const [launched] = launchedMatches;
    if (!launched) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(launched.permissionMode).toEqual({ value: "bypassPermissions", source: "seed" });

    // Real pane oracle: the tmux pane's own start command, not the daemon's account of
    // what it meant to spawn.
    const startCommand = await daemon.paneStartCommand(launched.tmuxTarget);
    expect(startCommand).toContain("--permission-mode bypassPermissions");

    // REQ-13/kb:adr/launch-opens-launched-session: a bypass launch opens like any other.
    const card = railCard(page, "bypass-launch-e1");
    await expect(card).toHaveAttribute("aria-current", "true");
    expect(await activeElementInsideTerminal(page, "bypass-launch-e1")).toBe(true);
  } finally {
    await dir.cleanup();
  }
});

test('unchecking "bypass" restores the ordinary "Launch" face (INV-2)', async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-uncheck-");
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();

    await bypassRadio(dialog).check();
    await expect(launchPrimaryButton(dialog)).toHaveClass(/key-danger/);

    await dialog.getByRole("radio", { name: "manual" }).check();
    await expect(bypassWarning(dialog)).toBeHidden();
    await expect(launchPrimaryButton(dialog)).toHaveText("Launch");
    await expect(launchPrimaryButton(dialog)).not.toHaveClass(/key-danger/);
  } finally {
    await dir.cleanup();
  }
});

test("the existing Resume action relaunches a bypass-latched session with --permission-mode bypassPermissions (REQ-1)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-resume-latch-");
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir.path,
      title: "bypass-resume-latch",
      permissionMode: "bypassPermissions",
    });
    const claudeId = "claude-bypass-resume-latch";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });

    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    const card = sessionCard(page, "bypass-resume-latch");
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });

    const resumeRes = await page.request.post(
      `${daemon.baseURL}/api/sessions/${session.id}/resume`,
    );
    expect(resumeRes.status()).toBe(200);

    const state = await getState(page, daemon);
    const resumed = findSession(state, session.id);
    expect(resumed.alive).toBe(true);
    const startCommand = await daemon.paneStartCommand(resumed.tmuxTarget);
    expect(startCommand).toContain("--permission-mode bypassPermissions");
    await expect(bypassChip(card)).toBeVisible();
  } finally {
    await dir.cleanup();
  }
});

test("the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives (REQ-4, REQ-5, E2)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-chip-");
  try {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await bypassRadio(dialog).check();
    await dialog.getByLabel("Title").fill("bypass-chip-e2");
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const card = sessionCard(page, "bypass-chip-e2");
    await expect(bypassChip(card)).toHaveText("bypass");
    await expect(bypassChip(page.locator("#mainhead"))).toHaveText("bypass");

    // REQ-5: no SessionStart has arrived yet, and this is a first launch into a never
    // before-seen directory — `firstLaunchHere` is true, so the note is the combined
    // trust-prompt-then-bypass-warning form (card.ts's `firstLaunchNote`), not the plain
    // "likely waiting on Claude Code's bypass warning" text that only applies once a
    // directory has been launched into before.
    await expect(
      card.getByText(
        "first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning",
      ),
    ).toBeVisible();
  } finally {
    await dir.cleanup();
  }
});

test("a hook reporting permission_mode: default removes the bypass chip from the rail card and the mainhead (E3)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-clears-");
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir.path,
      title: "bypass-clears-e3",
      permissionMode: "bypassPermissions",
    });
    const card = sessionCard(page, "bypass-clears-e3");
    await expect(bypassChip(card)).toBeVisible();

    const claudeId = "claude-bypass-clears-e3";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { permissionMode: "default" }),
    });

    await expect(stateBadge(card)).toHaveText(/working/i);
    // `.chip-danger` is a required template slot on every hosting surface (always in the
    // DOM; `render/sessions.ts`/`render/mainhead.ts` toggle its `hidden` attribute, never
    // add/remove the node) — `toHaveCount(0)` can never observe the clear, since the node
    // never leaves the DOM. `toBeHidden()` is the assertion that actually reads the
    // toggle.
    await expect(bypassChip(card)).toBeHidden();
    await expect(bypassChip(page.locator("#mainhead"))).toBeHidden();

    const state = await getState(page, daemon);
    const found = findSession(state, session.id);
    expect(found.permissionMode).toEqual({ value: "default", source: "hook" });
  } finally {
    await dir.cleanup();
  }
});

test("in Tiles, the bypass session's tile header shows the chip, and a hook reporting default removes it (E12)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-tile-");
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir.path,
      title: "bypass-tile-e12",
      permissionMode: "bypassPermissions",
    });

    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    const tile = liveTile(page, "bypass-tile-e12");
    await expect(bypassChip(tile)).toHaveText("bypass");

    const claudeId = "claude-bypass-tile-e12";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { permissionMode: "default" }),
    });

    // See the E3 test's comment: the chip's element is a permanent template slot, toggled
    // by its `hidden` attribute, never added/removed.
    await expect(bypassChip(tile)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("the bypass chip is shown on the rail card in every state (alive and dead), and returns once the latch flips back to bypass (INV-1, edge case 17)", async ({
  page,
  request,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-inv1-");
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir.path,
      title: "bypass-inv1",
      permissionMode: "bypassPermissions",
    });
    const card = sessionCard(page, "bypass-inv1");

    // started
    await expect(bypassChip(card)).toBeVisible();

    const claudeId = "claude-bypass-inv1";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });

    // working (latch still bypass — the hook below carries the same mode)
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { permissionMode: "bypassPermissions" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await expect(bypassChip(card)).toBeVisible();

    // needs_input
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification(claudeId, "p1", "permission_prompt"),
    });
    await expect(stateBadge(card)).toHaveText(/needs input/i);
    await expect(bypassChip(card)).toBeVisible();

    // idle
    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { permissionMode: "bypassPermissions" }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    await expect(bypassChip(card)).toBeVisible();

    // failed (a second turn that fails)
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2", permissionMode: "bypassPermissions" }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawStopFailure(claudeId, { promptId: "p2" }),
    });
    await expect(stateBadge(card)).toHaveText(/failed/i);
    await expect(bypassChip(card)).toBeVisible();

    // dead (End)
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(card).toHaveClass(/ended/, { timeout: 15_000 });
    await expect(bypassChip(card)).toBeVisible();

    // The latch moves to another mode and back (edge case 17): the chip goes, then
    // returns. Driven via a raw hook rather than a real Resume/relaunch — the state
    // machine's `modeLatch` update path is the same regardless of source.
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p3", permissionMode: "default" }),
    });
    // See the E3 test's comment: the chip's element is a permanent template slot, toggled
    // by its `hidden` attribute, never added/removed.
    await expect(bypassChip(card)).toBeHidden();

    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p4", permissionMode: "bypassPermissions" }),
    });
    await expect(bypassChip(card)).toBeVisible();
  } finally {
    await dir.cleanup();
  }
});

test("a directory whose last launch was bypass opens the dialog on auto, from a fresh open and from clicking its Recent (REQ-3, INV-3)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-bypass-norestore-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "bypass-norestore-seed",
      permissionMode: "bypassPermissions",
    });

    // Fresh open (initOpen's restore lands on the most-recently-launched directory).
    await page.keyboard.press("Alt+Meta+KeyN");
    const dialog = launchDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "auto" })).toBeChecked();
    await expect(bypassRadio(dialog)).not.toBeChecked();
    await expect(bypassWarning(dialog)).toBeHidden();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Explicitly re-navigate elsewhere then click the Recent back onto this directory
    // — the other restore path (REQ-3 names both "on open and on a Recent click").
    const other = await browseScratchDirectory(daemon, "muster-e2e-bypass-norestore-other-");
    try {
      const dialog2 = await openLaunchDialog(page);
      // initOpen's restore lands on `dir` (the only launched-into directory so far,
      // REQ-8) — go up to the browse root, then descend into `other`, before clicking
      // the Recent back onto `dir` (launch-opens-session.spec.ts's own pattern).
      await crumbButton(dialog2, basename(daemon.browseRoot)).click();
      await childEntry(dialog2, basename(other.path)).click();
      await recentButton(dialog2, basename(dir.path)).click();
      await expect(launchTargetPath(dialog2)).toHaveText(dir.path);
      await expect(dialog2.getByRole("radio", { name: "auto" })).toBeChecked();
      await expect(bypassRadio(dialog2)).not.toBeChecked();
    } finally {
      await other.cleanup();
    }
  } finally {
    await dir.cleanup();
  }
});
