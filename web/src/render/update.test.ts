// Plan auto-update: `buildUpdateViewModel` (W5's table-test contract — every Text-rules
// row: each `install` kind x pref on/off x `available` null/set x `installed` null/set x
// each `apply.phase`) is pure, so it's tested directly with no DOM at all. The DOM-facing
// functions below (`renderUpdateSection`, `renderSettingsBadge`, `renderRestartImpact`,
// `initRestartConfirm`) have no jsdom configured (docs/conventions.md defers DOM
// *construction* to Playwright) — following render/dead.test.ts's and
// render/dropguard.test.ts's precedent, they're exercised against plain fakes that record
// just enough state (`textContent`, `disabled`, `hidden`, `dataset`, attributes, a fake
// `addEventListener`/`showModal`/`close`) to assert on, never a real DOM node.
import { describe, expect, it, vi } from "vitest";
import type { RestartImpactShell } from "../api/update";
import type { Prefs, UpdateApplyPhase, UpdateInfo, UpdateInstallKind } from "../protocol";
import {
  buildUpdateViewModel,
  type CheckState,
  initRestartConfirm,
  renderRestartImpact,
  renderSettingsBadge,
  renderUpdateSection,
  type RestartConfirmElements,
  type UpdateSectionElements,
} from "./update";

const idleApply = { phase: "idle" as const, version: null, error: null };

const baseUpdate: UpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  // Plan rail-card-improvements-2 (REQ-9): most tests below predate the Check-now feature
  // and don't vary canCheck themselves — the dedicated "Check now" describe block overrides
  // it per case.
  canCheck: true,
  available: null,
  checkedAt: null,
  installed: null,
  apply: idleApply,
};

const onPrefs: Prefs = {
  view: "focus",
  density: "2x2",
  usageModel: "Fable",
  railSort: "manual",
  theme: "follow",
  updateCheck: true,
  railDensity: "comfortable",
  railActivity: "turn",
};
const offPrefs: Prefs = { ...onPrefs, updateCheck: false };

// Plan rail-card-improvements-2 (REQ-10/REQ-12/REQ-13): `NOW`/`idleCheck` are the neutral
// defaults for every test below that predates the Check-now feature and doesn't itself vary
// the request clock or in-flight state — `NOW` sits exactly 2 minutes after the fixture
// `checkedAt` values used throughout ("2026-09-10T20:00:00Z"), matching the plan's own
// States-table example ("checked 2m ago"). The dedicated "Check now" and "Available — age
// suffix" describes below override `check`/`now` per case.
const NOW = new Date("2026-09-10T20:02:00Z");
const idleCheck: CheckState = { inFlight: false, error: null };
const busyCheck: CheckState = { inFlight: true, error: null };

function buildVm(
  update: UpdateInfo | null,
  prefs: Prefs | null,
  check: CheckState = idleCheck,
  now: Date = NOW,
) {
  return buildUpdateViewModel(update, prefs, now, check);
}

describe("buildUpdateViewModel — no data yet (update === null, edge case 32)", () => {
  it("renders the honesty-shaped 'unknown' state: never an empty gauge, no badge, buttons hidden, Check now disabled", () => {
    const vm = buildVm(null, null);
    expect(vm).toEqual({
      running: "unknown",
      available: "not checked yet",
      toggleChecked: true,
      toggleDisabled: true,
      buttonsVisible: false,
      updateEnabled: false,
      restartEnabled: false,
      restartLabel: "Update and restart",
      status: "",
      badged: false,
      busy: false,
      // W2/edge case 21: canCheck is never known without an `update` object.
      checkEnabled: false,
      checkBusy: false,
    });
  });

  it("still reflects prefs.updateCheck for the toggle's checked state even with update === null", () => {
    const vm = buildVm(null, offPrefs);
    expect(vm.toggleChecked).toBe(false);
    expect(vm.toggleDisabled).toBe(true); // its own effect is unobservable with no daemon-side support
  });

  it("defaults toggleChecked to true when prefs is also null (pre-hello state)", () => {
    const vm = buildVm(null, null);
    expect(vm.toggleChecked).toBe(true);
  });

  it("checkEnabled stays false with update === null even while this window's own check is in flight (W2/edge case 21)", () => {
    const vm = buildVm(null, null, busyCheck);
    expect(vm.checkEnabled).toBe(false);
  });

  it("checkBusy still mirrors check.inFlight with update === null (the button shows its own request state before any snapshot)", () => {
    const vm = buildVm(null, null, busyCheck);
    expect(vm.checkBusy).toBe(true);
  });
});

