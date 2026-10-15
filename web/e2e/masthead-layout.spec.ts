import { observedVersionRange } from "./helpers/daemon";
import type { Locator } from "./helpers/fixtures";
import { expect, test } from "./helpers/fixtures";
import {
  mastheadBucket,
  mastheadModelSelect,
  mastheadModelWeek,
  mastheadModelWeekResets,
} from "./helpers/gauges";
import {
  epochSeconds,
  expectedResetsText,
  mastheadBucketResets,
  nextWeekday,
  RESETS_OTHER_DAY,
  removedModelReadout,
} from "./helpers/masthead";
import { envelopedSessionStart, envelopedStatusLineFull } from "./helpers/payloads";
import { envelopeOpts, launchSession, scratchDirectory } from "./helpers/session";
import {
  credentialsFileContent,
  FakeUsageAPI,
  weeklyScopedUsageResponse,
} from "./helpers/usageapi";

// ADR usage-masthead-narrow-width-shrinks-bars (issue #52, plan masthead-indicators): the
// masthead never wraps its text at any width (`.masthead { white-space: nowrap }`, every
// child `flex: none`); at and below the <=1840px tier its gaps tighten and `.bar` drops
// 96px -> 40px. With the model readout gone no readout truncates, so the row has to fit
// by what it shows. This spec drives every masthead readout to "known" the same way
// gauges.spec.ts and usage-model.spec.ts do - synthesized hook/status-line POSTs to a real
// launched session for the two rate-limit buckets, and a FakeUsageAPI response for the
// model-week window - and measures the rendered layout at the regressing widths. No real
// `claude` and no real Keychain/api.anthropic.com traffic (CLAUDE.md hard rule).
//
// Fixture plan: `startDaemon`, because the model-week window needs a fake usage endpoint
// whose port is computed in the test.

/**
 * Asserts `locator` renders on exactly one text line. Compares the element's *content*
 * height (its border-box height minus its own padding and border — `#new-session-button`
 * and the `.btn`-styled controls carry real vertical padding/border that isn't text, so
 * comparing the raw border-box height against a line-height would flag a padded
 * single-line button as "wrapped") against its own computed line-height (falling back to
 * the CSS-recommended ~1.2x font-size when the engine reports `line-height: normal` as
 * something `parseFloat` can't read) rather than a hardcoded pixel figure, so the check
 * survives a font-metrics change. A wrapped readout is not a little taller than one line —
 * the `.resets` suffix wrapping (this bug's actual pre-fix symptom, measured 46px -> 63px
 * for the *whole masthead* across three wrapped readouts) multiplies a single element's
 * own content height by 2-3x — so a 1.6x line-height ceiling has slack for
 * descender/leading rounding while still catching any real wrap.
 */
async function expectSingleLine(locator: Locator, label: string): Promise<void> {
  const metrics = await locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    let lineHeight = Number.parseFloat(cs.lineHeight);
    if (Number.isNaN(lineHeight)) {
      lineHeight = Number.parseFloat(cs.fontSize) * 1.2;
    }
    const verticalPadding = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
    const verticalBorder =
      Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
    const contentHeight = el.getBoundingClientRect().height - verticalPadding - verticalBorder;
    return { contentHeight, lineHeight };
  });
  expect(metrics.contentHeight, `${label} should render on a single text line`).toBeLessThanOrEqual(
    metrics.lineHeight * 1.6,
  );
}

