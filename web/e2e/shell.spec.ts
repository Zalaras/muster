import { expect, test } from "@playwright/test";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";

// REQ-6, REQ-7, REQ-8, REQ-15, REQ-16 — the M0 shell: masthead, unknown usage, empty
// sessions state, hello+snapshot, and GET /api/state sharing the snapshot shape.

let daemon: ScratchDaemon;

test.beforeAll(async () => {
  daemon = await startScratchDaemon();
});

test.afterAll(async () => {
  await daemon.teardown();
});

test("renders the masthead, connection status and empty sessions state after the WS handshake", async ({
  page,
}) => {
  await page.goto(daemon.dashboardUrl);

  await expect(page.getByRole("heading", { name: "Muster" })).toBeVisible();

  // Testable UI Elements: mandated role="status" on the masthead connection element.
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  // Exact match: M2 (plan m2-terminal) added two more empty-state placeholders that
  // contain this string as a substring ("No sessions yet — ⌘N to launch", in the Focus
  // main area and the Tiles view) — a non-exact getByText now resolves to 3 elements.
  // The rail's own bare-text empty state (`#sessions`, M1, unchanged) is the one this
  // test asserts on; exact:true disambiguates without weakening the assertion.
  await expect(page.getByText("No sessions yet", { exact: true })).toBeVisible();
});

test("renders both usage readouts as the word unknown, never an empty gauge", async ({ page }) => {
  await page.goto(daemon.dashboardUrl);

  // Testable UI Elements table's exact patterns for the M0 null-usage state.
  await expect(page.getByText(/5h[\s\S]*unknown/i)).toBeVisible();
  await expect(page.getByText(/7d[\s\S]*unknown/i)).toBeVisible();

  // The DOM-structural half of REQ-16 (no gauge/meter markup at all when null) is a
  // Vitest concern per the plan's Reviewer-Verified W8 row — not re-guessed here against
  // markup this spec hasn't seen yet.
});

test("shows the Claude Code version reported by hello", async ({ page }) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByText(/claude\s+2\./i)).toBeVisible();
});

test("GET /api/state returns exactly the M0 snapshot object once authenticated", async ({ page }) => {
  await page.goto(daemon.dashboardUrl);

  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  // `prefs.density` was added by plan m2-terminal (protocol §3.3 delta, default "2x2"
  // before any PUT /api/prefs) — updated here so this M0 assertion tracks the merged
  // protocol contract rather than going stale the moment m2-terminal ships.
  // `usage.model` was added by plan m3-gauges (protocol §5.4 delta) — present as an
  // explicit null until the first status post carries buckets + model together, same
  // as fiveHour/sevenDay/sampledAt — updated here for the same reason as density above.
  expect(body).toEqual({
    sessions: [],
    usage: { fiveHour: null, sevenDay: null, model: null, sampledAt: null, source: "subscription" },
    prefs: { view: "focus", density: "2x2" },
  });
});
