import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  effortArg,
  effortRadio,
  effortRadiogroup,
  headerModel,
  pickEffort,
  effText,
  wireEffort,
} from "./helpers/effort";
import { expect, settleFor, test } from "./helpers/fixtures";
import { focusedNode, tagNode } from "./helpers/focus-header";
import {
  childEntry,
  currentCrumb,
  launchDialog,
  openLaunchDialog,
  recentButton,
} from "./helpers/picker";
import { getRepos, launchPrimaryButton, pastSessionRow, resumeTab } from "./helpers/resume";
import {
  browseScratchDirectory,
  getState,
  launchSession,
  scratchDirectory,
  waitForNextClockSecond,
} from "./helpers/session";

// Plan effort — the launch half: the dialog's Effort row, what a launch spawns and records, what
// the daemon refuses, what the dialog remembers per directory, and the Resume-tab resume's effort.
// Acceptance E2, E3, E4, E16 with REQ-1 to REQ-4, REQ-11 and the dialog's focus rules.
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// each asserts recents or remembered per-directory effort, which is daemon-global.
//
// Claude Code is faked: the stub `claude` ignores its argv, so what a launch passed is read from
// the pane's start command (`daemon.paneStartCommand`), the oracle bypass.spec.ts and launch.spec.ts
// use for `--permission-mode` and `--model`.

const UNRECOGNIZED_MODEL = "muster-e2e-unrecognized-model";
const EFFORT_MESSAGE = "effort must be one of low, medium, high, xhigh, max";

async function startCommandOf(
  page: Parameters<typeof getState>[0],
  daemon: Parameters<typeof getState>[1],
  title: string,
): Promise<string> {
  const matches = (await getState(page, daemon)).sessions.filter((s) => s.title === title);
  expect(matches, `exactly one session titled ${title}`).toHaveLength(1);
  const [session] = matches;
  if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
  return await daemon.paneStartCommand(session.tmuxTarget);
}

test("the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort (REQ-1, E2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(effortRadiogroup(dialog)).toBeVisible();
  await expect(dialog.locator("legend", { hasText: "Effort" })).toBeVisible();

  const radios = effortRadiogroup(dialog).getByRole("radio");
  await expect(radios).toHaveCount(6);
  for (const [i, name] of ["default", "low", "medium", "high", "xhigh", "max"].entries()) {
    await expect(radios.nth(i)).toHaveAccessibleName(name);
    await expect(radios.nth(i)).toHaveAttribute("name", "effort");
  }
  expect(
    await radios.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
  ).toEqual(["", "low", "medium", "high", "xhigh", "max"]);
  await expect(effortRadio(dialog, "default")).toBeChecked();
  for (const level of ["low", "medium", "high", "xhigh", "max"] as const) {
    await expect(effortRadio(dialog, level)).not.toBeChecked();
  }

  // After the Model row's error line and custom-model input, before Start in.
  const inOrder = await dialog.evaluate((root) => {
    const q = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) throw new Error(`no ${selector} in the dialog`);
      return el;
    };
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const model = q('[role="radiogroup"][aria-label="Model"]');
    const error = q("#model-error");
    const custom = q("#custom-model-input");
    const effort = q('[role="radiogroup"][aria-label="Effort"]');
    const startIn = q('[role="radiogroup"][aria-label="Start in"]');
    return [
      follows(model, effort),
      follows(error, effort),
      follows(custom, effort),
      follows(effort, startIn),
    ];
  });
  expect(inOrder).toEqual([true, true, true, true]);
});

test("the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-effort-resume-tab-");
  try {
    await daemon.writeTranscript(dir.path, "past-effort-tab", {
      title: "Say hi",
      model: "claude-opus-4-5-20251101",
      assistantEfforts: ["high"],
    });
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await expect(pastSessionRow(dialog, "Say hi")).toBeVisible();

    // Resume hides the form's fields as a block: Effort goes with Model and Start in.
    await expect(dialog.getByRole("radiogroup", { name: "Model" })).toBeHidden();
    await expect(effortRadiogroup(dialog)).toBeHidden();
  } finally {
    await dir.cleanup();
  }
});

