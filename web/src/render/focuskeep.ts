/**
 * Focus preservation across a rebuild or an `insertBefore` reorder.
 *
 * `insertBefore` on an already-mounted node still detaches it first per the DOM spec, and
 * Chrome blurs a focused descendant on that detach even though the reattach is synchronous
 * — measured live on both the rail (`SORT-CHANGE focus: before=true after=false
 * active=BODY`, review m4-reconcile cycle 3 Minor 1) and the Tiles grid (cycle 4 Minor 2:
 * a tile-footer End survives 2.5 s of render ticks and falls to `<body>` the moment a
 * `Notification` reorders the grid). A `replaceChildren` rebuild (the reader's tree/
 * outline, when their structural signature changes) blurs a focused descendant outright,
 * for the same underlying reason. Every one of these reconcilers records *which* logical
 * element was focused before its rebuild/reorder and re-focuses the equivalent element
 * afterwards if — and only if — the rebuild actually lost it (review Minor 13: this used
 * to be three separate implementations of that same shape).
 *
 * Two "logical element" flavours live here, sharing the capture/restore-if-lost primitives
 * below:
 * - A **control**, keyed by session id (+ an optional action) — either an action button
 *   (`data-action` + `data-id`, built by `buildActionButton`) or a container carrying
 *   `data-session-id` (a rail/strip card, a tile). Anything else inside the container (an
 *   xterm textarea, say) is deliberately not captured: re-focusing it would fight the
 *   terminal's own focus management.
 * - A **key**, a single dataset attribute on a direct child of some container (the
 *   reader's tree `path` / outline `headingId`) — a plainer shape for a plainer container
 *   (one flat list of buttons, not the control/session split above).
 *
 * `features/connection.ts`'s own disconnect/reconnect focus memory does NOT fold into
 * either flavour: it remembers one element by identity across a status transition (not a
 * container rebuild), holds it across arbitrarily many renders rather than one, and its
 * restore condition is an app-specific validity rule (`connectionrestore.ts`'s
 * `shouldRestoreFocus`, itself dependent on daemon-connectivity state `render/` cannot see)
 * rather than "is this the same node its container already knows about". There is no
 * rebuild and no key to capture there, so it stays its own, smaller mechanism.
 */

/** Snapshot of one focused element, generic over how the caller identifies it again later
 * (`key`) — shared by both flavours below. */
interface CapturedFocus<K> {
  readonly key: K;
  /** The element that was focused, so `restoreIfLost` can detect "nothing changed". */
  readonly element: Element;
}

/** Captures `document.activeElement` as a `CapturedFocus<K>` iff it's eligible per `scope`
 * and `extractKey` can derive a key from it; null otherwise (focus elsewhere, or on a
 * non-control). */
function captureFocus<K>(
  scope: (active: HTMLElement) => boolean,
  extractKey: (active: HTMLElement) => K | null,
): CapturedFocus<K> | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !scope(active)) return null;
  const key = extractKey(active);
  return key === null ? null : { key, element: active };
}

/** Re-focuses `resolveTarget(captured.key)` iff the rebuild/reorder actually blurred
 * `captured.element` — `document.activeElement` falls back to `<body>` on blur, so any
 * mismatch with the captured element means focus was lost, not deliberately moved by the
 * caller mid-rebuild. */
function restoreFocusIfLost<K>(
  captured: CapturedFocus<K> | null,
  resolveTarget: (key: K) => HTMLElement | null | undefined,
): void {
  if (!captured || document.activeElement === captured.element) return;
  resolveTarget(captured.key)?.focus();
}

/** A session-id-keyed control: an action button (`data-action` + `data-id`) or a
 * session-carrying container (`data-session-id`). */
interface ControlKey {
  readonly sessionId: number;
  readonly action: string | undefined;
}

export interface FocusedControl {
  readonly sessionId: number;
  /** `data-action` of the focused button, or undefined when the session root itself had focus. */
  readonly action: string | undefined;
  /** The element that was focused, so the caller can detect "nothing changed". */
  readonly element: Element;
}

function controlKeyOf(active: HTMLElement): ControlKey | null {
  if (active.dataset["action"] !== undefined && active.dataset["id"] !== undefined) {
    const sessionId = Number(active.dataset["id"]);
    if (Number.isFinite(sessionId)) return { sessionId, action: active.dataset["action"] };
  }
  if (active.dataset["sessionId"] !== undefined) {
    const sessionId = Number(active.dataset["sessionId"]);
    if (Number.isFinite(sessionId)) return { sessionId, action: undefined };
  }
  return null;
}

/** Snapshot the focused logical control inside `container`, or null if focus is elsewhere. */
export function captureFocusedControl(container: Element): FocusedControl | null {
  const captured = captureFocus((active) => container.contains(active), controlKeyOf);
  return (
    captured && {
      sessionId: captured.key.sessionId,
      action: captured.key.action,
      element: captured.element,
    }
  );
}

/**
 * Re-focus the control captured by `captureFocusedControl` if the reorder blurred it.
 * `resolveRoot` maps a session id to that session's current root element (the card, the
 * tile) — the reconciler owns that lookup, not this helper.
 */
export function restoreFocusedControl(
  captured: FocusedControl | null,
  resolveRoot: (sessionId: number) => HTMLElement | null | undefined,
): void {
  restoreFocusIfLost<ControlKey>(
    captured && {
      key: { sessionId: captured.sessionId, action: captured.action },
      element: captured.element,
    },
    (key) => {
      const root = resolveRoot(key.sessionId);
      if (!root) return null;
      return key.action ? root.querySelector<HTMLElement>(`[data-action="${key.action}"]`) : root;
    },
  );
}

export interface FocusedKey {
  readonly key: string;
  readonly element: Element;
}

/** Reader flavour: finds the currently-focused element's stable key, iff it's a direct
 * child of `container` — used to restore focus onto the equivalent node across a rebuild
 * that genuinely changes the row set (`render/reader.ts`'s tree and outline). */
export function captureFocusedKey(container: HTMLElement, dataKey: string): FocusedKey | null {
  return captureFocus(
    (active) => active.parentElement === container,
    (active) => active.dataset[dataKey] ?? null,
  );
}

export function restoreFocusedKey(
  container: HTMLElement,
  dataKey: string,
  captured: FocusedKey | null,
): void {
  restoreFocusIfLost(captured, (key) => {
    for (const child of container.children) {
      if (child instanceof HTMLElement && child.dataset[dataKey] === key) return child;
    }
    return null;
  });
}
