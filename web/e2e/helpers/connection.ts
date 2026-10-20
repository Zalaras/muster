// The masthead's Claude Code version readout, its unknown-state hover text, the pattern a
// known version renders and the hello wait are pure DOM and live in the render tier's
// helper (web/render/helpers/connection.ts, where the readout's per-status properties
// re-levelled on 2026-10-20 read them); the journeys in claude-version.spec.ts reach them
// through this re-export.
export {
  claudeVersionReadout,
  UNKNOWN_HINT,
  versionReadoutPattern,
  waitForHello,
} from "../../render/helpers/connection";
