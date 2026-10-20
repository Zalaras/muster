// theme — the display properties of plan new-ui-design-colors (REQ-7, REQ-9, REQ-11,
// REQ-15, INV-1, INV-2: the Settings dialog's structure, what a prefs state paints on
// `<html>`, the head hint's first paint, and the per-theme computed styles of the header's
// buttons and the cards' badges), re-levelled on 2026-10-20 from web/e2e/theme.spec.ts
// (plans/_audit/relevel/misc-core.md). Nothing here changes state: `html[data-theme]` is
// adopted only from the prefs broadcast (web/src/features/theme.ts), never from the Settings
// radio, so each theme is its own fixture — `theme-dark`, `stop-resume-pair{,-dark,-light}`,
// `four-badges{,-dark,-light}` — and Instrument is `follow` with the family unknown, which
// every recorded fixture holds (the render rig has no Claude config to poll). The journeys
// — the PUT persisting, the poll reading a real config file, the restart, the kill, the
// pop-out — stay in web/e2e/theme.spec.ts.
import { focusSession, headerButton, sessionCard, stateBadge } from "./helpers/focus";
import { expect, type Page, test } from "./helpers/harness";
import { tokenColor } from "./helpers/style";
import {
  htmlClaudeFamily,
  htmlTheme,
  openSettingsDialog,
  themeLegend,
  themeRadio,
  themeRadios,
} from "./helpers/theme";

test("clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");
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
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.prefs.theme).toBe("follow");
  expect(fixture.snapshot.claudeTheme.family).toBe("unknown");
  await expect.poll(() => htmlTheme(page)).toBe("instrument");
  await expect.poll(() => htmlClaudeFamily(page)).toBe("unknown");

  const dialog = await openSettingsDialog(page);
  await expect(themeRadio(dialog, "Follow Claude Code")).toBeChecked();
});

test("after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5)", async ({
  page,
  dashboard,
}) => {
  // The first load adopts `dark` from the fixture's prefs broadcast and writes the hint the
  // head script reads (`muster.theme-hint` in localStorage, REQ-11) — the same entry a
  // chosen Dark leaves behind.
  const fixture = await dashboard.open("theme-dark");
  expect(fixture.snapshot.prefs.theme).toBe("dark");
  await expect.poll(() => htmlTheme(page)).toBe("dark");

  // Tags the attribute's value at DOMContentLoaded — before the WebSocket has any
  // chance to connect and any `snapshot` to arrive — so reading it back after
  // navigation proves the head-inline hint script (REQ-11), not the broadcast round trip,
  // painted the first frame. The harness's routes survive the reload.
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

/** The three themes the E2E chose through the radio, each as the fixture whose prefs hold it. */
const THEMES = [
  ["Instrument", "instrument", ""],
  ["Dark", "dark", "-dark"],
  ["Light", "light", "-light"],
] as const;

test("the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13)", async ({
  page,
  dashboard,
}) => {
  const mainhead = page.locator("#mainhead");
  const stopBtn = headerButton(page, "Stop");
  const resumeBtn = headerButton(page, "Resume");
  const focusLive = async () => {
    await focusSession(page, "enabled-e13");
    await expect(mainhead).toContainText("enabled-e13");
    await expect(stopBtn).toBeEnabled();
    await expect(resumeBtn).toHaveCount(0);
  };
  const focusDead = async () => {
    await focusSession(page, "disabled-e13");
    await expect(mainhead).toContainText("disabled-e13");
    await expect(resumeBtn).toBeDisabled();
    await expect(stopBtn).toHaveCount(0);
  };

  for (const [label, expectedTheme, suffix] of THEMES) {
    // A live bound session (an enabled Stop) beside a dead session no SessionStart ever
    // bound (a disabled Resume), under this theme's pref.
    const fixture = await dashboard.open(`stop-resume-pair${suffix}`);
    const titles = fixture.snapshot.sessions.map((s) => s.title);
    expect(titles).toEqual(["enabled-e13", "disabled-e13"]);
    await expect.poll(() => htmlTheme(page)).toBe(expectedTheme);

    await focusLive();
    const endColor = await stopBtn.evaluate((el) => getComputedStyle(el).color);
    const endBorder = await stopBtn.evaluate((el) => getComputedStyle(el).borderColor);
    await focusDead();
    const resumeColor = await resumeBtn.evaluate((el) => getComputedStyle(el).color);
    const resumeBorder = await resumeBtn.evaluate((el) => getComputedStyle(el).borderColor);
    const resumeCursor = await resumeBtn.evaluate((el) => getComputedStyle(el).cursor);

    expect(resumeColor, `${label}: Resume color must differ from enabled Stop`).not.toBe(endColor);
    expect(resumeBorder, `${label}: Resume border-color must differ from enabled Stop`).not.toBe(
      endBorder,
    );
    expect(resumeCursor, `${label}: disabled Resume must show not-allowed`).toBe("not-allowed");
  }
});

/** The browser's own normalised value of a `--token` colour under the page's current theme. */
async function resolvedCssVar(page: Page, token: string): Promise<string> {
  return await tokenColor(page, token);
}

test("badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14)", async ({
  page,
  dashboard,
}) => {
  for (const [label, expectedTheme, suffix] of THEMES) {
    // One card per coloured state — needs input (a permission prompt), failed (a
    // StopFailure), planning (a prompt in plan mode) and working (a prompt).
    const fixture = await dashboard.open(`four-badges${suffix}`);
    expect(fixture.snapshot.sessions.map((s) => [s.title, s.state])).toEqual([
      ["badge-needs-input", "needs_input"],
      ["badge-failed", "failed"],
      ["badge-planning", "planning"],
      ["badge-working", "working"],
    ]);

    const cardNI = sessionCard(page, "badge-needs-input");
    const cardF = sessionCard(page, "badge-failed");
    const cardP = sessionCard(page, "badge-planning");
    const cardW = sessionCard(page, "badge-working");
    await expect(stateBadge(cardNI)).toHaveText(/needs input/i);
    await expect(stateBadge(cardF)).toHaveText(/failed/i);
    await expect(stateBadge(cardP)).toHaveText(/planning/i);
    await expect(stateBadge(cardW)).toHaveText(/working/i);

    await expect.poll(() => htmlTheme(page)).toBe(expectedTheme);

    const amber = await resolvedCssVar(page, "--amber");
    const rose = await resolvedCssVar(page, "--rose");
    const violet = await resolvedCssVar(page, "--violet");
    const teal = await resolvedCssVar(page, "--teal");

    await expect(cardNI.locator(".badge"), `${label}: Needs-Input badge should be amber`).toHaveCSS(
      "color",
      amber,
    );
    await expect(cardF.locator(".badge"), `${label}: Failed badge should be rose`).toHaveCSS(
      "color",
      rose,
    );
    await expect(cardP.locator(".badge"), `${label}: Planning badge should be violet`).toHaveCSS(
      "color",
      violet,
    );
    await expect(cardW.locator(".badge"), `${label}: Working badge should be teal`).toHaveCSS(
      "color",
      teal,
    );
  }
});
