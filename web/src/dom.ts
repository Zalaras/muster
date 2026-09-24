// Element-lookup helpers shared by every feature controller (main.ts itself never looks
// up an element, so these live here rather than there) and by every builder that scopes a
// lookup inside an already-cloned root, via the optional `root` parameter.
export function requireElement<T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing required element: ${selector}`);
  return el;
}

/** Same "require" contract as `requireElement`: a selector matching nothing throws rather
 * than handing the caller a silent `[]`, which would read as a legitimately empty group
 * instead of a broken template. */
export function requireElements<T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  const els = Array.from(root.querySelectorAll<T>(selector));
  if (els.length === 0) throw new Error(`missing required elements: ${selector}`);
  return els;
}

/** Checks exactly the radio in `radios` whose `value` matches, explicitly unchecking every
 * other one — this "sync a radio group from external state" idiom was
 * hand-rolled in `features/launch.ts` (models/permission-mode) and again in
 * `render/settings.ts` (theme/rail-activity); one shared helper for both. Returns whether
 * any radio matched, for a caller that falls back when the stored value has no radio
 * (`features/launch.ts`'s "unknown model -> `other`"). */
export function checkRadioValue(radios: readonly HTMLInputElement[], value: string): boolean {
  let matched = false;
  for (const radio of radios) {
    radio.checked = radio.value === value;
    if (radio.checked) matched = true;
  }
  return matched;
}
