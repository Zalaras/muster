# Muster — protocol changelog

> **Frozen 2026-09-12.** Every bullet below is migrated: the `<!-- kb: … -->` marker at its end names the records it produced. Protocol changes now land as ADRs plus the edit to `docs/protocol.md` (`docs/features/<name>/contract.md` regenerates); nothing new is appended here.

History of `docs/protocol.md`: the milestone map the contract was first built against and the
per-plan changelog, newest last. `docs/protocol.md` itself is the current wire contract with no
provenance in it; `git log -- docs/protocol.md` has the diffs. Moved out of the protocol document
on 2026-09-11.

## Milestone map (what each milestone must implement of this contract)

- **M0**: §2 auth (both tokens), `/healthz`, `/auth`, static, `GET /api/state`, `/ws` <!-- kb:no-decision -->
  with `hello` + `snapshot` (empty sessions, null usage) + reconnect/banner behaviour,
  both ingest endpoints persisting enveloped/raw events with `seq` (no state machine —
  events land in the `event` table and are visible via `/api/state`'s future shape).
- **M1**: `POST /api/sessions`, `GET /api/repos`, `GET /api/browse`, the state machine <!-- kb:no-decision -->
  (§7), `sessionUpsert`, liveness polling, the envelope binding (§4.2).
- **M2**: terminal sockets (§6), `PUT /api/prefs` + `prefs` (view + density). <!-- kb:no-decision -->
- **M3**: `usage` message + `usage_sample` persistence + context in `sessionUpsert` + <!-- kb:no-decision -->
  title/model refresh from the status line.
- **M4**: `/resume` (§3.5), `/end` (§3.7), `DELETE` + `sessionRemoved` (§3.8, §5.5), <!-- kb:no-decision -->
  reconcile-on-start + shutdown policy (§7.5), pane snapshots (§3.4), resume → `idle`
  (§7.3) — plan `m4-reconcile`; canary unskip — plan `m4-canary`.

## Changelog

- **2026-09-11 — sections re-addressed by stable `kb:anchor` ids.** Every `##`/`###` section of <!-- kb: adr/knowledge-protocol-sections-addressed-by-anchor-ids -->
  `docs/protocol.md` now carries a `kb:anchor <id>` HTML comment on the line before its heading
  (id table: `tools/kb/anchors.tsv`), the numbers are dropped from the headings, and every
  citation in the tree reads `kb:anchor/<id>` instead of `§N.N` (validated by `go run ./tools/kb
  check`). Old §5.5 (`sessionUpsert` and `prefs`) is split into three messages, one heading each:
  `sessionUpsert`, `prefs`, `sessionRemoved`. The section numbers cited by the entries below refer
  to the numbering as it stood at the time. No wire change; no version bump.
- **2026-09-10 — protocol 2: `hello.claudeCode` is a verified range** (plan <!-- kb: adr/canary-verified-range-observed-not-pinned, adr/connection-installed-claude-classified-never-refused, adr/connection-protocol-bumps-only-on-shape-change -->
  `version-claude-interface`, closes #6). `{pinned, installed, drift}` → `{installed, floor,
  verified, status}`; `installed` null iff `status` is `unknown`; `floor`/`verified` always present.
  §3.12's snapshot allowlist follows. First version bump; the embedded dashboard ships with the
  daemon, so the only skewed client is an open tab, which gets "reload the dashboard".
- **2026-09-05 — §3.16 `POST /api/sessions/{id}/shell`; §6.1 `/ws/shell/{id}`; §3.8 also kills <!-- kb: adr/surfaces-shell-is-attach-target-not-session, adr/surfaces-shell-spawn-http-then-attach-ws, adr/surfaces-one-live-client-per-attach-target, adr/surfaces-shell-pane-carries-no-session-env -->
  the shell** (plan `plain-terminal-session`, Pre-v1, closes #21). A plain `$SHELL` tabbed to an
  existing session, in its directory, in a sibling tmux session `muster-<id>-shell`. Spawned
  lazily over HTTP (so its failure has a body the dashboard can render — a browser cannot read a
  pre-upgrade WS status), attached over a second terminal socket. The one-live-client law becomes
  per **attach target**, so a session's Claude and shell sockets are independent. Deliberately
  invisible to the data model: no SQLite row, no `kind` on the wire, **§5.3 Session unchanged**,
  no `sessionUpsert`; reconcile kills orphaned shells at startup rather than adopting them. The
  shell pane carries no `MUSTER_SESSION`, so a nested `claude` cannot bind to its parent. Additive
  (two new routes, no existing shape changed); no version bump.

- **2026-09-03 — §3.15 `PUT /api/sessions/{id}/title`; §5.3 `title` becomes the display title <!-- kb: adr/rename-muster-owned-title-override-wins -->
  and gains `titleOverride`** (plan `ui-text-and-focus`, Pre-v1, closes #10 with #16/#18/#19).
  A daemon-owned, nullable title override that wins over the status line's `session_name`;
  status posts never touch it; a hidden Claude-name change persists without a broadcast.
  Additive on the wire (one new nullable field, one new endpoint); no version bump.
- **2026-09-03 — §3.1/§3.2/§5.3/§7.2: `permissionMode` gains `"auto"`** (plan <!-- kb: adr/launch-permission-modes-offered-four-tabbed -->
  `fix-auto-mode-select`, closes #12). Claude Code 2.1.259 has a distinct `auto` mode
  (`--permission-mode auto`, hooks report `"auto"`); the launcher's "auto-accept" radio was
  accept-edits (`acceptEdits`) mis-labelled. `"default"` stays the wire value for what Claude
  Code now calls manual (measured identical on the wire). The 400 message names all four.
- **2026-09-02 — §3.14 `POST /api/sessions/{id}/locate`** (plan `file-drop-fix`, Pre-v1, <!-- kb: adr/drop-daemon-locates-original-never-stages -->
  closes #8). New endpoint resolving a dropped file's uploaded bytes to its original
  on-disk path via Spotlight then a session-directory walk, byte-compared; `404
  not_located` / `409 ambiguous` (with `paths`) / `413 too_large`. The daemon never stages
  a copy. No WS change; additive, no version bump.
- **2026-09-02 — §3.3/§5.2/§5.5/§5.6: theme pref and Claude theme family** (plan <!-- kb: adr/theme-pref-enum-follow-not-nullable, adr/theme-claude-theme-read-only-poll -->
  `new-ui-design-colors`, Pre-v1 Cleanup, closes #3). `PUT /api/prefs` gains `theme`
  (pattern-validated, otherwise opaque to the daemon; default `"follow"`); `snapshot` and
  `GET /api/state` gain `claudeTheme.family` (`light`/`dark`/`unknown`, always present); the
  `prefs` echo carries `theme`; new `claudeTheme` broadcast on family change only. The
  daemon reads Claude Code's own theme setting on a poll (`-claude-theme-poll`, default 10 s;
  `-claude-config-file` test seam) — read-only, knowledge confined to `internal/claudecode`.
  Additive; no version bump.
- **2026-08-31 — §2/§3.12/§3.13: issue capture** (plan `issue-capture`, Pre-v1 Cleanup). <!-- kb: adr/issue-payload-allowlist-never-dump, adr/issue-capture-then-file-server-held -->
  Two new UI endpoints let the dashboard file a GitHub issue carrying a strict-allowlist
  snapshot of muster's own state: `POST /api/issue/captures` takes and holds the snapshot,
  `POST /api/issues` files a held capture. §2 gains three error codes (`capture_expired`,
  `issue_auth_failed`, `issue_post_failed`). Additive: no WS message, no Session-object
  change, no state-machine change, no version bump — a filed issue is not muster state, so
  nothing is broadcast. The allowlist in §3.12 is the load-bearing part: prompt text, hook
  payload bodies, status-line JSON, pane captures, `title`, `lastActivity`,
  `failure.message`, `directory`, `branch`, the repo name, the `claudeSessionId` value and
  all account usage are excluded, because the repo may be open-sourced.

- **2026-08-30 — §3.1 request comment: `fable` preset** (plan `new-session-dialog`, <!-- kb: adr/launch-model-presets-passed-verbatim, fact/fable-model-alias -->
  Pre-v1 Cleanup). The launch dialog's Model control gains a `fable` preset (a measured
  alias in the installed Claude Code 2.1.251, `spikes/canary-fields.md`) — doc-only:
  `model` was already any non-empty string passed to `--model` verbatim. No wire change;
  no version bump.

- **2026-08-30 — §3.3/§3.10/§3.11/§5.3: user-owned rail order** (plan `order-sidebar`, <!-- kb: adr/rail-user-owned-manual-order-default, adr/rail-order-daemon-owned-per-session-fields -->
  Pre-v1 Cleanup). Session object gains `pinned` + `railPos` (invariant: pinned before
  unpinned, unique `railPos`; display-only columns). New `PUT /api/sessions/{id}/pin` and
  `PUT /api/sessions/order {ids, pinnedCount}`. `PUT /api/prefs` gains `railSort`
  (`manual` default | `attention`) — SPEC §2.1's needs-input-first order is now the rail's
  *attention* mode, the pinned block leads in both. Additive; no version bump.

- **2026-08-30 — §3.3/§3.9/§5.4/§5.5: per-model weekly usage** (plan `usage-model-bar`, <!-- kb: adr/usage-model-window-polled-from-oauth-api, adr/usage-keychain-token-read-only, adr/usage-masthead-one-selectable-model-window, fact/status-line-has-no-model-bucket -->
  Pre-v1 Cleanup). The Usage object gains `modelScoped[]` (+ `modelScopedAt`,
  `modelScopedError`, `modelScopedSource`), fed by musterd polling
  `GET https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth token read
  from the macOS Keychain (read-only) — the status line explicitly omits this window
  (measured 2.1.251). `PUT /api/prefs` gains `usageModel` (default `"Fable"`); new
  `POST /api/usage/refresh`. Additive; no version bump.

- **2026-08-28 — §4.2/§7.3: rebinding is monotonic** (plan `m4-hook-lifetime`, review cycle 1 <!-- kb: adr/ingest-monotonic-rebind -->
  Critical, Option B chosen by Damian; `plans/m4-hook-lifetime/decisions/monotonic-rebind/`).
  An enveloped event naming a claude id this session has already left (a reordered
  straggler, typically the `/clear` pair's own `SessionEnd(reason:"clear")`) is routed and
  applied but never rebinds backwards or resets the gauge/compaction count. Known
  residuals: a resume-back whose `SessionStart(source:"resume")` is lost keeps a stale
  `claudeSessionId` until the next bind event (state stays correct); and a cross-session id
  collision (one conversation posted under two `MUSTER_SESSION` values) leaves the
  bystander's `claudeSessionId` unattributed in the map — pre-existing on the
  `KindResumeBind` path, not introduced here. No wire change; no version bump.

- **2026-08-27 — §4/§4.1/§4.2/§7.3: all hooks are command wrappers; envelope-authoritative <!-- kb: adr/ingest-all-hooks-command-wrappers, adr/ingest-envelope-authoritative-binding -->
  binding** (plan `m4-hook-lifetime`). Muster writes one `type:"command"` entry per event
  pointing at `<dataDir>/hook.sh`, no `type:"http"` entries and no `allowedHttpHookUrls`;
  the wrapper exits 0 silently when `$MUSTER_SESSION` is unset or the daemon is down.
  Binding may occur on any enveloped event. Wire shapes on `/ingest/*` unchanged; no
  version bump.

- **2026-08-26 — m4-reconcile plan approved, delta merged.** §3.4 pane snapshot un-deferred <!-- kb: adr/actions-pane-snapshot-display-only, adr/lifecycle-reconcile-before-first-snapshot, adr/lifecycle-ended-rows-swept-next-start, adr/lifecycle-shutdown-leaves-sessions-running, adr/actions-remove-allowed-on-live-session -->
  (capture on every liveness tick, display only); §3.5 resume refined (reuses
  `muster-<id>`, state unchanged until the resume SessionStart, new `directory_missing`);
  new §3.7 `POST …/end` and §3.8 `DELETE /api/sessions/{id}`; §5.5 `sessionRemoved` is
  live; §7.5 settles reconcile (sweep `alive=0` rows at startup; keep newly-found-dead
  rows one lifetime) and the shutdown policy (`-on-exit`, default survive). §7.3's
  `source:"resume"` → `idle` row was already the contract — the code lands in `started`
  today and the plan fixes it. All additive; no version bump.

- **2026-08-25 — m4-hook-quoting plan approved, doc-only delta merged.** §4.2 records that <!-- kb: adr/ingest-shell-quote-at-write-boundary, fact/hook-commands-are-shell-lines -->
  `hooks[].command` / `statusLine.command` are `/bin/sh -c` command lines and that Muster
  single-quotes the wrapper-script paths it writes (recognising quoted and legacy bare
  forms on replace). No wire-shape change; no version bump.

- **2026-08-20 — v1 written** (M0 kickoff). Decisions made here, beyond what SPEC/ux-flows <!-- kb: adr/connection-commands-http-ws-push-only, adr/ingest-separate-token-in-url-path, adr/ingest-envelope-binds-never-cwd, adr/connection-whole-object-session-upserts, adr/lifecycle-alive-flag-not-a-state, adr/lifecycle-prompt-ordering-guards, adr/surfaces-one-live-client-per-session -->
  already fixed: commands-over-HTTP / push-only state WS; two tokens (UI cookie exchange,
  ingest URL token); single hook ingest URL with the envelope + `MUSTER_SESSION`/`TMUX_PANE`
  binding; raw events route by `session_id`, never guessed by `cwd`; whole-object
  `sessionUpsert`; client-side sorting; liveness as an orthogonal `alive` flag rather than
  a seventh state; resume lands in `idle`; `/clear` resets gauge+compactions but not
  identity; prompt-close guards for unordered streams; terminal-socket takeover with close
  code 4000. Open verifications noted in §4.2 (wrapper env visibility; `/clear`'s
  `SessionStart.source`).
- **2026-08-20 — §5.1 nullability clarified** (m0-skeleton plan approval): `hello`'s <!-- kb:no-decision -->
  `claudeCode.installed`/`drift` are `null` when the startup version check fails —
  rendered as *unknown*, not drift. Additive; no version bump.
- **2026-08-20 — §4.2 verified and corrected** (interface probe, against 2.1.237 — the <!-- kb: adr/launch-settings-local-json-not-settings-json, adr/lifecycle-alive-flag-not-a-state, fact/clear-mints-new-session-id -->
  installed binary had drifted past the 2.1.233 pin). Envelope env inheritance confirmed;
  config file settled as `.claude/settings.local.json`; `/clear` observed as
  `SessionEnd(reason:"clear")` → `SessionStart(source:"clear")` with a new `session_id`,
  so §7.3 gained a `source:"clear"` fast path and exempted `reason:"clear"` from the
  death-hint rule.
- **2026-08-22 — m1-sessions plan approved, delta merged.** New `GET /api/browse` (§3.6) <!-- kb: adr/launch-browse-via-daemon-not-native-chooser, adr/launch-model-presets-passed-verbatim, adr/launch-hybrid-mru-directory-memory -->
  replaces §3.2's "native chooser" note (wrong: browsers never reveal a picked folder's
  absolute path). `GET /api/repos` elements gain nullable `lastModel`/
  `lastPermissionMode` (per-directory launch defaults). `POST /api/sessions` error
  coverage clarified (400 for bad mode/model/directory; 500 for a corrupt
  `settings.local.json`); `model` accepts any non-empty string. Session objects gain
  `firstLaunchHere` (boolean, every object) and M1 value semantics are noted in §5.3.
  §7.3's status-line row is scoped to M3 (M1 persists and routes status posts, mutates
  nothing); §8's M1 row gains `/api/browse`, M3 gains the title/model refresh. All
  additive; no version bump.
