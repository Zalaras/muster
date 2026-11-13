import { describe, expect, it } from "vitest";
import type { ReaderListing } from "../api/reader";
import { makeReaderListing } from "../api/testfixtures";
import { makeSession } from "../sessions/testfixtures";
import { createScratchTracker } from "./readerscratch";

const DIR = "/tmp/claude-501/proj/abc/scratchpad";

function listing(scratch: ReaderListing["scratch"]): ReaderListing {
  return makeReaderListing({ scratch });
}
const session = (scratchpadDir: string | null) => makeSession({ id: 1, scratchpadDir });

describe("createScratchTracker", () => {
  it("does not ask for a re-scan before any listing was applied", () => {
    const t = createScratchTracker();
    expect(t.observeSession(session(DIR), false)).toBe(false);
  });

  it("asks for a re-scan when the session folder differs from the covered one", () => {
    const t = createScratchTracker();
    t.listingApplied(listing(null));
    expect(t.observeSession(session(DIR), false)).toBe(true);
  });

  it("does not ask while a listing is loading", () => {
    const t = createScratchTracker();
    t.listingApplied(listing(null));
    expect(t.observeSession(session(DIR), true)).toBe(false);
  });

  it("stops asking once the re-scan started covers the session folder", () => {
    const t = createScratchTracker();
    t.listingApplied(listing(null));
    t.observeSession(session(DIR), false);
    t.rescanStarted();
    expect(t.observeSession(session(DIR), false)).toBe(false);
  });

  it("is quiet when the listing's scratch folder is the session's", () => {
    const t = createScratchTracker();
    t.listingApplied(listing({ dir: DIR, files: [] }));
    expect(t.observeSession(session(DIR), false)).toBe(false);
  });

  it("asks again when the session loses its folder", () => {
    const t = createScratchTracker();
    t.listingApplied(listing({ dir: DIR, files: [] }));
    expect(t.observeSession(session(null), false)).toBe(true);
    expect(t.observeSession(null, false)).toBe(true);
  });

  it("remembers every scratch dir seen, session and listing", () => {
    const t = createScratchTracker();
    expect(t.isScratch(`${DIR}/a.md`)).toBe(false);
    t.observeSession(session(DIR), true);
    expect(t.isScratch(`${DIR}/a.md`)).toBe(true);
    t.listingApplied(listing({ dir: "/other/scratchpad", files: [] }));
    expect(t.isScratch("/other/scratchpad/n.md")).toBe(true);
    expect(t.isScratch(`${DIR}/a.md`)).toBe(true);
    expect(t.isScratch("/proj/README.md")).toBe(false);
  });

  it("keeps a dir after the session drops it", () => {
    const t = createScratchTracker();
    t.observeSession(session(DIR), true);
    t.observeSession(session(null), true);
    expect(t.isScratch(`${DIR}/a.md`)).toBe(true);
  });

  describe("docChangedNeedsRescan", () => {
    const rescan = (
      t: ReturnType<typeof createScratchTracker>,
      l: ReaderListing | null,
      path: string,
      loading = false,
    ) => t.docChangedNeedsRescan(l, loading, path);

    it("uses the session folder observed last", () => {
      const t = createScratchTracker();
      const l = listing({ dir: DIR, files: [] });
      expect(rescan(t, l, `${DIR}/new.md`)).toBe(false);
      t.observeSession(session(DIR), false);
      expect(rescan(t, l, `${DIR}/new.md`)).toBe(true);
    });

    it("is false for a listed file, a non-md file, a foreign path, or a pending listing", () => {
      const t = createScratchTracker();
      t.observeSession(session(DIR), false);
      const l = listing({
        dir: DIR,
        files: [{ path: "a.md", modifiedAt: "2026-11-12T10:00:00Z", writtenAt: null }],
      });
      expect(rescan(t, l, `${DIR}/a.md`)).toBe(false);
      expect(rescan(t, l, `${DIR}/b.txt`)).toBe(false);
      expect(rescan(t, l, "/proj/b.md")).toBe(false);
      expect(rescan(t, l, `${DIR}/b.md`, true)).toBe(false);
      expect(rescan(t, null, `${DIR}/b.md`)).toBe(false);
    });
  });
});
