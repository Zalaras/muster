// Shared decoder building blocks: the primitive value guards/adapters, a JSON object
// guard, an array-of-T decoder, and a null-or-T decoder. Every wire parser in this
// codebase hand-wrote these shapes at its own call site; this module owns how a JSON
// primitive, "a JSON object", "an array of these", and "null or one of these" are
// recognised — a parser still owns what its own fields mean. Every module under
// `web/src/protocol/` and `web/src/api/` imports from here rather than from each other.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** `unknown -> number | null` — the adapter every nullable numeric field passes to
 * `parseNullable`. */
export function asNumber(value: unknown): number | null {
  return isNumber(value) ? value : null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Parses every element of a JSON array with `parseItem`. Every wire list in this codebase
 * is all-or-nothing — one bad element rejects the whole array rather than dropping it — so
 * this returns `null` (not a partial array) the moment `value` isn't an array or any
 * element fails to parse. */
export function parseListOf<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parseItem(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

/** Parses a field whose wire value is either `null` or something `parseItem` accepts.
 * Returns `undefined` — never a valid `T | null` — as the sentinel for "present but
 * malformed", collapsing the `raw === null ? null : parseItem(raw)` assignment plus its
 * `raw !== null && parsed === null` rejection check into one assignment and one
 * `=== undefined` check at the call site. */
export function parseNullable<T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
): T | null | undefined {
  if (value === null) return null;
  const parsed = parseItem(value);
  return parsed === null ? undefined : parsed;
}
