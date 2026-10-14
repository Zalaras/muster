import type { Session } from "../protocol/session";
import {
  ACTION_BY_LABEL,
  actionEnabled,
  type CardAction,
  canResume,
  type SessionAction,
  stopResumeButton,
} from "../sessions/card";

export const CARD_MENU_LABELS = {
  stop: "Stop…",
  resume: "Resume",
  remove: "Remove…",
  pin: "Pin",
  unpin: "Unpin",
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

export function cardMenuItems(
  session: Pick<Session, "alive" | "claudeSessionId" | "pinned">,
  state: CardMenuState,
): CardMenuItems {
  const disabled = !state.connected || state.busy;
  const entry = (label: CardAction): CardMenuAction => ({
    label: MENU_TEXT[label],
    action: ACTION_BY_LABEL[label],
    danger: label === "Remove",
    disabled: state.busy || !actionEnabled(label, session.claudeSessionId, state.connected),
  });
  const primary = stopResumeButton(session, state.connected);
  const actions: CardMenuAction[] = [];
  if (session.alive || canResume(session.claudeSessionId)) actions.push(entry(primary.label));
  if (!session.alive) actions.push(entry("Remove"));
  return {
    actions,
    pin: { label: session.pinned ? CARD_MENU_LABELS.unpin : CARD_MENU_LABELS.pin, disabled },
    moveDisabled: disabled,
  };
}
