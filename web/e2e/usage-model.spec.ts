import { expect, settleFor, test } from "./helpers/fixtures";
import {
  mastheadModelSelect,
  mastheadModelWeek,
  mastheadModelWeekPercent,
  mastheadModelWeekResets,
  mastheadModelWeekTrack,
  mastheadModelWeekWarn,
  mastheadUsageRefreshButton,
} from "./helpers/gauges";
import { credentialsFileContent, FakeUsageAPI, weeklyScopedUsageResponse } from "./helpers/usageapi";

// Plan usage-model-bar — REQ-1 through REQ-14 driven end-to-end via a fake
// `GET /api/oauth/usage` endpoint (helpers/usageapi.ts) that musterd's `-usage-api-url`
// is pointed at, and a scratch `-usage-token-file` (helpers/daemon.ts) that stands in
// for the macOS Keychain. Nothing here launches a real `claude` or touches the real
// Keychain/api.anthropic.com (CLAUDE.md hard rule; REQ-13/INV-4). Plan acceptance:
// E1-E7 (E8 is `make e2e` itself, not a spec).
//
// A distinctive, fixed (never random — deterministic fixtures only) token string so
// E7/INV-4's log grep has something unambiguous to look for.
const FAKE_TOKEN = "MUSTER-E2E-FAKE-OAUTH-TOKEN-4f19bd2c";

// The measured `resets_at` form (docs/history/spikes/canary-fields.md: RFC3339 with micros and a
// `+00:00` offset) — reused across fixtures so every test exercises the same shape the
// real endpoint actually sends (REQ-4/edge case 12).
const RESETS_AT = "2026-09-01T13:59:59.522599+00:00";

// Every test needs its own daemon: `modelScoped`/`modelScopedError`/the `usageModel`
// pref are all daemon-global state (mirrors gauges.spec.ts's/views.spec.ts's rationale
// for account-level and pref-level state), and each test drives its own fake usage
// endpoint whose responses would otherwise race a concurrently-running test's daemon.
// Because `-usage-api-url` is the FakeUsageAPI's runtime port, every test spawns its
// daemon through the `startDaemon` factory (helpers/fixtures.ts), which tears it down.

test("with the fake endpoint returning a Fable 61% window, the readout shows the select, percent, warn bar and resets suffix (E1)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);

    // REQ-1: the poller's immediate on-Start fetch, not a timer, is what produces
    // this without the test waiting out any poll interval.
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelSelect(page)).toHaveValue("Fable");
    await expect(mastheadModelSelect(page).locator("option")).toHaveCount(1);
    await expect(mastheadModelSelect(page).locator("option")).toHaveText("Fable");
    await expect(mastheadModelWeekWarn(page)).toHaveCount(1);
    await expect(mastheadModelWeekTrack(page)).toHaveCount(1);
    await expect(mastheadModelWeekResets(page)).toContainText(/^· resets/);
  } finally {
    await api.stop();
  }
});

test("before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup (E2)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    // Held before the daemon even starts, so the poller's immediate on-Start fetch
    // (REQ-1) never completes for the whole test — deterministic, no race against a
    // poll interval.
    api.hold();
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);

    await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
    await expect(mastheadModelWeekTrack(page)).toHaveCount(0);
    await expect(mastheadModelWeekResets(page)).toHaveCount(0);
    // UI Specifications > States, "No data yet": select still exists, disabled,
    // single option reading the current pref (default "Fable").
    await expect(mastheadModelSelect(page)).toBeDisabled();
    await expect(mastheadModelSelect(page).locator("option")).toHaveCount(1);
    await expect(mastheadModelSelect(page)).toHaveValue("Fable");
  } finally {
    await api.stop();
  }
});

test("choosing a second model in the select re-renders to that model's percent and survives a reload (E3)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(
      200,
      weeklyScopedUsageResponse([
        { displayName: "Fable", percent: 61, resetsAt: RESETS_AT },
        { displayName: "Opus", percent: 20, resetsAt: RESETS_AT },
      ]),
    );
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelSelect(page).locator("option")).toHaveCount(2);

    await mastheadModelSelect(page).selectOption("Opus");
    await expect(mastheadModelWeekPercent(page)).toHaveText("20%");

    // REQ-8: the pref is actually persisted server-side, not merely rendered —
    // check the wire value directly rather than only the DOM.
    const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
    expect(stateRes.status()).toBe(200);
    const state = (await stateRes.json()) as { prefs: { usageModel: string } };
    expect(state.prefs.usageModel).toBe("Opus");

    await page.reload();
    await expect(mastheadModelSelect(page)).toHaveValue("Opus");
    await expect(mastheadModelWeekPercent(page)).toHaveText("20%");
  } finally {
    await api.stop();
  }
});

