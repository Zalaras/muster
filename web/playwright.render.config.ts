import { defineConfig, devices } from "@playwright/test";

// The render tier (web/render/): the built dashboard bundle in real Chromium with every
// request fulfilled from disk and `/ws` faked from a generated fixture — no daemon, no
// tmux, no launch (kb:adr/process-render-fixtures-generated-from-daemon).
//
// A second config rather than a project in playwright.config.ts because `globalSetup` is
// config-wide, not per project, and the two tiers hold the gate lock differently: a sweep
// holds it exclusively (it owns the machine's daemons and tmux servers), while this tier
// holds it shared — it spawns neither, so it may run beside unit tests but never beside a
// sweep, whose timing specs go red under any neighbour
// (kb:lesson/concurrent-e2e-across-worktrees-goes-red). The load numbers mirror the E2E
// config's so a render spec promoted from or demoted to e2e/ keeps its budget.
export default defineConfig({
  testDir: "./render",
  globalSetup: "./e2e/helpers/gatelock.ts",
  metadata: { gatelock: "shared" },
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
