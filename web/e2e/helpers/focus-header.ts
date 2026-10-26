// Helpers for the Focus header: its give-way order (plan title-crop-stop-resume-button
// REQ-2), its right-aligned cluster and the one Session actions ⋯ button that holds the place
// of the Stop/Resume and Remove buttons (plan remove-unread-right-click-1 REQ-4, REQ-5),
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
  headerLifecycleButtons,
  headerMore,
  headerInvariantProblems,
  headerProblems,
  type HeaderSnapshot,
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
