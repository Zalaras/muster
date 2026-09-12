import { defineConfig, devices } from "@playwright/test";

// Every spec drives its own scratch `musterd` through web/e2e/helpers/fixtures.ts (fresh
// per test, or one per file — the fixture decides; never a shared dev server, per
// docs/conventions.md "never attach to an existing server"), so there is no `webServer`
// block and no shared `use.baseURL` here.
//
// The three numbers below are the suite's load policy (docs/conventions.md §Testing;
// docs/history/design/test-strategy.md has the measurements). Each scratch daemon is a musterd
// process plus a tmux server plus a stub shell, so `workers` caps how many coexist; the
// expect timeout is what every daemon- or tmux-side wait inherits — a spec shortens it
// with a comment, never lengthens it; the test timeout allows a few such waits back to
// back. This file is web-impl's (gate integrity): the agent judged by the suite does not
// hold the knobs that decide what "passing" means.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
