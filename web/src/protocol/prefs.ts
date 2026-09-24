// Wire types and parser for `Prefs` and its `prefs` broadcast (docs/protocol.md,
// kb:anchor/prefs.put) — one of the protocol/ concept modules split
// out of the former protocol.ts.

import { isBoolean, isRecord, isString } from "./decode";

// kb:anchor/prefs.put: the rail's sort mode pref.
export const RAIL_SORTS = ["manual", "attention"] as const;
export type RailSort = (typeof RAIL_SORTS)[number];

export const VIEWS = ["focus", "tiles"] as const;
export type View = (typeof VIEWS)[number];

export const DENSITIES = ["2x2", "3x2"] as const;
export type Density = (typeof DENSITIES)[number];

// kb:anchor/prefs.put: the rail/strip card density pref.
export const RAIL_DENSITIES = ["compact", "comfortable", "expanded"] as const;
export type RailDensity = (typeof RAIL_DENSITIES)[number];

// kb:anchor/prefs.put: which text a card's activity line
// shows — turn-aware by default (kb:adr/rail-activity-line-turn-aware-default-with-pref).
export const RAIL_ACTIVITIES = ["turn", "prompt", "reply", "both"] as const;
export type RailActivity = (typeof RAIL_ACTIVITIES)[number];

// kb:anchor/prefs.put: density is always present alongside view — the daemon's default
// before any PUT is {"view":"focus","density":"2x2","usageModel":"Fable"} — so all three
// fields are required here, matching every real `snapshot`/`prefs` payload on the wire.
// `parsePrefs` below defaults a missing `usageModel` key to `"Fable"` so a payload without
// it still parses.
export interface Prefs {
  view: View;
  density: Density;
  usageModel: string;
  // kb:anchor/prefs.put: defaulted to "manual" client-side when
  // the key is absent (same tolerance as `usageModel`, for a daemon predating this field).
  railSort: RailSort;
  // kb:anchor/prefs.put: opaque to the daemon
  // beyond its pattern — the client owns the theme registry (theme.ts). Missing key
  // (a daemon predating this field) defaults to "follow", same tolerance as usageModel/railSort.
  theme: string;
  // kb:anchor/prefs.put / kb:anchor/ws.prefs: governs checking only - the binary
  // never changes without an explicit apply. Missing key (a daemon predating this field) defaults to
  // true (the daemon's own documented default), same tolerance as the other prefs above.
  updateCheck: boolean;
  // kb:anchor/prefs.put: card density in the rail and the
  // Tiles strip. Missing key (a daemon predating this field) defaults to "comfortable", same tolerance
  // as the other prefs above.
  railDensity: RailDensity;
  // kb:anchor/prefs.put: which text a card's activity line
  // shows. Missing key (a daemon predating this field) defaults to "turn", same tolerance as above.
  railActivity: RailActivity;
}

// One-owner defaults for every pref — `parsePrefsField`'s
// fallback for a missing wire key below, and `app.ts`'s initial `AppState` before the
// first snapshot ever arrives. `view`/`density` have no *wire* default (every daemon
// always sends both, so `parsePrefs` rejects a payload missing either rather than
// defaulting it) — they're here only because the client still needs something to paint
// before it has heard from the daemon at all, and kb:anchor/ws.prefs documents the
// daemon's own default snapshot as exactly this object.
export const PREF_DEFAULTS: Prefs = {
  view: "focus",
  density: "2x2",
  usageModel: "Fable",
  railSort: "manual",
  theme: "follow",
  updateCheck: true,
  railDensity: "comfortable",
  railActivity: "turn",
};

// kb:anchor/ws.prefs: full-object echo of every accepted `PUT /api/prefs`,
// broadcast to every connected UI socket.
export interface PrefsMessage {
  type: "prefs";
  prefs: Prefs;
}

function isRailSort(value: unknown): value is RailSort {
  return (RAIL_SORTS as readonly unknown[]).includes(value);
}

function isView(value: unknown): value is View {
  return (VIEWS as readonly unknown[]).includes(value);
}

function isDensity(value: unknown): value is Density {
  return (DENSITIES as readonly unknown[]).includes(value);
}

