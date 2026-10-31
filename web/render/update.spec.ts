// The update feature's display properties (plans/_audit/relevel/classify-launch-update.md):
// what the Settings dialog's Updates section shows for the one update state every fixture
// holds — `install: dev`, `canCheck: false`, nothing available, nothing checked — since the
// fixture generator builds its server with the update feature disabled. Ported on 2026-10-20
// from web/e2e/update.spec.ts; every journey (a check, an apply, a restart) stays there, as do
// the properties of the other update states until the generator can record one.
import { expect, test } from "./helpers/harness";
import { openSettingsDialog } from "./helpers/theme";
import {
  settingsBadgeDot,
  updateApplyButton,
  updateAvailableReadout,
  updateCheckButton,
  updateRestartButton,
} from "./helpers/update";

test("Check now is disabled on a daemon started with an empty update base URL (E12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.update?.canCheck).toBe(false);

  const dialog = await openSettingsDialog(page);
  await expect(updateCheckButton(dialog)).toBeDisabled();
});

// The display half of "a dev build never checks or badges, and the dialog shows no Update
// buttons"; the zero-`/latest`-requests half stays in web/e2e/update.spec.ts.
test("a dev build shows the not-checked readout, no Update buttons and no badge (E8, REQ-8)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.update?.install).toBe("dev");

  const dialog = await openSettingsDialog(page);
  await expect(updateAvailableReadout(dialog)).toHaveText("not checked (development build)");
  await expect(updateApplyButton(dialog)).toHaveCount(0);
  // Both buttons stay in the DOM always (toggled via the `hidden` attribute plus its
  // `display:none` CSS companion in style.css, never removed) — `updateRestartButton`
  // is an id locator, not a role query, so it doesn't benefit from getByRole's default
  // accessibility-tree exclusion of hidden elements the way updateApplyButton above
  // does. toBeHidden() is the correct "absent" check for it.
  await expect(updateRestartButton(dialog)).toBeHidden();
  await expect(settingsBadgeDot(page)).toBeHidden();
});
