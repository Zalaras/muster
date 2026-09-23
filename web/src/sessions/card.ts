// Pure card view-model: everything a rail card displays, derived from a Session + "now",
// with no DOM involved (docs/conventions.md — "keep logic in pure modules separate from
// DOM code"). render/sessions.ts is the only consumer.
import { PREF_DEFAULTS, type RailActivity } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import { elapsedSeconds, formatEndedAge, formatTimer } from "./format";

export type NoteKind = "attention" | "failure" | "trust" | "no-signal" | "none";

/** REQ-11's card action-row contract: a live card offers only End; an ended card offers
 * Resume then Remove, in that order — the exact button label text (Testable UI Elements). */
export type CardAction = "End" | "Resume" | "Remove";

// Plan rail-card-improvements REQ-14: the two activity-line texts a card renders,
// `.activity.you` and `.activity.claude` — either or both may be `null`, which the
// renderer treats as "hide that line" (a null source renders no empty-prefix line).
export interface CardActivity {
  you: string | null;
  claude: string | null;
}

export interface CardViewModel {
  id: number;
  title: string;
  stateClass: string;
  badge: string;
  timer: string;
  repoLine: string;
  activity: CardActivity;
  noteKind: NoteKind;
  noteText: string | null;
  ended: boolean;
  actions: readonly CardAction[];
  // Plan order-sidebar (REQ-8/REQ-9): drives the pin button's aria-label/aria-pressed/
  // title and the card's `pinned` class — render/sessions.ts is the only consumer.
  pinned: boolean;
  // Plan rail-card-improvements (REQ-9): drives the card's `unread` class,
  // `data-unread="true"` and the `unreadLabel` aria-label suffix below.
  unread: boolean;
}

// design-system §3: the state->colour token map (applied via CSS class, never inline).
const STATE_CLASS: Record<Session["state"], string> = {
  started: "s-start",
  planning: "s-plan",
  working: "s-work",
  needs_input: "s-blocked",
  failed: "s-failed",
  idle: "s-idle",
};

// Testable UI Elements: "lowercase in DOM; CSS may uppercase".
const BADGE_TEXT: Record<Session["state"], string> = {
  started: "started",
  planning: "planning",
  working: "working",
  needs_input: "needs input",
  failed: "failed",
  idle: "idle",
};

/** The lowercase state word, shared with render/mainhead.ts and render/dead.ts (the
 * mainhead meta line and the dead surface's endbar/cap both quote "last state <state>"
 * from the same map the card badge uses — one source of truth for the word, never a
 * second copy). */
export function stateBadgeText(state: Session["state"]): string {
  return BADGE_TEXT[state];
}

/** REQ-17/W3: why a Resume control is disabled, shared with render/mainhead.ts and
 * render/dead.ts (their `title`/`aria-description`) so the two surfaces never drift into
 * different wording for the same `409 not_resumable` cause. `null` when there is no
 * reason to give (session is alive, or `claudeSessionId` is bound) — callers clear the
 * attribute in that case rather than writing an empty string over it. */
export function resumeDisabledReason(session: Session): string | null {
  if (session.claudeSessionId === null)
    return "Can't resume — this session never started a Claude conversation.";
  return null;
}

// ux-flows §1.4: "a session that has emitted no SessionStart within ~10s shows
// 'no signal yet'".
const NO_SIGNAL_THRESHOLD_SECONDS = 10;

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || path;
}

/** "repo / branch" with a worktree marker, or the directory basename when there's no
 * repo at all (design-system §5 card anatomy). */
function repoLine(session: Session): string {
  if (session.repo) {
    const branch = session.repo.branch ?? "—";
    const worktree = session.repo.isWorktree ? " (worktree)" : "";
    return `${session.repo.name} / ${branch}${worktree}`;
  }
  return basename(session.directory);
}

/** Plan line 287 / design-system §3: the attention note pairs the reason with a
 * since-timer that counts up and escalates — driven by `attention.since`, which is the
 * blocked-since truth the sort (sort.ts) orders on. This is deliberately not
 * `session.stateSince` (the card's top-row `.timer`): that resets on any re-entry into
 * `needs_input`, while `attention.since` is the fact that matters here. */
function attentionNote(session: Session, now: Date): string | null {
  if (!session.attention) return null;
  const reason =
    session.attention.reason === "permission" ? "needs your permission" : "waiting for your input";
  return `${reason} — ${formatTimer(session.attention.since, now)}`;
}

