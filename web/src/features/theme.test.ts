// `initTheme` writes `document.documentElement.dataset` and calls theme.ts's
// `writeThemeHint`, whose default storage parameter is the real `localStorage` global —
// both are stubbed here rather than pulling in jsdom, matching render/focuskeep.test.ts's
// minimal-stand-in convention (docs/conventions.md: Vitest covers logic, not rendering).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { PREF_DEFAULTS, type Prefs } from "../protocol/prefs";
import { initTheme } from "./theme";

class FakeStorage {
  data: Record<string, string> = {};
  setItem(key: string, value: string): void {
    this.data[key] = value;
  }
  getItem(key: string): string | null {
    return key in this.data ? this.data[key]! : null;
  }
}

function fakeDocument(): { documentElement: { dataset: Record<string, string | undefined> } } {
  return { documentElement: { dataset: {} } };
}

function prefsWith(theme: string): Prefs {
  return { ...PREF_DEFAULTS, theme };
}

describe("initTheme — emits themeChanged only when the resolved theme or Claude family actually moved (review.work.md Minor 3)", () => {
  let savedDocument: unknown;
  let savedLocalStorage: unknown;
  let doc: ReturnType<typeof fakeDocument>;

  beforeEach(() => {
    savedDocument = (globalThis as { document?: unknown }).document;
    savedLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
    doc = fakeDocument();
    (globalThis as { document: unknown }).document = doc;
    (globalThis as { localStorage: unknown }).localStorage = new FakeStorage();
  });

  afterEach(() => {
    (globalThis as { document: unknown }).document = savedDocument;
    (globalThis as { localStorage: unknown }).localStorage = savedLocalStorage;
  });

  it("emits once for the first broadcast, which always moves off the un-applied startup state", () => {
    const app = createApp();
    initTheme(app);
    let emitted = 0;
    app.on("themeChanged", () => {
      emitted += 1;
    });

    app.emit("prefs", prefsWith("dark"));

    expect(doc.documentElement.dataset["theme"]).toBe("dark");
    expect(emitted).toBe(1);
  });

  it("does not emit again when a later broadcast resolves to the identical theme and family — the reconnect case, where wsapp.ts's onSnapshot fires prefs and snapshot in the same task with unchanged values", () => {
    const app = createApp();
    initTheme(app);
    let emitted = 0;
    app.on("themeChanged", () => {
      emitted += 1;
    });

    app.emit("prefs", prefsWith("dark"));
    // claudeFamily starts "unknown" and was never changed, so this repeats the exact
    // resolved theme ("dark", a fixed name — family-independent) and family.
    app.emit("claudeTheme", "unknown");

    expect(emitted).toBe(1);
  });

  it("emits again when the Claude family changes while the theme choice is 'follow', since the resolved theme itself moves", () => {
    const app = createApp();
    initTheme(app);
    let emitted = 0;
    app.on("themeChanged", () => {
      emitted += 1;
    });

    app.emit("prefs", prefsWith("follow"));
    expect(doc.documentElement.dataset["theme"]).toBe("instrument"); // "follow" + "unknown"
    expect(emitted).toBe(1);

    app.emit("claudeTheme", "light");
    expect(doc.documentElement.dataset["theme"]).toBe("light");
    expect(emitted).toBe(2);

    // Repeating the same family again is a no-op, same as the fixed-name case above.
    app.emit("claudeTheme", "light");
    expect(emitted).toBe(2);
  });

  it("emits again on a family-only change even under a fixed theme choice, since data-claude-family still moves though data-theme does not", () => {
    const app = createApp();
    initTheme(app);
    let emitted = 0;
    app.on("themeChanged", () => {
      emitted += 1;
    });

    app.emit("prefs", prefsWith("dark"));
    expect(emitted).toBe(1);

    app.emit("claudeTheme", "light");

    expect(doc.documentElement.dataset["theme"]).toBe("dark"); // unmoved — "dark" wins outright
    expect(doc.documentElement.dataset["claudeFamily"]).toBe("light"); // moved
    expect(emitted).toBe(2);
  });
});
