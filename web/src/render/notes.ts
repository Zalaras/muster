import { requireElement, setText } from "../dom";
import { renderMarkdown } from "../reader/markdown";
import {
  currentDiagramTheme,
  mintDiagramInstance,
  renderDiagrams,
  rerenderDiagrams,
} from "./diagrams";
import { buildFrontmatterNode } from "./frontmatter";
import { createHoverTip } from "./hovertip";

const MARKER_TEXT = "Has a note";

export const EMPTY_NOTE_TEXT = "No note yet. Click to write one (markdown).";

export interface NoteTipModel {
  text: string;
}

export interface NoteMarkerHover {
  attach(marker: HTMLElement, id: number): void;
  refresh(): void;
  close(): void;
}

function openLinksElsewhere(fragment: DocumentFragment): void {
  for (const link of fragment.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
}

function stampPass(host: HTMLElement): { instance: number; isCurrent: () => boolean } {
  const instance = mintDiagramInstance();
  host.dataset["noteInstance"] = String(instance);
  return { instance, isCurrent: () => host.dataset["noteInstance"] === String(instance) };
}

export function renderNoteInto(host: HTMLElement, text: string): void {
  const rendered = renderMarkdown(text);
  const frontmatter = buildFrontmatterNode(rendered.frontmatter);
  if (frontmatter) rendered.fragment.prepend(frontmatter);
  openLinksElsewhere(rendered.fragment);
  host.replaceChildren(rendered.fragment);
  const pass = stampPass(host);
  void renderDiagrams(host, { ...pass, theme: currentDiagramTheme() });
}

export function renderEmptyNote(host: HTMLElement): void {
  const line = document.createElement("span");
  line.className = "empty";
  line.textContent = EMPTY_NOTE_TEXT;
  host.replaceChildren(line);
  delete host.dataset["noteInstance"];
}

export function rerenderNoteDiagrams(host: HTMLElement): void {
  if (host.dataset["noteInstance"] === undefined) return;
  void rerenderDiagrams(host, { ...stampPass(host), theme: currentDiagramTheme() });
}

export function applyNoteMarker(marker: HTMLElement, note: string | null): void {
  marker.hidden = note === null;
  setText(requireElement<HTMLElement>(".sr-only", marker), note === null ? "" : MARKER_TEXT);
}

function buildNoteTip(model: NoteTipModel): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "pop note-pop";
  panel.setAttribute("role", "tooltip");
  const head = document.createElement("div");
  head.className = "ph";
  head.append("Note");
  const readOnly = document.createElement("span");
  readOnly.textContent = "read-only";
  head.append(readOnly);
  const body = document.createElement("div");
  body.className = "md nb cut";
  renderNoteInto(body, model.text);
  panel.append(head, body);
  return panel;
}

export function createNoteMarkerHover(noteOf: (id: number) => string | null): NoteMarkerHover {
  const tip = createHoverTip(buildNoteTip);
  return {
    attach(marker, id) {
      tip.attachHover(marker, () => {
        const text = noteOf(id);
        return text === null ? null : { text };
      });
    },
    refresh: tip.refresh,
    close: tip.close,
  };
}
