#!/usr/bin/env bash
# worktree.sh — the pipeline's worktree lifecycle (kb:adr/process-pipeline-runs-in-sibling-worktree).
# Every /orchestrate run happens in its own tree, ../<repo>-<plan> on branch plan/<plan>, created
# here BEFORE the session starts (a session cannot move into one: hooks and subagents key off the
# directory it started in). The primary checkout stays on main and is where /land merges.
#
#   make worktree NAME=<plan> [BASE=main]   add:   branch + tree + setup, from the primary
#   make worktree-setup                     setup: copy the gitignored local files, build (in a tree)
#   make worktree-rm NAME=<plan> [FORCE=1]  rm:    remove a tree; never the branch (/land does that)
#   make worktrees                          list:  every tree, and which plan branches touch the same files
#
# Deliberate choices:
#   - bash 3.2 (macOS), set -u; git plumbing only, no stash, no `git add -A`, no `git config user.*`
#     (worktrees share .git/config).
#   - `add` carries exactly the planning-session files onto the branch (orchestrate pre-flight 4a's
#     row 2, moved earlier). Anything else dirty in the primary stays there: a separate tree cannot
#     fold it into an agent's commit, which was the only reason 4a used to refuse.
#   - `rm` refuses a dirty tree, a tree whose branch holds content main lacks (the merge-tree test
#     /land uses — "unique commits" would refuse every squash-landed branch), or one a claude session still has as cwd.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # this checkout: the primary, or a tree
COMMON="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || { echo "worktree: $ROOT is not a git checkout" >&2; exit 2; }
PRIMARY="$(dirname "$COMMON")"
REPO="$(basename "$PRIMARY")"

die() { echo "worktree: $*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }
tree_for() { printf '%s/%s-%s\n' "$(dirname "$PRIMARY")" "$REPO" "$1"; }
valid_name() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }
registered_branch() {   # $1 = tree path → the branch checked out there, or nothing
  git -C "$PRIMARY" worktree list --porcelain | awk -v t="$1" '$1=="worktree"{cur=$2} $1=="branch" && cur==t {sub("refs/heads/","",$2); print $2}'
}
branch_checked_out_at() {   # $1 = branch → the tree path holding it, or nothing
  git -C "$PRIMARY" worktree list --porcelain | awk -v b="refs/heads/$1" '$1=="worktree"{cur=$2} $1=="branch" && $2==b {print cur}'
}
landed() {   # $1 = branch → 0 when merging it into main would change nothing
  [ "$(git -C "$PRIMARY" merge-tree --write-tree main "$1" 2>/dev/null | head -1)" = "$(git -C "$PRIMARY" rev-parse main^{tree})" ]
}
use_node() {   # the pinned Node for npm/make in a tree (gates.sh does the same)
  if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1
    (cd "$1" && nvm use >/dev/null 2>&1) && nvm use >/dev/null 2>&1
  fi
}

# --- add -----------------------------------------------------------------------------------
in_planning_set() {   # 4a row 2's list, plus what `make gen-kb` regenerates at plan approval
  case "$1" in
    plans/$NAME/*|docs/*|SPEC.md|TODO.md|CLAUDE.md|README.md|spikes/*|.claude/skills/*|.claude/agents/*|.claude/rules/*|*/CLAUDE.md) return 0 ;;
  esac
  return 1
}

