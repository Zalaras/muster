// Locators for plan rail-card-improvements: the restructured card template, the rail-head
// density control and the masthead's single New session button. All pure DOM, so they live
// in the render tier's helper (web/render/helpers/rail.ts, where the display properties
// re-levelled on 2026-10-20 read them); the journeys here reach them through this re-export.
export {
  bodyRailDensity,
  cardActivityClaude,
  cardActivityYou,
  cardName,
  cardRepoLine,
  cardStateRow,
  cardTitleRow,
  newSessionButton,
  type RailActivityLabel,
  railActivityLegend,
  railActivityRadio,
  railActivityRadios,
  type RailDensity,
  railDensityButton,
  railDensityGroup,
} from "../../render/helpers/rail";
