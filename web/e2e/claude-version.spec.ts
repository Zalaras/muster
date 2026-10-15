import { observedVersionRange, STUB_CLAUDE_VERSION } from "./helpers/daemon";
import { expect, test, type Locator, type Page } from "./helpers/fixtures";
import { issueButton } from "./helpers/issue";

// Plan version-claude-interface — E1 through E6 (E7 is `make e2e` itself, covering this
// file). The daemon's WS `hello.claudeCode` carries `{installed, floor, verified,
// status}` (kb:anchor/ws.hello delta, protocol 2); the masthead's `#claude-version`
// readout (web/src/render/masthead.ts's `renderClaudeVersion`/`describeClaudeVersion`)
// renders one of four states from it (plan UI Specifications > DOM table). Every daemon
// here is the harness's own scratch musterd with the stub `claude` (helpers/daemon.ts)
// — REQ-13's two knobs (`stubClaudeVersion`, `stubClaudeVersionFails`) make the stub's
// `--version` reply land inside, above, or nowhere in the verified range without ever
// touching a real `claude` binary (CLAUDE.md hard rule: no test here launches one).
//
// Floor/ceiling come from `observedVersionRange()` (helpers/daemon.ts), which reads
// REQ-1's own record (`internal/claudecode/observed_versions.txt`) off disk — never a
// version literal hardcoded here — so a future `go run ./tools/versions bump` moving the
// ceiling doesn't require an edit to this file. The default stub reply
// (`STUB_CLAUDE_VERSION`, unset knob) is below the record's floor by construction (Edge
// Case 9), so the plain `daemon` fixture alone already exercises the "below" status;
// tests needing "verified"/"above"/"unknown" use `startDaemon` with the relevant knob.

/** The leading `major.minor.patch` musterd's classifier parses out of a `--version`
 * reply — derived from `STUB_CLAUDE_VERSION` rather than a second hardcoded literal, so
 * this file tracks the harness's own default if it ever changes. */
function leadingVersion(v: string): string {
  const leading = /^(\d+\.\d+\.\d+)/.exec(v)?.[1];
  if (leading === undefined)
    throw new Error(`leadingVersion(): unparseable version ${JSON.stringify(v)}`);
  return leading;
}

function incrementPatch(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const major = m?.[1];
  const minor = m?.[2];
  const patch = m?.[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`incrementPatch(): unparseable version ${JSON.stringify(version)}`);
  }
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function claudeVersionReadout(page: Page): Locator {
  return page.locator("#claude-version");
}

/** The readout's hover text while its state is unknown — pre-hello and `status: "unknown"`
 * both render it (plan REQ-5, decision readout-reserved-width B). Cleared by every other state. */
const UNKNOWN_HINT = "The Claude Code version check failed or hasn't completed yet";

/** Waits for the WS `hello` frame. The readout's pre-hello placeholder and its
 * `status: "unknown"` state are the same text ("claude unknown"), so the text can no longer
 * tell them apart; the connection status can: `features/connection.ts`'s `connected()`
 * flips it to "connected" and renders the hello's `claudeCode` in the same synchronous
 * call (UI Specifications > User Flows 1), so "connected" means the readout shows the
 * hello's state. */
async function waitForHello(page: Page): Promise<void> {
  await expect(page.locator("#connection-status")).toHaveText("connected");
}

const DEFAULT_STUB_INSTALLED = leadingVersion(STUB_CLAUDE_VERSION);

test("default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await waitForHello(page);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(
    new RegExp(`^claude ${DEFAULT_STUB_INSTALLED.replace(/\./g, "\\.")}(\\s|$)`),
  );

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
  startDaemon,
}) => {
  const { verified } = await observedVersionRange();
  const daemon = await startDaemon({ stubClaudeVersion: verified });
  await page.goto(daemon.dashboardUrl);
  await waitForHello(page);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(`claude ${verified}`);
  await expect(readout.getByRole("img")).toHaveCount(0);
});

