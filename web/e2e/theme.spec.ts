import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawStopFailure, rawUserPromptSubmit } from "./helpers/payloads";
import { getState, launchSession, scratchDirectory, sessionCard, stateBadge } from "./helpers/session";
import { terminalRegion } from "./helpers/terminal";
import {
  claudeConfigJSON,
  htmlClaudeFamily,
  htmlTheme,
  openSettingsDialog,
  resolvedCssVar,
  settingsCloseButton,
  themeLegend,
  themeRadio,
  themeRadios,
} from "./helpers/theme";

// Plan new-ui-design-colors — REQ-7, REQ-9 through REQ-15, INV-1 through INV-4, INV-7.
// Plan acceptance: E2-E15, plus dedicated INV-1/INV-7 regression tests. E1 (`make e2e`)
// is the suite itself, not a spec. W* criteria (resolveTheme table, parsePrefs/
// parseSnapshot defaults, style.css/pane.ts shape) are Vitest's job per the plan's
// Affected Files > Tests section, not this file's.
//
// The Claude Code global config file the daemon's poller reads is faked entirely via
// `ScratchDaemonOptions.claudeConfigContent` / `ScratchDaemon.writeClaudeConfig()`
// (helpers/daemon.ts, REQ-18) — never the real file (INV-5, unconditional
// `-claude-config-file` on every scratch daemon). Nothing here launches a real `claude`;
// session state is driven purely through synthesized hook POSTs the same way every other
// suite in this project does.
//
// Every test gets its own daemon: `prefs.theme` and the polled Claude family are both
// daemon-global state, and several tests flip the scratch config file mid-test — sharing
// a daemon across concurrently running tests (this config is fullyParallel) would race
// those writes. Tests on the default options take the per-test `daemon` fixture
// (helpers/fixtures.ts); the five that need a scratch Claude config / fast poll
// (E9, E10, E11, E15, INV-1) call `startDaemon(opts)` inline instead, because grouping
// them under describes with `daemonOptions` would split the file out of its E-order.

test("clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await expect(dialog).toBeVisible();
  await expect(themeLegend(dialog)).toHaveText("Theme");

  const radios = themeRadios(dialog);
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(0)).toHaveAccessibleName("Follow Claude Code");
  await expect(radios.nth(1)).toHaveAccessibleName("Instrument");
  await expect(radios.nth(2)).toHaveAccessibleName("Dark");
  await expect(radios.nth(3)).toHaveAccessibleName("Light");
});

test("a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => htmlTheme(page)).toBe("instrument");
  await expect.poll(() => htmlClaudeFamily(page)).toBe("unknown");

  const dialog = await openSettingsDialog(page);
  await expect(themeRadio(dialog, "Follow Claude Code")).toBeChecked();
});

test("choosing Dark sets html[data-theme=dark] without a reload and changes body's background from Instrument (E4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => htmlTheme(page)).toBe("instrument");
  const bodyBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const dialog = await openSettingsDialog(page);
  await themeRadio(dialog, "Dark").check();

  await expect.poll(() => htmlTheme(page)).toBe("dark");
  const bodyAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyAfter).not.toBe(bodyBefore);

  // REQ-9: the radio fires the PUT immediately — confirm it actually persisted
  // server-side, not merely rendered.
  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  const state = (await stateRes.json()) as { prefs: { theme: string } };
  expect(state.prefs.theme).toBe("dark");
});

test("after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await themeRadio(dialog, "Dark").check();
  await expect.poll(() => htmlTheme(page)).toBe("dark");

  // Tags the attribute's value at DOMContentLoaded — before the WebSocket has any
  // chance to connect and any `snapshot` to arrive — so reading it back after
  // navigation proves the head-inline hint script (REQ-11), not the daemon round trip,
  // painted the first frame.
  await page.addInitScript(() => {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        (window as unknown as { __e2eEarlyTheme?: string | null }).__e2eEarlyTheme =
          document.documentElement.getAttribute("data-theme");
      },
      { once: true },
    );
  });
  await page.reload();

  const early = await page.evaluate(
    () => (window as unknown as { __e2eEarlyTheme?: string | null }).__e2eEarlyTheme,
  );
  expect(early).toBe("dark");
});

