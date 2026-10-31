// Drop simulation for the drop feature: a `DataTransfer` built in-page
// (`page.evaluateHandle`, `new File([...])`) and dispatched as `drop` — or `dragover` then
// `drop` — onto a locator, plus the one `role="status"` notice a surface owns and the
// client-side size cap. Pure DOM — no daemon, no fixture knowledge — so both tiers use it:
// the render spec here directly (the document-level guard, the size gate and the dead
// surface swallow a drop before any request), the E2E journeys through
// `web/e2e/helpers/terminal.ts` and `web/e2e/helpers/dropfiles.ts`, which re-export it.
import type { Locator, Page } from "./harness";

/** The client-side size cap, mirrored as a constant so a test can build a fixture exactly one byte over
 * it without hardcoding the number twice. */
export const MAX_DROP_BYTES = 50 * 1024 * 1024;

/** One file to include in a synthesized drop. Provide `bytes` whenever the daemon must
 * find a byte-identical match on disk; provide `size` alone when only the
 * File's size matters so tens of megabytes of literal content never round-trip
 * through this Node process as a JSON array. */
export interface DropFileSpec {
  name: string;
  bytes?: Buffer;
  size?: number;
}

async function buildFileDataTransfer(page: Page, files: readonly DropFileSpec[]) {
  const serializable = files.map((f) => ({
    name: f.name,
    bytes: f.bytes ? Array.from(f.bytes) : null,
    size: f.size ?? f.bytes?.length ?? 0,
  }));
  return await page.evaluateHandle((fs) => {
    const dt = new DataTransfer();
    for (const f of fs) {
      const content = f.bytes ? new Uint8Array(f.bytes) : new Uint8Array(f.size);
      dt.items.add(new File([content], f.name));
    }
    return dt;
  }, serializable);
}

async function buildTextDataTransfer(page: Page, text: string) {
  return await page.evaluateHandle((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    return dt;
  }, text);
}

/**
 * Dispatches one "drop" carrying every listed file, in order, onto `region` — the UI's own
 * sequential locate→paste loop then processes them one at a time. Playwright's
 * `dispatchEvent` bypasses the native drag gesture entirely, so no preceding `dragover` is
 * needed to reach a target's own `drop` listener (plan Implementation Notes); use
 * `dragoverThenDropFiles` when the *document-level guard's* `dragover` listener is itself
 * what's under test.
 */
export async function dropFiles(region: Locator, files: readonly DropFileSpec[]): Promise<void> {
  const dataTransfer = await buildFileDataTransfer(region.page(), files);
  await region.dispatchEvent("drop", { dataTransfer });
}

/** A text/plain-only drop (no Files) onto `region`. */
export async function dropText(region: Locator, text: string): Promise<void> {
  const dataTransfer = await buildTextDataTransfer(region.page(), text);
  await region.dispatchEvent("drop", { dataTransfer });
}

/**
 * Dispatches `dragover` then `drop` with the SAME `DataTransfer` handle — the
 * documented Playwright drag-and-drop testing pattern (reusing one handle across both
 * events, mirroring its own `dragstart`+`drop` example) — so a foreign drag over a
 * non-terminal part of the dashboard exercises the document-level drop guard's real
 * `dragover` listener, not just its `drop` handler.
 */
export async function dragoverThenDropFiles(
  target: Locator,
  files: readonly DropFileSpec[],
): Promise<void> {
  const dataTransfer = await buildFileDataTransfer(target.page(), files);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

/**
 * The one-per-surface drop notice (Testable UI Elements: "Only one notice element exists
 * per surface" — `role="status"` inside `.terminal-surface`).
 */
export function dropNotice(region: Locator): Locator {
  return region.getByRole("status");
}
