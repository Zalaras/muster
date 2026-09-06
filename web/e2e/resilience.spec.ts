import { countMigrations } from "./helpers/db";
import { expect, test } from "./helpers/fixtures";

// REQ-2, REQ-9, REQ-17, REQ-19, REQ-20 — daemon-down banner + reconnect, restart
// behaviour (token/migration persistence). Every test kills or restarts its daemon, so
// each takes the test-scoped `daemon` fixture (a fresh scratch daemon per test); the
// three are independent scenarios, so nothing here needs to run in sequence.
test.describe("daemon resilience", () => {
  test("shows the daemon-down banner when the scratch daemon is killed, and clears it on restart", async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    await expect(page.getByRole("status")).toHaveText(/connected/i);

    await daemon.kill();

    // Testable UI Elements: mandated role="alert" full-width banner.
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveText(/musterd unreachable/i);

    await daemon.restart();

    // REQ-17: the banner clears when `hello` arrives again — no page reload needed (E12).
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("status")).toHaveText(/connected/i);
  });

  test("keeps the same UI and ingest tokens across a restart on the same data dir", async ({ request, daemon }) => {
    const uiTokenBefore = daemon.uiToken;
    const ingestTokenBefore = daemon.ingestToken;

    await daemon.restart();

    expect(daemon.uiToken).toBe(uiTokenBefore);
    expect(daemon.ingestToken).toBe(ingestTokenBefore);

    const res = await request.get(`${daemon.baseURL}/healthz`);
    expect(res.status()).toBe(200);
  });

  test("does not re-apply migrations on a second startup against the same data dir", async ({ daemon }) => {
    const before = await countMigrations(daemon.dbPath);
    expect(before).toBeGreaterThan(0);

    await daemon.restart();

    const after = await countMigrations(daemon.dbPath);
    expect(after).toBe(before);
  });
});
