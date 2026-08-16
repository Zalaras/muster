import { defineConfig, devices } from "@playwright/test";

// SPEC §8 sets the testing bar: functional E2E always, driving a real daemon and a real
// claude session in a scratch repo. That harness arrives with M0; this config currently
// drives only the Vite dev server so the scaffold is genuinely runnable.
//
// Every run gets its own port and never attaches to an existing server. Reusing a stale
// dev server silently runs the suite against the wrong build — a trap that cost real
// debugging time in a previous project. Keep both properties when M0 replaces this
// harness: per-run ports, reuseExistingServer: false.
//
// The port is pinned through an env var because Playwright re-evaluates this config in
// every worker process — a bare pid-derived value would give each worker a different
// baseURL. Workers inherit the runner's env, so first evaluation wins.
process.env.MUSTER_E2E_PORT ??= String(42000 + (process.pid % 1000));
const port = Number(process.env.MUSTER_E2E_PORT);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