test("stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9)", async ({
  page,
  startDaemon,
}) => {
  const { verified } = await observedVersionRange();
  const aboveCeiling = incrementPatch(verified);
  const daemon = await startDaemon({ stubClaudeVersion: aboveCeiling });
  await page.goto(daemon.dashboardUrl);
  await waitForHello(page);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText(
    new RegExp(`^claude ${aboveCeiling.replace(/\./g, "\\.")}(\\s|$)`),
  );

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

test("stub whose --version fails: the dashboard still serves and the readout reads exactly claude unknown with the check-failed hover text, no glyph (E4, Edge Case 1)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubClaudeVersionFails: true });
  await page.goto(daemon.dashboardUrl);

  // INV-3: no version-check outcome makes musterd exit non-zero or skip serving.
  // Reaching "connected" is the functional proof (embedded.spec.ts's own idiom); it is also
  // the hello, so the readout below is the hello's `unknown`, not the pre-hello placeholder.
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  const readout = claudeVersionReadout(page);
  await expect(readout).toHaveText("claude unknown");
  await expect(readout).toHaveAttribute("title", UNKNOWN_HINT);
  await expect(readout.getByRole("img")).toHaveCount(0);
});

test("POST /api/issue/captures snapshot carries exactly the four claudeCode keys, status below, matching hello (E5)", async ({
  page,
  daemon,
}) => {
  const { floor, verified } = await observedVersionRange();
  await page.goto(daemon.dashboardUrl);
  await waitForHello(page);

  const capturePromise = page.waitForResponse(
    (r) => r.url() === `${daemon.baseURL}/api/issue/captures` && r.request().method() === "POST",
  );
  await issueButton(page).click();
  const res = await capturePromise;
  const body = (await res.json()) as { snapshot: { claudeCode: Record<string, unknown> } };

  const claudeCode = body.snapshot.claudeCode;
  expect(Object.keys(claudeCode).sort()).toEqual(["floor", "installed", "status", "verified"]);
  expect(claudeCode.status).toBe("below");
  expect(claudeCode.installed).toBe(DEFAULT_STUB_INSTALLED);
  expect(claudeCode.floor).toBe(floor);
  expect(claudeCode.verified).toBe(verified);
});

test("the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await waitForHello(page);

  await expect(page.locator("#claude-version button, #claude-version a")).toHaveCount(0);

  const readout = claudeVersionReadout(page);
  const glyph = readout.getByRole("img");
  await expect(glyph).toBeVisible();
  await glyph.click();
  await expect(glyph).toBeVisible();
  await expect(readout).toHaveText(
    new RegExp(`^claude ${DEFAULT_STUB_INSTALLED.replace(/\./g, "\\.")}(\\s|$)`),
  );
});

test("a stub whose --version takes 7 s: the daemon serves within 3 s and the open dashboard's readout flips to the version with no reload (claude-version-watch REQ-1, REQ-2)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubClaudeVersionDelaySeconds: 7 });

  // REQ-1: /healthz answered, measured from the spawn, without waiting on the version check.
  expect(daemon.startupMs).toBeLessThan(3_000);

  await page.goto(daemon.dashboardUrl);
  const readout = claudeVersionReadout(page);

  // Until the check finishes the dashboard holds `unknown` (hello.claudeCode "not checked yet").
  // Wait for the hello first: the pre-hello placeholder reads the same text.
  await waitForHello(page);
  await expect(readout).toHaveText("claude unknown");
  await expect(readout).toHaveAttribute("title", UNKNOWN_HINT);

  // REQ-2: the same page, never reloaded, re-renders from the pushed `claudeCode` message.
  await expect(readout).toHaveText(
    new RegExp(`^claude ${DEFAULT_STUB_INSTALLED.replace(/\./g, "\\.")}(\\s|$)`),
  );
});

test("a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload (claude-version-watch REQ-5)", async ({
  page,
  startDaemon,
}) => {
  const daemon = await startDaemon({ stubClaudeVersionDelaySeconds: 7 });
  await page.goto(daemon.dashboardUrl);

  const readout = claudeVersionReadout(page);
  const settings = page.locator("#settings-button");

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

  // The same page, never reloaded, flips to `claude <version>` plus the warning glyph (the
  // default stub reply classifies "below") - the widest version state the reservation covers.
  await expect(readout).toHaveText(
    new RegExp(`^claude ${DEFAULT_STUB_INSTALLED.replace(/\./g, "\\.")}(\\s|$)`),
  );
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
