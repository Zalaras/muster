/**
 * Focus preservation across an `insertBefore` reorder.
 *
 * `insertBefore` on an already-mounted node still detaches it first per the DOM spec, and
 * Chrome blurs a focused descendant on that detach even though the reattach is synchronous
 * — measured live on both the rail (`SORT-CHANGE focus: before=true after=false
 * active=BODY`, review m4-reconcile cycle 3 Minor 1) and the Tiles grid (cycle 4 Minor 2:
 * a tile-footer End survives 2.5 s of render ticks and falls to `<body>` the moment a
 * `Notification` reorders the grid). Both reconcilers therefore record *which* logical
 * control was focused before their reorder loop and re-focus the same logical control
 * afterwards if — and only if — the move blurred it.
 *
 * A "logical control" is either an action button (`data-action` + `data-id`, built by
 * `buildActionButton`) or a container that carries `data-session-id` (a rail/strip card).
 * Anything else inside the container (an xterm textarea, say) is deliberately not
 * captured here: re-focusing it would fight the terminal's own focus management.
 */

export interface FocusedControl {
  readonly sessionId: number;
  /** `data-action` of the focused button, or undefined when the session root itself had focus. */
  readonly action: string | undefined;
  /** The element that was focused, so the caller can detect "nothing changed". */
  readonly element: Element;
}

/** Snapshot the focused logical control inside `container`, or null if focus is elsewhere. */
export function captureFocusedControl(container: Element): FocusedControl | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) return null;

  if (active.dataset["action"] !== undefined && active.dataset["id"] !== undefined) {
    const sessionId = Number(active.dataset["id"]);
    if (Number.isFinite(sessionId))
      return { sessionId, action: active.dataset["action"], element: active };
  }
  if (active.dataset["sessionId"] !== undefined) {
    const sessionId = Number(active.dataset["sessionId"]);
    if (Number.isFinite(sessionId)) return { sessionId, action: undefined, element: active };
  }
  return null;
}

/**
 * Re-focus the control captured by `captureFocusedControl` if the reorder blurred it.
 * `resolveRoot` maps a session id to that session's current root element (the card, the
 * tile) — the reconciler owns that lookup, not this helper. `document.activeElement` falls
 * back to `<body>` on blur, so any mismatch with the captured element means focus was
 * lost, not deliberately moved by the caller mid-reconcile.
 */
export function restoreFocusedControl(
  captured: FocusedControl | null,
  resolveRoot: (sessionId: number) => HTMLElement | null | undefined,
): void {
  if (!captured || document.activeElement === captured.element) return;
  const root = resolveRoot(captured.sessionId);
  if (!root) return;
  const target = captured.action
    ? root.querySelector<HTMLElement>(`[data-action="${captured.action}"]`)
    : root;
  target?.focus();
}
