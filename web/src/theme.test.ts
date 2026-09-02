import { describe, expect, it } from "vitest";
import { readThemeHint, resolveTheme, THEMES, writeThemeHint, type ClaudeFamily, type ThemeHint } from "./theme";

// REQ-7/INV-1: resolveTheme is pure — a known theme name always wins outright; "follow"
// or any name the client doesn't recognise (edge case 6: a renamed/removed theme, or an
// older client against a newer daemon) resolves by Claude's family. All 12 pref x family
// cells (4 pref values x 3 families), plus an unrecognised name in each family, per W6.
describe("resolveTheme (REQ-7, INV-1)", () => {
  const families: ClaudeFamily[] = ["light", "dark", "unknown"];

  it.each([
    ["instrument", "light", "instrument"],
    ["instrument", "dark", "instrument"],
    ["instrument", "unknown", "instrument"],
    ["dark", "light", "dark"],
    ["dark", "dark", "dark"],
    ["dark", "unknown", "dark"],
    ["light", "light", "light"],
    ["light", "dark", "light"],
    ["light", "unknown", "light"],
    ["follow", "light", "light"],
    ["follow", "dark", "instrument"],
    ["follow", "unknown", "instrument"],
  ] as const)("resolveTheme(%s, %s) -> %s", (choice, family, expected) => {
    expect(resolveTheme(choice, family)).toBe(expected);
  });

  it.each(families)("an unrecognised pref name resolves the same as 'follow' when family is %s", (family) => {
    const expected = family === "light" ? "light" : "instrument";
    expect(resolveTheme("solarized", family)).toBe(expected);
    expect(resolveTheme("", family)).toBe(expected);
    expect(resolveTheme("Dark", family)).toBe(expected); // case-sensitive: not a known name
  });

  it("every registered theme name round-trips regardless of family (a known name always wins)", () => {
    for (const name of THEMES) {
      for (const family of families) {
        expect(resolveTheme(name, family)).toBe(name);
      }
    }
  });
});

// REQ-11/W10: readThemeHint/writeThemeHint against an injectable storage seam (the
// exported functions accept `Pick<Storage, "getItem"|"setItem">`, so no jsdom/localStorage
// is needed here — a plain in-memory fake stands in).
function fakeStorage(initial: Record<string, string> = {}): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function throwingStorage(): { getItem: () => never } {
  return {
    getItem: () => {
      throw new Error("storage disabled");
    },
  };
}

describe("readThemeHint (REQ-11, W10)", () => {
  it("returns null when no hint has been written (fresh profile, edge case 8)", () => {
    expect(readThemeHint(fakeStorage())).toBeNull();
  });

  it("returns the parsed hint when a valid one was written", () => {
    const storage = fakeStorage({ "muster.theme-hint": JSON.stringify({ theme: "dark", family: "light" }) });
    expect(readThemeHint(storage)).toEqual({ theme: "dark", family: "light" });
  });

  it("returns null for malformed JSON", () => {
    const storage = fakeStorage({ "muster.theme-hint": "not json{" });
    expect(readThemeHint(storage)).toBeNull();
  });

  it("returns null when the stored value isn't an object", () => {
    const storage = fakeStorage({ "muster.theme-hint": JSON.stringify("dark") });
    expect(readThemeHint(storage)).toBeNull();
  });

  it("returns null for a theme name the client doesn't know (edge case 6)", () => {
    const storage = fakeStorage({ "muster.theme-hint": JSON.stringify({ theme: "solarized", family: "dark" }) });
    expect(readThemeHint(storage)).toBeNull();
  });

  it("returns null for a family outside light|dark|unknown", () => {
    const storage = fakeStorage({ "muster.theme-hint": JSON.stringify({ theme: "dark", family: "sepia" }) });
    expect(readThemeHint(storage)).toBeNull();
  });

  it("returns null when 'follow' (a choice, never a resolved theme) is stored as the theme", () => {
    // The hint always carries a resolved ThemeName (index.html's head script paints
    // <html data-theme> with it directly) — "follow" is a pref choice, not a paintable
    // theme, so a hint carrying it is malformed.
    const storage = fakeStorage({ "muster.theme-hint": JSON.stringify({ theme: "follow", family: "dark" }) });
    expect(readThemeHint(storage)).toBeNull();
  });

  it("returns null when storage.getItem throws (private mode, disabled storage)", () => {
    expect(readThemeHint(throwingStorage())).toBeNull();
  });
});

describe("writeThemeHint (REQ-11/REQ-12, W10)", () => {
  it("writes the hint as JSON under the fixed key", () => {
    const storage = fakeStorage();
    const hint: ThemeHint = { theme: "light", family: "light" };
    writeThemeHint(hint, storage);
    expect(storage.data["muster.theme-hint"]).toBe(JSON.stringify(hint));
  });

  it("round-trips through readThemeHint", () => {
    const storage = fakeStorage();
    const hint: ThemeHint = { theme: "instrument", family: "unknown" };
    writeThemeHint(hint, storage);
    expect(readThemeHint(storage)).toEqual(hint);
  });

  it("swallows a throwing storage instead of throwing itself", () => {
    const storage = {
      setItem: () => {
        throw new Error("storage disabled");
      },
    };
    expect(() => writeThemeHint({ theme: "dark", family: "dark" }, storage)).not.toThrow();
  });
});
