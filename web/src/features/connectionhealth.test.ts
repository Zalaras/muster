import { describe, expect, it } from "vitest";
import { describeConnectionHealth } from "./connectionhealth";
import { computeBannerOverride } from "./updaterestart";

// W4/W5, INV-1: the health dot's state, hidden word and hover title are one pure
// derivation of the connection status and the update-restart banner override. The strings
// are the plan's Testable UI Elements table, verbatim.
const CONNECTED = { health: "ok", word: "connected", title: "Connected to musterd" };
const CONNECTING = { health: "pending", word: "connecting…", title: "Connecting to musterd…" };
const UPDATING = {
  health: "pending",
  word: "reconnecting…",
  title: "Restarting musterd for an update…",
};
const DOWN = {
  health: "down",
  word: "reconnecting…",
  title: "musterd unreachable — reconnecting…",
};

describe("describeConnectionHealth — every status x override combination (W4/W5)", () => {
  it.each([
    ["connecting", null, CONNECTING],
    ["connecting", { neutral: false }, CONNECTING],
    ["connecting", { neutral: true }, CONNECTING],
    ["connected", null, CONNECTED],
    ["connected", { neutral: false }, CONNECTED],
    ["connected", { neutral: true }, CONNECTED],
    ["reconnecting", null, DOWN],
    ["reconnecting", { neutral: false }, UPDATING],
    // The plan's INV-1 leaves this pair open; the implementation reads a lost socket as
    // down even while the neutral "Updated to v…" confirmation still shows.
    ["reconnecting", { neutral: true }, DOWN],
  ] as const)("%s with override %j -> %j", (status, override, expected) => {
    expect(describeConnectionHealth(status, override)).toEqual(expected);
  });
});

describe("describeConnectionHealth — INV-1 against the real update-restart override", () => {
  const NOW = new Date("2026-10-12T10:00:00Z");
  const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
  const restart = { version: "0.9.0", arrivedAt: ago(5_000) };
  const staleRestart = { version: "0.9.0", arrivedAt: ago(31_000) };
  const confirmation = { version: "0.9.0", startedAt: ago(1_000) };

  // The banner decision comes from `computeBannerOverride` itself, so the dot is checked
  // against what the banner really shows: unreachable text (no override, reconnecting),
  // updating text (non-neutral override) or the neutral confirmation.
  it.each([
    ["no restart in flight", null, null, "connecting", "pending"],
    ["no restart in flight", null, null, "connected", "ok"],
    ["no restart in flight", null, null, "reconnecting", "down"],
    ["restart inside the 30 s window", restart, null, "connecting", "pending"],
    ["restart inside the 30 s window", restart, null, "connected", "ok"],
    ["restart inside the 30 s window", restart, null, "reconnecting", "pending"],
    ["restart past the 30 s fallback", staleRestart, null, "connecting", "pending"],
    ["restart past the 30 s fallback", staleRestart, null, "connected", "ok"],
    ["restart past the 30 s fallback", staleRestart, null, "reconnecting", "down"],
    ["confirmation showing", null, confirmation, "connecting", "pending"],
    ["confirmation showing", null, confirmation, "connected", "ok"],
    ["confirmation showing", null, confirmation, "reconnecting", "down"],
  ] as const)("%s, %s -> %s", (_name, record, conf, status, expected) => {
    const override = computeBannerOverride(record, status, NOW, conf);
    expect(describeConnectionHealth(status, override).health).toBe(expected);
  });

  it("the updating banner (non-neutral override) pairs with the updating title, not the unreachable one", () => {
    const override = computeBannerOverride(restart, "reconnecting", NOW, null);
    expect(override?.neutral).toBe(false);
    expect(describeConnectionHealth("reconnecting", override)).toEqual(UPDATING);
  });

  it("past the 30 s fallback there is no override, and the unreachable title returns", () => {
    const override = computeBannerOverride(staleRestart, "reconnecting", NOW, null);
    expect(override).toBeNull();
    expect(describeConnectionHealth("reconnecting", override)).toEqual(DOWN);
  });
});
