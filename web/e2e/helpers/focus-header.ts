// Helpers for plan title-crop-stop-resume-button: the Focus header's give-way order
// (REQ-2), its right-aligned cluster (REQ-4) and the one Stop/Resume button (REQ-5, REQ-6),
// measured from the live layout.
//
// Everything here is pure layout — boxes read from the live header, never a pixel
// breakpoint — so it lives in the render tier's helper (web/render/helpers/focus.ts, where
// the display properties re-levelled on 2026-10-20 read it) and the journeys here reach it
// through this re-export, so a locator or an oracle is written once for both tiers.
export {
  type Box,
  boxOf,
  clusterShiftProblems,
  endedAgeAbsentProblems,
  endedAgeProblems,
  focusedNode,
  headerButton,
  headerInvariantProblems,
  headerProblems,
  type HeaderSnapshot,
  headerStopResume,
  onTwoRows,
  readHeaderSnapshot,
  type Rect,
  rectOf,
  sameBox,
  settledSnapshot,
  settleLayout,
  stackedBandProblems,
  sweepHeader,
  sweepWidths,
  tagNode,
} from "../../render/helpers/focus";
