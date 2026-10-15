import { requireElement } from "../dom";
import type { EffortStripPart } from "../sessions/effort";

function stripSignature(parts: readonly EffortStripPart[]): string {
  return parts.map((part) => `${part.bold ? "b" : "t"}${part.text}`).join("\u0000");
}

function buildSentence(parts: readonly EffortStripPart[]): Node[] {
  return parts.map((part) => {
    if (!part.bold) return document.createTextNode(part.text);
    const bold = document.createElement("b");
    bold.textContent = part.text;
    return bold;
  });
}

export function renderEffortStrip(
  strip: HTMLElement,
  parts: readonly EffortStripPart[] | null,
): void {
  strip.hidden = parts === null;
  if (parts === null) return;
  const signature = stripSignature(parts);
  if (strip.dataset["signature"] === signature) return;
  strip.dataset["signature"] = signature;
  requireElement<HTMLElement>(".sentence", strip).replaceChildren(...buildSentence(parts));
}
