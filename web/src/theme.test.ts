import { describe, expect, it } from "vitest";
import type { ClaudeFamily } from "./protocol/theme";
import { isThemeChoice, resolveTheme, THEMES, writeThemeHint, type ThemeHint } from "./theme";

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

  it.each(families)(
    "an unrecognised pref name resolves the same as 'follow' when family is %s",
    (family) => {
      const expected = family === "light" ? "light" : "instrument";
      expect(resolveTheme("solarized", family)).toBe(expected);
      expect(resolveTheme("", family)).toBe(expected);
      expect(resolveTheme("Dark", family)).toBe(expected); // case-sensitive: not a known name
    },
  );

  it("every registered theme name round-trips regardless of family (a known name always wins)", () => {
    for (const name of THEMES) {
      for (const family of families) {
        expect(resolveTheme(name, family)).toBe(name);
      }
    }
  });
});

// REQ-9: the Settings radios' guard. The daemon stores `prefs.theme` opaquely
// (kb:adr/theme-pref-enum-follow-not-nullable), so this is the only validation between a
// radio click and the PUT — a value it rejects drops the click silently, leaving the radio
// dead. The registry loop below is the point of the whole test: it fails if the guard is
// ever hand-listed again and a THEMES entry is added without it.
describe("isThemeChoice (REQ-9)", () => {
  it("accepts every registered theme name (derived from THEMES, not hand-listed)", () => {
    for (const name of THEMES) {
      expect(isThemeChoice(name)).toBe(true);
    }
  });

  it("accepts 'follow', which is a choice rather than a registry member", () => {
    expect(isThemeChoice("follow")).toBe(true);
  });

  it.each(["solarized", "", "Dark", "instrument "])("rejects %o", (value) => {
    expect(isThemeChoice(value)).toBe(false);
  });
});

// REQ-11/W10: writeThemeHint against an injectable storage seam (the exported function
// accepts `Pick<Storage, "setItem">`, so no jsdom/localStorage is needed here — a plain
// in-memory fake stands in).
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

describe("writeThemeHint (REQ-11/REQ-12, W10)", () => {
  it("writes the hint as JSON under the fixed key", () => {
    const storage = fakeStorage();
    const hint: ThemeHint = { theme: "light", family: "light" };
    writeThemeHint(hint, storage);
    expect(storage.data["muster.theme-hint"]).toBe(JSON.stringify(hint));
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
