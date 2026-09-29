import { describe, expect, it } from "vitest";
import { PERMISSION_MODES } from "../protocol/session";
import { isBypassMode, launchPrimaryFace, permissionModeToCheck } from "./permission";

// isBypassMode is the one owner for "is this mode bypass?", shared by
// permissionModeToCheck and launchPrimaryFace below plus features/launch.ts's
// bypass-warning visibility, sessions/card.ts's bypassChip and
// features/launchpastlist.ts's pastRowView — each of those five call sites is exercised
// indirectly elsewhere in this file or their own module's tests; this describes the
// predicate itself, including the raw-string/null inputs some of those five callers pass
// that were never validated against PERMISSION_MODES.
describe("permission — isBypassMode", () => {
  it("is true only for the exact string 'bypassPermissions'", () => {
    expect(isBypassMode("bypassPermissions")).toBe(true);
  });

  it("is false for every other recognised mode", () => {
    for (const mode of PERMISSION_MODES.filter((m) => m !== "bypassPermissions")) {
      expect(isBypassMode(mode)).toBe(false);
    }
  });

  it("is false for null (a past session's unrecorded mode)", () => {
    expect(isBypassMode(null)).toBe(false);
  });

  it("is false for an unrecognised or future mode string", () => {
    expect(isBypassMode("someFutureMode")).toBe(false);
  });

  it("is false for the empty string", () => {
    expect(isBypassMode("")).toBe(false);
  });
});

// PERMISSION_MODES is the single source for both LaunchRequest's permissionMode union and
// features/launch.ts's radio guard, so the accepted wire values and their dialog/cycle
// order live in exactly one place. Pinning its content here catches an accidental
// reorder or an extra value landing silently. kb:adr/launch-bypass-offered-with-danger-guardrails
// added the fifth value, bypassPermissions, in the danger family at the end of the list.
describe("permission — PERMISSION_MODES", () => {
  it("is exactly the five accepted wire values in dialog/cycle order", () => {
    expect(PERMISSION_MODES).toEqual([
      "default",
      "acceptEdits",
      "plan",
      "auto",
      "bypassPermissions",
    ]);
  });
});

// permissionModeToCheck is the single decision point for "which radio should be checked
// for this stored value" — features/launch.ts's setPermissionMode and
// selectedPermissionMode, and features/launchrestore.ts's initialRestore/repoRestore, all
// go through it. Every recognised value round-trips to itself except bypassPermissions,
// which kb:adr/launch-bypass-never-restored-as-default deliberately routes to auto like
// any unrecognised value — a directory's remembered bypass is never restored. Anything
// else — an unrecognised string, null, or "" — also falls back to "auto", never leaving
// every radio unchecked.
const RESTORABLE_MODES = PERMISSION_MODES.filter((mode) => mode !== "bypassPermissions");

describe("permission — permissionModeToCheck", () => {
  it.each(RESTORABLE_MODES)("round-trips the recognised value %j to itself", (mode) => {
    expect(permissionModeToCheck(mode)).toBe(mode);
  });

  // kb:adr/launch-bypass-never-restored-as-default (REQ-3/INV-3): a stored bypass is
  // never restored, unlike every other recognised mode above — checked separately so a
  // future PERMISSION_MODES reorder can't silently fold this back into the round-trip loop.
  it("falls back to auto for the never-restored bypassPermissions", () => {
    expect(permissionModeToCheck("bypassPermissions")).toBe("auto");
  });

  it("falls back to auto for an unrecognised string", () => {
    expect(permissionModeToCheck("someFutureMode")).toBe("auto");
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

// launchPrimaryFace (REQ-2/REQ-11/INV-2): #launch-button's face follows whichever tab is
// showing — the New tab's own checked Start-in mode, or the Resume tab's selected row's
// last-known mode. Bypass in either shape gets the danger face and the "without checks"
// label; every other combination gets the calm face and the tab's plain verb.
describe("permission — launchPrimaryFace", () => {
  it("New tab, non-bypass mode: plain Launch, not danger", () => {
    expect(launchPrimaryFace("new", "acceptEdits", null)).toEqual({
      label: "Launch",
      danger: false,
    });
  });

  it("New tab, bypass mode checked: danger 'Launch without checks'", () => {
    expect(launchPrimaryFace("new", "bypassPermissions", null)).toEqual({
      label: "Launch without checks",
      danger: true,
    });
  });

  it("New tab ignores the Resume-tab-only selectedRowMode argument", () => {
    expect(launchPrimaryFace("new", "auto", "bypassPermissions")).toEqual({
      label: "Launch",
      danger: false,
    });
  });

  it("Resume tab, nothing selected (null): plain Resume, not danger", () => {
    expect(launchPrimaryFace("resume", "auto", null)).toEqual({
      label: "Resume",
      danger: false,
    });
  });

  it("Resume tab, selected row's last mode is bypassPermissions: danger 'Resume without checks'", () => {
    expect(launchPrimaryFace("resume", "auto", "bypassPermissions")).toEqual({
      label: "Resume without checks",
      danger: true,
    });
  });

  it("Resume tab, selected row's last mode is an ordinary mode: plain Resume", () => {
    expect(launchPrimaryFace("resume", "auto", "acceptEdits")).toEqual({
      label: "Resume",
      danger: false,
    });
  });

  it("Resume tab ignores the New-tab-only mode argument", () => {
    expect(launchPrimaryFace("resume", "bypassPermissions", null)).toEqual({
      label: "Resume",
      danger: false,
    });
  });
});
