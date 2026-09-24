// The dead-session surface (kb:adr/actions-pane-snapshot-display-only) — an end bar, the last captured
// pane snapshot, and a centred "session ended" cap with Resume. Mounted in two places:
// Focus's `#dead-surface` (static markup, one instance) and, per dead tile, cloned from
// `#dead-surface-template` into that tile's `.tbody-slot` (render/tiles.ts's
// `mountTileDeadSurface`) — both share this module's pure builder/render functions so the
// two surfaces never drift out of sync with each other. DOM only: this
// module used to also own the `GET .../pane` fetch itself; `features/actions.ts`'s
// `loadPane` now does that and passes the resulting `PaneState` in, so no path here opens
// a request) — caching *when* to fetch is features/actions.ts's job
// (`ensurePaneFetch`/`paneState`).
import type { Session } from "../protocol/session";
import { canResume, resumeDisabledReason, stateBadgeText } from "../sessions/card";
import { ageAgo } from "../sessions/format";
import { showNotice } from "../terminal/notice";

export interface DeadSurfaceRefs {
  root: HTMLElement;
  endbarEl: HTMLElement;
  snapshotEl: HTMLElement;
  capBodyEl: HTMLElement;
  resumeBtn: HTMLButtonElement;
  /** The dead surface's own `role="status"` notice (`.terminal-notice`, same class/CSS
   * `terminal/pane.ts`'s `TerminalSurface` uses), for the one case that has no live surface
   * to route a notice through — a shell spawn failure on a session whose `claude` surface
   * is currently this dead surface, not a live pane. Built once, in
   * `collectDeadSurfaceRefs` below; only `showDeadSurfaceNotice` reads it. */
  noticeEl: HTMLElement;
}

/** The three fetch outcomes render/dead.ts cares about — `capturedAt` is carried for the
 * optional "captured … ago" addendum below, not required by the honesty text itself. */
export type PaneState =
  | { status: "loading" }
  | { status: "ok"; text: string; capturedAt: string }
  | { status: "missing" };

/** Reads refs off an already-mounted `.dead-surface` root (Focus's static `#dead-surface`,
 * or a tile's previously-cloned instance) — never re-clones, mirroring render/tiles.ts's
 * `updateTileChrome` convention of requerying existing chrome rather than caching it. Also
 * `buildDeadSurfaceFromTemplate`'s own querying step, once its clone has a root to query. */
export function collectDeadSurfaceRefs(root: HTMLElement): DeadSurfaceRefs {
  const endbarEl = root.querySelector<HTMLElement>(".endbar");
  const snapshotEl = root.querySelector<HTMLElement>("pre.snapshot");
  const capBodyEl = root.querySelector<HTMLElement>(".endcap-text");
  const resumeBtn = root.querySelector<HTMLButtonElement>('.endcap button[data-action="resume"]');
  const noticeEl = root.querySelector<HTMLElement>(".terminal-notice");
  if (!endbarEl || !snapshotEl || !capBodyEl || !resumeBtn || !noticeEl) {
    throw new Error("dead-surface markup is missing a required element");
  }
  return { root, endbarEl, snapshotEl, capBodyEl, resumeBtn, noticeEl };
}

/** Clones a fresh `.dead-surface` out of `#dead-surface-template` — the one path that
 * builds new DOM, used only the first time a given tile goes dead. */
export function buildDeadSurfaceFromTemplate(template: HTMLTemplateElement): DeadSurfaceRefs {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".dead-surface");
  if (!root) throw new Error("dead-surface-template is missing its .dead-surface root");
  return collectDeadSurfaceRefs(root);
}

/** Copy transcribed verbatim from the mockups, never composed as new strings — the end
 * bar always starts with "ended " (Testable UI Elements: `/^ended /`), the cap always
 * contains "session ended" plus a Resume button, and the
 * 404 `no_snapshot` case swaps the cap's body for the "unknown, not empty" honesty text
 * rather than a blank one. `connected` gates the Resume button the same way the mainhead
 * and card action rows do (States: "action buttons are disabled while the WS is down"). */
export function renderDeadSurface(
  refs: DeadSurfaceRefs,
  session: Session,
  pane: PaneState,
  now: Date,
  connected: boolean,
): void {
  // `ageAgo` avoids "ended now ago", and — mirroring how card.ts/tiles.ts already treat
  // this same defensive branch — a null `endedAt` renders no age clause at all rather than
  // the confident-but-wrong "just now" (`endedAt` and `alive:false` are a paired invariant
  // per kb:anchor/state.liveness, so this branch is defensive, not a real path, but it
  // should stay honest if it's ever hit).
  const age = session.endedAt ? ageAgo(session.endedAt, now) : null;
  const badge = stateBadgeText(session.state);
  refs.endbarEl.textContent = age
    ? `ended ${age} · last state ${badge} · last captured screen, not a live client`
    : `ended · last state ${badge} · last captured screen, not a live client`;

  if (pane.status === "ok") {
    // design-system §6.8: possibly-stale state shows its age — the snapshot can be a few
    // seconds older than `age` above (End freezes the ended timer, but the capture that
    // produced this text was taken slightly earlier still). `ageAgo` is the same "never
    // 'now ago'" helper the age clause above already uses.
    refs.endbarEl.textContent += ` · captured ${ageAgo(pane.capturedAt, now)}`;
    refs.snapshotEl.textContent = pane.text;
    refs.capBodyEl.textContent = age ? `${age} · last state: ${badge}` : `last state: ${badge}`;
  } else if (pane.status === "missing") {
    refs.snapshotEl.textContent = "";
    refs.capBodyEl.textContent = "no snapshot captured";
  } else {
    // While the pane fetch is in flight, an empty string would be indistinguishable from
    // a session that ended on a genuinely blank screen ("no snapshot captured" reads as a
    // confirmed negative, not "don't know yet") — say so explicitly instead.
    refs.snapshotEl.textContent = "";
    refs.capBodyEl.textContent = "loading last screen…";
  }

  refs.resumeBtn.dataset["action"] = "resume";
  refs.resumeBtn.dataset["id"] = String(session.id);
  refs.resumeBtn.disabled = !connected || !canResume(session.claudeSessionId);
  // A disabled-for-no-claudeSessionId Resume says why, not just sits greyed.
  refs.resumeBtn.title = resumeDisabledReason(session) ?? "";
}

/** Shows (or, given `null`, clears) the dead surface's own `role="status"` notice —
 * mirrors `TerminalSurface.showNotice` (`terminal/pane.ts`) exactly (same 5s auto-hide
 * convention, same "a new outcome replaces whatever text was there" behaviour), for the
 * one case that has no live `TerminalSurface` to route a notice through: a shell
 * spawn-failure message when the session whose `shell` spawn failed is currently showing
 * this dead surface for `claude`, not a live pane. Delegates to `terminal/notice.ts`
 * (extracting the shared 5s-auto-hide logic rather than duplicating it here) — every
 * caller here is a failure outcome, so this never passes `"inflight"`, keeping the
 * always-5s-auto-hide contract `dead.test.ts` already asserts unchanged. */
export function showDeadSurfaceNotice(refs: DeadSurfaceRefs, text: string | null): void {
  showNotice(refs.noticeEl, text);
}
