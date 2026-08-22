// Daemon-down banner (design-system honesty rule #7 — "surface daemon-down loudly").
// `role="alert"` and the banner text are static markup in index.html; this only ever
// toggles visibility.
export function renderBanner(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}
