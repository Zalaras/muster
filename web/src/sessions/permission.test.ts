import { describe, expect, it } from "vitest";
import { PERMISSION_MODES } from "../protocol/session";
import { permissionModeToCheck } from "./permission";

// Plan fix-auto-mode-select (Implementation Notes — "Web pattern"): PERMISSION_MODES is
// the single source for both LaunchRequest's permissionMode union and features/launch.ts's
// radio guard, so REQ-1's four wire values and their dialog/cycle order live in exactly
// one place. Pinning its content here catches an accidental reorder or a fifth value
// (bypassPermissions/dontAsk, deliberately out per the plan) landing silently.
describe("permission — PERMISSION_MODES", () => {
  it("is exactly the four accepted wire values in dialog/cycle order (REQ-1)", () => {
    expect(PERMISSION_MODES).toEqual(["default", "acceptEdits", "plan", "auto"]);
  });
});

// Plan fix-auto-mode-select REQ-6: permissionModeToCheck is the single decision point for
// "which radio should be checked for this stored value" — features/launch.ts's
// setPermissionMode and selectedPermissionMode, and features/launchrestore.ts's
// initialRestore/repoRestore, all go through it. Each recognised PERMISSION_MODES value
// must round-trip to itself; anything else — an unrecognised string, null, or "" — must
// fall back to "auto" (plan new-session-improvement REQ-5, W4: the fallback moved off
// "default" so a fresh dialog and an unrecoverable stored value both land on the
// least-surprising mode), never leave every radio unchecked.
describe("permission — permissionModeToCheck (REQ-6, fallback per plan new-session-improvement W4)", () => {
  it.each(PERMISSION_MODES)("round-trips the recognised value %j to itself", (mode) => {
    expect(permissionModeToCheck(mode)).toBe(mode);
  });

  it("falls back to auto for an unrecognised string", () => {
    expect(permissionModeToCheck("someFutureMode")).toBe("auto");
  });

  // bypassPermissions is a real Claude Code mode (kb:adr/launch-bypass-and-dontask-unoffered)
  // the dialog deliberately never offers — it must fall back like any other unrecognised
  // string, not be special-cased. A fallback keyed on Claude Code's own mode list, rather
  // than on PERMISSION_MODES, would pass this while failing "someFutureMode" above.
  it("falls back to auto for the deliberately-unoffered bypassPermissions", () => {
    expect(permissionModeToCheck("bypassPermissions")).toBe("auto");
  });

  it("falls back to auto for an arbitrary unrecognised string", () => {
    expect(permissionModeToCheck("nonsense")).toBe("auto");
  });

  it("falls back to auto for null", () => {
    expect(permissionModeToCheck(null)).toBe("auto");
  });

  it("falls back to auto for the empty string", () => {
    expect(permissionModeToCheck("")).toBe("auto");
  });
});
