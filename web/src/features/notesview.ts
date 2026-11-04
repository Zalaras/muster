import type { ConnectionStatus } from "../app";
import type { StatusKind } from "../render/notespanel";
import { CONNECTING_WORD } from "./connectionhealth";

export const UNREACHABLE_TEXT = "musterd unreachable";
export const UNSAVED_TEXT = `unsaved, ${UNREACHABLE_TEXT}`;
export const REMOVED_NOTICE_TEXT = "This session has been removed.";

export function adoptIncoming(shown: string, incoming: string, editing: boolean): string {
  return editing ? shown : incoming;
}

export function unsavedStatus(failed: boolean): string {
  return failed ? UNSAVED_TEXT : "";
}

export interface WindowStatus {
  text: string;
  kind: StatusKind;
}

export function windowStatus(connection: ConnectionStatus, saveFailed: boolean): WindowStatus {
  if (saveFailed) return { text: UNSAVED_TEXT, kind: "warn" };
  if (connection === "reconnecting") return { text: UNREACHABLE_TEXT, kind: "warn" };
  if (connection === "connecting") return { text: CONNECTING_WORD, kind: "info" };
  return { text: "", kind: "warn" };
}
