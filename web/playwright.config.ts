import { defineConfig, devices } from "@playwright/test";

// SPEC §8 sets the testing bar: functional E2E always, driving a real daemon and a real
// claude session in a scratch repo. That harness arrives with M0; this config currently
// drives only the Vite dev server so the scaffold is genuinely runnable.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