test("launching with high from the dialog spawns the pane with --effort high, sends effort in the request, and leaves the session's effort unreported (REQ-2, E3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await pickEffort(dialog, "high");
  await expect(effortRadio(dialog, "high")).toBeChecked();
  await dialog.getByLabel("Title").fill("effort-high-launch");
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions",
  );
  await launchPrimaryButton(dialog).click();
  await expect(dialog).toBeHidden();

  const body = (await request).postDataJSON() as Record<string, unknown>;
  expect(body.effort).toBe("high");
  expect(effortArg(await startCommandOf(page, daemon, "effort-high-launch"))).toBe("high");

  const launched = (await getState(page, daemon)).sessions.find(
    (s) => s.title === "effort-high-launch",
  );
  if (!launched) throw new Error("the launched session is not in the state snapshot");
  expect(await wireEffort(page, daemon, launched.id)).toEqual({
    effort: null,
    effortWarning: null,
  });
});

test("launching with default spawns the pane with no --effort, sends no level, and records no remembered effort (REQ-2, REQ-4, E3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await expect(effortRadio(dialog, "default")).toBeChecked();
  await dialog.getByLabel("Title").fill("effort-default-launch");
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions",
  );
  await launchPrimaryButton(dialog).click();
  await expect(dialog).toBeHidden();

  const body = (await request).postDataJSON() as Record<string, unknown>;
  expect(body.effort ?? null).toBeNull();
  const startCommand = await startCommandOf(page, daemon, "effort-default-launch");
  expect(startCommand).not.toContain("--effort");
  const repos = await getRepos(page, daemon);
  expect(repos.find((r) => r.path === daemon.browseRoot)?.lastEffort).toBeNull();
});

test("every level reaches the pane as --effort <level> and becomes the directory's lastEffort, and an API launch with effort null or none passes no flag (REQ-2, REQ-4, D4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  for (const level of ["low", "medium", "xhigh", "max"]) {
    const dir = await scratchDirectory(`muster-e2e-effort-${level}-`);
    try {
      const launched = await launchSession(page, daemon, {
        directory: dir.path,
        title: `effort-argv-${level}`,
        effort: level,
      });
      expect(effortArg(await daemon.paneStartCommand(launched.tmuxTarget))).toBe(level);
      const repo = (await getRepos(page, daemon)).find((r) => r.path === dir.path);
      expect(repo?.lastEffort).toBe(level);
    } finally {
      await dir.cleanup();
    }
  }
  for (const [label, effort] of [
    ["null", null],
    ["absent", undefined],
  ] as const) {
    const dir = await scratchDirectory(`muster-e2e-effort-${label}-`);
    try {
      const launched = await launchSession(page, daemon, {
        directory: dir.path,
        title: `effort-argv-${label}`,
        ...(effort !== undefined ? { effort } : {}),
      });
      expect(await daemon.paneStartCommand(launched.tmuxTarget)).not.toContain("--effort");
      const repo = (await getRepos(page, daemon)).find((r) => r.path === dir.path);
      expect(repo?.lastEffort).toBeNull();
    } finally {
      await dir.cleanup();
    }
  }
});

for (const value of ["auto", "ultracode", "HIGH"]) {
  test(`POST /api/sessions with effort ${JSON.stringify(value)} is refused 400 invalid_request and writes no repo row, settings file, tmux session or session (REQ-3, D3)`, async ({
    page,
    daemon,
  }) => {
    const dir = await scratchDirectory("muster-e2e-effort-invalid-");
    try {
      await page.goto(daemon.dashboardUrl);
      const res = await page.request.post(`${daemon.baseURL}/api/sessions`, {
        data: { directory: dir.path, model: "haiku", permissionMode: "default", effort: value },
      });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: "invalid_request", message: EFFORT_MESSAGE },
      });

      expect(await getRepos(page, daemon)).toEqual([]);
      expect((await getState(page, daemon)).sessions).toEqual([]);
      expect(await daemon.tmuxSessions()).toEqual([]);
      await expect(access(join(dir.path, ".claude", "settings.local.json"))).rejects.toThrow();
    } finally {
      await dir.cleanup();
    }
  });
}

test("an invalid effort is checked after permissionMode and before the model pre-check (REQ-3)", async ({
  page,
  daemon,
}) => {
  const dir = await scratchDirectory("muster-e2e-effort-order-");
  try {
    await page.goto(daemon.dashboardUrl);

    const both = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: { directory: dir.path, model: "haiku", permissionMode: "bogus-mode", effort: "bogus" },
    });
    expect(both.status()).toBe(400);
    const bothBody = (await both.json()) as { error: { code: string; message: string } };
    expect(bothBody.error.code).toBe("invalid_request");
    expect(bothBody.error.message).toMatch(/^permissionMode must be one of /);

    const withModel = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: {
        directory: dir.path,
        model: UNRECOGNIZED_MODEL,
        permissionMode: "default",
        effort: "bogus",
      },
    });
    expect(withModel.status()).toBe(400);
    expect(await withModel.json()).toEqual({
      error: { code: "invalid_request", message: EFFORT_MESSAGE },
    });
    expect(await getRepos(page, daemon)).toEqual([]);
  } finally {
    await dir.cleanup();
  }
});