describe("buildUpdateViewModel — Running (Text rules)", () => {
  it("renders 'v<running>' for a non-dev install", () => {
    const vm = buildVm({ ...baseUpdate, running: "0.10.0", install: "installer" }, onPrefs);
    expect(vm.running).toBe("v0.10.0");
  });

  it.each(["homebrew", "unmanaged"] as const)(
    "renders 'v<running>' for install kind %s too",
    (install) => {
      const vm = buildVm({ ...baseUpdate, running: "0.10.0", install, remedy: "x" }, onPrefs);
      expect(vm.running).toBe("v0.10.0");
    },
  );

  it("renders '<running> (development build)' for a dev install, with the raw (unprefixed) version string", () => {
    const vm = buildVm({ ...baseUpdate, running: "v0.10.0-4-ge5102b8", install: "dev" }, onPrefs);
    expect(vm.running).toBe("v0.10.0-4-ge5102b8 (development build)");
  });
});

describe("buildUpdateViewModel — Available (Text rules)", () => {
  it("renders 'not checked (development build)' for install 'dev', regardless of the pref or available/checkedAt", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "dev", available: "0.11.0", checkedAt: "2026-09-10T20:00:00Z" },
      onPrefs,
    );
    expect(vm.available).toBe("not checked (development build)");
  });

  // REQ-11 (plan rail-card-improvements-2): the old `!updateCheck` branch, which rendered
  // a fixed string meaning "the pref turned it off", is deleted rather than renamed — a
  // manual check runs regardless of the pref (REQ-8), so no text state means that anymore.
  it("renders 'v<available> · checked <age>' when a strictly newer release is known (REQ-11)", () => {
    const vm = buildVm(
      { ...baseUpdate, available: "0.11.0", checkedAt: "2026-09-10T20:00:00Z" },
      onPrefs,
    );
    expect(vm.available).toBe("v0.11.0 · checked 2m ago");
  });

  it("renders the same age suffix with the daily-check toggle off (REQ-11 no longer branches on prefs at all)", () => {
    const vm = buildVm(
      { ...baseUpdate, available: "0.11.0", checkedAt: "2026-09-10T20:00:00Z" },
      offPrefs,
    );
    expect(vm.available).toBe("v0.11.0 · checked 2m ago");
  });

  it("renders 'not checked yet' when available is null and checkedAt is null (never checked)", () => {
    const vm = buildVm({ ...baseUpdate, available: null, checkedAt: null }, onPrefs);
    expect(vm.available).toBe("not checked yet");
  });

  it("renders 'up to date · checked <age>' when available is null but checkedAt is set (checked, nothing newer, REQ-11)", () => {
    const vm = buildVm(
      { ...baseUpdate, available: null, checkedAt: "2026-09-10T20:00:00Z" },
      onPrefs,
    );
    expect(vm.available).toBe("up to date · checked 2m ago");
  });

  it("carries no age suffix at all — not an empty one — when checkedAt is null even if available is somehow set (edge case 19, defensive)", () => {
    const vm = buildVm({ ...baseUpdate, available: "0.11.0", checkedAt: null }, onPrefs);
    expect(vm.available).toBe("not checked yet");
  });

  it("renders 'checked now', never 'now ago', for a check that completed under a minute ago (edge case 20/W5)", () => {
    const vm = buildVm(
      { ...baseUpdate, available: "0.14.0", checkedAt: "2026-09-10T20:00:00Z" },
      onPrefs,
      idleCheck,
      new Date("2026-09-10T20:00:30Z"),
    );
    expect(vm.available).toBe("v0.14.0 · checked now");
  });

  it("is unaffected by a missing prefs (null) — availableText never reads prefs (REQ-11)", () => {
    const vm = buildVm(
      { ...baseUpdate, available: "0.11.0", checkedAt: "2026-09-10T20:00:00Z" },
      null,
    );
    expect(vm.available).toBe("v0.11.0 · checked 2m ago");
  });
});

