import { expect, test } from "./helpers/fixtures";

// The dashboard shell: GET /api/state sharing the snapshot shape. What the shell shows after
// the handshake — the masthead, the connected status, the empty rail, the unknown usage
// readouts — is a render test in web/render/connection.spec.ts (re-levelled 2026-10-20,
// plans/_audit/relevel/misc-core.md); the hello's Claude Code version is
// web/render/harness.spec.ts's own smoke test.
// The test asserts daemon-global state (the exact /api/state snapshot), so it takes the
// test-scoped `daemon` fixture: a fresh scratch daemon per test, per docs/conventions.md
// §Testing.

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
  // `modelScoped`/`modelScopedAt` stay null; `usage` carries no `model` key at all;
  // `claudeTheme.family` is "unknown" because no
  // `-claude-theme-poll` is passed; `update.install` is "dev" because `bin/musterd` is
  // stamped by `git describe`, so it never checks (`available`/`checkedAt`/`installed`
  // null, no remedy, `canCheck` false regardless of `-update-base-url`), and
  // `update.running` is matched structurally since the dev version changes every commit.
  expect(body.usage).not.toHaveProperty("model");
  expect(body).toEqual({
    sessions: [],
    // The rail-groups contract (kb:anchor/ws.snapshot): a fresh daemon has no groups and an
    // Ungrouped section at the default position, uncollapsed.
    groups: [],
    ungrouped: { pos: 0, collapsed: false },
    shellsBusy: [],
    usage: {
      fiveHour: null,
      sevenDay: null,
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
