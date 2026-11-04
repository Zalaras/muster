import { parseSessionParam } from "../reader/query";

export interface NoteWindowHandle {
  readonly closed: boolean;
  focus(): void;
}

export type OpenNoteWindow = (
  url: string,
  name: string,
  features: string,
) => NoteWindowHandle | null;

export interface NoteWindows {
  openOrFocus(id: number): boolean;
}

const WINDOW_FEATURES = "popup,width=520,height=460";

export function noteWindowUrl(id: number): string {
  return `/note.html?session=${id}`;
}

export function parseNoteQuery(search: string): number | null {
  return parseSessionParam(new URLSearchParams(search));
}

export function createNoteWindows(open: OpenNoteWindow): NoteWindows {
  const opened = new Map<number, NoteWindowHandle>();

  function openOrFocus(id: number): boolean {
    const existing = opened.get(id);
    if (existing !== undefined && !existing.closed) {
      existing.focus();
      return true;
    }
    const handle = open(noteWindowUrl(id), `muster-note-${id}`, WINDOW_FEATURES);
    if (handle === null) return false;
    opened.set(id, handle);
    return true;
  }

  return { openOrFocus };
}