test("after a launch with xhigh, reopening the dialog on that directory and clicking it in Recent both check xhigh, a later directory's level restores on its own click, and a default launch restores default (REQ-4, E4)", async ({
  page,
  daemon,
}) => {
  const dirA = await browseScratchDirectory(daemon, "muster-e2e-effort-remember-a-");
  const dirB = await browseScratchDirectory(daemon, "muster-e2e-effort-remember-b-");
  const nameA = basename(dirA.path);
  const nameB = basename(dirB.path);
  try {
    await page.goto(daemon.dashboardUrl);
    const first = await openLaunchDialog(page);
    await childEntry(first, nameA).click();
    await pickEffort(first, "xhigh");
    await first.getByLabel("Title").fill("effort-remember-a");
    await launchPrimaryButton(first).click();
    await expect(first).toBeHidden();
    expect((await getRepos(page, daemon)).find((r) => r.path === dirA.path)?.lastEffort).toBe(
      "xhigh",
    );

    // Reopening opens on the most recent directory, restoring its level.
    await page.keyboard.press("Alt+Meta+KeyN");
    const reopened = launchDialog(page);
    await expect(reopened).toBeVisible();
    await expect(recentButton(reopened, nameA)).toHaveAttribute("aria-pressed", "true");
    await expect(effortRadio(reopened, "xhigh")).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(reopened).toBeHidden();

    // A newer launch elsewhere at another level, then a Recent click each way.
    await waitForNextClockSecond();
    await launchSession(page, daemon, {
      directory: dirB.path,
      title: "effort-remember-b",
      effort: "low",
    });
    await page.keyboard.press("Alt+Meta+KeyN");
    const second = launchDialog(page);
    await expect(second).toBeVisible();
    await expect(recentButton(second, nameB)).toHaveAttribute("aria-pressed", "true");
    await expect(effortRadio(second, "low")).toBeChecked();
    await recentButton(second, nameA).click();
    await expect(recentButton(second, nameA)).toHaveAttribute("aria-pressed", "true");
    await expect(effortRadio(second, "xhigh")).toBeChecked();
    await recentButton(second, nameB).click();
    await expect(effortRadio(second, "low")).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(second).toBeHidden();

    // A launch with default clears the directory's remembered effort: it restores as default.
    await waitForNextClockSecond();
    await launchSession(page, daemon, {
      directory: dirA.path,
      title: "effort-remember-a-default",
      effort: null,
    });
    expect((await getRepos(page, daemon)).find((r) => r.path === dirA.path)?.lastEffort).toBeNull();
    await page.keyboard.press("Alt+Meta+KeyN");
    const third = launchDialog(page);
    await expect(third).toBeVisible();
    await expect(recentButton(third, nameA)).toHaveAttribute("aria-pressed", "true");
    await expect(effortRadio(third, "default")).toBeChecked();
    await recentButton(third, nameB).click();
    await expect(effortRadio(third, "low")).toBeChecked();
    await recentButton(third, nameA).click();
    await expect(effortRadio(third, "default")).toBeChecked();
  } finally {
    await dirA.cleanup();
    await dirB.cleanup();
  }
});

test("an effort picked before the initial restore lands stays checked, while the untouched model still restores from the recent (REQ-4)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-effort-race-");
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "effort-race-seed",
      model: "haiku",
      permissionMode: "default",
      effort: "low",
    });

    // Holds back only the first GET /api/browse the page makes — the dialog's own initial restore
    // onto the one recent (launch-defaults.spec.ts holds it the same way for model and mode).
    let seenFirstBrowse = false;
    let releaseFirstBrowse: () => void = () => {};
    const firstBrowseGate = new Promise<void>((resolve) => {
      releaseFirstBrowse = resolve;
    });
    await page.route("**/api/browse*", async (route) => {
      if (!seenFirstBrowse) {
        seenFirstBrowse = true;
        await firstBrowseGate;
      }
      await route.continue();
    });

    const dialog = await openLaunchDialog(page);
    await pickEffort(dialog, "max");
    releaseFirstBrowse();

    await expect(currentCrumb(dialog)).toHaveText(basename(dir.path));
    await expect(effortRadio(dialog, "max")).toBeChecked();
    await expect(effortRadio(dialog, "low")).not.toBeChecked();
    await expect(dialog.getByRole("radio", { name: "haiku" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "manual" })).toBeChecked();
  } finally {
    await dir.cleanup();
  }
});

