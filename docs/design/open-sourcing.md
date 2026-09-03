# Open-sourcing muster — audit & licence options

Research/discussion session 2026-09-02/03. The repo is currently **private**
(`gh repo view` → `PRIVATE`). Damian wants to publish it; nothing here is decided yet,
and **no `LICENSE` file has been added**. This note records the pre-flight audit and the
licence analysis so the next session doesn't re-derive them. When the licence is chosen,
it goes to `SPEC.md` per the usual changelog rule.

## Pre-flight audit (run 2026-09-02, `main` at c71a759)

Cleaner than expected. Findings, each verified by actually grepping rather than assumed:

- **No secrets in tracked files or git history.** `.mcp.json` holds only the context7
  HTTP endpoint, no token. `git log --all --diff-filter=A --name-only` surfaces no
  `.env`, `.pem`, credential or key files ever added.
- **No hardcoded personal paths in shipping code.** `/Users/damian` appears 34 times but
  only in test fixtures (`web/src/*.test.ts`, `internal/claudecode/settings_test.go`),
  plans, and docs. Cosmetic, not a leak — `web/src/render/crumbs.test.ts` in particular
  uses it deliberately to exercise path splitting on spaces.
- **`internal/claudecode/credentials_test.go` is safe** — every case injects a fake exec
  func (`tok-abc-123`), per D8; no test touches the real `security` binary or Keychain.
- **Dependency licences are all permissive** — MIT/BSD/Apache across `coder/websocket`,
  `creack/pty`, `rs/zerolog`, `modernc.org/sqlite`, `stretchr/testify`, `@xterm/*`,
  Vite, Vitest, Playwright, TypeScript. No copyleft to inherit, so no licence conflict
  whichever option below is chosen.

Blockers and chores, in order:

1. **A `LICENSE` file is the only hard blocker** — with none, nobody may legally use it.
2. Flip visibility:
   `gh repo edit --visibility public --accept-visibility-change-consequences`. Note this
   makes Actions minutes free and makes existing releases public.
3. `README.md` needs a build-from-source snippet (`nvm use && make build`) and a line on
   whether issues/PRs are accepted. It already sets expectations well otherwise
   ("Personal tool, macOS only, single user. Not a product.").
4. Three stray root files to delete, all tracked: `a.png`,
   `session-manager-mockup.html`, `claude-session-manager-handoff.md` — except the
   handoff doc is still the referenced research source (see §5 there and this file), so
   it stays; only the first two are junk.
5. **Decide about `plans/`.** 408 tracked files, much of it the internal process journal
   (specs, protocol contracts, review cycles, retros). Publishing it is probably the
   highest-value part of going public — very few people have a public record of a
   disciplined multi-agent pipeline — but skim `plans/*/review*.md` first for anything
   private.

**Unresolved, and Damian's to check, not Claude's:** the SPAN employment IP clause.
Employment contracts often assign IP created during employment, sometimes broadly enough
to cover personal projects in an adjacent space. The contracts are in
`~/Documents/03-Career/`; they have not been opened.

## Licence landscape — what comparable tools chose

Verified 2026-09-03 via the GitHub API and each repo's `LICENSE` file. This corrects
four rows of `claude-session-manager-handoff.md` §5, which had `agent-deck` as
unspecified "OSS", Nimbalyst as "free for individuals", Superset as bare
"source-available", and Vibe Kanban as "community-run".

| Tool | Repo | Licence | State (2026-09-03) |
|---|---|---|---|
| ccusage | `ccusage/ccusage` | MIT | 18.3k ★, active |
| ccstatusline | `sirmalloc/ccstatusline` | MIT | 12.7k ★, active |
| Claude Squad | `smtg-ai/claude-squad` | AGPL-3.0 | 8.4k ★, last push 2026-08-20 |
| Crystal (deprecated) | `stravu/crystal` | MIT | 3.1k ★, frozen Feb 2026 |
| Nimbalyst | `nimbalyst/nimbalyst` | MIT | 1.6k ★, active |
| agent-deck | `asheshgoplani/agent-deck` | MIT | 827 ★, active |
| Pane (Dcouple) | `dcouple/Pane` | AGPL-3.0 | 439 ★, active |
| ccmanager | `kbwo/ccmanager` | MIT | active |
| Vibe Kanban | `BloopAI/vibe-kanban` | Apache-2.0 | 28k ★, no push since 2026-04-24, 539 open issues |
| Superset | superset.sh | Elastic License 2.0 | source-available; no repo verified |

**Tally: MIT 6, AGPL-3.0 2, Apache-2.0 1, ELv2 1.** MIT is the convention in this space,
and the split is legible: the AGPL and ELv2 projects are the ones with commercial
ambitions (Dcouple Inc. advertises future paid team features), while every
individual-maintainer tool went MIT. Apache-2.0's single occurrence was a funded startup.

**Survivability is not a licence property.** Apache-2.0 *permitted* Vibe Kanban's
handover to the community after Bloop shut down in Apr 2026, but the handover produced
nothing — four months without a push and 539 open issues against 28k stars. Permissive
licensing is necessary but nowhere near sufficient for a project to outlive its author's
interest. Don't lean on this argument.

## MIT vs Apache-2.0 — open, genuinely thin

Both permissive; the differences only bite in individually-unlikely scenarios. AGPL-3.0
is **ruled out**: its distinguishing network-use clause never fires on a local
single-user daemon serving a localhost dashboard, and many companies forbid engineers
from even reading AGPL code — which works directly against the credential outcome below.

*For Apache-2.0:* §6 explicitly withholds trademark rights, and the name is the
separable asset in any scenario where someone wants to fold muster in — `Muster` was
deliberately chosen agent-CLI-agnostic (README), so a `ClaudeMuster` trademark problem
was already avoided. §5 gives a clean inbound licence for contributions while the
contribution question is still open. The patent grant plus retaliation clause is what
lets corporate legal wave it through without a review cycle.

*For MIT:* ecosystem fit — it's what the six comparable individual-maintainer tools
chose. 17 lines instead of ~200, and no `NOTICE` obligation for downstream users.

## Adjacent facts worth keeping

- **Publishing under a permissive licence does not give away the copyright.** It's a
  non-exclusive grant; Damian keeps ownership and stays free to relicense or sell later.
  What shrinks is what a buyer would pay for, since they can already fork it free.
- **The one irreversible step is merging a PR without a CLA.** After that the codebase
  is jointly owned and can't be relicensed without tracking down every contributor. A
  DCO (`Signed-off-by:`, Linux-kernel style) certifies provenance but grants **no**
  relicensing rights — only a CLA does. Don't set one up pre-emptively; decide when the
  first PR actually arrives. Apache-2.0 §5 covers the narrower "may I distribute this
  patch" question by itself.
- **Realistic outcomes if Anthropic (or anyone) took an interest**, most likely first:
  they build it themselves (no money changes hands, and a permissive licence lets them
  legitimately read the code); they hire Damian (the credential outcome — the repo, and
  `plans/` especially, is the artifact); an upstream donation with copyright assignment;
  and only rarely an actual acquisition, which at this size is copyright + trademark
  transfer plus a transition consulting agreement, priced on the maintainer and the
  users rather than the code. An acquisition would not require closing the source, and
  already-published versions stay free regardless.
