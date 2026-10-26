import type { Session } from "../protocol/session";
import {
  ACTION_BY_LABEL,
  actionEnabled,
  type CardAction,
  canResume,
  type SessionAction,
} from "../sessions/card";
import { sessionsPhrase } from "../sessions/sections";

export const CARD_MENU_LABELS = {
  stop: "Stop…",
  resume: "Resume",
  remove: "Remove…",
  pin: "Pin",
  unpin: "Unpin",
  markRead: "Mark as read",
  markUnread: "Mark as unread",
} as const;

export interface CardMenuAction {
  label: string;
  action: SessionAction;
  danger: boolean;
  disabled: boolean;
}

export interface CardMenuPin {
  label: typeof CARD_MENU_LABELS.pin | typeof CARD_MENU_LABELS.unpin;
  disabled: boolean;
}

export interface CardMenuItems {
  actions: CardMenuAction[];
  pin: CardMenuPin;
  marks: CardMenuAction[];
  moveDisabled: boolean;
}

export interface CardMenuState {
  connected: boolean;
  busy: boolean;
}

const MENU_TEXT = {
  Stop: CARD_MENU_LABELS.stop,
  Resume: CARD_MENU_LABELS.resume,
  Remove: CARD_MENU_LABELS.remove,
} as const satisfies Record<CardAction, string>;

function menuEntry(label: CardAction): Omit<CardMenuAction, "disabled"> {
  return { label: MENU_TEXT[label], action: ACTION_BY_LABEL[label], danger: label === "Remove" };
}

function markEntries(disabled: boolean): CardMenuAction[] {
  return [
    { label: CARD_MENU_LABELS.markRead, action: "markRead", danger: false, disabled },
    { label: CARD_MENU_LABELS.markUnread, action: "markUnread", danger: false, disabled },
  ];
}

export function cardMenuItems(
  session: Pick<Session, "alive" | "claudeSessionId" | "pinned">,
  state: CardMenuState,
): CardMenuItems {
  const disabled = !state.connected || state.busy;
  const entry = (label: CardAction): CardMenuAction => ({
    ...menuEntry(label),
    disabled: state.busy || !actionEnabled(label, session.claudeSessionId, state.connected),
  });
  const primary: CardAction = session.alive ? "Stop" : "Resume";
  const actions: CardMenuAction[] = [];
  if (session.alive || canResume(session.claudeSessionId)) actions.push(entry(primary));
  actions.push(entry("Remove"));
  return {
    actions,
    pin: { label: session.pinned ? CARD_MENU_LABELS.unpin : CARD_MENU_LABELS.pin, disabled },
    marks: markEntries(disabled),
    moveDisabled: disabled,
  };
}

export interface SelectionMenuItems {
  label: string;
  actions: CardMenuAction[];
  marks: CardMenuAction[];
  moveDisabled: boolean;
}

export function selectionMenuItems(
  sessions: readonly Pick<Session, "alive">[],
  state: CardMenuState,
): SelectionMenuItems {
  const disabled = !state.connected || state.busy;
  const entry = (label: Exclude<CardAction, "Resume">): CardMenuAction => ({
    ...menuEntry(label),
    disabled,
  });
  const actions: CardMenuAction[] = [];
  if (sessions.some((s) => s.alive)) actions.push(entry("Stop"));
  if (sessions.length > 0) actions.push(entry("Remove"));
  return {
    label: `Actions for ${sessionsPhrase(sessions.length)}`,
    actions,
    marks: markEntries(disabled),
    moveDisabled: disabled,
  };
}