cmd_add() {
  NAME="${1:-}"; BASE="${2:-main}"
  [ -n "$NAME" ] || die "usage: make worktree NAME=<plan> [BASE=main]"
  valid_name "$NAME" || die "name '$NAME' must match [A-Za-z0-9._-]+"
  [ "$ROOT" = "$PRIMARY" ] || die "run from the primary checkout ($PRIMARY), not a tree"
  [ "$(git symbolic-ref --short -q HEAD)" = "main" ] || die "the primary must be on main (it is on $(git symbolic-ref --short -q HEAD || echo 'a detached HEAD'))"
  git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || die "base '$BASE' is not a commit"
  [ -f "plans/$NAME/plan.md" ] || say "warning: no plans/$NAME/plan.md — fine for a scratch tree, wrong for a pipeline run"
  local BRANCH="plan/$NAME" TREE; TREE="$(tree_for "$NAME")"

  # Already there and registered for this branch → idempotent: setup again and stop.
  if [ -e "$TREE" ]; then
    [ "$(registered_branch "$TREE")" = "$BRANCH" ] || die "$TREE exists but is not the worktree for $BRANCH — remove or rename it first"
    say "$TREE already holds $BRANCH — re-running setup"
    cmd_setup "$TREE"; return
  fi
  local at; at="$(branch_checked_out_at "$BRANCH")"
  [ -z "$at" ] || die "$BRANCH is already checked out at $at"

  # Classify the primary's dirty files: the planning set travels, everything else stays.
  local planning=() stays=() line xy path
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    xy="${line:0:2}"; path="${line:3}"; path="${path##* -> }"
    if in_planning_set "$path"; then planning+=("$path"); else stays+=("$xy $path"); fi
  done < <(git status --porcelain)

  if [ ${#planning[@]} -gt 0 ]; then
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      git checkout -q "$BRANCH" || die "could not check out $BRANCH with the planning edits dirty — commit or move them, then retry"
    else
      git checkout -q -b "$BRANCH" || die "could not create $BRANCH"
    fi
    git add -- "${planning[@]}" \
      && git commit -q -m "docs($NAME): approved plan and planning-session edits" \
      || { git checkout -q main; die "committing the planning edits onto $BRANCH failed (left them dirty on main)"; }
    git checkout -q main || die "committed onto $BRANCH but could not return to main — you are on $BRANCH"
    say "committed ${#planning[@]} planning file(s) onto $BRANCH"
  fi

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git worktree add -q "$TREE" "$BRANCH" || die "git worktree add failed"
    if ! git -C "$TREE" merge -q --ff-only main >/dev/null 2>&1; then
      say "$BRANCH has diverged from main — resuming it as is (rebase or merge it yourself if you meant a fresh start)"
    fi
  else
    git worktree add -q -b "$BRANCH" "$TREE" "$BASE" || die "git worktree add failed"
  fi
  cmd_setup "$TREE"
  say ""
  say "ready: $TREE on $BRANCH — start the session THERE (cd '$TREE' && claude, or point Muster's launch dialog at it)"
  if [ ${#stays[@]} -gt 0 ]; then
    say "left in the primary, not part of this plan:"; printf '  %s\n' "${stays[@]}"
  fi
}

# --- setup ---------------------------------------------------------------------------------
cmd_setup() {
  local TREE="${1:-$ROOT}"
  [ "$TREE" != "$PRIMARY" ] || die "setup runs in a worktree, not the primary"
  [ -d "$TREE/.git" ] || [ -f "$TREE/.git" ] || die "$TREE is not a worktree"
  local SRC="$PRIMARY"
  say "setup: $TREE (from $SRC)"

  if [ -f "$SRC/.claude/settings.local.json" ]; then
    install -m 600 "$SRC/.claude/settings.local.json" "$TREE/.claude/settings.local.json" && say "  copied .claude/settings.local.json (0600)"
    grep -q -F "$SRC" "$TREE/.claude/settings.local.json" \
      && say "  warning: settings.local.json names the primary's path — a hook registered by path would post from the wrong tree"
  fi
  local f
  for f in .env .env.local; do
    [ -f "$SRC/$f" ] && { cp -p "$SRC/$f" "$TREE/$f" && say "  copied $f"; }
  done
  [ -d "$SRC/local" ] && [ ! -e "$TREE/local" ] && { cp -R "$SRC/local" "$TREE/local" && say "  copied local/"; }
  # TODO.md's "make check fails in a fresh clone or worktree": check-kb refs cite these captures.
  [ -d "$SRC/test/rig/captures" ] && [ ! -e "$TREE/test/rig/captures" ] \
    && { mkdir -p "$TREE/test/rig" && cp -R "$SRC/test/rig/captures" "$TREE/test/rig/captures" && say "  copied test/rig/captures/"; }

  use_node "$TREE"
  if [ ! -d "$TREE/web/node_modules" ]; then
    if [ -d "$SRC/web/node_modules" ] && cp -c -R "$SRC/web/node_modules" "$TREE/web/node_modules" 2>/dev/null; then
      say "  cloned web/node_modules (APFS clonefile)"
    else
      rm -rf "$TREE/web/node_modules"
      (cd "$TREE/web" && npm ci --no-audit --no-fund >/dev/null) && say "  npm ci (no clone source)" || die "npm ci failed in $TREE/web"
    fi
  fi
  if ! cmp -s "$SRC/web/package-lock.json" "$TREE/web/package-lock.json"; then
    (cd "$TREE/web" && npm ci --no-audit --no-fund >/dev/null) && say "  npm ci (package-lock.json differs from the primary)" || die "npm ci failed in $TREE/web"
  fi
  (cd "$TREE" && make -s web-build build >/dev/null) && say "  built: web-build build" || die "make web-build build failed in $TREE"
}

# --- rm ------------------------------------------------------------------------------------
cmd_rm() {
  local NAME="${1:-}"; [ -n "$NAME" ] || die "usage: make worktree-rm NAME=<plan> [FORCE=1]"
  valid_name "$NAME" || die "name '$NAME' must match [A-Za-z0-9._-]+"
  local BRANCH="plan/$NAME" TREE; TREE="$(tree_for "$NAME")"
  [ "$(registered_branch "$TREE")" = "$BRANCH" ] || die "$TREE is not the registered worktree for $BRANCH (make worktrees lists them)"
  local force="${FORCE:-}"
  if [ -n "$(git -C "$TREE" status --porcelain)" ]; then
    [ -n "$force" ] || die "$TREE is dirty — commit or discard there first, or FORCE=1 to discard"
  fi
  if ! landed "$BRANCH"; then
    [ -n "$force" ] || die "$BRANCH holds content main lacks (git diff main...$BRANCH) — /land it, or FORCE=1 to remove the tree anyway (the branch stays)"
  fi
  if lsof -a -d cwd -c claude -Fn 2>/dev/null | grep -qx "n$TREE"; then
    [ -n "$force" ] || die "a claude session still has $TREE as its cwd — end it first, or FORCE=1"
  fi
  if [ -n "$force" ]; then git -C "$PRIMARY" worktree remove --force "$TREE"; else git -C "$PRIMARY" worktree remove "$TREE"; fi \
    || die "git worktree remove failed"
  say "removed $TREE — branch $BRANCH kept (/land deletes it after the squash)"
}

# --- list ----------------------------------------------------------------------------------
cmd_list() {
  local path branch head dirty ahead land
  say "worktrees:"
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) path="${line#worktree }" ;;
      "HEAD "*) head="${line#HEAD }" ;;
      "branch "*) branch="${line#branch refs/heads/}" ;;
      "") [ -n "${path:-}" ] || continue
          dirty="$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
          if [ "${branch:-}" = "main" ] || [ -z "${branch:-}" ]; then ahead="-"; land="-"
          else ahead="$(git -C "$PRIMARY" rev-list --count "main..$branch")"; landed "$branch" && land=yes || land=no; fi
          printf '  %s  %s  %s  ahead=%s landed=%s dirty=%s\n' "$path" "${branch:-detached}" "${head:0:7}" "$ahead" "$land" "$dirty"
          path=""; branch=""; head="" ;;
    esac
  done < <(git -C "$PRIMARY" worktree list --porcelain; echo)

  # Radar: which plan branches (plus their trees' dirty files) touch the same paths.
  local branches=() b tmp; tmp="$(mktemp -d)"
  while IFS= read -r b; do branches+=("$b"); done < <(git -C "$PRIMARY" for-each-ref --format='%(refname:short)' 'refs/heads/plan/')
  for b in "${branches[@]}"; do
    { git -C "$PRIMARY" diff --name-only "main...$b"
      at="$(branch_checked_out_at "$b")"; [ -n "$at" ] && git -C "$at" status --porcelain | cut -c4- | sed 's/.* -> //'
    } | sort -u > "$tmp/${b//\//_}"
  done
  local i j found=0
  for ((i = 0; i < ${#branches[@]}; i++)); do
    for ((j = i + 1; j < ${#branches[@]}; j++)); do
      local common; common="$(comm -12 "$tmp/${branches[$i]//\//_}" "$tmp/${branches[$j]//\//_}")"
      [ -n "$common" ] && { found=1; say "overlap ${branches[$i]} ∩ ${branches[$j]}:"; printf '  %s\n' $common; }
    done
  done
  [ "$found" = 1 ] || say "no overlaps between plan branches"
  rm -rf "$tmp"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  add) cmd_add "$@" ;;
  setup) cmd_setup "$@" ;;
  rm) cmd_rm "$@" ;;
  list) cmd_list ;;
  *) echo "usage: worktree.sh add <name> [base] | setup [tree] | rm <name> | list" >&2; exit 2 ;;
esac
