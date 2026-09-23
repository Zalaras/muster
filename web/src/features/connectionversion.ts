// Plan version-claude-interface, UI Specifications > DOM: the Claude Code version
// readout's pure text/warning decision — split out of render/masthead.ts (review seed B7:
// a DOM-free decision with one controller caller, features/connection.ts, lives beside it,
// not in `render/`). `render/masthead.ts`'s `renderClaudeVersion` stays the DOM half,
// taking the `ClaudeVersionDescription` this produces as a parameter.
import type { ClaudeCodeInfo } from "../protocol/hello";
import type { ClaudeVersionDescription } from "../render/masthead";

const VERSION_NOT_TESTED = "This Claude Code version has not been tested with Muster";
const VERSION_NOT_TESTED_UPDATE = `${VERSION_NOT_TESTED} — please update Claude Code`;

/** UI Specifications > DOM table:
 * - `null` (pre-hello) -> "claude unknown", no warning
 * - `status: "unknown"` (any `installed`), or a defensive non-`unknown` status with
 *   `installed === null` (the daemon never sends this — INV-1) -> "Claude installation
 *   unknown", no warning
 * - `status: "verified"` -> "claude <installed>", no warning
 * - `status: "above"` -> "claude <installed>" + the "not tested" warning
 * - `status: "below"` -> "claude <installed>" + the "not tested, please update" warning
 */
export function describeClaudeVersion(info: ClaudeCodeInfo | null): ClaudeVersionDescription {
  if (!info) return { text: "claude unknown", warning: null };
  if (info.status === "unknown" || info.installed === null) {
    return { text: "Claude installation unknown", warning: null };
  }
  if (info.status === "above") {
    return { text: `claude ${info.installed}`, warning: VERSION_NOT_TESTED };
  }
  if (info.status === "below") {
    return { text: `claude ${info.installed}`, warning: VERSION_NOT_TESTED_UPDATE };
  }
  return { text: `claude ${info.installed}`, warning: null };
}
