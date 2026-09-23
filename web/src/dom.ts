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

export function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}
