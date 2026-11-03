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

/**
 * The size of what an element actually draws: screenshot it and take the bounding box of the
 * pixels that differ from its ground (the top-left pixel). A glyph's font box and a CSS box
 * both overstate the ink, so a requirement on how big a mark looks is asserted on this.
 */
export async function inkBox(loc: Locator): Promise<{ width: number; height: number }> {
  const png = await loc.screenshot({ animations: "disabled" });
  return await loc.page().evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bmp, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const px = (k: number): number => data[k] ?? 0;
    const ground = [px(0), px(1), px(2)] as const;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const diff =
          Math.abs(px(i) - ground[0]) +
          Math.abs(px(i + 1) - ground[1]) +
          Math.abs(px(i + 2) - ground[2]);
        if (diff > 60) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return maxX < 0 ? { width: 0, height: 0 } : { width: maxX - minX + 1, height: maxY - minY + 1 };
  }, png.toString("base64"));
}
