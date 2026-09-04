# Going public — run-through checklist

The ordered list to work through on the day `Zalaras/muster` flips from private to
public. Background and the reasoning behind each choice: `docs/design/open-sourcing.md`
and the `SPEC.md` changelog entry of 2026-09-04 (licence). This file is the *procedure*.

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
- [ ] Skim `plans/*/review*.md` (and anything else under `plans/`) for private content.
      Damian's call that it publishes as-is; this is the last look.
- [x] Delete the two junk root files, `a.png` and `session-manager-mockup.html` (done
      2026-09-04). `claude-session-manager-handoff.md` **stays** — still referenced.
- [ ] README § Install: reword "The repo is private, so downloads go through `gh`". Once
      public, `gh` is still the supported path (`make install`), but the sentence's
      reason is wrong and a plain browser download also works.
- [ ] **Community Standards (Insights → Community Standards) — to discuss.** GitHub's
      checklist for a public repo: description ✓, README ✓, licence ✓, contributing ✓,
      PR template ✓, **code of conduct ✗, security policy ✗, issue templates ✗**,
      plus a repo-image (social preview) and topics (script sets topics). Decide which of
      the missing ones are wanted vs deliberately skipped; not urgent for the flip.
- [ ] Decide on `SECURITY.md` (part of the Community Standards item above). Recommended: three lines — where to report, no bounty,
      best-effort response. The daemon holds a `gh` token in memory and drives tmux, so a
      report is plausible. Not written yet because the contact address is Damian's to pick.
- [ ] Be aware: the existing releases (v0.7.x, v0.8.0 and later) become public at the
      flip, binaries included. The audit found nothing in them; nothing to do, just know it.
- [ ] Tree clean, on `main`, pushed — the script refuses otherwise.

## 2. The flip — `scripts/go-public.sh --yes`

Run the script once, read its output, then tick these off against what it printed:

- [ ] **[script]** `gh repo edit --visibility public --accept-visibility-change-consequences`
- [ ] **[script]** Ruleset `protect-main` on the default branch: block deletion and
      force-push. **Nothing else** — no required PRs, no required checks — because `/land`
      pushes squashes straight to `main` and `svu` cuts releases from that push.
- [ ] **[script]** Actions: allowed actions restricted to GitHub-owned + verified creators
      (GoReleaser's action is verified); default workflow token stays read-only; fork-PR
      workflow runs require approval for first-time contributors (belt-and-braces — the
      only workflow triggers on push to `main`, which a fork PR cannot do).
- [ ] **[script]** Dependabot alerts on; secret scanning + push protection on. **Not**
      Dependabot version-update PRs — no PRs accepted, and the pins are deliberate.
- [ ] **[script]** Repo features: projects off, wiki off, discussions off,
      delete-branch-on-merge on.
- [ ] **[script]** Topics set (`claude-code`, `tmux`, `go`, `macos`, `session-manager`,
      `developer-tools`).
- [ ] **[script]** Prints the resulting settings for the record.

## 3. After the flip — by hand

- [ ] Open the repo logged out (or in a private window) and confirm: LICENSE shows in the
      sidebar, the PR template appears on a test PR from a fork you then close, the Issue
      button in a running `musterd` still files (the token path is unchanged, but check).
- [ ] `docs/design/open-sourcing.md`: mark the visibility flip done; `SPEC.md` § 8
      posture line: "Repo public since <date>"; changelog entry.
- [ ] Now unblocked, plan together (TODO.md M5+): the Homebrew tap (GoReleaser `brews:`
      block) and the `curl | sh` installer from #7 — both needed the repo public.
- [ ] Optional: add `make check` as a CI job now that Actions minutes are free
      (SPEC 2026-08-3x CI entry deferred it pending open-sourcing).
