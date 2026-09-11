// Element-lookup helpers shared by every feature controller (plan code-breakup REQ-2/W13
// — `main.ts` itself never looks up an element, so these live here rather than there).
export function requireElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing required element: ${selector}`);
  return el;
}

export function requireElements<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}
