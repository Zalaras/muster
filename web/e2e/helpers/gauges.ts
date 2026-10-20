// Locators for the masthead usage gauges and the card/tile context gauges. They are pure
// DOM and live in the render tier's helper (web/render/helpers/usage.ts, where the display
// properties re-levelled on 2026-10-20 read them); the journeys here reach them through
// this re-export so a locator is written once for both tiers.
export {
  type Bucket,
  cardContextHot,
  cardContextRow,
  cardContextTrack,
  mastheadBucket,
  mastheadBucketTrack,
  mastheadBucketWarn,
  mastheadModelSelect,
  mastheadModelWeek,
  mastheadModelWeekPercent,
  mastheadModelWeekResets,
  mastheadModelWeekTrack,
  mastheadModelWeekWarn,
  mastheadUsageRefreshButton,
  tileContextInfo,
  tileContextTrack,
} from "../../render/helpers/usage";
