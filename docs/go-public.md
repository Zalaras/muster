# Going public — run-through checklist

The ordered list to work through on the day `Zalaras/muster` flips from private to
public. Background and the reasoning behind each choice: `docs/history/design/open-sourcing.md`
and the `docs/history/spec-changelog.md` entry of 2026-09-04 (licence). This file is the *procedure*.

Items tagged **[script]** are applied by `scripts/go-public.sh`; everything else is by
hand. The script is dry-run by default — it prints every command and changes nothing
until run with `--yes`. It has **not** been run as of this writing.

Order matters in one place: on the free plan, rulesets and interaction limits are only
available on a public repo, so the visibility flip has to come first and the protection
steps immediately after. Nobody knows the repo exists yet, so the gap is not a real
exposure, but don't leave it open for a day.

## 1. Before the flip — by hand

- [x] `LICENSE` added (MIT, 2026-09-04).
- [x] Decide contribution policy — issues yes, PRs no (README § Issues and contributions,
      `.github/PULL_REQUEST_TEMPLATE.md`).
- [x] README: build-from-source snippet, Issue-button caveats (public, `gh auth login`).
- [x] Issue dialog in the app states the issue is public and goes out under the user's `gh` login.
- [x] GitHub Projects tab turned off (2026-09-04).
- [x] `CONTRIBUTING.md` added (2026-09-04) — GitHub links it above the new-issue and new-PR
      forms, which the PR template alone cannot reach.
- [x] `plans/` publishes as-is — Damian's call (2026-09-04), no skim wanted.
- [x] Delete the two junk root files, `a.png` and `session-manager-mockup.html` (done
      2026-09-04). `docs/research/claude-session-manager-handoff.md` **stays** — still referenced.
- [x] **Community Standards (Insights → Community Standards) — decided 2026-09-04.**
      Description ✓, README ✓, licence ✓, contributing ✓, PR template ✓, **security policy ✓**
      (`SECURITY.md`, routes reports to GitHub private vulnerability reporting — the script
      enables it, so no email address is published). **Deliberately skipped:** code of
      conduct (single-maintainer issue tracker; nothing to govern yet), issue templates (the
      dashboard's Issue button already attaches the structure a template would ask for),
      social preview image (cosmetic). Revisit only if a community actually forms.
- [x] Be aware: the existing releases (v0.7.x, v0.8.0 and later) become public at the
      flip, binaries included. The audit found nothing in them; nothing to do, just know it.
- [x] Tree clean, on `main`, pushed — the script refuses otherwise.

## 2. The flip — `scripts/go-public.sh --yes`

**Run 2026-09-10 (gh 2.100.0).** Two attempts: the first aborted at step 1 because gh 2.52.0
lacked `--accept-visibility-change-consequences` (nothing changed — upgrade gh, re-run);
the second flipped visibility and then hit `Repository has been locked` (HTTP 403) on the
ruleset POST — GitHub's brief post-flip lock. A third run seconds later went straight through
(step 1 is a no-op on a public repo). All ticked against the printed output:

- [x] **[script]** `gh repo edit --visibility public --accept-visibility-change-consequences`
- [x] **[script]** Ruleset `protect-main` on the default branch: block deletion and
      force-push. **Nothing else** — no required PRs, no required checks — because `/land`
      pushes squashes straight to `main` and `svu` cuts releases from that push.
- [x] **[script]** Actions: allowed actions restricted to GitHub-owned + verified creators
      (GoReleaser's action is verified); default workflow token stays read-only; fork-PR
      workflow runs require approval for first-time contributors (belt-and-braces — the
      only workflow triggers on push to `main`, which a fork PR cannot do).
- [x] **[script]** Private vulnerability reporting on (what `SECURITY.md`'s "Report a
      vulnerability" button needs); Dependabot alerts on; secret scanning + push protection
      on. **Not** Dependabot version-update PRs — no PRs accepted, and the pins are deliberate.
- [x] **[script]** Repo features: projects off, wiki off, discussions off,
      delete-branch-on-merge on.
- [x] **[script]** Topics set (`claude-code`, `tmux`, `go`, `macos`, `session-manager`,
      `developer-tools`).
- [x] **[script]** Prints the resulting settings for the record.

## 3. After the flip — by hand

- [x] Anonymous checks (2026-09-10, unauthenticated `curl`): repo API → `visibility: public`,
      `license: MIT`; `/security/policy` → 200; `releases/latest` → 200 and the v0.10.0 arm64
      archive downloads with no auth (5.0 MB). Dependabot alerts → 204 (on), fork-PR approval
      → `first_time_contributors`, selected actions → GitHub-owned + verified.
- [ ] By hand, Damian: the PR template appears on a test PR from a fork you then close; the
      Issue button in a running `musterd` still files (the token path is unchanged, but check).
- [x] README § Install: rewritten 2026-09-10 around `scripts/install.sh` — the `gh` fences
      are gone, and on Damian's instruction the pass covered the whole README (194 → 115
      lines). Homebrew was split out of that work and is still open (below).
- [x] `docs/history/design/open-sourcing.md` marked done; `SPEC.md` § 8 posture line → public since
      2026-09-10; spec-changelog entry (2026-09-10).
- [x] The `curl | sh` installer from #7 shipped 2026-09-10 (`scripts/install.sh`): the
      anonymous asset download this flip enabled is exactly what it rests on, and it
      verifies the release's published SHA-256.
- [ ] The **Homebrew tap** (GoReleaser `brews:` block) — split out on Damian's call and now
      its own `TODO.md` item. Unblocked by the flip (a public repo needs no private-tap
      token), just unscheduled.
- [ ] Optional: add `make check` as a CI job now that Actions minutes are free
      (SPEC 2026-08-3x CI entry deferred it pending open-sourcing).
