// Plan frontmatter (REQ-1..REQ-4, REQ-7, W1-W9): splitFrontmatter is the reader's only
// frontmatter-detection logic — pure, no DOM (this module's own header comment) — so
// every fence/line-ending/classification case belongs here rather than behind
// markdown.ts's DOM build, which is Playwright's per reader/CLAUDE.md.
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter — no block (REQ-7)", () => {
  it("returns frontmatter: null and the input unchanged when the text has no fence at all", () => {
    const text = "# Just a heading\n\nSome body text.\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("returns frontmatter: null and the input unchanged when --- is not the first line (W2)", () => {
    const text = "intro line\n---\nkey: value\n---\nbody\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("returns frontmatter: null and the input unchanged for an unclosed opening fence (W1)", () => {
    const text = "---\nkey: value\nno closing fence here\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("does not treat a later thematic break as a closing fence without a real opener", () => {
    // First line isn't a fence at all, so the whole document is untouched (W2).
    const text = "para\n\n---\n\nmore\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });
});

describe("splitFrontmatter — fence recognition (W5)", () => {
  it("recognises a fence line with trailing spaces", () => {
    const text = "---   \nkey: value\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("body\n");
  });

  it("recognises a fence line with trailing tabs", () => {
    const text = "---\t\nkey: value\n---\t\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
  });

  it("does not treat ---- as a fence", () => {
    const text = "----\nkey: value\n---\nbody\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("does not treat --- x as a fence", () => {
    const text = "--- x\nkey: value\n---\nbody\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("does not close on a line with trailing content after the dashes", () => {
    const text = "---\nkey: value\n--- not a fence\n---\nbody\n";
    const result = splitFrontmatter(text);
    // the first real closing fence is the second "---" line; everything before it,
    // including the fake closer, is inner block text and fails flat classification
    expect(result.frontmatter).toEqual({
      kind: "raw",
      text: "key: value\n--- not a fence\n",
    });
    expect(result.body).toBe("body\n");
  });
});

describe("splitFrontmatter — BOM and line endings (REQ-1, W3, W4)", () => {
  it("strips a leading UTF-8 BOM and does not include it in the body", () => {
    const text = "﻿---\nkey: value\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("body\n");
    expect(result.body.startsWith("﻿")).toBe(false);
  });

  it("recognises CRLF fences and returns a body byte-identical to the text after the closing fence's line ending", () => {
    const text = "---\r\nkey: value\r\n---\r\nbody line one\r\nbody line two\r\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("body line one\r\nbody line two\r\n");
  });

  it("keeps CRLFs inside a raw fallback block's text verbatim", () => {
    const text = "---\r\n- a\r\n- b\r\n---\r\nbody\r\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "- a\r\n- b\r\n" });
  });

  it("handles a BOM with CRLF fences together", () => {
    const text = "﻿---\r\nkey: value\r\n---\r\nbody\r\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("body\r\n");
  });
});

describe("splitFrontmatter — flat entries (REQ-2, W8)", () => {
  it("parses one row per key: value line, in file order", () => {
    const text = "---\na: 1\nb: 2\nc: 3\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [
        { key: "a", value: "1" },
        { key: "b", value: "2" },
        { key: "c", value: "3" },
      ],
    });
  });

  it("keeps duplicate keys as separate rows in order", () => {
    const text = "---\ntag: one\ntag: two\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [
        { key: "tag", value: "one" },
        { key: "tag", value: "two" },
      ],
    });
  });

  it("renders an empty string value for a key with nothing after the colon", () => {
    const text = "---\nkey:\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "entries", entries: [{ key: "key", value: "" }] });
  });

  it("trims surrounding whitespace from the value but keeps it otherwise verbatim", () => {
    const text = "---\nkey:   spaced out value   \n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "spaced out value" }],
    });
  });

  it("takes the value after the first colon-space when the value itself contains a colon", () => {
    const text = "---\nurl: http://example.com:8080/x\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "url", value: "http://example.com:8080/x" }],
    });
  });

  it("shows a list-shaped value as literal text, no list parsing", () => {
    const text = "---\ntags: [a, b]\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "tags", value: "[a, b]" }],
    });
  });

  it("skips blank and comment lines without producing rows for them", () => {
    const text = "---\na: 1\n\n# a comment\nb: 2\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [
        { key: "a", value: "1" },
        { key: "b", value: "2" },
      ],
    });
  });

  it("allows dots, hyphens and underscores in a key", () => {
    const text = "---\nfile.path-name_1: ok\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "file.path-name_1", value: "ok" }],
    });
  });
});

describe("splitFrontmatter — raw fallback (REQ-3, W6)", () => {
  it("falls back to raw for a block-list item", () => {
    const text = "---\ntags:\n  - a\n  - b\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "tags:\n  - a\n  - b\n" });
  });

  it("falls back to raw for a | scalar body", () => {
    const text = "---\ndescription: |\n  line one\n  line two\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "raw",
      text: "description: |\n  line one\n  line two\n",
    });
  });

  it("falls back to raw for an unkeyed line", () => {
    const text = "---\njust some text\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "just some text\n" });
  });

  it("falls back to raw when a key has no leading space before its value (key:value)", () => {
    const text = "---\nkey:value\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "key:value\n" });
  });

  it("falls back to raw for the whole block when only one of several lines is non-flat", () => {
    const text = "---\na: 1\n  - stray list item\nb: 2\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "a: 1\n  - stray list item\nb: 2\n" });
  });

  it("keeps the raw text verbatim, including blank lines and comments", () => {
    const text = "---\n# a comment\n\n  - item\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({ kind: "raw", text: "# a comment\n\n  - item\n" });
  });
});

describe("splitFrontmatter — empty block (REQ-4, W7)", () => {
  it("returns frontmatter: null and strips an empty block", () => {
    const text = "---\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("body\n");
  });

  it("returns frontmatter: null and strips a comments-only block", () => {
    const text = "---\n# just a comment\n# another\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("body\n");
  });

  it("returns frontmatter: null and strips a whitespace-only block", () => {
    const text = "---\n\n   \n\t\n---\nbody\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe("body\n");
  });
});

describe("splitFrontmatter — body untouched beyond the block (W9, edge case 19/20)", () => {
  it("leaves a later thematic break in the body untouched", () => {
    const text = "---\nkey: value\n---\nabove\n\n---\n\nbelow\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("above\n\n---\n\nbelow\n");
  });

  it("returns an empty body for a file that is only frontmatter", () => {
    const text = "---\nkey: value\n---\n";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("");
  });

  it("returns an empty body for a file that is only frontmatter with no trailing newline", () => {
    const text = "---\nkey: value\n---";
    const result = splitFrontmatter(text);
    expect(result.frontmatter).toEqual({
      kind: "entries",
      entries: [{ key: "key", value: "value" }],
    });
    expect(result.body).toBe("");
  });
});
