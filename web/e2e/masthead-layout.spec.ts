import { observedVersionRange } from "./helpers/daemon";
import type { Locator } from "./helpers/fixtures";
import { expect, test } from "./helpers/fixtures";
import { mastheadBucket, mastheadModelWeek } from "./helpers/gauges";
import { envelopedSessionStart, envelopedStatusLineFull } from "./helpers/payloads";
import { envelopeOpts, launchSession, scratchDirectory } from "./helpers/session";
import {
  credentialsFileContent,
  FakeUsageAPI,
  weeklyScopedUsageResponse,
} from "./helpers/usageapi";

// ADR usage-masthead-narrow-width-shrinks-bars-truncates-model (issue #52): the masthead
// never wraps its text at any width (`.masthead { white-space: nowrap }`, every child
// `flex: none` except `.masthead-right`, and within it only `.model` is elastic); at and
// below the ≤1840px tier its gaps tighten and `.bar` drops 96px -> 40px. `.model`
// (#usage-model) is the one readout that truncates, carrying the full name as `title`.
// This spec drives every masthead readout to "known" the same way gauges.spec.ts and
// usage-model.spec.ts do — synthesized hook/status-line POSTs to a real launched session
// for the two rate-limit buckets, and a FakeUsageAPI response for the model-week window —
// and measures the rendered layout at the regressing width. No real `claude` and no real
// Keychain/api.anthropic.com traffic (CLAUDE.md hard rule).

// A long display name, chosen to be the worst case for `.model`'s ellipsis (well past
// its 6ch min-width) rather than a name that happens to already fit.
const LONG_MODEL_NAME = "Opus 5.5 (1M context)";

/**
 * A resets_at a minute away from "now", guaranteed to land on the same calendar day as
 * whatever `now` is when `formatResets` (web/src/sessions/format.ts) renders it —
 * `renderUsageTrack`'s `now` is the browser's real wall clock at render time
 * (web/src/app.ts's render loop), and playwright.config.ts sets no `timezoneId`, so the
 * comparison happens in the test runner's own local zone. Same-day is what renders the
 * wider "resets HH:MM" form asserted below; any other day renders the short weekday form
 * instead. A fixed "+2h" offset would flip to the weekday form for a run starting within
 * 2h of local midnight; this instead moves forward a minute, or back a minute on the rare
 * run inside the last minute of the day, so it always lands on today regardless of when
 * the suite happens to run.
 */
function sameDayResetsAt(): Date {
  const now = new Date();
  const forward = new Date(now.getTime() + 60_000);
  if (forward.getDate() === now.getDate()) return forward;
  return new Date(now.getTime() - 60_000);
}

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

