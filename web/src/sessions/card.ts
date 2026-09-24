// Pure card view-model: everything a rail card displays, derived from a Session + "now",
// with no DOM involved (docs/conventions.md — "keep logic in pure modules separate from
// DOM code"). render/sessions.ts is the main consumer; the action vocabulary below is
// also shared by every feature controller that dispatches a card/mainhead/tile action.
import { PREF_DEFAULTS, type RailActivity } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import { basename } from "../reader/paths";
import { ageAgo, elapsedSeconds, formatAge, formatTimer } from "./format";

export type NoteKind = "attention" | "failure" | "trust" | "no-signal" | "none";

/** kb:adr/actions-placement-mainhead-and-card-rows's card action-row contract: a live card
 * offers only End; an ended card offers Resume then Remove, in that order — the exact
 * button label text a test locator matches. */
export type CardAction = "End" | "Resume" | "Remove";

/** The action a card/mainhead/tile dispatches when its End/Resume/Remove/pin control
 * fires — `features/actions.ts`'s dispatcher owns what each one actually does (open a
 * confirm dialog, or call Resume/pin directly). One vocabulary for every surface that
 * offers these controls, so a dispatcher never has to translate between a render-side
 * label and its own action names. */
export type SessionAction = "end" | "resume" | "remove" | "pin";

// kb:adr/rail-activity-line-turn-aware-default-with-pref: the two activity-line texts a
// card renders, `.activity.you` and `.activity.claude` — either or both may be `null`, which
// the renderer treats as "hide that line" (a null source renders no empty-prefix line).
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
  // kb:adr/rail-whole-card-drag-drop-decides-pin: drives the pin button's
  // aria-label/aria-pressed/title and the card's `pinned` class — render/sessions.ts is the
  // only consumer.
  pinned: boolean;
  // kb:adr/rail-unread-marker-neutral-dot: drives the card's `unread` class,
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

// Lowercase in the DOM; CSS may uppercase for display.
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

/** Whether a Resume control should be enabled for this `claudeSessionId` — the one place
 * that rule is written, shared by every rail/mainhead/tile/dead-surface Resume button
 * (combined with `connected` where the caller has that too). */
export function canResume(claudeSessionId: string | null): boolean {
  return claudeSessionId !== null;
}

/** Why a Resume control is disabled, shared with render/mainhead.ts and render/dead.ts
 * (their `title`/`aria-description`) so the two surfaces never drift into different
 * wording for the same `409 not_resumable` cause. `null` when there is no reason to give
 * (session is alive, or `claudeSessionId` is bound) — callers clear the attribute in that
 * case rather than writing an empty string over it. */
export function resumeDisabledReason(session: Session): string | null {
  if (!canResume(session.claudeSessionId))
    return "Can't resume — this session never started a Claude conversation.";
  return null;
}

// ux-flows §1.4: "a session that has emitted no SessionStart within ~10s shows
// 'no signal yet'".
const NO_SIGNAL_THRESHOLD_SECONDS = 10;

/** "repo / branch" with a worktree marker, or the directory basename when there's no
 * repo at all (design-system §5 card anatomy). Exported for the callers that want only
 * this line (features/actionscopy.ts's dialog copy, render/mainhead.ts's meta line)
 * without building a whole `CardViewModel`. */
export function repoLine(session: Session): string {
  if (session.repo) {
    const branch = session.repo.branch ?? "—";
    const worktree = session.repo.isWorktree ? " (worktree)" : "";
    return `${session.repo.name} / ${branch}${worktree}`;
  }
  return basename(session.directory);
}

/** The mainhead's meta line: "repo/branch · model · `ended <age>` when dead" — reuses
 * `repoLine` above (the same repo-or-basename fallback the rail card shows) rather than
 * re-deriving it. render/mainhead.ts's only caller, features/focus.ts, passes the raw
 * session through; the text itself is a `sessions/` view-model like the rest of this
 * module, not something render/ composes. */
export function mainheadMeta(session: Session, now: Date): string {
  const parts: string[] = [repoLine(session)];
  if (session.model) parts.push(session.model.displayName);
  if (!session.alive && session.endedAt) parts.push(`ended ${ageAgo(session.endedAt, now)}`);
  return parts.join(" · ");
}