/** Honesty rule 4 (design-system §6): the raw token, verbatim, never switched on. */
function failureNote(session: Session): string | null {
  if (!session.failure) return null;
  return `${session.failure.error} — ${session.failure.message}`;
}

/** REQ-17 / ux-flows §1.4: trust-prompt vs. no-signal honesty note, derived client-side
 * from `firstLaunchHere` + elapsed time since launch — never guessed from pane content. */
function firstLaunchNote(session: Session, now: Date): { kind: NoteKind; text: string } | null {
  if (session.state !== "started" || session.claudeSessionId !== null) return null;
  if (session.firstLaunchHere) {
    return {
      kind: "trust",
      text: "first launch here — likely waiting on Claude Code's trust prompt",
    };
  }
  if (elapsedSeconds(session.createdAt, now) >= NO_SIGNAL_THRESHOLD_SECONDS) {
    return { kind: "no-signal", text: "no signal yet" };
  }
  return null;
}

// REQ-14: states in which a turn is currently open — `activityLines`'s "turn" mode shows
// the user's own prompt while one of these holds, the reply otherwise (including
// `failed`, edge case 25 — a failed turn is closed, not open).
const TURN_OPEN_STATES: ReadonlySet<Session["state"]> = new Set([
  "working",
  "planning",
  "needs_input",
]);

/** REQ-14: the pure mode -> text derivation for a card's two activity lines, extracted
 * from `buildCardViewModel` to keep it under Biome's complexity ceiling
 * (Implementation Notes) and so Vitest can cover the mode x state matrix with no DOM. A
 * `null` source (no prompt yet, no reply yet) yields a `null` line — the renderer hides
 * it rather than showing an empty-prefix line. */
export function activityLines(session: Session, mode: RailActivity): CardActivity {
  const prompt = session.lastPrompt;
  const reply = session.lastActivity;

  if (mode === "prompt") return { you: prompt ? `you: ${prompt}` : null, claude: null };
  if (mode === "reply") return { you: null, claude: reply ? `claude: ${reply}` : null };
  if (mode === "both") {
    return {
      you: prompt ? `you: ${prompt}` : null,
      claude: reply ? `claude: ${reply}` : null,
    };
  }
  // "turn": the open turn's prompt while one is open, else the last reply.
  if (TURN_OPEN_STATES.has(session.state)) {
    return { you: prompt ? `on: ${prompt}` : null, claude: null };
  }
  return { you: null, claude: reply ? `claude: ${reply}` : null };
}

/** REQ-9: the card's accessible name — the display title, with an ", unread" suffix
 * while `unread` holds and nothing otherwise. Extracted so `render/sessions.ts` and this
 * module share one wording rather than each spelling the suffix out. */
export function unreadLabel(title: string, unread: boolean): string {
  return unread ? `${title}, unread` : title;
}

export function buildCardViewModel(
  session: Session,
  now: Date,
  // Defaults to the pref's own default (PREF_DEFAULTS.railActivity, Minor 1) so every
  // existing call site (and Vitest fixture) that predates this plan keeps compiling and
  // rendering the same behaviour.
  mode: RailActivity = PREF_DEFAULTS.railActivity,
): CardViewModel {
  let noteKind: NoteKind = "none";
  let noteText: string | null = null;

  const attention = attentionNote(session, now);
  const failure = failureNote(session);
  const firstLaunch = firstLaunchNote(session, now);

  if (attention) {
    noteKind = "attention";
    noteText = attention;
  } else if (failure) {
    noteKind = "failure";
    noteText = failure;
  } else if (firstLaunch) {
    noteKind = firstLaunch.kind;
    noteText = firstLaunch.text;
  }

  const ended = !session.alive;
  // REQ-9: an ended card's timer reads "ended <age>" from `endedAt`, not the running
  // state timer — `stateSince` stopped advancing the instant reconcile/End froze `state`.
  // `session.endedAt` is only ever null while `alive:true` (kb:anchor/state.liveness's paired
  // invariant), so the fallback below is defensive-only and never observed in practice.
  const timer =
    ended && session.endedAt
      ? `ended ${formatEndedAge(session.endedAt, now)}`
      : formatTimer(session.stateSince, now);

  return {
    id: session.id,
    title: session.title ?? "untitled",
    stateClass: STATE_CLASS[session.state],
    badge: BADGE_TEXT[session.state],
    timer,
    repoLine: repoLine(session),
    activity: activityLines(session, mode),
    noteKind,
    noteText,
    ended,
    actions: ended ? ["Resume", "Remove"] : ["End"],
    pinned: session.pinned,
    unread: session.unread,
  };
}