test("at a 14-inch laptop's 1512px viewport, the masthead fits one row with no wrap and the model readout truncates via title (issue #52)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    const resetsAt = sameDayResetsAt();
    const resetsEpoch = Math.floor(resetsAt.getTime() / 1000);
    const resetsIso = resetsAt.toISOString();
    // A verified (not "below"/"unknown") Claude Code version, matching normal operation
    // — the default stub reply classifies "below" and appends a warning glyph
    // (claude-version.spec.ts E1), which is realistic but not the common case this
    // layout is meant to hold up under.
    const { verified } = await observedVersionRange();

    // model-week "known" needs a window naming the default `usageModel` pref
    // ("Fable", usage-model.spec.ts) so the immediate on-Start fetch (REQ-1) renders
    // the bar/select/resets without any interaction.
    api.setResponse(
      200,
      weeklyScopedUsageResponse([{ displayName: "Fable", percent: 15, resetsAt: resetsIso }]),
    );
    const daemon = await startDaemon({
      usageApiURL: api.baseURL,
      usageTokenContent: credentialsFileContent("MUSTER-E2E-FAKE-OAUTH-TOKEN-issue52"),
      stubClaudeVersion: verified,
    });

    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto(daemon.dashboardUrl);

    // Realistic connection state before measuring layout — not the transient
    // "reconnecting…" + "Claude installation unknown" combination that only shows
    // briefly pre-hello (an accepted, unmeasured overflow case, not this test's concern).
    await expect(page.locator("#connection-status")).toHaveText("connected");
    await expect(page.locator("#claude-version")).toHaveText(`claude ${verified}`);

    const { path: dir, cleanup } = await scratchDirectory();
    try {
      const session = await launchSession(page, daemon, {
        directory: dir,
        title: "masthead-layout-1512",
      });
      const claudeId = "claude-masthead-layout-1512";

      await page.request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
      });
      await page.request.post(daemon.ingestURL("status"), {
        data: envelopedStatusLineFull(claudeId, {
          ...(await envelopeOpts(session, daemon)),
          // Worst case, not a middling one: 5h at its widest number (100%) and every
          // bucket's resets_at same-day so all three readouts render the wider
          // "· resets HH:MM" form rather than the short weekday form.
          fiveHourPct: 100,
          fiveHourResetsAt: resetsEpoch,
          sevenDayPct: 10,
          sevenDayResetsAt: resetsEpoch,
          model: { id: "claude-opus-5-5-1m", displayName: LONG_MODEL_NAME },
        }),
      });

      // Every readout known: both buckets with reset suffixes, the model-week bar,
      // and the model readout showing (all preconditions for the layout below).
      await expect(mastheadBucket(page, "5h")).toContainText("100%");
      await expect(mastheadBucket(page, "5h")).toContainText(/· resets \d{2}:\d{2}/);
      await expect(mastheadBucket(page, "7d")).toContainText("10%");
      await expect(mastheadBucket(page, "7d")).toContainText(/· resets \d{2}:\d{2}/);
      await expect(mastheadModelWeek(page)).toContainText("15%");
      await expect(mastheadModelWeek(page)).toContainText(/· resets \d{2}:\d{2}/);
      const modelReadout = page.locator("#usage-model");
      await expect(modelReadout).toHaveText(LONG_MODEL_NAME);

      // No horizontal overflow — but `.masthead`'s own scrollWidth/clientWidth is
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
          paddingBoxRight: mastheadRect.right - paddingRight,
        };
      });
      expect(
        layout.mastheadScrollWidth,
        "masthead scrollWidth should not exceed its clientWidth at 1512px",
      ).toBeLessThanOrEqual(layout.mastheadClientWidth + 1);
      expect(
        layout.rightScrollWidth,
        ".masthead-right scrollWidth should not exceed its own clientWidth at 1512px",
      ).toBeLessThanOrEqual(layout.rightClientWidth + 1);
      expect(
        layout.connRight,
        "#connection-status's right edge should sit inside the masthead's padding box, not spill into its right padding",
      ).toBeLessThanOrEqual(layout.paddingBoxRight + 1);

      // Nothing wraps — the pre-fix symptom (ADR context) was each gauge's
      // "· resets HH:MM" and the New session/model/claude-version readouts going
      // onto multiple lines, growing the masthead from 46px to 63px.
      await expectSingleLine(page.locator("#usage-5h"), "#usage-5h");
      await expectSingleLine(page.locator("#usage-7d"), "#usage-7d");
      await expectSingleLine(page.locator("#usage-model-week"), "#usage-model-week");
      await expectSingleLine(page.locator("#new-session-button"), "#new-session-button");
      await expectSingleLine(modelReadout, "#usage-model");
      await expectSingleLine(page.locator("#claude-version"), "#claude-version");

      // `.model` is the one readout allowed to shrink and truncate — pin that it
      // actually absorbed the squeeze (scrollWidth > clientWidth means real content
      // is clipped, not merely that the element happens to be narrow) rather than
      // just asserting the fallback title attribute exists.
      const modelOverflow = await modelReadout.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(
        modelOverflow.scrollWidth,
        "#usage-model should be truncating (scrollWidth > clientWidth) at 1512px with a long model name",
      ).toBeGreaterThan(modelOverflow.clientWidth);

      // The truncated readout keeps the full name as a hover tooltip
      // (masthead.ts renderUsageModel).
      await expect(modelReadout).toHaveAttribute("title", LONG_MODEL_NAME);
    } finally {
      await cleanup();
    }
  } finally {
    await api.stop();
  }
});

test("at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width (issue #52)", async ({
  page,
  startDaemon,
}) => {
  const api = await FakeUsageAPI.start();
  try {
    const resetsAt = sameDayResetsAt();
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
          model: { id: "claude-opus-5-5-1m", displayName: LONG_MODEL_NAME },
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
