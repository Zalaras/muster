// REQ-17/W2 (plan session-lifecycle): the global End/Resume/Remove failure alert
// (`#action-error`, index.html, right after `#banner`) — global rather than scoped to one
// surface because actions dispatch from the mainhead, rail cards and tile footers alike.
// `role="alert"` and static markup live in index.html; this only ever writes the message
// and toggles visibility, mirroring `render/banner.ts`'s `renderBanner`.
export function renderActionError(el: HTMLElement, message: string | null): void {
  el.textContent = message ?? "";
  el.hidden = message === null;
}
