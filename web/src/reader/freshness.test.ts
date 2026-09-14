// Plan markdown-viewing (W9, REQ-18): changedText composes over sessions/format.ts's
// formatAge buckets through the shared agoSuffix helper (review cycle-1 Major 2), so the
// sub-minute bucket reads "changed now" rather than the ungrammatical "changed now ago"
// despite the illustrative "changed 0s ago" in plan.md's User Flow 3 — every other bucket
// still reads "changed <age> ago".
import { describe, expect, it } from "vitest";
import { changedText } from "./freshness";

describe("changedText", () => {
  it("renders the sub-minute bucket as 'changed now', never 'changed now ago'", () => {
    const writtenAt = "2026-09-13T09:15:00Z";
    const now = new Date("2026-09-13T09:15:10Z");
    expect(changedText(writtenAt, now)).toBe("changed now");
    expect(changedText(writtenAt, now)).not.toContain("now ago");
  });

  it("renders a minutes-old write", () => {
    const writtenAt = "2026-09-13T09:15:00Z";
    const now = new Date("2026-09-13T09:17:00Z");
    expect(changedText(writtenAt, now)).toBe("changed 2m ago");
  });

  it("renders an hours-old write", () => {
    const writtenAt = "2026-09-13T09:15:00Z";
    const now = new Date("2026-09-13T11:15:00Z");
    expect(changedText(writtenAt, now)).toBe("changed 2h ago");
  });

  it("renders a days-old write", () => {
    const writtenAt = "2026-09-11T09:15:00Z";
    const now = new Date("2026-09-13T09:15:00Z");
    expect(changedText(writtenAt, now)).toBe("changed 2d ago");
  });

  it("matches /^changed (now|.+ ago)$/ at every bucket, and the sub-minute bucket is exactly 'changed now'", () => {
    const writtenAt = "2026-09-13T09:15:00Z";
    const cases = [
      { now: new Date("2026-09-13T09:15:05Z"), subMinute: true },
      { now: new Date("2026-09-13T09:20:00Z"), subMinute: false },
      { now: new Date("2026-09-13T12:15:00Z"), subMinute: false },
      { now: new Date("2026-09-16T09:15:00Z"), subMinute: false },
    ];
    for (const { now, subMinute } of cases) {
      const text = changedText(writtenAt, now);
      expect(text).toMatch(/^changed (now|.+ ago)$/);
      if (subMinute) {
        expect(text).toBe("changed now");
      } else {
        expect(text).toMatch(/ ago$/);
      }
    }
  });
});
