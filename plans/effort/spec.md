# Spec: Effort at launch and in the Focus header

**Plan**: effort
**Created**: 2026-10-15
**Features**: launch, focus, card-location, past-sessions, actions
**Touches**: usage — the status-line parsing that reads the effort key lives in its files; what usage does is unchanged
**Status**: Approved

## Goal

Let the developer choose a session's effort level when launching it, and see the effort the
session is actually running at, in brackets after the model in the Focus header — kept current
when `/effort` or `/model` changes it mid-session, and right on resumed sessions. Closes `TODO.md`
§ Issues "Add effort to launch options" ([#68](https://github.com/Zalaras/muster/issues/68)).

Today Muster neither sets nor shows effort; the only way to pick one is `/effort` inside Claude
Code after the session is up.

## Background & Context

Measured on Claude Code 2.1.300 by an interface probe on 2026-10-15 (commit `88eaf6dc`); these
records are the wire truth and beat Claude Code's docs:

- `kb:fact/effort-levels-per-model` — each model has its own default and level set. Haiku 4.5
  and Sonnet 4.5 have no effort (the status-line key is absent whatever the flag); the 5.x
  models take all five levels (Haiku 5.5 and Opus 5.5 default `medium`, Sonnet 5.5 and Fable 5.1
  `high`); Opus 4.5 offers only up to `high`, Sonnet 4.6 has no `xhigh`. A level the model
  doesn't offer is **clamped silently** — no warning, no error; only the status line shows what
  applied. The per-model lists come from a server-sent catalog, so they can change without a
  Claude Code release.
- `kb:fact/effort-flag-values` — `--effort` takes `low|medium|high|xhigh|max`, case-insensitive;
  an unknown value (including `auto`) warns on stderr and starts at the default rather than
  failing; `ultracode` is accepted as `xhigh` plus ultracode.
- `kb:fact/effort-changes-mid-session` — `/effort` changes the level at once with **no hook**;
  the status line is the only signal. A session keeps one chosen level across `/model`
  switches, and each model shows it clamped to its own set. `PreModelSwitch`/`PostModelSwitch`
  carry no effort.
- `kb:fact/effort-default-saved-per-model` — `/effort <level>` saves a per-model default that a
  launch with no `--effort` starts at; an explicit `--effort` overrides it; `/effort auto` clears
  it. So a flagless launch is only as predictable as the developer's last save for that model.
- `kb:fact/resume-does-not-restore-effort` — unlike model and mode
  (`kb:fact/resume-restores-model-and-mode-except-plan`), `--resume` does not bring effort back;
  `--effort` on a resume applies. Every `assistant` transcript line records its turn's
  `effort`.
- `kb:fact/status-line-effort-key` — the status line carries `effort: {level}` only while the
  model supports effort; a missing key means "no effort setting", not "unknown".

Settled decisions this rests on: `kb:adr/launch-form-seeds-model-and-permission-mode`,
`kb:adr/launch-hybrid-mru-directory-memory` (per-directory launch defaults),
`kb:adr/launch-resume-in-original-mode-else-default`,
`kb:adr/focus-model-never-truncates-name-blocks-give-way`,
`kb:adr/lifecycle-bind-model-display-name-is-id`. The model is shown only in the Focus header
today — not on rail cards or tiles — and effort follows it there only.

Behaviour this depends on: the launch dialog decides the claude argv and remembers each
directory's last launch choices (`kb:spec/launch`); the session's model name is kept from hooks
and the status line (`kb:spec/card-location`); both resume paths start Claude Code with
`--resume` (`kb:spec/actions`, `kb:spec/past-sessions`); the design system reserves amber for
Needs-Input and the banner/danger tokens for daemon-down and destructive actions
(`docs/design/design-system.md` §3), so the warning needs a token family of its own.

## Scope

**In Scope:**
- An Effort row in the launch dialog's New form, remembered per directory.
- The effort in the Focus header after the model, with a loading state.
- A launch-mismatch warning strip under the Focus header, and a new warning token family in the
  design system for it.
- Both resume paths (the Resume button and the Resume tab) bringing back the session's last
  effort.

**Out of Scope:**
- Greying out or disabling levels a model doesn't offer before launch (that would mean reading
  Claude Code's private model-catalog cache).
- Showing effort anywhere but the Focus header: rail cards, tiles, the Resume tab's list rows.
- Changing a session's effort from Muster after launch — that stays `/effort` in Claude Code.
- Any warning for a change made inside Claude Code (`/effort`, `/model`) or for a resume that
  comes back at a different level: that is Claude Code's behaviour, not Muster's to cover.
- Offering `auto` or `ultracode`.
- Undoing or managing what `/effort` saves to Claude Code's own settings.

## Requirements

1. **Choose at launch.** The New form has an Effort row of `default | low | medium | high |
   xhigh | max`, built like Model and Start in. `default` lets Claude Code decide; a level starts
   the session at that level when the model can take it.
2. **Remembered per directory.** A directory's last chosen effort is restored by Recent and when
   the dialog reopens there, as Model and Start in are; a directory with none starts on
   `default`.
3. **Shown in the Focus header.** The model is followed by the effort the session is actually
   running at, e.g. `Opus 5.5 (high)`. It reads `(…)` until Claude Code first reports an
   effort, and has no brackets when the model has no effort.
4. **Kept current.** A change made inside Claude Code — `/effort`, or `/model` to a model with
   different levels — shows in the header within a couple of seconds, with no warning.
5. **Launch-mismatch warning.** When the developer chose a level and the session's first report
   shows a different level, or no effort at all, a yellow warning strip appears under that
   session's Focus header, saying what was asked for and what the session got. While it shows,
   the effort in the header is tinted the same yellow; Dismiss removes the strip and returns the
   effort to its normal colour.
6. **Warning lifetime.** The warning belongs to its own session and stays until dismissed —
   across dashboard reloads, in every dashboard window, and across musterd restarts. Dismissing
   one session's warning leaves every other session's in place. A resume never raises one, and
   a `default` launch never does.
7. **Resume keeps effort.** The Resume button and the Resume tab both bring a session back at
   the effort it last ran at, as they do for model and mode; with nothing recorded, Claude Code
   decides.

Design: option A of `plans/effort/mockups/` (`opt-a-segmented.html`, chosen 2026-10-15) — the
Effort segmented row under Model; the strip in a new yellow warning token family, distinct from
amber's band and from the banner/danger tokens.

## Edge Cases & Considerations

- **No report yet.** Between launch and the first status-line post (a few seconds, or forever
  while the trust prompt blocks startup) the header reads `(…)` and no warning is raised. A
  session that ends without ever reporting shows no brackets.
- **Missed posts.** No hook carries effort, so a lost status-line post leaves the header stale
  until the next one corrects it. Daemon down: the header keeps its last-known level, as the
  model does.
- **Change before the first report.** If the developer runs `/effort` before the first post
  arrives, that post reflects their change and may raise a warning against the launch choice;
  accepted.
- **Model without effort.** A launch with a level on such a model (e.g. Haiku 4.5) warns "no
  effort setting"; the header shows the model with no brackets.
- **Clamping is silent in Claude Code** and per-model lists can change server-side without a
  release, so the check is always against what the session reports, never a table in Muster.
- **Resume with no recorded effort** (the model had none, or no turn completed) passes no effort.
- **An ended session** keeps an undismissed warning until it is dismissed or the session is
  removed; resuming it does not re-raise or clear it.
- **Real-binary cost.** E2E fakes Claude Code; any check against the real binary belongs to the
  canary, Haiku-only per the hard rules — so the effort-capable half is covered by the fact
  records, not a live test.

## Acceptance Criteria

- [ ] The New form shows an Effort row `default low medium high xhigh max`; `default` is selected for a directory with no remembered effort.
- [ ] Launching with a level starts Claude Code with that effort; launching with `default` passes none.
- [ ] Reopening the dialog on a directory, or picking it from Recent, restores the effort last launched there.
- [ ] The Focus header shows `<model> (…)` from launch until the first status-line report, then `<model> (<level>)`; a model with no effort shows `<model>` alone.
- [ ] A mid-session `/effort` or `/model` change shows the new level (or drops the brackets) in the header within 2 s, with no warning.
- [ ] Launching with a level the session doesn't come up at — clamped, or a model without effort — shows the yellow warning strip under that session's header, naming the requested and the actual level (or "no effort"), and tints the effort yellow.
- [ ] A matching launch, a `default` launch and any resume never show the strip.
- [ ] Dismiss removes the strip and un-tints the effort for that session only; another session's warning stays.
- [ ] An undismissed warning survives a dashboard reload, shows in a second dashboard window, and survives a musterd restart; a dismissed one stays gone through all three.
- [ ] The Resume button and a Resume-tab resume bring the session back at the effort it last ran at, and pass none when nothing was recorded.
- [ ] A session that ends without ever reporting shows no brackets.
- [ ] The warning tokens meet the design system's contrast rules in every theme.
- [ ] No E2E test launches a real `claude`; the real-binary behaviour is referenced through the new fact records.

## Feature Spec Delta

**launch** — becomes true:
- Effort is a segmented control of `default`, `low`, `medium`, `high`, `xhigh` and `max`; a level is passed to `--effort`, and `default` passes none, so Claude Code's own default applies (kb:fact/effort-levels-per-model, kb:fact/effort-default-saved-per-model).
- Model, Effort and Start in default to the directory's last-used values; clicking a Recent restores its last model, effort and mode.
- A launched level the session's first status-line report contradicts — clamped by the model or absent — raises the launch-mismatch warning `kb:spec/focus` shows.

**launch** — stops being true:
- "Model and Start in default to the directory's last-used values" (replaced above).
- "restoring its last model and mode" (replaced above).
- The spec is the longest of the five; `/plan-work` checks it stays under the 800-word body budget and trims if not.

**focus** — becomes true:
- The meta line ends with the model followed by its effort in brackets: `(…)` until the first status-line report, no brackets when the model has no effort or a dead session never reported one.
- A session launched at a level it did not come up at shows a warning strip under the mainhead, in the warning tokens, naming the requested and actual level, and tints the effort the same; Dismiss clears both for that session only, and until then the warning survives reloads, other windows and daemon restarts.

**focus** — stops being true:
- "and the model" as the meta line's last item (replaced above).

**card-location** — becomes true:
- The session's effort is the status line's `effort.level` from each post, null when the key is absent; no hook carries it, so a missed post leaves it stale until the next (kb:fact/effort-changes-mid-session).

**card-location** — stops being true:
- nothing

**past-sessions** — becomes true:
- Resuming a row runs `claude --resume <id> --permission-mode <mode>`, plus `--effort <level>` when the transcript's last assistant line recorded one (kb:fact/resume-does-not-restore-effort).

**past-sessions** — stops being true:
- The argv sentence naming only `--permission-mode` (replaced above).

**actions** — becomes true:
- Resume passes the session's last-known effort as `--effort`, and none when it never reported one (kb:fact/resume-does-not-restore-effort).

**actions** — stops being true:
- nothing

Outside the feature specs: `docs/design/design-system.md` §3 gains the warning token family
(not a state colour), with values for every theme.

## References

- `kb:fact/effort-levels-per-model`, `kb:fact/effort-flag-values`, `kb:fact/effort-changes-mid-session`, `kb:fact/effort-default-saved-per-model`, `kb:fact/resume-does-not-restore-effort`, `kb:fact/status-line-effort-key`, `kb:fact/slash-model-effort-write-user-settings`, `kb:fact/resume-restores-model-and-mode-except-plan`
- Mockups: `plans/effort/mockups/index.html`, chosen `opt-a-segmented.html`
- `TODO.md` § Issues → "Together — launching a session" → "Add effort to launch options" ([#68](https://github.com/Zalaras/muster/issues/68))
- `docs/design/design-system.md` §3 (state colours), §5 (banners, notices)
