// M0's daemon only ever sends an empty `sessions` array (the state machine and card
// rendering arrive in M1); this renders the honest empty state rather than a
// placeholder list.
import type { Session } from "../protocol";

export function renderSessions(el: HTMLElement, sessions: readonly Session[]): void {
  if (sessions.length === 0) {
    el.textContent = "No sessions yet";
    return;
  }
  // M1 replaces this branch with real session cards (rail/tiles).
  el.textContent = `${sessions.length} sessions`;
}