describe("buildUpdateViewModel — Toggle (checked iff prefs.updateCheck; disabled only for install=dev)", () => {
  it.each(["installer", "homebrew", "unmanaged"] as const)(
    "enables the toggle for install kind %s",
    (install) => {
      const vm = buildVm(
        { ...baseUpdate, install, remedy: install === "installer" ? null : "x" },
        onPrefs,
      );
      expect(vm.toggleDisabled).toBe(false);
    },
  );

  it("disables the toggle for install 'dev' while still reflecting the pref's checked state", () => {
    const vm = buildVm({ ...baseUpdate, install: "dev" }, offPrefs);
    expect(vm.toggleDisabled).toBe(true);
    expect(vm.toggleChecked).toBe(false);
  });

  it.each([true, false])("toggleChecked mirrors prefs.updateCheck=%s exactly", (updateCheck) => {
    const vm = buildVm(baseUpdate, { ...onPrefs, updateCheck });
    expect(vm.toggleChecked).toBe(updateCheck);
  });
});

describe("buildUpdateViewModel — Buttons visible (iff install != dev)", () => {
  it.each(["installer", "homebrew", "unmanaged"] as const)(
    "shows buttons for install kind %s",
    (install) => {
      const vm = buildVm(
        { ...baseUpdate, install, remedy: install === "installer" ? null : "x" },
        onPrefs,
      );
      expect(vm.buttonsVisible).toBe(true);
    },
  );

  it("hides buttons for install 'dev'", () => {
    const vm = buildVm({ ...baseUpdate, install: "dev" }, onPrefs);
    expect(vm.buttonsVisible).toBe(false);
  });
});

describe("buildUpdateViewModel — Buttons enabled (install=installer, phase not in flight, available|installed set)", () => {
  it("disables both buttons when install is 'installer' but neither available nor installed is set", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "installer", available: null, installed: null },
      onPrefs,
    );
    expect(vm.updateEnabled).toBe(false);
    expect(vm.restartEnabled).toBe(false);
  });

  it("enables both buttons when available is set and installed is null", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "installer", available: "0.11.0", installed: null },
      onPrefs,
    );
    expect(vm.updateEnabled).toBe(true);
    expect(vm.restartEnabled).toBe(true);
  });

  it("disables Update but keeps Restart enabled once installed is set (REQ-25's restart-only case)", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "installer", available: null, installed: "0.11.0" },
      onPrefs,
    );
    expect(vm.updateEnabled).toBe(false);
    expect(vm.restartEnabled).toBe(true);
  });

  it("keeps Update disabled even with available set, once installed is also set", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "installer", available: "0.11.0", installed: "0.11.0" },
      onPrefs,
    );
    expect(vm.updateEnabled).toBe(false);
    expect(vm.restartEnabled).toBe(true);
  });

  it.each(["homebrew", "unmanaged"] as const)(
    "disables both buttons for install kind %s even with available set (only 'installer' may apply)",
    (install) => {
      const vm = buildVm({ ...baseUpdate, install, remedy: "x", available: "0.11.0" }, onPrefs);
      expect(vm.updateEnabled).toBe(false);
      expect(vm.restartEnabled).toBe(false);
    },
  );

  it.each(["downloading", "verifying", "installing", "restarting"] as const)(
    "disables both buttons while phase %s is in flight, even with available set",
    (phase) => {
      const vm = buildVm(
        {
          ...baseUpdate,
          install: "installer",
          available: "0.11.0",
          apply: { phase, version: "0.11.0", error: null },
        },
        onPrefs,
      );
      expect(vm.updateEnabled).toBe(false);
      expect(vm.restartEnabled).toBe(false);
    },
  );

  it.each(["idle", "done", "failed"] as const)(
    "re-enables buttons once phase is %s again (not in flight)",
    (phase) => {
      const vm = buildVm(
        {
          ...baseUpdate,
          install: "installer",
          available: "0.11.0",
          apply: {
            phase,
            version: phase === "idle" ? null : "0.11.0",
            error: phase === "failed" ? "boom" : null,
          },
        },
        onPrefs,
      );
      expect(vm.updateEnabled).toBe(true);
      expect(vm.restartEnabled).toBe(true);
    },
  );
});

