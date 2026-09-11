// Pure commit/cancel semantics for the inline rename editor (plan ui-text-and-focus
// REQ-14). No DOM here — render/rename.ts owns the button<->input swap and calls this to
// decide what (if anything) to send.
import type { Session } from "../protocol";

export type TitleCommand = { kind: "noop" } | { kind: "set"; title: string } | { kind: "clear" };

/** `input` is the raw field value at commit time (Enter or blur); `session` supplies the
 * wire `title` (already the daemon's precedence-resolved display title, kb:anchor/ws.session)
 * and `titleOverride` (used only to decide what "empty" means). Trims first, then: equal
 * to the current display title -> no request; empty -> a clear iff an override is
 * currently set, else no request; anything else -> a set of the trimmed string. */
export function titleCommand(input: string, session: Pick<Session, "title" | "titleOverride">): TitleCommand {
  const trimmed = input.trim();
  if (trimmed === (session.title ?? "")) return { kind: "noop" };
  if (trimmed === "") return session.titleOverride !== null ? { kind: "clear" } : { kind: "noop" };
  return { kind: "set", title: trimmed };
}
