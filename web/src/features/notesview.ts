export const UNSAVED_TEXT = "unsaved, musterd unreachable";

export function adoptIncoming(shown: string, incoming: string, editing: boolean): string {
  return editing ? shown : incoming;
}

export function unsavedStatus(failed: boolean): string {
  return failed ? UNSAVED_TEXT : "";
}