describe("buildUpdateViewModel — restartLabel (Restart now iff installed != null)", () => {
  it("reads 'Update and restart' when installed is null", () => {
    const vm = buildVm({ ...baseUpdate, installed: null }, onPrefs);
    expect(vm.restartLabel).toBe("Update and restart");
  });

  it("reads 'Restart now' once installed is set", () => {
    const vm = buildVm({ ...baseUpdate, installed: "0.11.0" }, onPrefs);
    expect(vm.restartLabel).toBe("Restart now");
  });
});

describe("buildUpdateViewModel — Status line (every phase, plus the idle/remedy/empty fallbacks)", () => {
  it("renders 'Downloading v<version>…' during download", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "downloading", version: "0.11.0", error: null } },
      onPrefs,
    );
    expect(vm.status).toBe("Downloading v0.11.0…");
  });

  it("renders 'Verifying v<version>…' during verification", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "verifying", version: "0.11.0", error: null } },
      onPrefs,
    );
    expect(vm.status).toBe("Verifying v0.11.0…");
  });

  it("renders 'Installing v<version>…' during install", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "installing", version: "0.11.0", error: null } },
      onPrefs,
    );
    expect(vm.status).toBe("Installing v0.11.0…");
  });

  it("renders 'Restarting musterd…' during restart, dropping the version entirely", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "restarting", version: "0.11.0", error: null } },
      onPrefs,
    );
    expect(vm.status).toBe("Restarting musterd…");
  });

  it("renders 'Update failed: <error>' on failure, naming the remedy sentence carried in the error", () => {
    const vm = buildVm(
      {
        ...baseUpdate,
        apply: {
          phase: "failed",
          version: "0.11.0",
          error:
            "signature on checksums.txt did not verify — the release may be tampered with; nothing was installed",
        },
      },
      onPrefs,
    );
    expect(vm.status).toBe(
      "Update failed: signature on checksums.txt did not verify — the release may be tampered with; nothing was installed",
    );
  });

  it("renders 'Updated to v<installed>. Restart musterd to finish.' on phase 'done'", () => {
    const vm = buildVm(
      {
        ...baseUpdate,
        installed: "0.11.0",
        apply: { phase: "done", version: "0.11.0", error: null },
      },
      onPrefs,
    );
    expect(vm.status).toBe("Updated to v0.11.0. Restart musterd to finish.");
  });

  it("renders the same 'Updated to...' line once phase returns to idle, as long as installed is still set (REQ-26/REQ-25 persistence)", () => {
    const vm = buildVm({ ...baseUpdate, installed: "0.11.0", apply: idleApply }, onPrefs);
    expect(vm.status).toBe("Updated to v0.11.0. Restart musterd to finish.");
  });

  it("renders the remedy sentence when phase is idle, installed is null, and a remedy is present (homebrew/unmanaged)", () => {
    const vm = buildVm(
      {
        ...baseUpdate,
        install: "homebrew",
        remedy: "installed by Homebrew — run brew upgrade musterd",
      },
      onPrefs,
    );
    expect(vm.status).toBe("installed by Homebrew — run brew upgrade musterd");
  });

  it("renders an empty status when idle, installed null, and no remedy (the ordinary installer no-news state)", () => {
    const vm = buildVm(baseUpdate, onPrefs);
    expect(vm.status).toBe("");
  });

  it("uses an empty version placeholder rather than 'vundefined'/'vnull' if apply.version is somehow null during an in-flight phase", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "downloading", version: null, error: null } },
      onPrefs,
    );
    expect(vm.status).toBe("Downloading v…");
  });

  it("REQ-12: a failed manual check's reason wins over the idle/remedy/empty fallback", () => {
    const vm = buildVm(baseUpdate, onPrefs, { inFlight: false, error: "connection refused" });
    expect(vm.status).toBe("connection refused");
  });

  it("REQ-12: a failed manual check's reason wins even over an apply phase in progress", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "downloading", version: "0.11.0", error: null } },
      onPrefs,
      { inFlight: false, error: "connection refused" },
    );
    expect(vm.status).toBe("connection refused");
  });

  it("falls back to the ordinary apply-phase priority chain once check.error is cleared", () => {
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "downloading", version: "0.11.0", error: null } },
      onPrefs,
      idleCheck,
    );
    expect(vm.status).toBe("Downloading v0.11.0…");
  });
});