test("clicking Refresh usage causes a second request at the fake endpoint within 1s, and the button is aria-busy until the usage message lands (E4)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    const countBeforeClick = api.requestCount;

    // Hold the *next* response so the button's aria-busy window is observable
    // before the usage message that would otherwise clear it arrives.
    api.hold();
    await mastheadUsageRefreshButton(page).click();

    await expect(mastheadUsageRefreshButton(page)).toHaveAttribute("aria-busy", "true");
    await expect
      .poll(() => api.requestCount, {
        timeout: 1_000,
        message: "expected the Refresh usage click to reach the fake endpoint within 1s (E4)",
      })
      .toBeGreaterThan(countBeforeClick);

    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 70, resetsAt: RESETS_AT }]));
    api.release();

    await expect(mastheadModelWeekPercent(page)).toHaveText("70%");
    await expect(mastheadUsageRefreshButton(page)).not.toHaveAttribute("aria-busy", "true");
  } finally {
    await api.stop();
  }
});

test("the fake endpoint switched to 401 marks the readout stale while keeping the last-good percent, and a later 200 clears it (E5)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelWeek(page)).not.toHaveClass(/stale/);

    api.setResponse(401, { error: "unauthorized" });
    const refreshRes = await page.request.post(`${daemon.baseURL}/api/usage/refresh`);
    expect(refreshRes.status()).toBe(202);

    await expect(mastheadModelWeek(page)).toHaveClass(/stale/);
    await expect(mastheadModelWeek(page)).toHaveAttribute("title", "unauthorized");
    // INV-3: a failed poll never changes the last-good list.
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelWeekTrack(page)).toHaveCount(1);

    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const refreshRes2 = await page.request.post(`${daemon.baseURL}/api/usage/refresh`);
    expect(refreshRes2.status()).toBe(202);

    await expect(mastheadModelWeek(page)).not.toHaveClass(/stale/);
  } finally {
    await api.stop();
  }
});

test("a daemon started with -usage-poll 0 shows unknown and 404s the refresh endpoint, never calling the fake endpoint (E6)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usagePoll: "0",
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);

    await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
    await expect(mastheadModelWeekTrack(page)).toHaveCount(0);

    const refreshRes = await page.request.post(`${daemon.baseURL}/api/usage/refresh`);
    expect(refreshRes.status()).toBe(404);
    const body = (await refreshRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");

    expect(api.requestCount).toBe(0);
  } finally {
    await api.stop();
  }
});

test("the daemon's captured log output never contains the usage token string, across a success and a failure poll (E7, INV-4)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    // REQ-6's Warn-once-per-error-kind path must not log the token either.
    api.setResponse(401, { error: "unauthorized" });
    const refreshRes = await page.request.post(`${daemon.baseURL}/api/usage/refresh`);
    expect(refreshRes.status()).toBe(202);
    await expect(mastheadModelWeek(page)).toHaveClass(/stale/);

    expect(daemon.log).not.toContain(FAKE_TOKEN);
  } finally {
    await api.stop();
  }
});

test("a usageModel change in one window re-renders another window's readout via the prefs echo, seen from both Focus and Tiles (INV-6)", async ({
  page,
  browser,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(
      200,
      weeklyScopedUsageResponse([
        { displayName: "Fable", percent: 61, resetsAt: RESETS_AT },
        { displayName: "Opus", percent: 20, resetsAt: RESETS_AT },
      ]),
    );
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await pageB.goto(daemon.dashboardUrl);
      await expect(mastheadModelWeekPercent(pageB)).toHaveText("61%");

      // Window B never touched the select — Focus view, purely the `prefs` echo.
      await mastheadModelSelect(page).selectOption("Opus");
      await expect(mastheadModelWeekPercent(pageB)).toHaveText("20%");
      await expect(mastheadModelSelect(pageB)).toHaveValue("Opus");

      // Switch window B to Tiles — the masthead (and this readout) is hosted in
      // both views — and prove the echo still reaches it there.
      await pageB.getByRole("button", { name: "Tiles" }).click();
      await mastheadModelSelect(page).selectOption("Fable");
      await expect(mastheadModelWeekPercent(pageB)).toHaveText("61%");
      await expect(mastheadModelSelect(pageB)).toHaveValue("Fable");
    } finally {
      await contextB.close();
    }
  } finally {
    await api.stop();
  }
});

