import { describe, expect, it, type Mock, vi } from "vitest";
import {
  createNoteWindows,
  type NoteWindowHandle,
  noteWindowUrl,
  parseNoteQuery,
} from "./noteswindows";

function handle(closed = false): NoteWindowHandle & { focus: Mock<() => void> } {
  return { closed, focus: vi.fn<() => void>() };
}

describe("createNoteWindows.openOrFocus", () => {
  it("opens a named popup for the session and reports success", () => {
    const open = vi.fn(() => handle());
    expect(createNoteWindows(open).openOrFocus(7)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/note.html?session=7", "muster-note-7", expect.any(String));
  });

  it("returns false when the popup is blocked and retries on the next press (W6)", () => {
    const open = vi.fn<() => NoteWindowHandle | null>(() => null);
    const windows = createNoteWindows(open);
    expect(windows.openOrFocus(7)).toBe(false);
    open.mockReturnValue(handle());
    expect(windows.openOrFocus(7)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("focuses the open window instead of opening a second", () => {
    const win = handle();
    const open = vi.fn(() => win);
    const windows = createNoteWindows(open);
    windows.openOrFocus(7);
    expect(windows.openOrFocus(7)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it("opens again once the window was closed", () => {
    const first = handle();
    const open = vi.fn(() => first);
    const windows = createNoteWindows(open);
    windows.openOrFocus(7);
    Object.assign(first, { closed: true });
    windows.openOrFocus(7);
    expect(open).toHaveBeenCalledTimes(2);
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("keeps a window per session", () => {
    const open = vi.fn(() => handle());
    const windows = createNoteWindows(open);
    windows.openOrFocus(1);
    windows.openOrFocus(2);
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe("noteWindowUrl / parseNoteQuery", () => {
  it("round-trips an id", () => {
    const url = noteWindowUrl(42);
    expect(parseNoteQuery(url.slice(url.indexOf("?")))).toBe(42);
  });

  it.each<[string, string, number | null]>([
    ["a bare integer", "?session=12", 12],
    ["zero", "?session=0", 0],
    ["no query", "", null],
    ["missing session", "?other=1", null],
    ["empty", "?session=", null],
    ["negative", "?session=-3", null],
    ["fractional", "?session=1.5", null],
    ["non-numeric", "?session=abc", null],
    ["trailing junk", "?session=12x", null],
    ["signed", "?session=%2B4", null],
  ])("%s", (_label, search, expected) => {
    expect(parseNoteQuery(search)).toBe(expected);
  });
});
