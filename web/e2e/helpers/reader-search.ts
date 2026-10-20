// Helpers for the reader's find bar E2E suite (plan docs-search-bar).
//
// The DOM side — the find-bar locators, the `CSS.highlights` oracle, the corner geometry,
// the Meta+F key log, the focus-identity tags and the find documents themselves — is pure
// display and lives in the render tier's helper; the journeys here reach it through this
// re-export so an oracle is written once for both tiers. What stays here is the one thing
// a render test never does: writing the documents into a scratch directory on disk.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FIND_DOCUMENTS, FIND_FILES, type FindFileKey } from "../../render/helpers/reader-find";

export {
  activeElementTag,
  type BarMetrics,
  barMetrics,
  bodyScrollTop,
  bottom,
  type Box,
  boxOf,
  closeSearch,
  type CornerGeometry,
  cornerGeometry,
  distanceFromEnd,
  expectBarInCorner,
  expectCurrentMatchInView,
  expectFindState,
  expectHighlightedText,
  expectIconInCorner,
  expectInCorner,
  expectNoHighlights,
  FIND_DOCUMENTS,
  FIND_FILES,
  type FindFileKey,
  type FindFixture,
  type FindHighlights,
  type FindRange,
  installFindKeyLog,
  type LoggedKey,
  matchCount,
  nextMatch,
  previousMatch,
  readFindKeyLog,
  readHighlights,
  right,
  samePosition,
  scrollBodyToEnd,
  SEARCH_LABEL,
  searchBox,
  searchIcon,
  sidewaysScroll,
  tagActiveElement,
  tallBody,
  waitForFindKeys,
} from "../../render/helpers/reader-find";

/** Writes every document in `FIND_FILES` into `dir`, with the bytes `FIND_DOCUMENTS` holds. */
export async function writeFindFixtures(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const key of Object.keys(FIND_FILES) as FindFileKey[]) {
    await writeFile(join(dir, FIND_FILES[key].name), FIND_DOCUMENTS[key]);
  }
}
