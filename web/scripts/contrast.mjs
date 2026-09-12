#!/usr/bin/env node
// REQ-4/5/6 (plan new-ui-design-colors): the contrast gate. Node stdlib only — `make
// check` stays dependency-free beyond the existing toolchain. Parses every
// `[data-theme]` block out of style.css, evaluates every `contrast-pairs.json` pair per
// theme with the WCAG 2.x relative-luminance formula, verifies every hue-family token
// sits inside its hue band, and verifies no colour literal exists outside the theme
// blocks (REQ-1's rule, machine checked here). `npm run contrast` runs it; `make
// contrast` wraps that; `make check` is `lint test contrast`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const styleCssPath = path.join(scriptDir, "..", "src", "style.css");
const pairsJsonPath = path.join(scriptDir, "contrast-pairs.json");

const cssRaw = readFileSync(styleCssPath, "utf8");
const config = JSON.parse(readFileSync(pairsJsonPath, "utf8"));

// Comments stripped up front — the file's own explanatory comments directly precede
// several `:root` rules (each theme block, the terminal-pair blocks), and a comment
// glued onto the front of a selector list would otherwise defeat the
// `startsWith(":root")` check below. Stripping here also means the later
// literal-outside-theme-blocks scan never has to worry about prose that mentions colour
// words ("amber", "teal", "grey", ...) in a comment.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1. Parse every top-level `:root...{...}` rule out of the file ─────────────────────
// This codebase's style.css has no nesting (no @media, no nested rules) inside these
// blocks, so a flat "selector-list { declarations }" scan is sufficient. A rule counts
// as a "root block" iff every comma-separated selector in its selector list starts with
// `:root` — that's the font-stack block, the three theme blocks (one combined with the
// bare `:root` for instrument), and the two terminal-pair blocks. All six are excluded
// from the later literal-outside-theme-blocks scan; the three carrying `data-theme="X"`
// additionally populate that theme's token map.
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
const themes = { instrument: {}, dark: {}, light: {} };
const rootBlockSpans = [];

for (const match of css.matchAll(ruleRe)) {
  const selectorList = match[1];
  const body = match[2];
  const selectors = selectorList
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (selectors.length === 0) continue;
  const isRootBlock = selectors.every((s) => s.startsWith(":root"));
  if (!isRootBlock) continue;

  rootBlockSpans.push([match.index, match.index + match[0].length]);

  const themeSelector = selectors.find((s) => /data-theme="(instrument|dark|light)"/.test(s));
  if (!themeSelector) continue;
  const themeName = /data-theme="(instrument|dark|light)"/.exec(themeSelector)[1];

  for (const declMatch of body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    themes[themeName][declMatch[1]] = declMatch[2].trim();
  }
}

// ── 2. Resolve a token's value within one theme (chases var() refs defensively — every
// pair in practice resolves to a literal in one hop, since Layer 2 blocks declare
// literals only) ────────────────────────────────────────────────────────────────────
function resolveToken(themeName, tokenName, seen = new Set()) {
  const map = themes[themeName];
  if (!(tokenName in map)) return null;
  if (seen.has(tokenName)) return null; // cycle guard
  seen.add(tokenName);
  const raw = map[tokenName];
  const varMatch = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/.exec(raw);
  if (varMatch) return resolveToken(themeName, varMatch[1], seen);
  return raw;
}

// ── 3. Colour parsing + WCAG relative luminance / contrast ratio ──────────────────────
function parseColor(value) {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
    value.trim(),
  );
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) };
  }
  return null;
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── 4. RGB -> HSL (for hue-band / saturation checks, REQ-6) ────────────────────────────
function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s: s * 100, l };
}

function hueInBand(hue, band) {
  if (band.wraps) return hue >= band.min || hue <= band.max;
  return hue >= band.min && hue <= band.max;
}

// ── 5. Run the checks ────────────────────────────────────────────────────────────────
let failures = 0;
const themeNames = Object.keys(themes);

