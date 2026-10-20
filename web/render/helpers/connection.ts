// The masthead's Claude Code version readout (plan version-claude-interface, plan
// claude-version-watch): its locator, the hover text its unknown state carries and the
// text pattern a known version renders. Pure DOM — no daemon, no fixture knowledge — so
// both tiers use it: the render spec here directly (the readout for a fixture's
// `hello.claudeCode`), the E2E journeys through `web/e2e/helpers/connection.ts`, which
// re-exports it.
import { expect, type Locator, type Page } from "./harness";
import { connectionStatus } from "./usage";

/** `#claude-version` — web/src/render/masthead.ts's `renderClaudeVersion` target. */
export function claudeVersionReadout(page: Page): Locator {
  return page.locator("#claude-version");
}

/** The readout's hover text while its state is unknown — pre-hello and `status: "unknown"`
 * both render it (plan REQ-5, decision readout-reserved-width B). Cleared by every other state. */
export const UNKNOWN_HINT = "The Claude Code version check failed or hasn't completed yet";

/** `claude <installed>` at the start of the readout, followed by a space (the warning glyph's
 * separator) or the end. */
export function versionReadoutPattern(installed: string): RegExp {
  return new RegExp(`^claude ${installed.replace(/\./g, "\\.")}(\\s|$)`);
}

/** `major.minor.patch` with its patch one higher — the first version above a ceiling. */
export function incrementPatch(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const major = m?.[1];
  const minor = m?.[2];
  const patch = m?.[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`incrementPatch(): unparseable version ${JSON.stringify(version)}`);
  }
  return `${major}.${minor}.${Number(patch) + 1}`;
}

/** Waits for the WS `hello` frame. The readout's pre-hello placeholder and its
 * `status: "unknown"` state are the same text ("claude unknown"), so the text can no longer
 * tell them apart; the connection status can: `features/connection.ts`'s `connected()`
 * flips it to "connected" and renders the hello's `claudeCode` in the same synchronous
 * call (UI Specifications > User Flows 1), so "connected" means the readout shows the
 * hello's state. */
export async function waitForHello(page: Page): Promise<void> {
  await expect(connectionStatus(page)).toHaveText("connected");
}
