// Plan general-cleanup (REQ-6, REQ-8, W3, W4) — the reader's pure status-line and
// docChanged-dispatch derivations. No DOM, no fetch (docs/conventions.md).
import { describe, expect, it } from "vitest";
import type { ConnectionStatus } from "../render/masthead";
import { classifyDocChanged, deriveNotice, UNREACHABLE_TEXT } from "./notice";

describe("deriveNotice — status precedence (INV-POPOUT-CONNECTING, W3)", () => {
  // "connecting" (never connected, REQ-8): always "connecting…", independent of every
  // other input — a pop-out that hasn't seen its first hello must never read the
  // unreachable text or a stale loading/outcome line.
  const connectingCells: Array<[string | null, boolean, string | null]> = [
    [null, false, null],
    [null, true, "some earlier outcome"],
    ["notes.md", false, null],
    ["notes.md", true, "some earlier outcome"],
  ];
  for (const [loadingPath, bodyRendered, noticeText] of connectingCells) {
    it(`is "connecting…" for status "connecting" with loadingPath=${JSON.stringify(loadingPath)}, bodyRendered=${bodyRendered}, noticeText=${JSON.stringify(noticeText)}`, () => {
      expect(deriveNotice("connecting", loadingPath, bodyRendered, noticeText)).toBe("connecting…");
    });
  }

  // "reconnecting" (a lost connection, REQ-8): always the unreachable text, independent of
  // every other input.
  const reconnectingCells: Array<[string | null, boolean, string | null]> = [
    [null, false, null],
    [null, true, "some earlier outcome"],
    ["notes.md", false, null],
    ["notes.md", true, "some earlier outcome"],
  ];
  for (const [loadingPath, bodyRendered, noticeText] of reconnectingCells) {
    it(`is the unreachable text for status "reconnecting" with loadingPath=${JSON.stringify(loadingPath)}, bodyRendered=${bodyRendered}, noticeText=${JSON.stringify(noticeText)}`, () => {
      expect(deriveNotice("reconnecting", loadingPath, bodyRendered, noticeText)).toBe(
        UNREACHABLE_TEXT,
      );
    });
  }
});

describe("deriveNotice — status 'connected' (existing loading/outcome rules, W3)", () => {
  // The full loadingPath × bodyRendered cross for "connected": the loading cue only wins
  // once something is actually on screen to grey out (REQ-8); with nothing rendered yet
  // the body's own placeholder is the cue instead (REQ-9), so the status line falls
  // through to whatever noticeText already held — including the absent case, null.
  const status: ConnectionStatus = "connected";

  it("loadingPath set, bodyRendered true → the loading cue names the file", () => {
    expect(deriveNotice(status, "docs/notes.md", true, "stale outcome")).toBe("loading notes.md…");
  });

  it("loadingPath set, bodyRendered false → falls through to noticeText, not the loading cue", () => {
    expect(deriveNotice(status, "docs/notes.md", false, "stale outcome")).toBe("stale outcome");
  });

  it("loadingPath null, bodyRendered true → falls through to noticeText", () => {
    expect(deriveNotice(status, null, true, "stale outcome")).toBe("stale outcome");
  });

  it("loadingPath null, bodyRendered false → falls through to noticeText", () => {
    expect(deriveNotice(status, null, false, "stale outcome")).toBe("stale outcome");
  });

  it("falls through to a null noticeText (no prior outcome) rather than inventing text", () => {
    expect(deriveNotice(status, null, false, null)).toBeNull();
    expect(deriveNotice(status, "docs/notes.md", false, null)).toBeNull();
  });
});

describe("classifyDocChanged (REQ-6, markdown-render-fixes edge case 5, W4)", () => {
  it('is "refetch" when the changed path is the one currently open', () => {
    expect(classifyDocChanged("docs/plan.md", "docs/plan.md")).toBe("refetch");
  });

  it('is "dots" when openPath is null (nothing open)', () => {
    expect(classifyDocChanged(null, "docs/plan.md")).toBe("dots");
  });

  // Edge case 7: a docChanged for A arrives while the open file has moved to B — B's own
  // load must stay unaffected, so a write to any other path is just a tree dot.
  it('is "dots" when the changed path differs from the open path (edge case 7)', () => {
    expect(classifyDocChanged("docs/b.md", "docs/a.md")).toBe("dots");
  });
});