test("the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches (REQ-1, REQ-2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  // Setup, not evidence: put focus on the checked segment. The keys below are the round trip.
  await effortRadio(dialog, "default").focus();
  await page.keyboard.press("ArrowRight");
  const low = effortRadio(dialog, "low");
  await expect(low).toBeChecked();
  await expect(low).toBeFocused();
  await tagNode(low, "effort-low");
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-low" });

  // Past the 1 s render tick: the same node, still focused, still checked.
  await settleFor(page, 1_200);
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-low" });
  await expect(low).toBeChecked();

  await page.keyboard.press("ArrowRight");
  const medium = effortRadio(dialog, "medium");
  await expect(medium).toBeChecked();
  await expect(medium).toBeFocused();
  await expect(low).not.toBeChecked();
  await tagNode(medium, "effort-medium");
  await settleFor(page, 1_200);
  expect(await focusedNode(page)).toEqual({ tag: "INPUT", node: "effort-medium" });
  await expect(medium).toBeChecked();

  await dialog.getByLabel("Title").fill("effort-keyboard-launch");
  await launchPrimaryButton(dialog).click();
  await expect(dialog).toBeHidden();
  expect(effortArg(await startCommandOf(page, daemon, "effort-keyboard-launch"))).toBe("medium");
});

test("clicking the max segment checks it, and it stays the checked one across a render tick (REQ-1)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openLaunchDialog(page);

  await pickEffort(dialog, "max");
  await expect(effortRadio(dialog, "max")).toBeChecked();
  await expect(effortRadio(dialog, "default")).not.toBeChecked();

  await settleFor(page, 1_200);
  await expect(effortRadio(dialog, "max")).toBeChecked();
  await expect(effortRadio(dialog, "default")).not.toBeChecked();

  await pickEffort(dialog, "default");
  await expect(effortRadio(dialog, "default")).toBeChecked();
  await expect(effortRadio(dialog, "max")).not.toBeChecked();
});

// --- the Resume tab (REQ-11, E16) ---

test("a Resume-tab resume of a transcript whose last assistant line recorded low spawns the pane with --effort low, seeds effort low, and the header reads (low) before any post (REQ-11, E16)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-effort-resume-low-");
  try {
    await daemon.writeTranscript(dir.path, "past-effort-low", {
      title: "Resume at low",
      lastPrompt: "say hi",
      model: "claude-opus-4-5-20251101",
      permissionMode: "acceptEdits",
      assistantEfforts: ["low"],
    });
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Resume at low").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const created = (await getState(page, daemon)).sessions.filter((s) => s.directory === dir.path);
    expect(created).toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
    const startCommand = await daemon.paneStartCommand(session.tmuxTarget);
    expect(startCommand).toContain("--resume past-effort-low");
    expect(effortArg(startCommand)).toBe("low");
    expect(startCommand).not.toContain("--model");

    // No status post has been sent: the level comes from the seed alone, and shows at once.
    expect(await wireEffort(page, daemon, session.id)).toEqual({
      effort: { level: "low" },
      effortWarning: null,
    });
    await expect(headerModel(page)).toHaveText("claude-opus-4-5-20251101 (low)");
    expect(await effText(page)).toBe(" (low)");
  } finally {
    await dir.cleanup();
  }
});