// review usage-model-bar cycle 1, Major 1 / Critical 1 regression test: every test
// above drives the select via `selectOption`, which sets the value programmatically and
// never touches focus or the native popup — so none of them could see the defect the
// review measured (the select being destroyed and rebuilt by the 1s render tick,
// dropping focus to <body> and killing any open dropdown). This test focuses the live
// node instead, waits past a full render tick, and asserts both that focus survived and
// that the exact same DOM node instance is still in the tree — not merely that *some*
// select happens to be focused afterwards.
test("the model select keeps focus and the same node instance across a render tick (Critical 1 regression)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Fable", percent: 61, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    const select = mastheadModelSelect(page);
    await select.focus();
    await expect(select).toBeFocused();

    // Tag the live node itself (not a Playwright-side reference) so that after the
    // wait below we can tell "this exact node is still attached and focused" apart
    // from "a freshly-built replacement select that happens to also be focused".
    await select.evaluate((node) => {
      (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag = "original-select";
    });

    // main.ts's render loop ticks every 1s; wait past more than one full tick. Before
    // the fix, `renderModelWeek` rebuilt a brand-new <select> unconditionally on
    // every pass (`el.replaceChildren(select, num)`), which detaches the focused
    // node — the reviewer measured `document.activeElement` going SELECT -> BODY and
    // the tagged node vanishing within 1.6s.
    await settleFor(page, 1600);

    await expect(select).toBeFocused();
    const stillTagged = await select.evaluate(
      (node) => (node as HTMLSelectElement & { __e2eTag?: string }).__e2eTag === "original-select",
    );
    expect(stillTagged).toBe(true);

    // The steady-state reuse path only touches `select.value`/`select.disabled` in
    // place (masthead.ts), so the value set before the wait must still read correctly
    // too — not just "focused", but still the same functioning control.
    await expect(select).toHaveValue("Fable");
  } finally {
    await api.stop();
  }
});

// web-implementation.md Fix Attempt 1, Minor 3 fix: a pref naming a model absent from a
// non-null list used to leave `select.value` unmatched (selectedIndex -1, rendering
// blank) beside the honest "unknown" percent. The fix prepends a disabled placeholder
// option carrying the pref name so the control shows that name instead of going blank.
// This is new user-visible behaviour introduced by this cycle's implementation fix, not
// covered by any existing spec (every prior test either never diverges the pref from the
// list, or exercises the null/empty-list branch, which already had its own single
// disabled option before this fix).
test("a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank (Minor 3 fix)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    api.setResponse(
      200,
      weeklyScopedUsageResponse([
        { displayName: "Fable", percent: 61, resetsAt: RESETS_AT },
        { displayName: "Opus", percent: 20, resetsAt: RESETS_AT },
      ]),
    );
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");

    // Point the pref at a model that is not in the (non-null) list returned above.
    const putRes = await page.request.put(`${daemon.baseURL}/api/prefs`, { data: { usageModel: "Sonnet" } });
    expect(putRes.status()).toBe(204);

    // INV-2 still holds: the honest "unknown" reading with zero track markup, even
    // though the underlying list is non-null and non-empty.
    await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
    await expect(mastheadModelWeekTrack(page)).toHaveCount(0);
    await expect(mastheadModelWeekResets(page)).toHaveCount(0);

    // The select itself shows the pref name via a prepended, disabled placeholder
    // option — not a blank control (selectedIndex -1) and not silently falling back
    // to the first real option.
    const select = mastheadModelSelect(page);
    await expect(select).toHaveValue("Sonnet");
    const options = select.locator("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("Sonnet");
    await expect(options.nth(0)).toHaveAttribute("disabled", "");
    await expect(options.nth(1)).toHaveText("Fable");
    await expect(options.nth(2)).toHaveText("Opus");
  } finally {
    await api.stop();
  }
});

