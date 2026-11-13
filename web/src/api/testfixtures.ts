// Unit-test factories for the response shapes this directory owns, beside `testfakes.ts`
// (the `Response` fakes) and `sessions/testfixtures.ts` (Session). The endpoint tests here keep
// their raw response bodies — decoding the whole payload is what they are about.
import type { ReaderListing } from "./reader";

/** A git listing of `/proj` with no plan, no files and no scratchpad. */
export function makeReaderListing(overrides: Partial<ReaderListing> = {}): ReaderListing {
  return {
    directory: "/proj",
    plan: null,
    files: [],
    scratch: null,
    listing: "git",
    truncated: false,
    ...overrides,
  };
}
