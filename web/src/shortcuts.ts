// Pure keyboard-shortcut matching (kb:adr/shortcuts-match-event-code-in-pure-module). The
// whole bound chord table lives here — features/shortcuts.ts and features/launch.ts
// dispatch from `matchShortcut` rather than matching keys themselves, so the binding set
// can't drift apart across files again. `event.code` is physical-key based: immune to
// macOS's ⌥ dead-key transform (⌥N delivers `key: "˜"`, ⌥1 delivers `key: "¡"`) and to
// keyboard layout, unlike `event.key` (web/src/shortcuts.test.ts).

export type ShortcutAction =
  | { readonly type: "new-session" }
  | { readonly type: "toggle-view" }
  | { readonly type: "launch-parent-dir" }
  | { readonly type: "focus-neediest" }
  | { readonly type: "focus-nth"; readonly n: number };

interface Binding {
  readonly code: string;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly action: ShortcutAction;
}

const DIGIT_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
] as const;

// The Binding Table. Digits match the main row only (`DigitN`) —
// `NumpadN` is deliberately unbound, and every chord requires an exact
// modifier signature: a held ⌃ or ⇧ alongside a bound chord does not match.
const BINDINGS: readonly Binding[] = [
  {
    code: "KeyN",
    metaKey: true,
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "new-session" },
  },
  {
    code: "Backslash",
    metaKey: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "toggle-view" },
  },
  {
    code: "ArrowUp",
    metaKey: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "launch-parent-dir" },
  },
  {
    code: "Digit0",
    metaKey: true,
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "focus-neediest" },
  },
  ...DIGIT_CODES.map(
    (code, index): Binding => ({
      code,
      metaKey: true,
      altKey: true,
      shiftKey: false,
      ctrlKey: false,
      action: { type: "focus-nth", n: index + 1 },
    }),
  ),
];

/** Maps a keydown to its bound action, or `null` if the event doesn't match any bound
 * chord exactly — all four modifier booleans (`metaKey`/`altKey`/`shiftKey`/`ctrlKey`)
 * must equal the binding's, so an extra held modifier never triggers a
 * neighbouring action. Matches on `event.code`, never `event.key`. */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  for (const binding of BINDINGS) {
    if (
      event.code === binding.code &&
      event.metaKey === binding.metaKey &&
      event.altKey === binding.altKey &&
      event.shiftKey === binding.shiftKey &&
      event.ctrlKey === binding.ctrlKey
    ) {
      return binding.action;
    }
  }
  return null;
}
