// The past-sessions feature's display properties (plans/_audit/relevel/classify-launch-update.md):
// the launch dialog's New | Resume tab pair — which tab a fresh open lands on, what a tab
// round trip keeps, the keyboard between the tabs and the dialog's accessible name — and the
// Resume tab's own fetch-error state. Ported on 2026-10-20 from
// web/e2e/past-sessions.spec.ts; every journey that needs a listed row (a
// `GET /api/past-sessions` answer the harness does not serve) stays there.
//
// The dialog's open always issues a `GET /api/browse` the harness answers 404, so
// `#launch-error` carries that message throughout; nothing here reads it. The Resume tab's
// `GET /api/past-sessions` answers 404 too, which `fetchList`
// (web/src/features/launchresume.ts) takes down the same `{ok: false}` branch as a
// connection failure — the error line below.
import { type Dashboard, expect, type Page, test } from "./helpers/harness";
import { launchPrimaryButton } from "./helpers/launch";
import { pastList, pastSessionsSection, sessionKindTablist } from "./helpers/past-sessions";
import { launchDialog, newTab, openLaunchDialog, resumeTab } from "./helpers/shortcuts";

async function openEmptyDialog(page: Page, dashboard: Dashboard) {
  await dashboard.open("empty");
  const dialog = await openLaunchDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test("opening the dialog always lands on the New tab, even right after a previous open was left on Resume (REQ-7)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);
  await expect(sessionKindTablist(dialog)).toBeVisible();
  await expect(newTab(dialog)).toHaveAttribute("aria-selected", "true");

  await resumeTab(dialog).click();
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(pastSessionsSection(dialog)).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Reopen via the chord — REQ-7 names both the chord and the button.
  await page.keyboard.press("Alt+Meta+KeyN");
  const byChord = launchDialog(page);
  await expect(byChord).toBeVisible();
  await expect(newTab(byChord)).toHaveAttribute("aria-selected", "true");
  await expect(resumeTab(byChord)).toHaveAttribute("aria-selected", "false");
  await expect(pastSessionsSection(byChord)).toBeHidden();

  await resumeTab(byChord).click();
  await expect(resumeTab(byChord)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(byChord).toBeHidden();

  // And via the masthead button.
  const reopened = await openLaunchDialog(page);
  await expect(newTab(reopened)).toHaveAttribute("aria-selected", "true");
  await expect(resumeTab(reopened)).toHaveAttribute("aria-selected", "false");
  await expect(pastSessionsSection(reopened)).toBeHidden();
});

test("switching to Resume and back to New restores the form exactly as it was left (User Flow 3)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);
  await dialog.getByLabel("Title").fill("tabs-restore-title");
  await dialog.getByRole("radio", { name: "opus" }).check();
  await dialog.getByRole("radio", { name: "accept edits" }).check();

  await resumeTab(dialog).click();
  await expect(pastSessionsSection(dialog)).toBeVisible();
  await expect(dialog.locator("#launch-form .fields")).toBeHidden();

  await newTab(dialog).click();
  await expect(pastSessionsSection(dialog)).toBeHidden();
  await expect(dialog.locator("#launch-form .fields")).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("tabs-restore-title");
  await expect(dialog.getByRole("radio", { name: "opus" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "accept edits" })).toBeChecked();
});

test("with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' (E9)", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);
  await resumeTab(dialog).click();

  await expect(pastList(dialog)).toHaveText("Couldn't read sessions — try again");
  await expect(launchPrimaryButton(dialog)).toBeDisabled();
});

test("ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session'", async ({
  page,
  dashboard,
}) => {
  const dialog = await openEmptyDialog(page, dashboard);
  // The tablist sitting inside the dialog's own labelling <h2> must not leak its own
  // text ("New session Session kind") into the dialog's accessible name.
  await expect(page.getByRole("dialog", { name: "New session", exact: true })).toBeVisible();

  await newTab(dialog).click();
  await expect(newTab(dialog)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(resumeTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(resumeTab(dialog)).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(newTab(dialog)).toHaveAttribute("aria-selected", "true");
  await expect(newTab(dialog)).toBeFocused();
});
