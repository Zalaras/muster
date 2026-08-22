import { defineConfig, devices } from "@playwright/test";

// M0 replaces the pre-M0 Vite dev-server scaffold: every spec drives its own scratch
// `musterd` (web/e2e/helpers/daemon.ts) with a fresh port and data dir, and navigates
// with that daemon's own absolute baseURL/dashboardUrl — never a shared dev server
// (docs/conventions.md's "never attach to an existing server" rule). There is
// therefore no `webServer` block and no shared `use.baseURL` here.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
