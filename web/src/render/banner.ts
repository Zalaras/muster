// Daemon-down / update-restart / confirmation banner (design-system honesty rule #7 —
// "surface daemon-down loudly"; the restart and confirmation text share the same
// `role="alert"` element, kb:adr/update-restart-reloads-dashboard). `role="alert"` is
// static markup in index.html; the text is not — `renderBanner` still only ever toggles
// visibility.
export function renderBanner(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}

/** The daemon-down banner's shared clause. Both `features/connection.ts`'s ordinary
 * unreachable text and `features/updaterestart.ts`'s restarting text splice this in
 * verbatim, so the wording has one owner instead of two modules independently agreeing
 * on it. Lives here rather than in either controller because both already import this
 * file for the banner element, and it's read by more than the one controller `render/`
 * normally reserves a DOM-free decision for (render/CLAUDE.md). */
export const DAEMON_ABSENCE_CLAUSE =
  "hook output in open panes is Muster's absence, not session failure.";

/** `text` is fully composed by the caller (features/connection.ts, from its own text or
 * features/updaterestart.ts's `BannerOverride`) — this only ever writes it in, never
 * composes a second copy. `neutral` selects the confirmation's informational style
 * (`--bg-raised`/`--fg-muted`/`--line-control`, the `.neutral` modifier in style.css) over
 * the alarm `--banner-*` tokens `.banner` sets by default. */
export function renderBannerContent(el: HTMLElement, text: string, neutral: boolean): void {
  el.textContent = text;
  el.classList.toggle("neutral", neutral);
}
