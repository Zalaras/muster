import { isRecord } from "../protocol/decode";
import { readJson, type StorageLike, writeJson } from "../storage";
import type { Rect } from "./notesgeometry";

export interface NotePlace {
  popped: boolean;
  rect: Rect | null;
}

export type NotePlaces = ReadonlyMap<number, NotePlace>;

const KEY = "muster.note-places";
const ID_PATTERN = /^\d+$/;

function parseRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  )
    return null;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function parsePlace(value: unknown): NotePlace | null {
  if (!isRecord(value) || typeof value["popped"] !== "boolean") return null;
  const raw = value["rect"];
  if (raw === undefined || raw === null) return { popped: value["popped"], rect: null };
  const rect = parseRect(raw);
  return rect === null ? null : { popped: value["popped"], rect };
}

function parsePlaces(value: unknown): NotePlaces | null {
  if (!isRecord(value)) return null;
  const places = new Map<number, NotePlace>();
  for (const [key, entry] of Object.entries(value)) {
    const place = ID_PATTERN.test(key) ? parsePlace(entry) : null;
    if (place !== null) places.set(Number(key), place);
  }
  return places;
}

export function loadPlaces(storage: StorageLike): NotePlaces {
  return readJson<NotePlaces>(storage, KEY, parsePlaces, new Map());
}

export function savePlaces(storage: StorageLike, places: NotePlaces): void {
  writeJson(storage, KEY, Object.fromEntries(places));
}

export function isPopped(places: NotePlaces, id: number): boolean {
  return places.get(id)?.popped === true;
}

export function rectOf(places: NotePlaces, id: number): Rect | null {
  return places.get(id)?.rect ?? null;
}

export function withPlace(places: NotePlaces, id: number, patch: Partial<NotePlace>): NotePlaces {
  const next = new Map(places);
  next.set(id, { popped: false, rect: null, ...places.get(id), ...patch });
  return next;
}

export function withoutPlace(places: NotePlaces, id: number): NotePlaces {
  if (!places.has(id)) return places;
  const next = new Map(places);
  next.delete(id);
  return next;
}

export function withoutAbsent(places: NotePlaces, present: ReadonlySet<number>): NotePlaces {
  const next = new Map([...places].filter(([id]) => present.has(id)));
  return next.size === places.size ? places : next;
}
