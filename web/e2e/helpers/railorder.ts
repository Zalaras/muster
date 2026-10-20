// Rail-order helpers: the daemon-side pin setup. The DOM side — the rail card locator, the
// rail and strip order oracles, the pin control, the sort select, the class check and the
// manual-order oracle — is pure page and lives in the render tier's helper
// (web/render/helpers/rail.ts, where the display properties re-levelled on 2026-10-20 read
// them); the journeys here reach it through the re-export below.
import type { Page } from "@playwright/test";

export {
  expectedManualOrder,
  hasClass,
  pinButton,
  railCard,
  railOrderIds,
  railSortSelect,
  stripOrderIds,
} from "../../render/helpers/rail";

/**
 * Sets a session's pinned flag directly via the real `PUT /api/sessions/{id}/pin`
 * (kb:anchor/sessions.pin) — used to build a starting configuration (e.g. "two cards already
 * pinned") without re-deriving it through a chain of UI clicks in every test that needs
 * one. Throws on anything but the documented 204.
 */
export async function pinViaApi(
  page: Page,
  daemonBaseURL: string,
  id: number,
  pinned: boolean,
): Promise<void> {
  const res = await page.request.put(`${daemonBaseURL}/api/sessions/${id}/pin`, {
    data: { pinned },
  });
  if (res.status() !== 204) {
    throw new Error(`pin API call failed: ${res.status()} ${await res.text()}`);
  }
}