// The widest realistic suffix on every bar: an other-day reset, which carries the weekday.
// The next Wednesday at least two days out, so it is never today whatever day the suite runs.
// 1280 is the width browser review cycle 3 found the readout's reserved width pushing
// #connection-status off-screen at, with every gauge known (plan REQ-5).
for (const width of [1512, 1440, 1280]) {
  test(`at ${width}px with every gauge known, the model-week selector showing and other-day resets on all three bars, the masthead is one row with no wrapped text and no model readout (E7, REQ-11, issue #52)`, async ({
    page,
    startDaemon,
  }) => {
    const api = await FakeUsageAPI.start();
    try {
      const resetsAt = nextWeekday(3, 20, 8);
      // A verified (not "below"/"unknown") Claude Code version, matching normal operation
      // - the default stub reply classifies "below" and appends a warning glyph
      // (claude-version.spec.ts E1), which is realistic but not the common case this
      // layout is meant to hold up under.
      const { verified } = await observedVersionRange();

      // model-week "known" needs a window naming the default `usageModel` pref
      // ("Fable", usage-model.spec.ts) so the immediate on-Start fetch (REQ-1) renders
      // the bar/select/resets without any interaction.
      api.setResponse(
        200,
        weeklyScopedUsageResponse([
          { displayName: "Fable", percent: 15, resetsAt: resetsAt.toISOString() },
        ]),
      );
      const daemon = await startDaemon({
        usageApiURL: api.baseURL,
        usageTokenContent: credentialsFileContent(`MUSTER-E2E-FAKE-OAUTH-TOKEN-layout-${width}`),
        stubClaudeVersion: verified,
      });

      await page.setViewportSize({ width, height: 982 });
      await page.goto(daemon.dashboardUrl);

      // Realistic connection state before measuring layout - not the transient
      // "connecting…" + "Claude installation unknown" combination that only shows
      // briefly pre-hello (an accepted, unmeasured overflow case, not this test's concern).
      await expect(page.locator("#connection-status")).toHaveText("connected");
      await expect(page.locator("#claude-version")).toHaveText(`claude ${verified}`);

      const { path: dir, cleanup } = await scratchDirectory();
      try {
        const session = await launchSession(page, daemon, {
          directory: dir,
          title: `masthead-layout-${width}`,
        });
        const claudeId = `claude-masthead-layout-${width}`;

        await page.request.post(daemon.ingestURL("hook"), {
          data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
        });
        await page.request.post(daemon.ingestURL("status"), {
          data: envelopedStatusLineFull(claudeId, {
            ...(await envelopeOpts(session, daemon)),
            // Worst case, not a middling one: 5h at its widest number (100%) and every
            // bucket's resets_at on another day so all three readouts render the wider
            // "(HH:MM Ddd)" form rather than the bare "(HH:MM)".
            fiveHourPct: 100,
            fiveHourResetsAt: epochSeconds(resetsAt),
            sevenDayPct: 10,
            sevenDayResetsAt: epochSeconds(resetsAt),
          }),
        });

        // Every readout known: both buckets with reset suffixes, the model-week bar and
        // its selector (all preconditions for the layout below).
        const expected = await expectedResetsText(page, resetsAt);
        expect(expected).toMatch(RESETS_OTHER_DAY);
        await expect(mastheadBucket(page, "5h")).toContainText("100%");
        await expect(mastheadBucketResets(page, "5h")).toHaveText(expected);
        await expect(mastheadBucket(page, "7d")).toContainText("10%");
        await expect(mastheadBucketResets(page, "7d")).toHaveText(expected);
        await expect(mastheadModelWeek(page)).toContainText("15%");
        await expect(mastheadModelWeekResets(page)).toHaveText(expected);
        await expect(mastheadModelSelect(page)).toBeVisible();
        await expect(removedModelReadout(page)).toHaveCount(0);

        // No horizontal overflow - but `.masthead`'s own scrollWidth/clientWidth is
        // blind to up to 16px of `.masthead-right` spilling into `.masthead`'s own
        // right padding (padding is inside the border box, not inside
        // `.masthead-right`'s box, so `.masthead-right` can overflow into it without
        // `.masthead` itself ever reporting a wider scrollWidth). Check
        // `.masthead-right` doesn't overflow itself, and directly measure its last
        // visible child's right edge against `.masthead`'s padding box.
        const layout = await page.evaluate(() => {
          const masthead = document.querySelector(".masthead") as HTMLElement;
          const right = document.querySelector(".masthead-right") as HTMLElement;
          const conn = document.querySelector("#connection-status") as HTMLElement;
          const mastheadRect = masthead.getBoundingClientRect();
          const connRect = conn.getBoundingClientRect();
          const paddingRight = Number.parseFloat(getComputedStyle(masthead).paddingRight);
          return {
            mastheadScrollWidth: masthead.scrollWidth,
            mastheadClientWidth: masthead.clientWidth,
            rightScrollWidth: right.scrollWidth,
            rightClientWidth: right.clientWidth,
            connRight: connRect.right,
            viewportWidth: document.documentElement.clientWidth,
            paddingBoxRight: mastheadRect.right - paddingRight,
          };
        });
        // The connection dot is fully on-screen, not merely inside the masthead's own
        // padding box (the masthead can itself overflow the viewport).
        expect(
          layout.connRight,
          `#connection-status should sit fully inside the ${width}px viewport`,
        ).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.connRight).toBeGreaterThan(0);

        expect(
          layout.mastheadScrollWidth,
          `masthead scrollWidth should not exceed its clientWidth at ${width}px`,
        ).toBeLessThanOrEqual(layout.mastheadClientWidth + 1);
        expect(
          layout.rightScrollWidth,
          `.masthead-right scrollWidth should not exceed its own clientWidth at ${width}px`,
        ).toBeLessThanOrEqual(layout.rightClientWidth + 1);
        expect(
          layout.connRight,
          "#connection-status's right edge should sit inside the masthead's padding box, not spill into its right padding",
        ).toBeLessThanOrEqual(layout.paddingBoxRight + 1);

        // Nothing wraps - the pre-fix symptom (ADR context) was each gauge's reset suffix
        // and the New session/claude-version readouts going onto multiple lines, growing
        // the masthead from 46px to 63px.
        await expectSingleLine(page.locator("#usage-5h"), "#usage-5h");
        await expectSingleLine(page.locator("#usage-7d"), "#usage-7d");
        await expectSingleLine(page.locator("#usage-model-week"), "#usage-model-week");
        await expectSingleLine(mastheadBucketResets(page, "5h"), "#usage-5h .resets");
        await expectSingleLine(mastheadBucketResets(page, "7d"), "#usage-7d .resets");
        await expectSingleLine(mastheadModelWeekResets(page), "#usage-model-week .resets");
        await expectSingleLine(page.locator("#new-session-button"), "#new-session-button");
        await expectSingleLine(page.locator("#claude-version"), "#claude-version");

        // One row, measured against the same masthead where it certainly is one: the
        // height at this width equals the height at a width far above the 1840px tier.
        const mastheadHeight = async (): Promise<number> =>
          (await page.locator(".masthead").boundingBox())?.height ?? 0;
        const narrowHeight = await mastheadHeight();
        expect(narrowHeight).toBeGreaterThan(0);
        await page.setViewportSize({ width: 2400, height: 982 });
        await expect.poll(mastheadHeight).toBeCloseTo(narrowHeight, 0);
      } finally {
        await cleanup();
      }
    } finally {
      await api.stop();
    }
  });
}

