// Pure heading-id derivation for the reader's outline (REQ-14, W8) — no DOM, so
// `markdown.ts`'s heading walk and the outline builder share one algorithm without
// either owning a DOM dependency (docs/conventions.md: keep logic pure).

/** Lowercases, strips anything but word chars/spaces/hyphens, and hyphenates — GitHub's
 * own heading-anchor algorithm, close enough for a same-document outline (no cross-file
 * anchor stability is promised or needed here). */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/** Edge case 26: a repeated heading text yields the same slug twice — GitHub's own
 * dedupe scheme (`notes`, `notes-2`, `notes-3`, ...) applied over the whole document in
 * heading order, so every outline entry still has a unique id to scroll to. */
export function dedupeIds(slugs: readonly string[]): string[] {
  const seen = new Map<string, number>();
  const result: string[] = [];
  for (const slug of slugs) {
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    result.push(count === 0 ? slug : `${slug}-${count + 1}`);
  }
  return result;
}
