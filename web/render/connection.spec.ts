// connection — the display properties of the dashboard shell (the masthead, the connection
// status and the empty rail after the handshake, the unknown usage readouts), plan
// ui-text-and-focus REQ-6/REQ-7 (the type ramp, E10) and plans version-claude-interface
// and claude-version-watch (the masthead's Claude Code version readout per
// `hello.claudeCode.status`, E1–E3, E6, REQ-5), re-levelled on 2026-10-20 from
// web/e2e/{shell,type-scale,claude-version}.spec.ts (plans/_audit/relevel/misc-core.md).
// Nothing here changes state: the readout is a pure function of the fixture's hello
// (`claude-version-{below,above,unknown}`, and every other fixture's `verified`), the
// REQ-5 flip is a `claudeCode` frame taken from the `claude-version-below` fixture's own
// hello, and the rail card the type-scale test measures comes from `three-states`. The
// journeys — the daemon still serving when its version check fails, the capture POST's
// claudeCode keys, the 7 s check landing within 3 s of startup — stay in
// web/e2e/claude-version.spec.ts.
import {
  claudeVersionReadout,
  incrementPatch,
  UNKNOWN_HINT,
  versionReadoutPattern,
  waitForHello,
} from "./helpers/connection";
import { sessionCard } from "./helpers/focus";
import { expect, loadFixture, test } from "./helpers/harness";
import { settingsButton } from "./helpers/theme";

// --- the dashboard shell (web/e2e/shell.spec.ts) ---

test("renders the masthead, connection status and empty sessions state after the WS handshake", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("empty");

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
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  expect(fixture.snapshot.usage.fiveHour).toBeNull();
  expect(fixture.snapshot.usage.sevenDay).toBeNull();

  await expect(page.getByText(/5h[\s\S]*unknown/i)).toBeVisible();
  await expect(page.getByText(/7d[\s\S]*unknown/i)).toBeVisible();

  // The DOM-structural half of REQ-16 (no gauge/meter markup at all when null) is a
  // Vitest concern per the plan's Reviewer-Verified W8 row — not re-guessed here against
  // markup this spec hasn't seen yet.
});

// --- the type ramp (web/e2e/type-scale.spec.ts) ---

test("the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("three-states");

  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe("15px");

  // Ramp mapping (Implementation Notes): today's 13.5px/14px literals collapse onto
  // `--fs-base` (1rem) — at a 15px root that resolves to 15px. The rail card's title
  // (`.name`) is exactly the element sessions.spec.ts already treats as the card's
  // title text.
  const card = sessionCard(page, "Alpha");
  await expect(card.locator(".name")).toHaveCSS("font-size", "15px");
});

// --- the Claude Code version readout (web/e2e/claude-version.spec.ts) ---
//
// The daemon's WS `hello.claudeCode` carries `{installed, floor, verified, status}`
// (kb:anchor/ws.hello, protocol 2); the masthead's `#claude-version` readout
// (web/src/render/masthead.ts's `renderClaudeVersion`/`describeClaudeVersion`) renders one
// of four states from it (plan UI Specifications > DOM table). The render rig records each
// state straight into the hello: `claude-version-below` holds an installed version under
// the floor (what the E2E's default stub reply classifies as, Edge Case 9),
// `claude-version-above` one patch over the verified ceiling, `claude-version-unknown` a
// check that failed, and every other fixture the verified ceiling itself.

test("default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("claude-version-below");
  await waitForHello(page);
  const { installed, status } = fixture.hello.claudeCode;
  expect(status).toBe("below");
  if (installed === null) throw new Error("claude-version-below: the hello carries no version");

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(versionReadoutPattern(installed));

  const glyph = readout.getByRole("img", {
    name: "This Claude Code version has not been tested with Muster — please update Claude Code",
  });
  await expect(glyph).toBeVisible();
  await expect(glyph).toHaveAttribute(
    "title",
    "This Claude Code version has not been tested with Muster — please update Claude Code",
  );
});

test("stub answering the verified ceiling: readout reads claude <ceiling> with no glyph in the readout (E2, Edge Case 9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("empty");
  await waitForHello(page);
  const { installed, verified, status } = fixture.hello.claudeCode;
  expect(status).toBe("verified");
  expect(installed).toBe(verified);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(`claude ${verified}`);
  await expect(readout.getByRole("img")).toHaveCount(0);
});

test("stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("claude-version-above");
  await waitForHello(page);
  const { installed, verified, status } = fixture.hello.claudeCode;
  expect(status).toBe("above");
  const aboveCeiling = incrementPatch(verified);
  expect(installed).toBe(aboveCeiling);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(versionReadoutPattern(aboveCeiling));

  const glyph = readout.getByRole("img", {
    name: "This Claude Code version has not been tested with Muster",
  });
  await expect(glyph).toBeVisible();
  await expect(glyph).toHaveAttribute(
    "title",
    "This Claude Code version has not been tested with Muster",
  );
  const glyphName = (await glyph.getAttribute("aria-label")) ?? "";
  expect(glyphName).not.toContain("update");
});

test("the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("claude-version-below");
  await waitForHello(page);
  const installed = fixture.hello.claudeCode.installed;
  if (installed === null) throw new Error("claude-version-below: the hello carries no version");

  await expect(page.locator("#claude-version button, #claude-version a")).toHaveCount(0);

  const readout = claudeVersionReadout(page);
  const glyph = readout.getByRole("img");
  await expect(glyph).toBeVisible();
  await glyph.click();
  await expect(glyph).toBeVisible();
  await expect(readout).toHaveText(versionReadoutPattern(installed));
});

test("a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload (claude-version-watch REQ-5)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("claude-version-unknown");
  expect(fixture.hello.claudeCode.status).toBe("unknown");
  expect(fixture.hello.claudeCode.installed).toBeNull();
  // The frame the daemon pushes once its check completes (kb:anchor/ws.claude-code): the
  // `below` fixture's own hello object, never a hand-written one — the widest version
  // state the reservation covers (a version plus the warning glyph).
  const below = (await loadFixture("claude-version-below")).hello.claudeCode;
  expect(below.status).toBe("below");
  if (below.installed === null)
    throw new Error("claude-version-below: the hello carries no version");

  const readout = claudeVersionReadout(page);
  const settings = settingsButton(page);

  // The hello's `unknown`, held while the check runs. The pre-hello placeholder is the same
  // text, so wait for "connected" (the hello) before measuring, not for the text.
  await waitForHello(page);
  await expect(readout).toHaveText("claude unknown");
  await expect(settings).toBeVisible();
  const before = await settings.boundingBox();
  if (before === null) throw new Error("#settings-button has no bounding box before the flip");
  const widthBefore = (await readout.boundingBox())?.width;

  // The hover text carries the explanation while unknown.
  await expect(readout).toHaveAttribute("title", UNKNOWN_HINT);

  // The same page, never reloaded, flips to `claude <version>` plus the warning glyph.
  dashboard.send({ type: "claudeCode", claudeCode: below });
  await expect(readout).toHaveText(versionReadoutPattern(below.installed));
  await expect(readout.getByRole("img")).toBeVisible();

  // No hover text once a version is known (the glyph keeps its own title).
  await expect(readout).toHaveAttribute("title", "");

  const after = await settings.boundingBox();
  if (after === null) throw new Error("#settings-button has no bounding box after the flip");
  expect(after.x).toBeCloseTo(before.x, 2);

  // The reservation, not luck: the readout itself keeps its width across the flip.
  const widthAfter = (await readout.boundingBox())?.width;
  expect(widthAfter).toBeCloseTo(widthBefore ?? Number.NaN, 2);
});
