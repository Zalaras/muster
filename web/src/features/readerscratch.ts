import type { ReaderListing } from "../api/reader";
import type { Session } from "../protocol/session";
import { docChangedNeedsRescan, isScratchPath, scratchDirMoved } from "../reader/claude";

export interface ScratchTracker {
  observeSession(session: Session | null, listingLoading: boolean): boolean;
  docChangedNeedsRescan(
    listing: ReaderListing | null,
    listingLoading: boolean,
    changedPath: string,
  ): boolean;
  rescanStarted(): void;
  listingApplied(listing: ReaderListing): void;
  isScratch(path: string): boolean;
}

export function createScratchTracker(): ScratchTracker {
  const dirs = new Set<string>();
  let sessionDir: string | null = null;
  let covered: string | null | undefined;

  return {
    observeSession(session, listingLoading) {
      sessionDir = session?.scratchpadDir ?? null;
      if (sessionDir) dirs.add(sessionDir);
      return !listingLoading && scratchDirMoved(sessionDir, covered);
    },
    docChangedNeedsRescan(listing, listingLoading, changedPath) {
      return docChangedNeedsRescan({
        listing,
        listingPending: listingLoading,
        scratchpadDir: sessionDir,
        changedPath,
      });
    },
    rescanStarted() {
      covered = sessionDir;
    },
    listingApplied(listing) {
      covered = listing.scratch?.dir ?? null;
      if (listing.scratch) dirs.add(listing.scratch.dir);
    },
    isScratch(path) {
      return isScratchPath(path, dirs);
    },
  };
}
