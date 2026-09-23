import { expect, test } from "./helpers/fixtures";

// The dashboard shell: masthead, unknown usage, empty sessions state, hello+snapshot, and
// GET /api/state sharing the snapshot shape.
// Every test asserts daemon-global state (the empty sessions state, the exact /api/state
// snapshot), so each takes the test-scoped `daemon` fixture: a fresh scratch daemon per
// test, per docs/conventions.md §Testing.

test("renders the masthead, connection status and empty sessions state after the WS handshake", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  await expect(page.getByRole("heading", { name: "Muster" })).toBeVisible();

  // Testable UI Elements: mandated role="status" on the masthead connection element.
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  // Exact match: the Focus main area and the Tiles view each have an empty-state
  // placeholder that contains this string as a substring ("No sessions yet — … to
  // launch"), so a non-exact getByText resolves to 3 elements. The rail's own bare-text
  // empty state (`#sessions`) is the one this test asserts on; exact:true disambiguates
  // without weakening the assertion.
  await expect(page.getByText("No sessions yet", { exact: true })).toBeVisible();
});

test("renders both usage readouts as the word unknown, never an empty gauge", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  await expect(page.getByText(/5h[\s\S]*unknown/i)).toBeVisible();
  await expect(page.getByText(/7d[\s\S]*unknown/i)).toBeVisible();

  // The DOM-structural half of REQ-16 (no gauge/meter markup at all when null) is a
  // Vitest concern per the plan's Reviewer-Verified W8 row — not re-guessed here against
  // markup this spec hasn't seen yet.
});

test("shows the Claude Code version reported by hello", async ({ page, daemon }) => {
  await page.goto(daemon.dashboardUrl);
  await expect(page.getByText(/claude\s+2\./i)).toBeVisible();
});

test("GET /api/state returns exactly the empty-daemon snapshot object once authenticated", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  const res = await page.request.get(`${daemon.baseURL}/api/state`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  // Values that follow from this scratch daemon's setup rather than from the defaults:
  // it writes no usage-token-file content, so its immediate on-Start fetch fails fast
  // with "no-credentials" (what a machine with no Keychain item sees) and
  // `modelScoped`/`modelScopedAt` stay null; `usage.model` stays null until a status post
  // carries buckets and model together; `claudeTheme.family` is "unknown" because no
  // `-claude-theme-poll` is passed; `update.install` is "dev" because `bin/musterd` is
  // stamped by `git describe`, so it never checks (`available`/`checkedAt`/`installed`
  // null, no remedy, `canCheck` false regardless of `-update-base-url`), and
  // `update.running` is matched structurally since the dev version changes every commit.
  expect(body).toEqual({
    sessions: [],
    shellsBusy: [],
    usage: {
      fiveHour: null,
      sevenDay: null,
      model: null,
      sampledAt: null,
      source: "subscription",
      modelScoped: null,
      modelScopedAt: null,
      modelScopedError: "no-credentials",
      modelScopedSource: "subscription-api",
    },
    prefs: {
      view: "focus",
      density: "2x2",
      usageModel: "Fable",
      railSort: "manual",
      theme: "follow",
      updateCheck: true,
      railDensity: "comfortable",
      railActivity: "turn",
    },
    claudeTheme: { family: "unknown" },
    update: {
      running: expect.any(String),
      install: "dev",
      remedy: null,
      canCheck: false,
      available: null,
      checkedAt: null,
      installed: null,
      apply: { phase: "idle", version: null, error: null },
    },
  });
});