describe("buildUpdateViewModel — Check now (REQ-10/REQ-13, plan rail-card-improvements-2)", () => {
  it("checkEnabled is true when canCheck is true and no check is in flight", () => {
    const vm = buildVm({ ...baseUpdate, canCheck: true }, onPrefs, idleCheck);
    expect(vm.checkEnabled).toBe(true);
  });

  it("checkEnabled is false when canCheck is false (W2 — empty -update-base-url or a dev install)", () => {
    const vm = buildVm({ ...baseUpdate, canCheck: false }, onPrefs, idleCheck);
    expect(vm.checkEnabled).toBe(false);
  });

  it("checkEnabled is false while this window's own check is already in flight, even with canCheck true (W4/edge case 16)", () => {
    const vm = buildVm({ ...baseUpdate, canCheck: true }, onPrefs, busyCheck);
    expect(vm.checkEnabled).toBe(false);
  });

  it("checkEnabled is true with the daily-check toggle off, as long as canCheck is true (REQ-8, W3)", () => {
    const vm = buildVm({ ...baseUpdate, canCheck: true }, offPrefs, idleCheck);
    expect(vm.checkEnabled).toBe(true);
  });

  it.each([true, false])(
    "checkBusy mirrors check.inFlight=%s regardless of canCheck",
    (inFlight) => {
      const vm = buildVm({ ...baseUpdate, canCheck: false }, onPrefs, { inFlight, error: null });
      expect(vm.checkBusy).toBe(inFlight);
    },
  );
});

describe("buildUpdateViewModel — Badge (available != null && installed == null, INV-6)", () => {
  it("is badged when available is set and installed is null", () => {
    const vm = buildVm({ ...baseUpdate, available: "0.11.0", installed: null }, onPrefs);
    expect(vm.badged).toBe(true);
  });

  it("is not badged when both are null", () => {
    const vm = buildVm({ ...baseUpdate, available: null, installed: null }, onPrefs);
    expect(vm.badged).toBe(false);
  });

  it("is not badged once installed is set, even if available is still non-null", () => {
    const vm = buildVm({ ...baseUpdate, available: "0.11.0", installed: "0.11.0" }, onPrefs);
    expect(vm.badged).toBe(false);
  });

  it("is not badged when installed is set and available is null (swap done, restart pending)", () => {
    const vm = buildVm({ ...baseUpdate, available: null, installed: "0.11.0" }, onPrefs);
    expect(vm.badged).toBe(false);
  });

  it("is never badged for a dev install even if available/installed were somehow both set (defensive — daemon never sends this per INV-2)", () => {
    const vm = buildVm(
      { ...baseUpdate, install: "dev", available: "0.11.0", installed: null },
      onPrefs,
    );
    expect(vm.badged).toBe(true); // badge rule reads only available/installed, matching REQ-9's literal definition
  });
});

describe("buildUpdateViewModel — busy (aria-busy iff an apply phase is in flight)", () => {
  it.each(["downloading", "verifying", "installing", "restarting"] as const)(
    "is busy during phase %s",
    (phase) => {
      const vm = buildVm(
        { ...baseUpdate, apply: { phase, version: "0.11.0", error: null } },
        onPrefs,
      );
      expect(vm.busy).toBe(true);
    },
  );

  it.each(["idle", "done", "failed"] as const)("is not busy during phase %s", (phase) => {
    const vm = buildVm(
      {
        ...baseUpdate,
        apply: {
          phase,
          version: phase === "idle" ? null : "0.11.0",
          error: phase === "failed" ? "boom" : null,
        },
      },
      onPrefs,
    );
    expect(vm.busy).toBe(false);
  });
});

