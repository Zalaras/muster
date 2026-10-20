import { UNKNOWN_HINT, claudeVersionReadout, waitForHello } from "./helpers/connection";
import { observedVersionRange, STUB_CLAUDE_VERSION } from "./helpers/daemon";
import { expect, test } from "./helpers/fixtures";
import { issueButton } from "./helpers/issue";

// Plan version-claude-interface — E4 and E5, and plan claude-version-watch REQ-1/REQ-2
// (E7 is `make e2e` itself, covering this file): the daemon still serving when its
// version check fails, the capture POST's claudeCode keys, and a 7 s check that neither
// delays startup nor needs a reload to land. The daemon's WS `hello.claudeCode` carries
// `{installed, floor, verified, status}` (kb:anchor/ws.hello delta, protocol 2); the
// masthead's `#claude-version` readout (web/src/render/masthead.ts's
// `renderClaudeVersion`/`describeClaudeVersion`) renders one of four states from it (plan
// UI Specifications > DOM table). What the readout shows per status — below, verified,
// above, the inert glyph, the reserved width across the unknown → below flip (E1, E2, E3,
// E6, claude-version-watch REQ-5) — is a render test in web/render/connection.spec.ts
// (re-levelled 2026-10-20, plans/_audit/relevel/misc-core.md). Every daemon here is the
// harness's own scratch musterd with the stub `claude` (helpers/daemon.ts) — REQ-13's
// knobs (`stubClaudeVersionFails`, `stubClaudeVersionDelaySeconds`) make the stub's
// `--version` reply fail or stall without ever touching a real `claude` binary
// (CLAUDE.md hard rule: no test here launches one).
//
// Floor/ceiling come from `observedVersionRange()` (helpers/daemon.ts), which reads
// REQ-1's own record (`internal/claudecode/observed_versions.txt`) off disk — never a
// version literal hardcoded here — so a future `go run ./tools/versions bump` moving the
// ceiling doesn't require an edit to this file. The default stub reply
// (`STUB_CLAUDE_VERSION`, unset knob) is below the record's floor by construction (Edge
// Case 9), so the plain `daemon` fixture alone already exercises the "below" status.

/** The leading `major.minor.patch` musterd's classifier parses out of a `--version`
 * reply — derived from `STUB_CLAUDE_VERSION` rather than a second hardcoded literal, so
 * this file tracks the harness's own default if it ever changes. */
function leadingVersion(v: string): string {
  const leading = /^(\d+\.\d+\.\d+)/.exec(v)?.[1];
  if (leading === undefined)
    throw new Error(`leadingVersion(): unparseable version ${JSON.stringify(v)}`);
  return leading;
}

const DEFAULT_STUB_INSTALLED = leadingVersion(STUB_CLAUDE_VERSION);

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
