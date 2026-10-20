// Computed-style oracles shared by the render specs: a CSS effect a requirement names is
// asserted by the computed property that produces it, never by a proxy that passes without
// it (kb:lesson/shared-class-css-hid-resume-button, kb:lesson/mockup-vindicates-markup-not-cascade).
import type { Locator, Page } from "./harness";

/**
 * The live colour a `--token` resolves to, read off a probe element so the comparison is
 * against what the page's own cascade produces for that variable, never a literal. `prop`
 * is the property the token is applied through — `color` by default, `background-color`
 * for a ground token; the browser normalises both to the same `rgb(...)` text.
 */
export async function tokenColor(
  page: Page,
  token: string,
  prop: "color" | "background-color" = "color",
): Promise<string> {
  return await page.evaluate(
    ({ name, prop }) => {
      const probe = document.createElement("span");
      probe.style.setProperty(prop, `var(${name})`);
      document.body.append(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return resolved;
    },
    { name: token, prop },
  );
}

/** An element's computed `color`. */
export async function computedColor(loc: Locator): Promise<string> {
  return await loc.evaluate((el) => getComputedStyle(el).color);
}

/** One text line's clipping and box: an ellipsis is `text-overflow` plus a scrollWidth wider
 * than the clientWidth, never the dots alone. */
export async function lineGeometry(line: Locator): Promise<{
  textOverflow: string;
  whiteSpace: string;
  overflow: string;
  scrollWidth: number;
  clientWidth: number;
  top: number;
  bottom: number;
  height: number;
}> {
  return await line.evaluate((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      overflow: cs.overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
    };
  });
}