for (const themeName of themeNames) {
  let themePairCount = 0;
  const failuresBeforeTheme = failures;
  for (const pair of config.pairs) {
    const fgRaw = resolveToken(themeName, pair.fg);
    const bgRaw = resolveToken(themeName, pair.bg);
    if (fgRaw === null || bgRaw === null) {
      console.error(
        `${themeName} ${pair.fg} on ${pair.bg}: token not declared in this theme block`,
      );
      failures++;
      continue;
    }
    const fgColor = parseColor(fgRaw);
    const bgColor = parseColor(bgRaw);
    if (!fgColor || !bgColor) {
      console.error(
        `${themeName} ${pair.fg} on ${pair.bg}: could not parse "${fgRaw}" / "${bgRaw}"`,
      );
      failures++;
      continue;
    }
    const ratio = contrastRatio(fgColor, bgColor);
    themePairCount++;
    if (ratio < pair.min) {
      console.error(`${themeName} ${pair.fg} on ${pair.bg} ${ratio.toFixed(2)} (min ${pair.min})`);
      failures++;
    }
  }

  for (const [token, band] of Object.entries(config.hueBands ?? {})) {
    const raw = resolveToken(themeName, token);
    const color = raw ? parseColor(raw) : null;
    if (!color) {
      console.error(`${themeName} ${token}: could not parse hue-band value`);
      failures++;
      continue;
    }
    const { h } = rgbToHsl(color);
    if (!hueInBand(h, band)) {
      console.error(
        `${themeName} ${token} hue ${h.toFixed(1)}deg outside band [${band.min}, ${band.max}]`,
      );
      failures++;
    }
  }

  for (const [token, ceiling] of Object.entries(config.saturationCeilings ?? {})) {
    const raw = resolveToken(themeName, token);
    const color = raw ? parseColor(raw) : null;
    if (!color) {
      console.error(`${themeName} ${token}: could not parse saturation value`);
      failures++;
      continue;
    }
    const { s } = rgbToHsl(color);
    if (s > ceiling) {
      console.error(
        `${themeName} ${token} saturation ${s.toFixed(1)}% exceeds ceiling ${ceiling}%`,
      );
      failures++;
    }
  }

  const themeFailures = failures - failuresBeforeTheme;
  if (themeFailures === 0) {
    console.log(`${themeName}: ${themePairCount} pairs, 0 failures`);
  }
}

// ── 6. No colour literal outside a theme block (REQ-1/INV-8) ──────────────────────────
// Everything outside the six root-block spans found above must carry no hex colour, no
// rgb()/rgba()/hsl()/hsla() call, and no CSS named colour. var(--x) references and
// custom-property usages are legitimate everywhere and are stripped first so a token
// name that happens to share a CSS colour keyword (e.g. --teal) never false-positives.
let rest = "";
let cursor = 0;
for (const [start, end] of rootBlockSpans.sort((a, b) => a[0] - b[0])) {
  rest += css.slice(cursor, start);
  cursor = end;
}
rest += css.slice(cursor);

// var(--x) references are stripped so a custom-property name that happens to share a
// CSS colour keyword (e.g. --teal) never false-positives against the named-colour scan
// below. Comments are already gone (stripped from `css` itself, above). `white-space`
// (a legitimate property this file uses ten times) is stripped for the same reason — the
// CSS keyword "white" is a substring of it, word-boundary and all.
rest = rest.replace(/var\([^)]*\)/g, "");
rest = rest.replace(/white-space/g, "");

const NAMED_COLORS = [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
];
const namedColorRe = new RegExp(`\\b(${NAMED_COLORS.join("|")})\\b`, "gi");

const literalPatterns = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, label: "hex literal" },
  { re: /\brgba?\(/g, label: "rgb()/rgba()" },
  { re: /\bhsla?\(/g, label: "hsl()/hsla()" },
  { re: namedColorRe, label: "named colour" },
];

for (const { re, label } of literalPatterns) {
  for (const hit of rest.matchAll(re)) {
    console.error(`literal outside theme blocks: ${label} "${hit[0]}"`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast/hue/literal failure(s).`);
  process.exit(1);
}
