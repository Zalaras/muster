// The usage-refresh poke — "response carries no state, the socket does": the actual new
// value reaches every UI socket via the `usage` WS broadcast, so the caller here never
// needs a decoded body.
import { requestEmpty, type ApiResult } from "./http";

/** `POST /api/usage/refresh` (kb:anchor/usage.refresh). `202` with no body on success — the
 * fetch itself runs asynchronously and its result reaches every UI socket via the next
 * `usage` broadcast. Errors: `404 not_found` when the poller is disabled (`-usage-poll 0`). */
export async function refreshUsage(): Promise<ApiResult<null>> {
  return requestEmpty("POST", "/api/usage/refresh", 202);
}