test("a Resume-tab resume whose transcript recorded no effort passes no --effort, seeds effort null, reads (…) in the header and leaves the new repo row's lastEffort null (REQ-11, REQ-4)", async ({
  page,
  daemon,
}) => {
  const dir = await browseScratchDirectory(daemon, "muster-e2e-effort-resume-none-");
  try {
    await daemon.writeTranscript(dir.path, "past-effort-none", {
      title: "Resume with none",
      lastPrompt: "say hi",
      model: "claude-opus-4-5-20251101",
      permissionMode: "acceptEdits",
    });
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await childEntry(dialog, basename(dir.path)).click();
    await resumeTab(dialog).click();
    await pastSessionRow(dialog, "Resume with none").click();
    await launchPrimaryButton(dialog).click();
    await expect(dialog).toBeHidden();

    const created = (await getState(page, daemon)).sessions.filter((s) => s.directory === dir.path);
    expect(created).toHaveLength(1);
    const [session] = created;
    if (!session) throw new Error("unreachable: toHaveLength(1) just passed");
    expect(await daemon.paneStartCommand(session.tmuxTarget)).not.toContain("--effort");
    expect(await wireEffort(page, daemon, session.id)).toEqual({
      effort: null,
      effortWarning: null,
    });
    await expect(headerModel(page)).toHaveText("claude-opus-4-5-20251101 (…)");
    expect(await effText(page)).toBe(" (…)");
    expect((await getRepos(page, daemon)).find((r) => r.path === dir.path)?.lastEffort).toBeNull();
  } finally {
    await dir.cleanup();
  }
});

test("a Resume-tab resume reads the transcript's LAST assistant line: an earlier level is superseded by a later one, and a last line with no effort passes none (REQ-11)", async ({
  page,
  daemon,
}) => {
  const later = await scratchDirectory("muster-e2e-effort-last-later-");
  const bare = await scratchDirectory("muster-e2e-effort-last-bare-");
  try {
    await daemon.writeTranscript(later.path, "past-effort-later", {
      title: "later wins",
      model: "claude-opus-4-5-20251101",
      assistantEfforts: ["high", "low"],
    });
    await daemon.writeTranscript(bare.path, "past-effort-bare", {
      title: "bare last line",
      model: "claude-opus-4-5-20251101",
      assistantEfforts: ["high", null],
    });
    await page.goto(daemon.dashboardUrl);

    const laterRes = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: { directory: later.path, resumeSessionId: "past-effort-later" },
    });
    expect(laterRes.status()).toBe(201);
    const laterSession = (await laterRes.json()) as { id: number; tmuxTarget: string };
    expect(effortArg(await daemon.paneStartCommand(laterSession.tmuxTarget))).toBe("low");
    expect((await wireEffort(page, daemon, laterSession.id)).effort).toEqual({ level: "low" });

    const bareRes = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: { directory: bare.path, resumeSessionId: "past-effort-bare" },
    });
    expect(bareRes.status()).toBe(201);
    const bareSession = (await bareRes.json()) as { id: number; tmuxTarget: string };
    expect(await daemon.paneStartCommand(bareSession.tmuxTarget)).not.toContain("--effort");
    expect((await wireEffort(page, daemon, bareSession.id)).effort).toBeNull();
  } finally {
    await later.cleanup();
    await bare.cleanup();
  }
});

test("a Resume-tab resume leaves the directory's lastEffort as the last launch set it, and the resume form refuses a non-null effort with the combination message before looking for the transcript (REQ-3, REQ-4, REQ-11, D8)", async ({
  page,
  daemon,
}) => {
  const dir = await scratchDirectory("muster-e2e-effort-resume-form-");
  try {
    await daemon.writeTranscript(dir.path, "past-effort-form", {
      title: "form check",
      model: "claude-opus-4-5-20251101",
      assistantEfforts: ["medium"],
    });
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, {
      directory: dir.path,
      title: "effort-form-seed",
      effort: "high",
    });
    expect((await getRepos(page, daemon)).find((r) => r.path === dir.path)?.lastEffort).toBe(
      "high",
    );

    // The combination rule comes before the existence check: an unknown id still reads 400.
    const combined = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: { directory: dir.path, resumeSessionId: "past-effort-unknown", effort: "high" },
    });
    expect(combined.status()).toBe(400);
    expect(await combined.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "resumeSessionId cannot be combined with title, model, permissionMode or effort",
      },
    });

    // effort null is "absent": accepted, and the transcript's own level is what spawns.
    const resumed = await page.request.post(`${daemon.baseURL}/api/sessions`, {
      data: { directory: dir.path, resumeSessionId: "past-effort-form", effort: null },
    });
    expect(resumed.status()).toBe(201);
    const session = (await resumed.json()) as { tmuxTarget: string };
    expect(effortArg(await daemon.paneStartCommand(session.tmuxTarget))).toBe("medium");

    // lastEffort is still the launch's `high`, not the resume's `medium`.
    expect((await getRepos(page, daemon)).find((r) => r.path === dir.path)?.lastEffort).toBe(
      "high",
    );
  } finally {
    await dir.cleanup();
  }
});