test("after choosing Dark, a daemon restart plus reload still shows dark with the Dark radio checked (E6)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await themeRadio(dialog, "Dark").check();
  await expect.poll(() => htmlTheme(page)).toBe("dark");

  await daemon.restart();
  await page.reload();

  await expect.poll(() => htmlTheme(page)).toBe("dark");
  const dialog2 = await openSettingsDialog(page);
  await expect(themeRadio(dialog2, "Dark")).toBeChecked();
});

test("Focus: choosing Light re-themes the chrome and the live pane ground within one render, no reload (E7, INV-3 Focus)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "focus-e7" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e7", { musterSession: session.id }),
    });

    const region = terminalRegion(page, "focus-e7");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const bodyBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const groundBefore = await region.evaluate((el) => getComputedStyle(el).backgroundColor);

    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Light").check();
    await expect.poll(() => htmlTheme(page)).toBe("light");

    const expectedGround = await resolvedCssVar(page, "--term", "background-color");
    await expect
      .poll(async () => await region.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(expectedGround);
    expect(expectedGround).not.toBe(groundBefore);

    const bodyAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyAfter).not.toBe(bodyBefore);
  } finally {
    await cleanup();
  }
});

test("Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirs[0].path, title: "tiles-e8-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirs[1].path, title: "tiles-e8-b" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e8-a", { musterSession: sessionA.id }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e8-b", { musterSession: sessionB.id }),
    });

    // exact: true — sanctioned repair (plan ui-text-and-focus, REQ-13/Testable UI
    // Elements): live tile headers now host a rename trigger whose accessible name
    // is the display title, and this test's own fixture title ("tiles-e8-a")
    // contains "tiles" as a substring, so a non-exact match on the view switcher's
    // "Tiles" button is ambiguous.
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    const regionA = terminalRegion(page, "tiles-e8-a");
    const regionB = terminalRegion(page, "tiles-e8-b");
    await expect(regionA).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    await expect(regionB).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Light").check();
    await expect.poll(() => htmlTheme(page)).toBe("light");

    const expectedGround = await resolvedCssVar(page, "--term", "background-color");
    await expect
      .poll(async () => await regionA.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(expectedGround);
    await expect
      .poll(async () => await regionB.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(expectedGround);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("with a fast poll, flipping the Claude config from dark to light changes data-claude-family within 2s; data-theme stays fixed under an explicit pref, then switches under Follow (E9)", async ({
  page,
  request,
  startDaemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const daemon = await startDaemon({ claudeThemePoll: "200ms", claudeConfigContent: claudeConfigJSON("dark") });
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "poll-e9" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e9", { musterSession: session.id }),
    });

    // Branch 1: pin the pref away from "follow" first.
    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Instrument").check();
    await expect.poll(() => htmlTheme(page)).toBe("instrument");
    await expect.poll(() => htmlClaudeFamily(page)).toBe("dark");

    await daemon.writeClaudeConfig(claudeConfigJSON("light"));
    await expect.poll(() => htmlClaudeFamily(page), { timeout: 2_000 }).toBe("light");
    // INV-2: family changed; the pinned theme did not.
    expect(await htmlTheme(page)).toBe("instrument");

    const region = terminalRegion(page, "poll-e9");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    const expectedGround = await resolvedCssVar(page, "--term", "background-color");
    await expect
      .poll(async () => await region.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(expectedGround);

    // Branch 2: with family still "light", switching the pref to Follow re-resolves
    // data-theme to light too.
    await themeRadio(dialog, "Follow Claude Code").check();
    await expect.poll(() => htmlTheme(page)).toBe("light");
  } finally {
    await cleanup();
  }
});

test("with pref pinned to Dark, flipping the Claude config to light changes only the pane ground, not data-theme (E10, INV-2)", async ({
  page,
  request,
  startDaemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    const daemon = await startDaemon({ claudeThemePoll: "200ms", claudeConfigContent: claudeConfigJSON("dark") });
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "poll-e10" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e10", { musterSession: session.id }),
    });

    const dialog = await openSettingsDialog(page);
    await themeRadio(dialog, "Dark").check();
    await expect.poll(() => htmlTheme(page)).toBe("dark");
    await expect.poll(() => htmlClaudeFamily(page)).toBe("dark");

    const region = terminalRegion(page, "poll-e10");
    await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });
    const darkGround = await resolvedCssVar(page, "--term", "background-color");
    await expect
      .poll(async () => await region.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(darkGround);

    await daemon.writeClaudeConfig(claudeConfigJSON("light"));
    await expect.poll(() => htmlClaudeFamily(page), { timeout: 2_000 }).toBe("light");
    // INV-2: data-theme is unaffected by the family change while the pref names a
    // known theme.
    expect(await htmlTheme(page)).toBe("dark");

    const lightGround = await resolvedCssVar(page, "--term", "background-color");
    expect(lightGround).not.toBe(darkGround);
    await expect
      .poll(async () => await region.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(lightGround);
  } finally {
    await cleanup();
  }
});