test("at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width (issue #52)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    const resetsAt = nextWeekday(3, 20, 8);
    const { verified } = await observedVersionRange();
    api.setResponse(
      200,
      weeklyScopedUsageResponse([
        { displayName: "Fable", percent: 15, resetsAt: resetsAt.toISOString() },
      ]),
    );
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent("MUSTER-E2E-FAKE-OAUTH-TOKEN-issue52-wide"),
      stubClaudeVersion: verified,
    });

    const { path: dir, cleanup } = await scratchDirectory();
    try {
      // Measure the narrow (<=1840px) case first, same session/page, then widen —
      // deterministic before/after on the identical DOM rather than two separate
      // page loads racing two separate fetches.
      await page.setViewportSize({ width: 1512, height: 982 });
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, {
        directory: dir,
        title: "masthead-layout-1900",
      });
      const claudeId = "claude-masthead-layout-1900";

      await page.request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
      });
      await page.request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          ...(await envelopeOpts(session, daemon)),
          fiveHourPct: 45,
          sevenDayPct: 10,
        }),
      });
      await expect(mastheadBucket(page, "5h")).toContainText("45%");

      const narrowBar = page.locator("#usage-5h .bar");
      await expect(narrowBar).toHaveCSS("width", "40px");

      // Above the 1840px tier.
      await page.setViewportSize({ width: 1900, height: 982 });
      const wideBar = page.locator("#usage-5h .bar");
      await expect(wideBar).toHaveCSS("width", "96px");
    } finally {
      await cleanup();
    }
  } finally {
    await api.stop();
  }
});
