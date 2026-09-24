// In-memory session store: snapshot replace + upsert merge (kb:anchor/ws.session-upsert —
// "sessionUpsert ... broadcast whole ... naturally loss-tolerant"). Pure state holder,
// no DOM; render/sessions.ts reads it out through features/rail.ts and features/tiles.ts,
// via app.ts's render frame.
import type { Session } from "../protocol/session";

export class SessionStore {
  private sessions = new Map<number, Session>();

  /** Replaces the whole store — the WS `snapshot` resync (no partial merge: a fresh
   * snapshot is authoritative and loss-tolerant by construction). */
  replaceAll(sessions: readonly Session[]): void {
    this.sessions = new Map(sessions.map((session) => [session.id, session]));
  }

  /** Applies one `sessionUpsert` — whole-object replace of that session only. */
  upsert(session: Session): void {
    this.sessions.set(session.id, session);
  }

  /** Applies one `sessionRemoved` (`kb:anchor/ws.session-removed`). A no-op if `id` is
   * unknown — a client that has never seen this id simply ignores it, not an error. */
  remove(id: number): void {
    this.sessions.delete(id);
  }

  values(): Session[] {
    return Array.from(this.sessions.values());
  }
}