test("choosing Follow after Dark, with family light, resolves to light and persists follow across a reload (E11)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ claudeConfigContent: claudeConfigJSON("light") });
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => htmlClaudeFamily(page)).toBe("light");

  const dialog = await openSettingsDialog(page);
  await themeRadio(dialog, "Dark").check();
  await expect.poll(() => htmlTheme(page)).toBe("dark");

  await themeRadio(dialog, "Follow Claude Code").check();
  await expect.poll(() => htmlTheme(page)).toBe("light");

  await page.reload();
  await expect.poll(() => htmlTheme(page)).toBe("light");
  const dialog2 = await openSettingsDialog(page);
  await expect(themeRadio(dialog2, "Follow Claude Code")).toBeChecked();

  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  const state = (await stateRes.json()) as { prefs: { theme: string } };
  expect(state.prefs.theme).toBe("follow");
});

test("killing the daemon leaves both theme attributes unchanged while the banner shows; restarting re-applies them (E12, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await themeRadio(dialog, "Dark").check();
  await expect.poll(() => htmlTheme(page)).toBe("dark");
  await settingsCloseButton(dialog).click();

  await daemon.kill();
  const banner = page.getByRole("alert");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => htmlTheme(page)).toBe("dark");
  await expect.poll(() => htmlClaudeFamily(page)).toBe("unknown");

  await daemon.restart();
  await expect(banner).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => htmlTheme(page)).toBe("dark");
});

test("masthead Resume is disabled and its computed style differs from the enabled End button, in each theme (E13)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "disabled-e13" });
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-e13", { musterSession: session.id }),
    });
    const mainhead = page.locator("#mainhead");
    await expect(mainhead).toContainText("disabled-e13");

    const endBtn = mainhead.getByRole("button", { name: "End" });
    const resumeBtn = mainhead.getByRole("button", { name: "Resume" });
    await expect(endBtn).toBeEnabled();
    await expect(resumeBtn).toBeDisabled();

    const dialog = await openSettingsDialog(page);
    for (const [label, expectedTheme] of [
      ["Instrument", "instrument"],
      ["Dark", "dark"],
      ["Light", "light"],
    ] as const) {
      await themeRadio(dialog, label).check();
      await expect.poll(() => htmlTheme(page)).toBe(expectedTheme);

      const endColor = await endBtn.evaluate((el) => getComputedStyle(el).color);
      const resumeColor = await resumeBtn.evaluate((el) => getComputedStyle(el).color);
      const endBorder = await endBtn.evaluate((el) => getComputedStyle(el).borderColor);
      const resumeBorder = await resumeBtn.evaluate((el) => getComputedStyle(el).borderColor);
      const resumeCursor = await resumeBtn.evaluate((el) => getComputedStyle(el).cursor);

      expect(resumeColor, `${label}: Resume color must differ from enabled End`).not.toBe(endColor);
      expect(resumeBorder, `${label}: Resume border-color must differ from enabled End`).not.toBe(endBorder);
      expect(resumeCursor, `${label}: disabled Resume must show not-allowed`).toBe("not-allowed");
    }
  } finally {
    await cleanup();
  }
});