- **2026-08-23 — m2-terminal plan approved, delta merged.** §6 refined: upgrade auth + <!-- kb: adr/surfaces-one-tmux-session-per-session, adr/surfaces-one-live-client-per-session, adr/actions-pane-snapshot-display-only -->
  pre-upgrade errors (401/404/409 `not_attachable`), resize clamps and the
  initial-resize rule, close codes `4000 superseded` / `4001 pane_ended` (EOF also
  nudges liveness), no server→client text frames. §3.3 `PUT /api/prefs` gains `density`
  ("2x2"|"3x2"), partial bodies, and the full-object `prefs` echo; `snapshot.prefs`
  gains `density`. §3.4 pane snapshots **deferred to M4** (mockup cards are
  metadata-only; the dead-session use case belongs with resume). §5.3 notes the new
  tmuxTarget format `muster-<id>:@<n>` — one tmux session per Muster session, because
  concurrent live tiles each need their own attach client. All additive; no version
  bump.
- **2026-08-23 — m3-gauges plan approved, delta merged.** §5.4 Usage gains nullable <!-- kb: adr/usage-sample-dedup-by-value, adr/usage-no-hydration-across-restart, adr/usage-masthead-model-from-freshest-sample, adr/rename-title-from-status-line-session-name -->
  `model` (freshest sample's; masthead readout) and precise semantics: record/broadcast
  only on bucket-value or model change (collapses the ~435 ms pair posts), no hydration
  across daemon restart (buckets null until the next post), samples only from routed
  posts carrying buckets + model together. §5.3 gains M3 value semantics (title/model
  refresh whenever the status post carries them; context adopted only when the payload's
  used-percentage is non-null, all-or-nothing, reset by `/clear`; status posts mutate
  nothing state-owned — INV-1). §7.3's status-line row resolved accordingly. All
  additive; no version bump.
- **2026-08-22 — §3.6 gains the browse root** (M1 review follow-up, user-approved): <!-- kb: adr/launch-browse-via-daemon-not-native-chooser -->
  `musterd -browse-root` (empty = the user's home directory) is `GET /api/browse`'s
  no-param default and the "Up" ceiling (`parent` null there); explicit absolute paths
  outside it remain browsable. Motivation: the E2E harness had to create scratch
  directories under the real `$HOME` to drive the Browse… flow. Additive; no version
  bump.
- **2026-09-03 — §7.2/§7.3/§7.4: subagent-marked events are never stragglers; turn activity <!-- kb: adr/lifecycle-subagent-marked-events-not-stragglers -->
  clears `attention` and `failure`** (plan `claude-status-fixes`, closes #14, #15, #20).
  Measured on 2.1.259: a background subagent's `PreToolUse`/`PostToolUse`/`PermissionRequest`
  carry the parent turn's `prompt_id` plus an agent marker and arrive after the parent's
  `Stop`; the closed-prompt guard now lets marked events through (→ `ACTIVE` /
  `needs_input`) without reopening the prompt, while unmarked stragglers stay inert.
  `Stop.background_tasks` is deliberately not a state input. Every transition into `ACTIVE`
  now enforces §5.3's "non-null iff" rules for `attention` and `failure`, which the
  turn-activity row previously left stale. Semantics only; no wire shape changes.
- **2026-09-10 — §3.3 `updateCheck`; §3.17 `POST /api/update/apply`; §3.18 <!-- kb: adr/update-check-pref-governs-checking-only, adr/update-check-runs-in-daemon-daily, adr/update-trust-root-minisign-signed-checksums, adr/update-restart-is-in-place-reexec-not-shutdown -->
  `GET /api/update/restart-impact`; §5.2 `snapshot.update`; §5.7 `update`** (plan
  `auto-update`). One boolean pref, default on, governs checking only; apply is always explicit
  (button or `musterd -update`) and verified by a minisign signature on `checksums.txt` plus the
  archive's SHA-256; `restart:true` re-execs in place without touching a session. Additive; no
  version bump.
