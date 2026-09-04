// Pure matcher tests for shortcuts.ts (plan shortcut-fixes). No jsdom is configured in
// this Vitest environment (see render/context.test.ts) — matchShortcut only reads plain
// boolean/string properties off the event, so a cast plain object stands in for a real
// KeyboardEvent, same pattern render/*.test.ts uses for fake DOM elements.
import { describe, expect, it } from "vitest";
import { matchShortcut, type ShortcutAction } from "./shortcuts";

interface FakeKeyInit {
  readonly code: string;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key?: string;
}

function keyEvent(init: FakeKeyInit): KeyboardEvent {
  return {
    code: init.code,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    key: init.key ?? "",
  } as unknown as KeyboardEvent;
}

describe("matchShortcut — bound chords (W1/W2/W3)", () => {
  it("returns new-session for Opt+Cmd+N (W1)", () => {
    expect(matchShortcut(keyEvent({ code: "KeyN", metaKey: true, altKey: true, key: "n" }))).toEqual({
      type: "new-session",
    });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("returns focus-nth with n=%i for Opt+Cmd+%i (W2)", (n) => {
    expect(
      matchShortcut(keyEvent({ code: `Digit${n}`, metaKey: true, altKey: true, key: String(n) })),
    ).toEqual({ type: "focus-nth", n });
  });

  it("returns focus-neediest for Opt+Cmd+0 (W3)", () => {
    expect(matchShortcut(keyEvent({ code: "Digit0", metaKey: true, altKey: true, key: "0" }))).toEqual({
      type: "focus-neediest",
    });
  });

  it("returns toggle-view for Cmd+\\ (unchanged binding, REQ-10)", () => {
    expect(matchShortcut(keyEvent({ code: "Backslash", metaKey: true, key: "\\" }))).toEqual({
      type: "toggle-view",
    });
  });

  it("returns launch-parent-dir for Cmd+ArrowUp (unchanged binding, REQ-10)", () => {
    expect(matchShortcut(keyEvent({ code: "ArrowUp", metaKey: true }))).toEqual({
      type: "launch-parent-dir",
    });
  });
});

describe("matchShortcut — bare Cmd chords no longer match (W4/W5, REQ-2)", () => {
  it("returns null for bare Cmd+N (W4) — the browser's own Cmd+N is left alone", () => {
    expect(matchShortcut(keyEvent({ code: "KeyN", metaKey: true, key: "n" }))).toBeNull();
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])("returns null for bare Cmd+%i, no Opt held (W5)", (n) => {
    expect(matchShortcut(keyEvent({ code: `Digit${n}`, metaKey: true, key: String(n) }))).toBeNull();
  });
});

describe("matchShortcut — unbound codes and bare modifier keydowns", () => {
  it("returns null for a code that isn't in the binding table at all", () => {
    expect(matchShortcut(keyEvent({ code: "KeyA", metaKey: true, altKey: true }))).toBeNull();
  });

  it("returns null for NumpadDigit1 even with the bound modifiers held (edge case 11 — numpad is deliberately unbound)", () => {
    expect(matchShortcut(keyEvent({ code: "Numpad1", metaKey: true, altKey: true }))).toBeNull();
  });

  it("returns null for a bare modifier keydown (MetaLeft) even though metaKey reads true on it", () => {
    expect(matchShortcut(keyEvent({ code: "MetaLeft", metaKey: true }))).toBeNull();
  });

  it("returns null for every binding's code with no modifiers held at all", () => {
    expect(matchShortcut(keyEvent({ code: "KeyN" }))).toBeNull();
    expect(matchShortcut(keyEvent({ code: "Digit1" }))).toBeNull();
    expect(matchShortcut(keyEvent({ code: "Backslash" }))).toBeNull();
    expect(matchShortcut(keyEvent({ code: "ArrowUp" }))).toBeNull();
  });
});

// INV-2: `matchShortcut` returns non-null iff the event is exactly one of the bound
// chords. For each bound chord, every one of the 15 *other* modifier signatures must
// return null — only the exact signature matches. Written as a loop over all 16
// signatures per chord (the plan requires this, not "a handful of cases").
//
// This table is an independent transcription of the plan's Binding Table, not a read of
// shortcuts.ts's internal BINDINGS constant — the point of the test is to catch the
// table drifting from the plan, so it must not share data with the implementation.
const BOUND_CHORDS: ReadonlyArray<{
  readonly code: string;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly action: ShortcutAction;
}> = [
  { code: "KeyN", meta: true, alt: true, shift: false, ctrl: false, action: { type: "new-session" } },
  { code: "Backslash", meta: true, alt: false, shift: false, ctrl: false, action: { type: "toggle-view" } },
  { code: "ArrowUp", meta: true, alt: false, shift: false, ctrl: false, action: { type: "launch-parent-dir" } },
  { code: "Digit0", meta: true, alt: true, shift: false, ctrl: false, action: { type: "focus-neediest" } },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    code: `Digit${n}`,
    meta: true,
    alt: true,
    shift: false,
    ctrl: false,
    action: { type: "focus-nth", n } as ShortcutAction,
  })),
];

