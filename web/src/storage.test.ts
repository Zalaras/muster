import { afterEach, describe, expect, it } from "vitest";
import { safeLocalStorage } from "./storage";
import { memoryStorage } from "./storagefakes";

function setLocalStorage(get: () => Storage): void {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get });
}

describe("safeLocalStorage", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("an accessor held from a blocked start works once the global becomes readable", () => {
    let blocked = true;
    const backing = memoryStorage();
    setLocalStorage(() => {
      if (blocked) throw new Error("SecurityError");
      return backing as unknown as Storage;
    });
    const storage = safeLocalStorage();
    expect(() => storage.setItem("k", "v")).toThrow();
    expect(storage.length).toBe(0);

    blocked = false;
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe("k");
    storage.removeItem("k");
    expect(backing.data).toEqual({});
  });

  it("an accessor held while readable reports unavailable once the global blocks", () => {
    let blocked = false;
    setLocalStorage(() => {
      if (blocked) throw new Error("SecurityError");
      return memoryStorage() as unknown as Storage;
    });
    const storage = safeLocalStorage();
    blocked = true;
    expect(() => storage.getItem("k")).toThrow("storage unavailable");
    expect(storage.key(0)).toBeNull();
  });
});
