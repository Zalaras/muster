import { expect, test } from "@playwright/test";

// Smoke test for the scaffold itself: the dev server serves the shell and the TypeScript
// entrypoint executes. It asserts the toolchain, not the product.
//
// The real E2E suite lands with M0 (scratch daemon) and M1 (a real claude session in a
// scratch repo). See SPEC §8.
test("serves the app shell and runs the entrypoint", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Muster");

  const shell = page.getByTestId("app-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveText("Muster — pre-M0 shell");
});
