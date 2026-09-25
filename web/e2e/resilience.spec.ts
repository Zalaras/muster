import { countMigrations } from "./helpers/db";
import { expect, settleFor, test } from "./helpers/fixtures";

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

  test("a steady daemon-down produces no #banner mutations for its role=alert to re-announce", async ({
    page,
    daemon,
  }) => {
    await page.goto(daemon.dashboardUrl);
    await expect(page.getByRole("status")).toHaveText(/connected/i);

    const banner = page.getByRole("alert");

    await daemon.kill();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveText(/musterd unreachable/i);

    // connection.ts's render phase re-evaluates the banner on every 1 s tick
    // (main.ts's `setInterval(app.render)`) even while nothing has changed, so a
    // regression back to an unconditional write shows up here as repeated mutations to
    // an `#banner` whose text, class and `hidden` are already settled. The observer is
    // attached only once the down-transition itself has settled (above), so its own
    // mutations aren't counted.
    await page.evaluate(() => {
      const el = document.getElementById("banner");
      if (!el) throw new Error("no #banner element");
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(el, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
      (window as unknown as { __bannerMutationCount: () => number }).__bannerMutationCount = () =>
        count;
    });

    await settleFor(page, 5_000);

    expect(
      await page.evaluate(() =>
        (window as unknown as { __bannerMutationCount: () => number }).__bannerMutationCount(),
      ),
    ).toBe(0);

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
  });

  test("keeps the same UI and ingest tokens across a restart on the same data dir", async ({
    request,
    daemon,
  }) => {
    const uiTokenBefore = daemon.uiToken;
    const ingestTokenBefore = daemon.ingestToken;

    await daemon.restart();

    expect(daemon.uiToken).toBe(uiTokenBefore);
    expect(daemon.ingestToken).toBe(ingestTokenBefore);

    const res = await request.get(`${daemon.baseURL}/healthz`);
    expect(res.status()).toBe(200);
  });

  test("does not re-apply migrations on a second startup against the same data dir", async ({
    daemon,
  }) => {
    const before = await countMigrations(daemon.dbPath);
    expect(before).toBeGreaterThan(0);

    await daemon.restart();

    const after = await countMigrations(daemon.dbPath);
    expect(after).toBe(before);
  });
});