// review usage-model-bar cycle 2, Major 1 regression test: the node-reuse cache in
// `renderModelWeek` used to key on the option-*name* sequence alone, so a
// placeholder-state flip that leaves the name sequence identical — pref "Fable" against
// list [Opus] (placeholder needed, names = ["Fable","Opus"]) and pref "Fable" against
// list [Fable, Opus] (no placeholder needed, names = ["Fable","Opus"]) collide — took
// the reuse path and never re-synced the placeholder option's `disabled` flag: a live,
// listed model could become permanently unselectable in the dropdown. This drives
// exactly that transition (the model dropped from the list, then restored via the
// refresh button at the same name sequence) and proves Fable is genuinely selectable
// afterwards with a real keyboard/typeahead interaction, not `selectOption` — a
// programmatic `selectOption` sets `<select>.value` directly and does not go through the
// browser's native disabled-option check the way a real user's keystroke does, so it
// could not have caught this defect.
test("a model dropped from the list and later restored becomes selectable again via real keyboard input (Major 1 regression)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    // Default pref is "Fable" (REQ-8); the fetched list starts without it, so the
    // control shows the disabled placeholder (Minor 3 / INV-2).
    api.setResponse(200, weeklyScopedUsageResponse([{ displayName: "Opus", percent: 20, resetsAt: RESETS_AT }]));
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent(FAKE_TOKEN),
    });
    await page.goto(daemon.dashboardUrl);

    await expect(mastheadModelWeekPercent(page)).toHaveText(/unknown/i);
    await expect(mastheadModelWeekTrack(page)).toHaveCount(0);
    await expect(mastheadModelWeekResets(page)).toHaveCount(0);
    const select = mastheadModelSelect(page);
    await expect(select).toHaveValue("Fable");
    const options = select.locator("option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText("Fable");
    await expect(options.nth(0)).toBeDisabled();
    await expect(options.nth(1)).toHaveText("Opus");

    // The endpoint now returns Fable too — the resulting option-name sequence is
    // still exactly ["Fable","Opus"] (the placeholder synthesizes that same order),
    // which is precisely the collision the node-reuse cache used to miss. Drive the
    // update via the refresh button rather than waiting out the (5m default) poll.
    api.setResponse(
      200,
      weeklyScopedUsageResponse([
        { displayName: "Fable", percent: 61, resetsAt: RESETS_AT },
        { displayName: "Opus", percent: 20, resetsAt: RESETS_AT },
      ]),
    );
    await mastheadUsageRefreshButton(page).click();

    // Fable is already the selected value, so the live percent renders without any
    // further interaction — this alone does not yet prove selectability (that's the
    // part the bug broke).
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelWeekTrack(page)).toHaveCount(1);
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText("Fable");
    await expect(options.nth(1)).toHaveText("Opus");
    // The fix: Fable's option is no longer the stale disabled placeholder now that
    // it's a real, listed window.
    await expect(options.nth(0)).toBeEnabled();

    // Prove it's genuinely selectable, not just enabled in markup, with a real
    // keyboard interaction: move away to Opus, then back to Fable via native
    // single-character typeahead — a browser skips disabled options during
    // typeahead, so pressing "F" would fail to move off "Opus" if the bug's stale
    // `disabled` flag on the Fable option were still set. The native typeahead
    // search string concatenates keys pressed within ~1s of each other (confirmed
    // against a bare, app-independent two-option <select> outside this harness:
    // "O" then "F" within the window searches for "OF", which matches nothing and
    // leaves the selection on Opus) — a real user pausing between keystrokes clears
    // it, so the wait below is what a genuine second keystroke needs, not padding
    // for the app's own render tick.
    await select.focus();
    await page.keyboard.press("O");
    await expect(select).toHaveValue("Opus");
    await expect(mastheadModelWeekPercent(page)).toHaveText("20%");

    await settleFor(page, 1100);
    await page.keyboard.press("F");
    await expect(select).toHaveValue("Fable");
    await expect(mastheadModelWeekPercent(page)).toHaveText("61%");
    await expect(mastheadModelWeekTrack(page)).toHaveCount(1);

    // REQ-8: the keyboard-driven change actually persisted server-side, not just in
    // the DOM.
    const stateRes = await page.request.get(`${daemon.baseURL}/api/state`);
    expect(stateRes.status()).toBe(200);
    const state = (await stateRes.json()) as { prefs: { usageModel: string } };
    expect(state.prefs.usageModel).toBe("Fable");
  } finally {
    await api.stop();
  }
});
