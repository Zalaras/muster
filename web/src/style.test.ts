import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// W6/REQ-10: the connection health dot's three colours are semantic tokens declared in each
// of the three theme blocks, and the dot's component rule paints with those tokens only.
// style.css is plain text, so this reads the shipped file rather than a copy of its values.
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

function blockBody(openingSelector: string): string {
  const start = css.indexOf(`${openingSelector} {`);
  if (start === -1) throw new Error(`no rule for ${openingSelector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const THEME_BLOCKS = [
  ["instrument", ':root,\n:root[data-theme="instrument"]'],
  ["dark", ':root[data-theme="dark"]'],
  ["light", ':root[data-theme="light"]'],
] as const;
const TOKENS = ["--health-ok", "--health-pending", "--health-down"] as const;
const COLOUR = /^#[0-9a-f]{6}$/i;

describe("health dot tokens (W6, REQ-10)", () => {
  it.each(
    THEME_BLOCKS.flatMap(([theme, selector]) => TOKENS.map((t) => [theme, selector, t] as const)),
  )("the %s theme block declares %s as a colour", (_theme, selector, token) => {
    const match = new RegExp(`${token}:\\s*([^;]+);`).exec(blockBody(selector));
    expect(match, `${token} missing`).not.toBeNull();
    expect(match?.[1]?.trim()).toMatch(COLOUR);
  });

  it.each(TOKENS)("%s is declared once per theme block, never in the shared :root", (token) => {
    expect(css.match(new RegExp(`^\\s*${token}:`, "gm"))).toHaveLength(3);
  });

  it("the dot rule and its three state rules paint only through the health tokens", () => {
    const rules = [
      "#connection-status::before",
      '#connection-status[data-health="ok"]::before',
      '#connection-status[data-health="pending"]::before',
      '#connection-status[data-health="down"]::before',
    ].map((selector) => blockBody(selector));
    for (const body of rules) expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(rules.slice(1).map((body) => /background:\s*var\((--[\w-]+)\)/.exec(body)?.[1])).toEqual(
      ["--health-ok", "--health-pending", "--health-down"],
    );
  });
});