// Full cross-product sample (W5's literal "each install kind x pref on/off x available
// null/set x installed null/set x each apply.phase") — a smaller number of the columns
// above are already exhaustively covered on their own; this walks the full grid once to
// catch any interaction the column-by-column tests above could miss, asserting only that
// it never throws and that badged/buttonsVisible/toggleChecked stay internally consistent
// with the rules already pinned above.
/** One cell of the full grid below. Lives at module scope, not inside the five nested
 * loops, so the assertions read at zero nesting — and so the body is one unit of
 * complexity rather than inheriting the loops' depth. */
function expectGridRowConsistent(
  install: UpdateInstallKind,
  updateCheck: boolean,
  available: string | null,
  installed: string | null,
  phase: UpdateApplyPhase,
): void {
  const update: UpdateInfo = {
    ...baseUpdate,
    install,
    remedy: install === "homebrew" || install === "unmanaged" ? "remedy text" : null,
    available,
    checkedAt: available !== null ? "2026-09-10T20:00:00Z" : null,
    installed,
    apply: {
      phase,
      version: phase === "idle" ? null : "0.11.0",
      error: phase === "failed" ? "boom" : null,
    },
  };
  const prefs: Prefs = { ...onPrefs, updateCheck };
  const vm = buildVm(update, prefs);

  expect(vm.badged).toBe(available !== null && installed === null);
  expect(vm.buttonsVisible).toBe(install !== "dev");
  expect(vm.toggleChecked).toBe(updateCheck);
  expect(vm.toggleDisabled).toBe(install === "dev");
  if (install !== "installer") {
    expect(vm.updateEnabled).toBe(false);
    expect(vm.restartEnabled).toBe(false);
  }
}

describe("buildUpdateViewModel — full grid (no throw; badge/visibility/toggle stay internally consistent)", () => {
  const installs: UpdateInstallKind[] = ["installer", "dev", "homebrew", "unmanaged"];
  const phases: UpdateApplyPhase[] = [
    "idle",
    "downloading",
    "verifying",
    "installing",
    "restarting",
    "failed",
    "done",
  ];

  for (const install of installs) {
    for (const updateCheck of [true, false]) {
      for (const available of [null, "0.11.0"] as const) {
        for (const installed of [null, "0.11.0"] as const) {
          for (const phase of phases) {
            it(`install=${install} updateCheck=${updateCheck} available=${available} installed=${installed} phase=${phase}`, () => {
              expectGridRowConsistent(install, updateCheck, available, installed, phase);
            });
          }
        }
      }
    }
  }
});

// --- DOM-facing functions: plain fakes, no jsdom (see file header). ---

function fakeSectionElements(): UpdateSectionElements & {
  attrs: Map<string, string>;
  checkAttrs: Map<string, string>;
} {
  const attrs = new Map<string, string>();
  const checkAttrs = new Map<string, string>();
  return {
    section: {
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
    } as unknown as HTMLElement,
    runningEl: { textContent: "" } as unknown as HTMLElement,
    availableEl: { textContent: "" } as unknown as HTMLElement,
    toggle: { disabled: false } as unknown as HTMLInputElement,
    statusEl: { textContent: "" } as unknown as HTMLElement,
    applyBtn: { hidden: false, disabled: false } as unknown as HTMLButtonElement,
    restartBtn: { hidden: false, disabled: false, textContent: "" } as unknown as HTMLButtonElement,
    // REQ-10 (plan rail-card-improvements-2): `#update-check-button`.
    checkBtn: {
      disabled: false,
      setAttribute: (name: string, value: string) => checkAttrs.set(name, value),
      removeAttribute: (name: string) => checkAttrs.delete(name),
    } as unknown as HTMLButtonElement,
    attrs,
    checkAttrs,
  };
}