// Exported: features/rail.ts's density-button guard imports this instead of keeping its
// own copy.
export function isRailDensity(value: unknown): value is RailDensity {
  return (RAIL_DENSITIES as readonly unknown[]).includes(value);
}

// Exported: render/settings.ts's rail-activity-radio guard imports this instead of
// keeping its own copy.
export function isRailActivity(value: unknown): value is RailActivity {
  return (RAIL_ACTIVITIES as readonly unknown[]).includes(value);
}

/** Reads one prefs field that has a fixed default for a missing key and a guard for a
 * present one — every field below `view`/`density` (which have no default; every
 * daemon always sends them) shares this exact "missing key defaults, present-but-wrong-shape
 * rejects the whole object" shape. Extracted so `parsePrefs` states each field once,
 * under Biome's complexity ceiling, rather than repeating a ternary-then-guard pair per
 * field inline. */
function parsePrefsField<T>(raw: unknown, fallback: T, guard: (v: unknown) => v is T): T | null {
  const v = raw === undefined ? fallback : raw;
  return guard(v) ? v : null;
}

export function parsePrefs(value: unknown): Prefs | null {
  if (!isRecord(value)) return null;
  const view = value["view"];
  const density = value["density"];
  if (!isView(view)) return null;
  if (!isDensity(density)) return null;
  // Missing key (a daemon predating this field) defaults to the daemon's own
  // documented default (kb:anchor/ws.prefs, PREF_DEFAULTS above).
  const usageModel = parsePrefsField(value["usageModel"], PREF_DEFAULTS.usageModel, isString);
  if (usageModel === null) return null;
  // Missing key (a daemon predating this field) defaults to PREF_DEFAULTS.railSort
  // (kb:anchor/prefs.put's documented default).
  const railSort = parsePrefsField(value["railSort"], PREF_DEFAULTS.railSort, isRailSort);
  if (railSort === null) return null;
  // Missing key (a daemon predating this field) defaults to
  // PREF_DEFAULTS.theme (kb:anchor/prefs.put's documented default) — the daemon treats
  // the string as opaque beyond its pattern, so no further validation happens client-side.
  const theme = parsePrefsField(value["theme"], PREF_DEFAULTS.theme, isString);
  if (theme === null) return null;
  // Missing key (a daemon predating this field) defaults to PREF_DEFAULTS.updateCheck
  // (kb:anchor/prefs.put's documented default), same tolerance as usageModel/railSort/theme above.
  const updateCheck = parsePrefsField(value["updateCheck"], PREF_DEFAULTS.updateCheck, isBoolean);
  if (updateCheck === null) return null;
  // Missing key (a daemon predating this field) defaults to
  // PREF_DEFAULTS.railDensity (kb:anchor/prefs.put's documented default). A *stored*
  // value outside the enum is the daemon's problem, not the wire's — it falls back to
  // "comfortable" server-side before it is ever sent. If an
  // out-of-enum railDensity somehow reaches the client anyway, parsePrefsField's guard
  // fails and parsePrefs rejects the whole prefs object (protocol/prefs.test.ts's "rejects a
  // railDensity value outside the compact|comfortable|expanded enum").
  const railDensity = parsePrefsField(
    value["railDensity"],
    PREF_DEFAULTS.railDensity,
    isRailDensity,
  );
  if (railDensity === null) return null;
  // Missing key (a daemon predating this field) defaults to
  // PREF_DEFAULTS.railActivity (kb:anchor/prefs.put's documented default), same tolerance
  // as railDensity above.
  const railActivity = parsePrefsField(
    value["railActivity"],
    PREF_DEFAULTS.railActivity,
    isRailActivity,
  );
  if (railActivity === null) return null;
  return {
    view,
    density,
    usageModel,
    railSort,
    theme,
    updateCheck,
    railDensity,
    railActivity,
  };
}

export function parsePrefsMessage(rec: Record<string, unknown>): PrefsMessage | null {
  const prefs = parsePrefs(rec["prefs"]);
  if (!prefs) return null;
  return { type: "prefs", prefs };
}