/** A dead tile's header timer: the bare age, deliberately WITHOUT the "ended" word — a
 * tile's dead-surface (mounted in the same subtree, unlike a rail card) already has an
 * `.endbar` that starts with "ended ", and two elements inside one tile both starting
 * with "ended " would make any `tile.getByText(/^ended /)` locator ambiguous (Playwright
 * strict-mode violation). Alive reads the same ticking timer `buildCardViewModel.timer`
 * uses. */
export function tileHeaderTimerText(session: Session, now: Date): string {
  if (session.alive) return formatTimer(session.stateSince, now);
  return session.endedAt ? formatAge(session.endedAt, now) : "";
}

/** A dead tile's footer age readout: "✕ ended <age> ago", or bare "✕ ended" while
 * `endedAt` is null (defensive; see `tileHeaderTimerText`'s sibling comment on the same
 * "ended " collision this "✕" prefix sidesteps). */
export function tileFooterAgeText(session: Session, now: Date): string {
  return session.endedAt ? `✕ ended ${ageAgo(session.endedAt, now)}` : "✕ ended";
}

/** The dead surface's endbar base text — "ended <age> · last state <badge> · last
 * captured screen, not a live client", or without the age clause when `endedAt` is null
 * (defensive; `endedAt`/`alive:false` are a paired invariant per
 * kb:anchor/state.liveness). render/dead.ts appends the pane's own "captured <age>"
 * clause afterwards, since that derives from `PaneState`, not `Session`. */
export function deadEndbarText(session: Session, now: Date): string {
  const age = session.endedAt ? ageAgo(session.endedAt, now) : null;
  const badge = stateBadgeText(session.state);
  return age
    ? `ended ${age} · last state ${badge} · last captured screen, not a live client`
    : `ended · last state ${badge} · last captured screen, not a live client`;
}

/** The dead surface's cap body prefix for a captured pane — "<age> · last state:
 * <badge>", or without the age clause when `endedAt` is null. render/dead.ts substitutes
 * its own text for the other two pane-fetch states ("no snapshot captured", "loading
 * last screen…"). */
export function deadCapPrefix(session: Session, now: Date): string {
  const age = session.endedAt ? ageAgo(session.endedAt, now) : null;
  const badge = stateBadgeText(session.state);
  return age ? `${age} · last state: ${badge}` : `last state: ${badge}`;
}

/** design-system §3: the attention note pairs the reason with a
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

/** kb:adr/launch-trust-prompt-never-auto-answered / ux-flows §1.4: trust-prompt vs.
 * no-signal honesty note, derived client-side from `firstLaunchHere` + elapsed time since
 * launch — never guessed from pane content. */
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

// kb:adr/rail-activity-line-turn-aware-default-with-pref: states in which a turn is
// currently open — `activityLines`'s "turn" mode shows the user's own prompt while one of
// these holds, the reply otherwise (a failed turn is closed, not open, so `failed` is not
// in this set).
const TURN_OPEN_STATES: ReadonlySet<Session["state"]> = new Set([
  "working",
  "planning",
  "needs_input",
]);

/** kb:adr/rail-activity-line-turn-aware-default-with-pref: the pure mode -> text
 * derivation for a card's two activity lines, extracted from `buildCardViewModel` to keep
 * it under Biome's complexity ceiling and so Vitest can cover the mode x state matrix with
 * no DOM. A `null` source (no prompt yet, no reply yet) yields a `null` line — the
 * renderer hides it rather than showing an empty-prefix line. */
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

/** kb:adr/rail-unread-marker-neutral-dot: the card's accessible name — the display title,
 * with an ", unread" suffix while `unread` holds and nothing otherwise. Extracted so
 * `render/sessions.ts` and this module share one wording rather than each spelling the
 * suffix out. */
export function unreadLabel(title: string, unread: boolean): string {
  return unread ? `${title}, unread` : title;
}

export function buildCardViewModel(
  session: Session,
  now: Date,
  // Defaults to the pref's own default (PREF_DEFAULTS.railActivity) for callers that read
  // everything but `activity` off the view-model — render/tiles.ts's `updateTileChrome`
  // never renders the activity lines, so it has no real mode to pass.
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
  // An ended card's timer reads "ended <age>" from `endedAt`, not the running
  // state timer — `stateSince` stopped advancing the instant reconcile/End froze `state`.
  // `session.endedAt` is only ever null while `alive:true` (kb:anchor/state.liveness's paired
  // invariant), so the fallback below is defensive-only and never observed in practice.
  const timer =
    ended && session.endedAt
      ? `ended ${formatAge(session.endedAt, now)}`
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
