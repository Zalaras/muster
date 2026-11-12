import type { ReaderListing } from "../api/reader";

export interface ClaudeChips {
  plan: "plan" | "no plan";
  tmp: string | null;
}

export function claudeChips(planExists: boolean, scratchCount: number): ClaudeChips {
  return {
    plan: planExists ? "plan" : "no plan",
    tmp: scratchCount > 0 ? `${scratchCount} tmp` : null,
  };
}

export function latestIso(...stamps: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const stamp of stamps) {
    if (stamp && (best === null || Date.parse(stamp) > Date.parse(best))) best = stamp;
  }
  return best;
}

function isUnder(path: string, dir: string): boolean {
  return path.startsWith(`${dir}/`);
}

export function isScratchPath(path: string, scratchDirs: ReadonlySet<string>): boolean {
  for (const dir of scratchDirs) if (isUnder(path, dir)) return true;
  return false;
}

export interface ScratchRescanInput {
  listing: ReaderListing | null;
  listingPending: boolean;
  scratchpadDir: string | null;
  changedPath: string;
}

export function docChangedNeedsRescan(input: ScratchRescanInput): boolean {
  const { listing, listingPending, scratchpadDir, changedPath } = input;
  if (listing === null || listingPending || scratchpadDir === null) return false;
  if (!isUnder(changedPath, scratchpadDir) || !changedPath.toLowerCase().endsWith(".md"))
    return false;
  if (listing.scratch?.dir !== scratchpadDir) return true;
  const rel = changedPath.slice(scratchpadDir.length + 1);
  return !listing.scratch.files.some((file) => file.path === rel);
}

export function scratchDirMoved(
  scratchpadDir: string | null,
  coveredDir: string | null | undefined,
): boolean {
  return coveredDir !== undefined && scratchpadDir !== coveredDir;
}
