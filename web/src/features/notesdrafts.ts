import { type KeyedStorage, listKeys, readJson, removeItem, writeJson } from "../storage";

export interface DraftStore {
  get(id: number): string | undefined;
  set(id: number, text: string): void;
  acknowledge(id: number, text: string): void;
  drop(id: number): void;
  pending(): ReadonlyMap<number, string>;
}

const KEY_PREFIX = "muster.note-draft.";

function keyFor(id: number): string {
  return `${KEY_PREFIX}${id}`;
}

function idOf(key: string | null): number | null {
  if (key === null || !key.startsWith(KEY_PREFIX)) return null;
  const id = Number(key.slice(KEY_PREFIX.length));
  return Number.isInteger(id) ? id : null;
}

function parseDraft(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function createDraftStore(storage: KeyedStorage): DraftStore {
  const typed = new Map<number, string>();

  function stored(id: number): string | undefined {
    return readJson<string | undefined>(storage, keyFor(id), parseDraft, undefined);
  }

  function storedIds(): number[] {
    return listKeys(storage).flatMap((key) => idOf(key) ?? []);
  }

  function get(id: number): string | undefined {
    return typed.get(id) ?? stored(id);
  }

  function set(id: number, text: string): void {
    typed.set(id, text);
    if (!writeJson(storage, keyFor(id), text)) removeItem(storage, keyFor(id));
  }

  function drop(id: number): void {
    typed.delete(id);
    removeItem(storage, keyFor(id));
  }

  function acknowledge(id: number, text: string): void {
    if (get(id) === text) drop(id);
  }

  function pending(): ReadonlyMap<number, string> {
    const all = new Map<number, string>();
    for (const id of storedIds()) {
      const text = stored(id);
      if (text !== undefined) all.set(id, text);
    }
    for (const [id, text] of typed) all.set(id, text);
    return all;
  }

  return { get, set, acknowledge, drop, pending };
}
