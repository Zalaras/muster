import type { DiffBody, DiffScope, DiffSummary, ScopeCounts } from "../api/diff";
import type { ApiErrorBody } from "../api/http";

export const MINUS = "−";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function signedCounts(additions: number, deletions: number): string {
  return `+${additions} ${MINUS}${deletions}`;
}

export function countsText(counts: {
  files: number;
  additions: number;
  deletions: number;
}): string {
  return `${plural(counts.files, "file")} ${signedCounts(counts.additions, counts.deletions)}`;
}

export function pickScope(summary: DiffSummary): DiffScope {
  return summary.uncommitted.files > 0 || summary.branch.files === 0 ? "uncommitted" : "branch";
}

function countsPart(summary: DiffSummary): string | null {
  if (summary.uncommitted.files > 0) return countsText(summary.uncommitted);
  if (summary.branch.files > 0) return `branch · ${countsText(summary.branch)}`;
  return null;
}

export function diffButtonText(summary: DiffSummary | null, open: boolean): string | null {
  if (!summary?.repo) return null;
  const counts = countsPart(summary);
  if (counts === null && summary.openComments === 0) return null;
  const parts: string[] = [];
  if (counts !== null) parts.push(counts);
  if (summary.openComments > 0) parts.push(`💬 ${summary.openComments}`);
  parts.push(open ? "Close diff ×" : "View diff ›");
  return parts.join(" · ");
}

function scopeTitle(label: string, counts: ScopeCounts): string {
  return `${label}: ${countsText(counts)}`;
}

export function diffButtonTitle(summary: DiffSummary): string {
  return [
    scopeTitle("Uncommitted", summary.uncommitted),
    scopeTitle("Branch", summary.branch),
  ].join(" · ");
}

export function summaryLine(body: DiffBody): string {
  const additions = body.files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = body.files.reduce((sum, f) => sum + f.deletions, 0);
  return `${plural(body.files.length, "file")} · ${signedCounts(additions, deletions)} · against ${body.base}`;
}

function fileSignature(file: DiffBody["files"][number]): string {
  return file.hunks.map((h) => h.lines.map((l) => `${l.kind}${l.text}`).join("\n")).join("\n@@\n");
}

export function whatChanged(shown: DiffBody, latest: DiffBody): string {
  const before = new Map(shown.files.map((f) => [f.path, fileSignature(f)]));
  const after = new Map(latest.files.map((f) => [f.path, fileSignature(f)]));
  let added = 0;
  let changed = 0;
  let gone = 0;
  for (const [path, signature] of after) {
    const old = before.get(path);
    if (old === undefined) added++;
    else if (old !== signature) changed++;
  }
  for (const path of before.keys()) if (!after.has(path)) gone++;
  const parts: string[] = [];
  if (added > 0) parts.push(plural(added, "new file"));
  if (changed > 0) parts.push(`${plural(changed, "file")} changed`);
  if (gone > 0) parts.push(`${plural(gone, "file")} no longer changed`);
  return parts.length > 0 ? parts.join(", ") : "its contents changed";
}

export function diffErrorText(error: ApiErrorBody): string {
  return error.code === "network_error" ? "musterd unreachable" : error.message;
}