test("badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 4 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);

    const needsInput = await launchSession(page, daemon, {
      directory: dirs[0]?.path ?? "",
      title: "badge-needs-input",
    });
    const failed = await launchSession(page, daemon, { directory: dirs[1]?.path ?? "", title: "badge-failed" });
    const planning = await launchSession(page, daemon, {
      directory: dirs[2]?.path ?? "",
      title: "badge-planning",
      permissionMode: "plan",
    });
    const working = await launchSession(page, daemon, { directory: dirs[3]?.path ?? "", title: "badge-working" });

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-badge-ni", { musterSession: needsInput.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-badge-ni") });
    await request.post(daemon.ingestURL("hook"), {
      data: rawNotification("claude-badge-ni", "p1", "permission_prompt"),
    });

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-badge-f", { musterSession: failed.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-badge-f") });
    await request.post(daemon.ingestURL("hook"), { data: rawStopFailure("claude-badge-f") });

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-badge-p", { musterSession: planning.id }),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit("claude-badge-p", { permissionMode: "plan" }),
    });

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart("claude-badge-w", { musterSession: working.id }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit("claude-badge-w") });

    const cardNI = sessionCard(page, "badge-needs-input");
    const cardF = sessionCard(page, "badge-failed");
    const cardP = sessionCard(page, "badge-planning");
    const cardW = sessionCard(page, "badge-working");
    await expect(stateBadge(cardNI)).toHaveText(/needs input/i);
    await expect(stateBadge(cardF)).toHaveText(/failed/i);
    await expect(stateBadge(cardP)).toHaveText(/planning/i);
    await expect(stateBadge(cardW)).toHaveText(/working/i);

    const dialog = await openSettingsDialog(page);
    for (const [label, expectedTheme] of [
      ["Instrument", "instrument"],
      ["Dark", "dark"],
      ["Light", "light"],
    ] as const) {
      await themeRadio(dialog, label).check();
      await expect.poll(() => htmlTheme(page)).toBe(expectedTheme);

      const amber = await resolvedCssVar(page, "--amber");
      const rose = await resolvedCssVar(page, "--rose");
      const violet = await resolvedCssVar(page, "--violet");
      const teal = await resolvedCssVar(page, "--teal");

      await expect(cardNI.locator(".badge"), `${label}: Needs-Input badge should be amber`).toHaveCSS(
        "color",
        amber,
      );
      await expect(cardF.locator(".badge"), `${label}: Failed badge should be rose`).toHaveCSS("color", rose);
      await expect(cardP.locator(".badge"), `${label}: Planning badge should be violet`).toHaveCSS(
        "color",
        violet,
      );
      await expect(cardW.locator(".badge"), `${label}: Working badge should be teal`).toHaveCSS("color", teal);
    }
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("a scratch Claude config with malformed JSON yields data-claude-family=unknown with no error banner or console error (E15)", async ({
  page,
  startDaemon,
}) => {
  const pageErrors: Error[] = [];
  const daemon = await startDaemon({ claudeConfigContent: "{not valid json" });
  page.on("pageerror", (err) => pageErrors.push(err));
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => htmlClaudeFamily(page)).toBe("unknown");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("theme resolution walks follow×dark -> dark×dark -> follow×light -> light×dark (INV-1)", async ({ page, startDaemon }) => {
  const daemon = await startDaemon({ claudeThemePoll: "200ms", claudeConfigContent: claudeConfigJSON("dark") });
  await page.goto(daemon.dashboardUrl);

  // follow × dark -> instrument
  await expect.poll(() => htmlClaudeFamily(page)).toBe("dark");
  await expect.poll(() => htmlTheme(page)).toBe("instrument");

  const dialog = await openSettingsDialog(page);

  // dark × dark -> dark
  await themeRadio(dialog, "Dark").check();
  await expect.poll(() => htmlTheme(page)).toBe("dark");

  // Flip family to light while the pref stays "dark" — INV-2: theme unaffected.
  await daemon.writeClaudeConfig(claudeConfigJSON("light"));
  await expect.poll(() => htmlClaudeFamily(page), { timeout: 2_000 }).toBe("light");
  expect(await htmlTheme(page)).toBe("dark");

  // follow × light -> light
  await themeRadio(dialog, "Follow Claude Code").check();
  await expect.poll(() => htmlTheme(page)).toBe("light");

  // light × dark -> light: an explicit known theme name always wins over family.
  await themeRadio(dialog, "Light").check();
  await expect.poll(() => htmlTheme(page)).toBe("light");
  await daemon.writeClaudeConfig(claudeConfigJSON("dark"));
  await expect.poll(() => htmlClaudeFamily(page), { timeout: 2_000 }).toBe("dark");
  expect(await htmlTheme(page)).toBe("light");
});

test("a rejected PUT /api/prefs never persists or applies; the Settings dialog closes on daemon-down and the checked radio only ever reflects the broadcast (INV-7, INV-4)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await expect(themeRadio(dialog, "Follow Claude Code")).toBeChecked();

  // Block the PUT at the network level (WS stays up, so the dialog stays open and the
  // radio is clickable) — isolates "a click that never reaches the daemon" from the
  // separate daemon-down scenario below. A native <input type="radio"> flips its own
  // `checked` synchronously on click regardless of app JS (unavoidable HTML semantics,
  // not something INV-7 governs); what INV-7 governs is *theme state*, which must not
  // move without a broadcast.
  await page.route("**/api/prefs", (route) => route.abort("failed"));
  await themeRadio(dialog, "Dark").click();
  expect(await htmlTheme(page)).toBe("instrument");
  await page.unroute("**/api/prefs");

  // Daemon-down: States (new-ui-design-colors) — "The Settings dialog closes with the
  // other dialogs ... since a PUT cannot land." Also confirms INV-4: neither theme
  // attribute is touched by the disconnect itself.
  await daemon.kill();
  const banner = page.getByRole("alert");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeHidden();
  await expect.poll(() => htmlTheme(page)).toBe("instrument");
  await expect.poll(() => htmlClaudeFamily(page)).toBe("unknown");

  await daemon.restart();
  await expect(banner).toBeHidden({ timeout: 15_000 });

  // REQ-9/INV-7: the checked radio only ever reflects the daemon's own broadcast —
  // neither the blocked click nor the outage ever persisted "dark" server-side, so the
  // reconnect snapshot syncs the reopened dialog's radio to the true "follow" pref.
  const dialog2 = await openSettingsDialog(page);
  await expect(themeRadio(dialog2, "Follow Claude Code")).toBeChecked();
  await expect(themeRadio(dialog2, "Dark")).not.toBeChecked();

  const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(stateRes.status()).toBe(200);
  const state = (await stateRes.json()) as { prefs: { theme: string } };
  expect(state.prefs.theme).toBe("follow");
});

// Sanity that getState (used elsewhere in this suite) still resolves against a
// theme-carrying snapshot — REQ-10, guards against a `theme` field silently vanishing
// from GET /api/state for a plain, no-session daemon.
test("GET /api/state always carries prefs.theme and claudeTheme.family (REQ-10, REQ-15)", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  const state = (await getState(page, daemon)) as unknown as {
    prefs: { theme: string };
    claudeTheme: { family: string };
  };
  expect(state.prefs.theme).toBe("follow");
  expect(state.claudeTheme.family).toBe("unknown");
});
