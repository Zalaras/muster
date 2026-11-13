// Unit-test factories for the wire shapes this directory owns, beside
// `sessions/testfixtures.ts` (Session). Each returns a complete, valid object and takes the
// fields a test is about as overrides. The decoder tests here keep their raw wire literals —
// spelling the whole payload out is their job.
import type { UpdateInfo } from "./update";

/** An installer-managed daemon on 0.10.0 that can check, with nothing available and no apply
 * under way. */
export function makeUpdateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    running: "0.10.0",
    install: "installer",
    remedy: null,
    canCheck: true,
    available: null,
    checkedAt: null,
    installed: null,
    apply: { phase: "idle", version: null, error: null },
    ...overrides,
  };
}
