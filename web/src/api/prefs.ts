// Prefs writes — a "response carries no state, the socket does" shape: the new value
// reaches every UI socket via the `prefs` WS broadcast, so the caller here never needs a
// decoded body.
import type { Prefs } from "../protocol/prefs";
import { requestEmpty, type ApiResult } from "./http";

// kb:anchor/prefs.put: at least one field, unknown fields ignored — a caller only ever
// changes one field at a time. Derived from `Prefs` rather than listed a second time —
// `usageModel`'s "1-32 chars after trim, validated daemon-side" and every other field's own
// semantics stay documented once, on `Prefs` itself.
export type PrefsRequest = Partial<Prefs>;

/** `PUT /api/prefs` (kb:anchor/prefs.put). `204` with no body on success — the new prefs
 * value reaches every UI socket (this one included) via the `prefs` WS broadcast
 * (kb:adr/connection-commands-http-ws-push-only). */
export async function putPrefs(body: PrefsRequest): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/prefs", 204, body);
}

// Every prefs-changing control (rail sort/density, view/density switcher, theme/rail-activity
// radios, the update-check toggle) fires a one-field patch and only ever logs a failure —
// `putPrefs`'s own failure log (http.ts's `logApiFailure`) already covers that, so this
// wrapper exists to make "fire-and-forget, never awaited" the caller's only decision.
// Named apart from http.ts's `request*` family (`requestJson`/`requestEmpty`/…, which all
// return an awaited `ApiResult`) since this one is `void`-returning and synchronous at the
// call site.
export function sendPrefsPatch(patch: PrefsRequest): void {
  void putPrefs(patch);
}