const BOOLS = [true, false] as const;

describe("matchShortcut — INV-2 exact modifier match (W6)", () => {
  for (const bound of BOUND_CHORDS) {
    describe(`${bound.code} bound at meta=${bound.meta} alt=${bound.alt} shift=${bound.shift} ctrl=${bound.ctrl}`, () => {
      for (const metaKey of BOOLS) {
        for (const altKey of BOOLS) {
          for (const shiftKey of BOOLS) {
            for (const ctrlKey of BOOLS) {
              const isExact =
                metaKey === bound.meta && altKey === bound.alt && shiftKey === bound.shift && ctrlKey === bound.ctrl;
              it(`meta=${metaKey} alt=${altKey} shift=${shiftKey} ctrl=${ctrlKey} -> ${
                isExact ? "matches" : "null"
              }`, () => {
                const result = matchShortcut(keyEvent({ code: bound.code, metaKey, altKey, shiftKey, ctrlKey }));
                if (isExact) {
                  expect(result).toEqual(bound.action);
                } else {
                  expect(result).toBeNull();
                }
              });
            }
          }
        }
      }
    });
  }
});

// The dead-key problem (edge case 1): on macOS, Opt+N delivers `key: "˜"` and Opt+1
// delivers `key: "¡"` — never "n" or "1". Playwright cannot emulate this transform
// (`press("Alt+Meta+Digit1")` delivers `key: "1"`), so this is the only place in the
// suite that can prove the matcher is `code`-based rather than incidentally working
// because tests always send a plausible `key`. W16.
describe("matchShortcut — macOS Opt dead-key proof (W16)", () => {
  it("matches Opt+Cmd+N when `key` carries the dead-key glyph '˜' instead of 'n'", () => {
    expect(matchShortcut(keyEvent({ code: "KeyN", metaKey: true, altKey: true, key: "˜" }))).toEqual({
      type: "new-session",
    });
  });

  it("matches Opt+Cmd+1 when `key` carries the dead-key glyph '¡' instead of '1'", () => {
    expect(matchShortcut(keyEvent({ code: "Digit1", metaKey: true, altKey: true, key: "¡" }))).toEqual({
      type: "focus-nth",
      n: 1,
    });
  });

  it("matches Opt+Cmd+0 when `key` carries the dead-key glyph 'º' instead of '0'", () => {
    expect(matchShortcut(keyEvent({ code: "Digit0", metaKey: true, altKey: true, key: "º" }))).toEqual({
      type: "focus-neediest",
    });
  });

  it("matches even when `key` is empty (some synthetic/older events never populate it)", () => {
    expect(matchShortcut(keyEvent({ code: "KeyN", metaKey: true, altKey: true, key: "" }))).toEqual({
      type: "new-session",
    });
  });
});

describe("SHORTCUT_HELP (REQ-12)", () => {
  it("is exported as an array so a future help overlay has a single data source", async () => {
    const { SHORTCUT_HELP } = await import("./shortcuts");
    expect(Array.isArray(SHORTCUT_HELP)).toBe(true);
    expect(SHORTCUT_HELP.length).toBeGreaterThan(0);
    for (const entry of SHORTCUT_HELP) {
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.chord).toBe("string");
    }
  });
});
