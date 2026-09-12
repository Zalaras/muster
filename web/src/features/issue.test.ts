import { describe, expect, it } from "vitest";
import { composeNoteSection, renderIssueButton } from "./issue";

// W4: "The note-section composer produces the empty string for a whitespace-only note,
// and `"## What happened\n\n<note>\n\n"` otherwise, with CRLF normalised to LF." Pinned
// identically on the daemon side (plan Implementation Notes: "One composer for the note
// section, two callers") — INV-2's E2E byte-identity assertion depends on both sides
// agreeing on exactly this rule, so every clause of it gets its own case here.
describe("composeNoteSection (W4, plan issue-capture Implementation Notes)", () => {
  it("returns the empty string for an empty note", () => {
    expect(composeNoteSection("")).toBe("");
  });

  it("returns the empty string for a whitespace-only note (spaces, tabs, newlines)", () => {
    expect(composeNoteSection("   \t  \n\n  ")).toBe("");
  });

  it("returns the empty string for a note that is CRLF-only whitespace", () => {
    expect(composeNoteSection("  \r\n  \r\n  ")).toBe("");
  });

  it("wraps a single-line note in the '## What happened' section", () => {
    expect(composeNoteSection("Something broke")).toBe("## What happened\n\nSomething broke\n\n");
  });

  it("trims leading and trailing whitespace from the note before composing", () => {
    expect(composeNoteSection("  Something broke  ")).toBe(
      "## What happened\n\nSomething broke\n\n",
    );
  });

  it("preserves internal newlines in a multi-line note", () => {
    expect(composeNoteSection("Line one\nLine two\nLine three")).toBe(
      "## What happened\n\nLine one\nLine two\nLine three\n\n",
    );
  });

  it("normalises CRLF to LF throughout the note", () => {
    expect(composeNoteSection("Line one\r\nLine two\r\nLine three")).toBe(
      "## What happened\n\nLine one\nLine two\nLine three\n\n",
    );
  });

  it("normalises a lone CRLF at the note's own end distinctly from the trim (both apply)", () => {
    expect(composeNoteSection("Note text\r\n")).toBe("## What happened\n\nNote text\n\n");
  });

  it("normalises mixed CRLF and bare LF line endings in the same note", () => {
    expect(composeNoteSection("Line one\r\nLine two\nLine three")).toBe(
      "## What happened\n\nLine one\nLine two\nLine three\n\n",
    );
  });

  it("passes through backticks, a triple-backtick fence, a pipe and a </details> string verbatim (Edge Case 10/11)", () => {
    const note = "```\ncode fence\n``` and a | pipe and a </details> tag and `inline code`";
    expect(composeNoteSection(note)).toBe(`## What happened\n\n${note}\n\n`);
  });

  it("a single non-whitespace character is enough to produce the section (boundary against the empty case)", () => {
    expect(composeNoteSection("x")).toBe("## What happened\n\nx\n\n");
  });
});

describe("renderIssueButton (masthead trigger, REQ-13: disabled while the daemon is down)", () => {
  function fakeButton(): HTMLButtonElement {
    return { disabled: false } as unknown as HTMLButtonElement;
  }

  it("enables the button when connected", () => {
    const el = fakeButton();
    el.disabled = true;
    renderIssueButton(el, true);
    expect(el.disabled).toBe(false);
  });

  it("disables the button when not connected", () => {
    const el = fakeButton();
    el.disabled = false;
    renderIssueButton(el, false);
    expect(el.disabled).toBe(true);
  });
});