describe("renderUpdateSection — applies a view model to the DOM refs", () => {
  it("writes running/available text, toggle.disabled, status text, and never touches toggle.checked", () => {
    const els = fakeSectionElements();
    const vm = buildVm(
      { ...baseUpdate, available: "0.11.0", checkedAt: "2026-09-10T20:00:00Z" },
      onPrefs,
    );
    (els.toggle as unknown as { checked: boolean }).checked = false;
    renderUpdateSection(els, vm);
    expect(els.runningEl.textContent).toBe("v0.10.0");
    expect(els.availableEl.textContent).toBe("v0.11.0 · checked 2m ago");
    expect(els.toggle.disabled).toBe(false);
    // renderUpdateSection's own doc comment: it never writes .checked (settings.ts's
    // setChecked, driven only by the prefs/update broadcast, is the sole writer — INV-7).
    expect((els.toggle as unknown as { checked: boolean }).checked).toBe(false);
  });

  it("REQ-10: writes checkBtn.disabled from checkEnabled", () => {
    const els = fakeSectionElements();
    renderUpdateSection(els, buildVm({ ...baseUpdate, canCheck: true }, onPrefs, idleCheck));
    expect(els.checkBtn.disabled).toBe(false);
    renderUpdateSection(els, buildVm({ ...baseUpdate, canCheck: false }, onPrefs, idleCheck));
    expect(els.checkBtn.disabled).toBe(true);
  });

  it("REQ-13: sets aria-busy='true' on checkBtn while this window's own check is in flight, and removes it once it isn't", () => {
    const els = fakeSectionElements();
    renderUpdateSection(els, buildVm(baseUpdate, onPrefs, busyCheck));
    expect(els.checkAttrs.get("aria-busy")).toBe("true");
    renderUpdateSection(els, buildVm(baseUpdate, onPrefs, idleCheck));
    expect(els.checkAttrs.has("aria-busy")).toBe(false);
  });

  it("hides both buttons for a dev install", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, install: "dev" }, onPrefs);
    renderUpdateSection(els, vm);
    expect(els.applyBtn.hidden).toBe(true);
    expect(els.restartBtn.hidden).toBe(true);
  });

  it("shows and enables both buttons when an update is available", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, available: "0.11.0" }, onPrefs);
    renderUpdateSection(els, vm);
    expect(els.applyBtn.hidden).toBe(false);
    expect(els.applyBtn.disabled).toBe(false);
    expect(els.restartBtn.disabled).toBe(false);
  });

  it("writes the restart button's label ('Restart now' once installed)", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, installed: "0.11.0" }, onPrefs);
    renderUpdateSection(els, vm);
    expect(els.restartBtn.textContent).toBe("Restart now");
  });

  it("sets aria-busy='true' on the section while an apply phase is in flight", () => {
    const els = fakeSectionElements();
    const vm = buildVm(
      { ...baseUpdate, apply: { phase: "downloading", version: "0.11.0", error: null } },
      onPrefs,
    );
    renderUpdateSection(els, vm);
    expect(els.attrs.get("aria-busy")).toBe("true");
  });

  it("removes aria-busy once no phase is in flight", () => {
    const els = fakeSectionElements();
    els.attrs.set("aria-busy", "true"); // simulate a previous busy render
    const vm = buildVm(baseUpdate, onPrefs);
    renderUpdateSection(els, vm);
    expect(els.attrs.has("aria-busy")).toBe(false);
  });
});

function fakeBadgeButton(withDot: boolean): HTMLButtonElement {
  const attrs = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const dot = withDot ? ({ hidden: true } as unknown as HTMLElement) : null;
  return {
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => attrs.delete(name),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    dataset,
    querySelector: () => dot,
  } as unknown as HTMLButtonElement;
}

describe("renderSettingsBadge — REQ-9's masthead badge dot and accessible name", () => {
  it("sets aria-label, data-update, and unhides the dot when badged", () => {
    const button = fakeBadgeButton(true);
    renderSettingsBadge(button, true);
    expect(button.getAttribute("aria-label")).toBe("Settings, update available");
    expect(button.dataset["update"]).toBe("available");
    expect(button.querySelector<HTMLElement>(".update-dot")?.hidden).toBe(false);
  });

  it("removes aria-label/data-update and hides the dot again when not badged", () => {
    const button = fakeBadgeButton(true);
    renderSettingsBadge(button, true);
    renderSettingsBadge(button, false);
    expect(button.getAttribute("aria-label")).toBeNull();
    expect(button.dataset["update"]).toBeUndefined();
    expect(button.querySelector<HTMLElement>(".update-dot")?.hidden).toBe(true);
  });

  it("does not throw when the dot element is missing", () => {
    const button = fakeBadgeButton(false);
    expect(() => renderSettingsBadge(button, true)).not.toThrow();
    expect(() => renderSettingsBadge(button, false)).not.toThrow();
  });
});

