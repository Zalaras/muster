// Plan mermaid-support — pure helpers for the diagram pass: recognising a mermaid fence
// (REQ-1), mapping the dashboard theme to one of mermaid's two built-in themes (REQ-7),
// formatting a failed fence's reason line (REQ-6), and naming a diagram instance (REQ-14).
// No DOM, no mermaid import here — `render/mermaid.ts` is the only module that names the
// engine (kb:spec/reader "not Vitest-importable" split).

/** True iff `className` (a `<code>` element's `className`, whitespace-separated tokens)
 * carries a `language-mermaid` token, case-insensitive on the whole token — marked emits
 * `language-<info-string-first-word>` verbatim, so `Mermaid`/`MERMAID` info strings must
 * still match (edge case 1) while `language-mermaidjs` must not. */
export function isMermaidLanguageClass(className: string): boolean {
  return className
    .split(/\s+/)
    .some((token) => token.length > 0 && token.toLowerCase() === "language-mermaid");
}

/** `light` maps to mermaid's `default` theme; every other value — `instrument`, `dark`,
 * empty and unrecognised alike — maps to `dark` (REQ-7: "or anything unrecognised"). */
export function mermaidThemeFor(theme: string | null): "dark" | "default" {
  return theme === "light" ? "default" : "dark";
}

const MAX_REASON_LENGTH = 200;

/** The first non-empty, trimmed line of `message`, capped at `MAX_REASON_LENGTH`
 * characters, or `null` if every line is empty. */
function firstNonEmptyLine(message: string): string | null {
  for (const rawLine of message.split("\n")) {
    const line = rawLine.trim();
    if (line.length > 0)
      return line.length > MAX_REASON_LENGTH ? line.slice(0, MAX_REASON_LENGTH) : line;
  }
  return null;
}

/** REQ-6's failure line text: `diagram not rendered: ` plus the first non-empty line of
 * an `Error`'s message (trimmed, capped), or `diagram not rendered: syntax error` for
 * anything else — a non-`Error` throw, or an `Error` whose message is empty/blank. */
export function diagramErrorText(err: unknown): string {
  const reason = err instanceof Error ? firstNonEmptyLine(err.message) : null;
  return `diagram not rendered: ${reason ?? "syntax error"}`;
}

/** A unique id per diagram, per pass — `instance` is a value the caller mints fresh for
 * this pass (`features/reader.ts` draws it from a module counter on every call, never
 * reusing one across passes, so a re-render never reuses a stale id), `n` the fence's
 * position in document order (REQ-14: two identical fences still get distinct ids). */
export function diagramId(instance: number, n: number): string {
  return `muster-diagram-${instance}-${n}`;
}
