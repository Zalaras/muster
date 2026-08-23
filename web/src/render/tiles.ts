// Tiles view rendering: the live grid + the snapshot strip (docs/design/mockups/
// d-tiled.html; design-system §4/§5). DOM only — every displayed string comes from
// ../sessions/card.ts's pure view-model, shared with the rail, since a strip card IS a
// rail card per the plan's UI spec: "the M1 card content on its side".
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";
import { buildSessionCardElement } from "./sessions";

function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}

export interface TileRefs {
  root: HTMLElement;
  /** Where the caller (main.ts's surface manager) moves a live TerminalSurface's root —
   * this module never touches a socket or an xterm instance. */
  bodySlot: HTMLElement;
  geoEl: HTMLElement;
  markerEl: HTMLElement;
}

/** Updates one tile's header chrome (title/where/context/timer + state class) in place
 * from the shared view-model, without touching `bodySlot`'s mounted live surface — the
 * only two callers are `buildTile` (fresh chrome) and main.ts's tiles reconciler
 * (existing chrome, every render pass; review m2-terminal Critical 2: rebuilding a
 * live tile's chrome wholesale re-parents its mounted surface root and blurs xterm's
 * textarea, so updates must mutate the existing nodes instead). */
function updateTileChrome(root: HTMLElement, session: Session, now: Date): void {
  const vm = buildCardViewModel(session, now);
  root.className = `tile ${vm.stateClass}${vm.ended ? " ended" : ""}`;

  const name = root.querySelector<HTMLElement>(".nm");
  const where = root.querySelector<HTMLElement>(".wh");
  const ctx = root.querySelector<HTMLElement>(".ctxinfo");
  const timer = root.querySelector<HTMLElement>(".tm");

  if (name) name.textContent = vm.title;
  if (where) where.textContent = vm.repoLine;
  if (ctx) ctx.textContent = vm.contextText;
  if (timer) timer.textContent = vm.timer;
}

/** Builds one tile's chrome (header + empty body slot + footer) from the shared
 * view-model. The Testable UI Elements table calls a live tile "article-shaped" — the
 * template's root is a bare `<article>`, which is the one plain element that carries an
 * implicit ARIA role (`article`) without any attribute, and its header (`.nm`) carries
 * the session title text the table also requires. */
export function buildTile(session: Session, now: Date): TileRefs {
  const template = requireTemplate("tile-template");
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".tile");
  if (!root) throw new Error("tile-template is missing its .tile root");

  const bodySlot = root.querySelector<HTMLElement>(".tbody-slot");
  const geoEl = root.querySelector<HTMLElement>(".geo");
  const markerEl = root.querySelector<HTMLElement>(".marker");
  if (!bodySlot || !geoEl || !markerEl) throw new Error("tile-template is missing a required element");

  root.dataset["sessionId"] = String(session.id);
  updateTileChrome(root, session, now);

  return { root, bodySlot, geoEl, markerEl };
}

/** Refreshes an existing tile's chrome for the current render pass — never rebuilds or
 * re-parents anything (see `updateTileChrome`). */
export function updateTile(refs: TileRefs, session: Session, now: Date): void {
  updateTileChrome(refs.root, session, now);
}

/** Tile footer geometry + live/stopped marker (REQ-15's "tile footers show their real
 * geometry"; design-system §5: the marker reads `live` or `stopped`). Driven by the
 * session's own `alive` flag, not by geometry nullability — review m2-terminal
 * Critical 5: a surface that ever attached keeps a non-null `geometry` forever, so a
 * session that dies while its tile is live must not still read `live` just because its
 * last-known geometry is still around. */
export function renderTileGeometry(
  refs: TileRefs,
  alive: boolean,
  geometry: { cols: number; rows: number } | null,
): void {
  refs.geoEl.textContent = geometry ? `${geometry.cols}×${geometry.rows}` : "";
  refs.markerEl.textContent = alive ? "live" : "stopped";
  refs.markerEl.className = alive ? "marker live" : "marker";
}

/** Renders the snapshot strip: the same rail-card markup, on its side — clicking
 * promotes (REQ-8's "clicking a strip card promotes it"). Hides the strip entirely when
 * every session is live (plan edge case 7: "the strip hides when empty"). */
export function renderStrip(
  el: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  onPromote: (id: number) => void,
): void {
  el.hidden = sessions.length === 0;
  if (sessions.length === 0) {
    el.replaceChildren();
    return;
  }
  const template = requireTemplate("session-card-template");
  el.replaceChildren(...sessions.map((session) => buildSessionCardElement(session, now, template, onPromote)));
}
