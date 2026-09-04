#!/usr/bin/env bash
# Apply the GitHub repo settings for taking Zalaras/muster public.
# Procedure and rationale: docs/go-public.md. Dry-run by default: prints every command
# and changes nothing. Pass --yes to apply. Idempotent — safe to re-run after a partial run.
set -euo pipefail

REPO="Zalaras/muster"
APPLY=0
[[ "${1:-}" == "--yes" ]] && APPLY=1

run() {
  if (( APPLY )); then
    printf '\033[1m$ %s\033[0m\n' "$*"
    "$@"
  else
    printf '[dry-run] $ %s\n' "$*"
  fi
}
step() { printf '\n== %s ==\n' "$*"; }
die()  { printf 'go-public: %s\n' "$*" >&2; exit 1; }

# ---- preconditions (always checked, even in dry-run) ----------------------------------
step "preconditions"
command -v gh >/dev/null || die "gh not installed"
gh auth status >/dev/null 2>&1 || die "gh not logged in"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || die "not on main"
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean"
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "main not pushed (HEAD != origin/main)"
[[ -f LICENSE ]] || die "LICENSE missing"
for f in a.png session-manager-mockup.html; do
  [[ -e "$f" ]] && die "junk root file still present: $f (docs/go-public.md §1)"
done
echo "ok: on main, clean, pushed, LICENSE present, junk files gone"
echo "current visibility: $(gh repo view "$REPO" --json visibility -q .visibility)"
(( APPLY )) || echo "(dry-run — re-run with --yes to apply)"

# ---- 1. visibility ---------------------------------------------------------------------
step "1. visibility -> public"
run gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences

# ---- 2. ruleset: protect main from deletion and force-push ----------------------------
step "2. ruleset protect-main (block delete + force-push; nothing else)"
existing="$(gh api "repos/$REPO/rulesets" -q '.[] | select(.name=="protect-main") | .id' 2>/dev/null || true)"
ruleset_body='{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ]
}'
if [[ -n "$existing" ]]; then
  echo "ruleset already exists (id $existing) — leaving as is"
else
  run gh api --method POST "repos/$REPO/rulesets" --input - <<<"$ruleset_body"
fi

# ---- 3. actions ------------------------------------------------------------------------
step "3. actions: GitHub-owned + verified only; read-only token; approve first-time fork runs"
run gh api --method PUT "repos/$REPO/actions/permissions" \
  -F enabled=true -f allowed_actions=selected
run gh api --method PUT "repos/$REPO/actions/permissions/selected-actions" \
  -F github_owned_allowed=true -F verified_allowed=true
run gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
# Newer endpoint; tolerate absence rather than abort the run.
run gh api --method PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=first_time_contributors || echo "warn: fork-pr approval endpoint unavailable — set it in Settings > Actions > General"

# ---- 4. security -----------------------------------------------------------------------
step "4. security: private vuln reporting, dependabot alerts, secret scanning + push protection (no version-update PRs)"
# SECURITY.md points reporters at the Security tab's "Report a vulnerability" button; this is
# what makes that button exist. Public repos only, hence after step 1.
run gh api --method PUT "repos/$REPO/private-vulnerability-reporting"
run gh api --method PUT "repos/$REPO/vulnerability-alerts"
run gh api --method PATCH "repos/$REPO" --input - <<'JSON'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
JSON

# ---- 5. features + topics --------------------------------------------------------------
step "5. features: projects/wiki/discussions off, delete-branch-on-merge on; topics"
run gh repo edit "$REPO" --enable-projects=false --enable-wiki=false \
  --enable-discussions=false --delete-branch-on-merge
run gh repo edit "$REPO" --add-topic claude-code --add-topic tmux --add-topic go \
  --add-topic macos --add-topic session-manager --add-topic developer-tools

# ---- 6. report -------------------------------------------------------------------------
step "6. resulting settings"
if (( APPLY )); then
  gh repo view "$REPO" --json visibility,hasProjectsEnabled,hasWikiEnabled,hasDiscussionsEnabled,deleteBranchOnMerge,repositoryTopics
  gh api "repos/$REPO/rulesets" -q '.[] | {name, enforcement}'
  gh api "repos/$REPO/actions/permissions"
  gh api "repos/$REPO/actions/permissions/workflow"
  gh api "repos/$REPO" -q .security_and_analysis
  gh api "repos/$REPO/private-vulnerability-reporting"
  echo; echo "done — now work through docs/go-public.md §3"
else
  echo "(dry-run — nothing changed)"
fi