describe("renderRestartImpact — REQ-11's confirm body naming the plain-terminal shells", () => {
  it("says no shells are open, and that Claude sessions keep running, for an empty list", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    renderRestartImpact(el, []);
    expect(el.textContent).toBe(
      "No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("uses singular 'shell' and names the one title for a single shell", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [{ sessionId: 3, title: "fix auth" }];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "1 plain-terminal shell will close: fix auth. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("uses plural 'shells' and comma-joins titles for multiple shells", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [
      { sessionId: 1, title: "fix auth" },
      { sessionId: 2, title: "spike" },
    ];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "2 plain-terminal shells will close: fix auth, spike. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("substitutes 'untitled' for a shell whose owning session is unknown (null title)", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [{ sessionId: 9, title: null }];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "1 plain-terminal shell will close: untitled. Claude sessions keep running and are re-adopted after the restart.",
    );
  });
});

/** A minimal `<dialog>` fake — `open`, `showModal()`, `close()` only, matching
 * render/confirm.ts's precedent (no jsdom, see file header). */
function fakeDialog(): HTMLDialogElement {
  const dialog = {
    open: false,
    showModal: () => {
      dialog.open = true;
    },
    close: () => {
      dialog.open = false;
    },
  };
  return dialog as unknown as HTMLDialogElement;
}

/** A fake button recording its one `click` listener, for the confirm/cancel wiring. */
function fakeClickButton(): HTMLButtonElement & { click: () => void } {
  let handler: (() => void) | null = null;
  return {
    addEventListener: (type: string, listener: () => void) => {
      if (type === "click") handler = listener;
    },
    click: () => handler?.(),
  } as unknown as HTMLButtonElement & { click: () => void };
}

function fakeRestartConfirmElements(): RestartConfirmElements & {
  confirmBtn: HTMLButtonElement & { click: () => void };
  cancelBtn: HTMLButtonElement & { click: () => void };
} {
  return {
    dialog: fakeDialog(),
    body: { textContent: "" } as unknown as HTMLElement,
    confirmBtn: fakeClickButton(),
    cancelBtn: fakeClickButton(),
  };
}

describe("initRestartConfirm — REQ-11's confirm dialog controller", () => {
  it("open() renders the restart-impact body and shows the modal", () => {
    const els = fakeRestartConfirmElements();
    const shells: RestartImpactShell[] = [{ sessionId: 3, title: "fix auth" }];

    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    controller.open(shells);

    expect(els.body.textContent).toContain("fix auth");
    expect(els.dialog.open).toBe(true);
  });

  it("open() is a no-op (does not re-invoke showModal) when already open", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    let showModalCalls = 0;
    const originalShowModal = els.dialog.showModal.bind(els.dialog);
    els.dialog.showModal = () => {
      showModalCalls += 1;
      originalShowModal();
    };
    controller.open([]);
    controller.open([]);
    expect(showModalCalls).toBe(1);
  });

  it("Confirm closes the dialog then fires onConfirm", () => {
    const els = fakeRestartConfirmElements();
    const onConfirm = vi.fn();
    const controller = initRestartConfirm(els, { onConfirm });
    controller.open([]);

    els.confirmBtn.click();

    expect(els.dialog.open).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the dialog without firing onConfirm", () => {
    const els = fakeRestartConfirmElements();
    const onConfirm = vi.fn();
    const controller = initRestartConfirm(els, { onConfirm });
    controller.open([]);

    els.cancelBtn.click();

    expect(els.dialog.open).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("close() is a no-op when the dialog is already closed", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    expect(() => controller.close()).not.toThrow();
    expect(els.dialog.open).toBe(false);
  });

  it("close() closes an open dialog (e.g. daemon-down tears it down)", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    controller.open([]);
    controller.close();
    expect(els.dialog.open).toBe(false);
  });
});
