// REQ-13 (plan m4-reconcile): the dead-session surface — an end bar, the last captured
// pane snapshot, and a centred "session ended" cap with Resume. Mounted in two places:
// Focus's `#dead-surface` (static markup, one instance) and, per dead tile, cloned from
// `#dead-surface-template` into that tile's `.tbody-slot` (render/tiles.ts's
// `mountTileDeadSurface`) — both share this module's pure builder/render functions so the
// two surfaces never drift out of sync with each other. Pure builder + fetch trigger
// (docs/conventions.md): DOM construction and the `GET .../pane` fetch live here; caching
// *when* to fetch is features/actions.ts's job (`ensurePaneFetch`/`paneState`).
import { fetchPane } from "../api";
import type { Session } from "../protocol";
import { stateBadgeText } from "../sessions/card";
import { formatEndedAgo } from "../sessions/format";
import { showNotice } from "../terminal/notice";

export interface DeadSurfaceRefs {
  root: HTMLElement;
  endbarEl: HTMLElement;
  snapshotEl: HTMLElement;
  capBodyEl: HTMLElement;
  resumeBtn: HTMLButtonElement;
  /** Review plain-terminal-session Major 1: the dead surface's own `role="status"` notice
   * (`.terminal-notice`, same class/CSS `terminal/pane.ts`'s `TerminalSurface` uses), for
   * the one case that has no live surface to route a notice through — a spawn failure
   * (REQ-12) on a session whose `claude` surface is currently this dead surface, not a
   * live pane. Optional for the same pre-existing-fixture reason as
   * `MainheadElements.surfaceSegment`/`TileRefs.surfaceSegment` (`render/mainhead.ts`,
   * `render/tiles.ts`): `dead.test.ts`'s hand-built `fakeRefs()` (used only to test
   * `renderDeadSurface`, which never touches `noticeEl`) predates this field. Every real
   * instance — always built via `refsFromRoot` below — has one; only `refsFromRoot`
   * and `showDeadSurfaceNotice` ever read it. */
  noticeEl?: HTMLElement;
}

/** The three fetch outcomes render/dead.ts cares about — `capturedAt` is carried for
 * REQ-19 (nice-to-have) callers but not required by the honesty text below. */
export type PaneState =
  | { status: "loading" }
  | { status: "ok"; text: string; capturedAt: string }
  | { status: "missing" };

function refsFromRoot(root: HTMLElement): DeadSurfaceRefs {
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

/** Reads refs off an already-mounted `.dead-surface` root (Focus's static `#dead-surface`,
 * or a tile's previously-cloned instance) — never re-clones, mirroring render/tiles.ts's
 * `updateTileChrome` convention of requerying existing chrome rather than caching it. */
export function collectDeadSurfaceRefs(root: HTMLElement): DeadSurfaceRefs {
  return refsFromRoot(root);
}

/** Clones a fresh `.dead-surface` out of `#dead-surface-template` — the one path that
 * builds new DOM, used only the first time a given tile goes dead. */
export function buildDeadSurfaceFromTemplate(template: HTMLTemplateElement): DeadSurfaceRefs {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".dead-surface");
  if (!root) throw new Error("dead-surface-template is missing its .dead-surface root");
  return refsFromRoot(root);
}

/** REQ-13's exact copy, transcribed from the mockups (Implementation Notes: "do not
 * compose new strings") — the end bar always starts with "ended " (Testable UI Elements:
 * `/^ended /`), the cap always contains "session ended" plus a Resume button, and the
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
  // review m4-reconcile Major 6 + Minor 7: `formatEndedAgo` avoids "ended now ago", and
  // — mirroring how card.ts/tiles.ts already treat this same defensive branch — a null
  // `endedAt` renders no age clause at all rather than the confident-but-wrong "just now"
  // (`endedAt` and `alive:false` are a paired invariant per kb:anchor/state.liveness, so this branch
  // is defensive, not a real path, but it should stay honest if it's ever hit).
  const age = session.endedAt ? formatEndedAgo(session.endedAt, now) : null;
  const badge = stateBadgeText(session.state);
  refs.endbarEl.textContent = age
    ? `ended ${age} · last state ${badge} · last captured screen, not a live client`
    : `ended · last state ${badge} · last captured screen, not a live client`;

  if (pane.status === "ok") {
    // REQ-19 (nice-to-have) / design-system §6.8: possibly-stale state shows its age —
    // the snapshot can be a few seconds older than `age` above (End freezes the ended
    // timer, but the capture that produced this text was taken slightly earlier still).
    // `formatEndedAgo` is the same "never 'now ago'" helper the age clause above already
    // uses, so this can't reintroduce Major 6's bug.
    refs.endbarEl.textContent += ` · captured ${formatEndedAgo(pane.capturedAt, now)}`;
    refs.snapshotEl.textContent = pane.text;
    refs.capBodyEl.textContent = age ? `${age} · last state: ${badge}` : `last state: ${badge}`;
  } else if (pane.status === "missing") {
    refs.snapshotEl.textContent = "";
    refs.capBodyEl.textContent = "no snapshot captured";
  } else {
    // review m4-reconcile Minor 9: while the pane fetch is in flight, this was
    // previously indistinguishable from a session that ended on a genuinely blank
    // screen ("no snapshot captured" reads as a confirmed negative, not "don't know
    // yet"). Say so explicitly instead of rendering empty strings.
    refs.snapshotEl.textContent = "";
    refs.capBodyEl.textContent = "loading last screen…";
  }

  refs.resumeBtn.dataset["action"] = "resume";
  refs.resumeBtn.dataset["id"] = String(session.id);
  refs.resumeBtn.disabled = !connected || session.claudeSessionId === null;
}

/** The fetch trigger: wraps `GET /api/sessions/{id}/pane` into the three-state `PaneState`
 * above. `no_snapshot` (and, defensively, any other error) both read as "missing" — the
 * dead surface never distinguishes a genuine no-capture-yet from an unexpected error, it
 * just shows the honest "no snapshot captured" text either way (edge case 13). */
export async function loadPane(id: number): Promise<PaneState> {
  const result = await fetchPane(id);
  if (result.ok)
    return { status: "ok", text: result.value.text, capturedAt: result.value.capturedAt };
  return { status: "missing" };
}

/** Review plain-terminal-session Major 1: shows (or, given `null`, clears) the dead
 * surface's own `role="status"` notice — mirrors `TerminalSurface.showNotice`
 * (`terminal/pane.ts`) exactly (same 5s auto-hide per REQ-6's existing convention, same
 * "a new outcome replaces whatever text was there" behaviour), for the one case that has
 * no live `TerminalSurface` to route a notice through: REQ-12's spawn-failure message when
 * the session whose `shell` spawn failed is currently showing this dead surface for
 * `claude`, not a live pane. Delegates to `terminal/notice.ts` (plan v1-cleanup REQ-12,
 * extracting what the review above found duplicated) — every caller here is a failure
 * outcome (plan Implementation Notes), so this never passes `"inflight"` and keeps the
 * always-5s-auto-hide contract `dead.test.ts` already asserts unchanged (REQ-13 changes
 * only `terminal/pane.ts`). */
export function showDeadSurfaceNotice(refs: DeadSurfaceRefs, text: string | null): void {
  const noticeEl = refs.noticeEl;
  if (!noticeEl) return; // only unset for dead.test.ts's pre-existing fakeRefs() fixture
  showNotice(noticeEl, text);
}
