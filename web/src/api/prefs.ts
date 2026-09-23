// Prefs writes and the usage-refresh poke — both are "response carries no state, the
// socket does" shapes: the actual new value reaches every UI socket via a WS broadcast
// (`prefs`/`usage`), so neither caller here ever needs a decoded body.
import type { Prefs } from "../protocol";
import { requestEmpty, type ApiResult } from "./http";

// kb:anchor/prefs.put: at least one field, unknown fields ignored — a caller only ever
// changes one field at a time. Derived from `Prefs` (Minor 2, review cycle 1) rather than
// listed a second time — `usageModel`'s "1-32 chars after trim, validated daemon-side" and
// every other field's own semantics stay documented once, on `Prefs` itself.
export type PrefsRequest = Partial<Prefs>;

/** `PUT /api/prefs` (kb:anchor/prefs.put). `204` with no body on success — the new prefs
 * value reaches every UI socket (this one included) via the `prefs` WS broadcast (INV-4). */
export async function putPrefs(body: PrefsRequest): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/prefs", 204, body);
}

// B1: the 8 call sites that changed exactly one pref field and only ever logged the
// failure (never surfaced it in the UI) collapse to this — `putPrefs`'s own failure log
// (http.ts's `logApiFailure`) already covers what each of those `.then(console.error)`
// blocks used to spell out by hand.
export function requestPrefs(patch: PrefsRequest): void {
  void putPrefs(patch);
}

/** `POST /api/usage/refresh` (kb:anchor/usage.refresh). `202` with no body on success — the
 * fetch itself runs asynchronously and its result reaches every UI socket via the next
 * `usage` broadcast. Errors: `404 not_found` when the poller is disabled (`-usage-poll 0`). */
export async function refreshUsage(): Promise<ApiResult<null>> {
  return requestEmpty("POST", "/api/usage/refresh", 202);
}
