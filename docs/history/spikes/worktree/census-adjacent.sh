#!/usr/bin/env bash
# Adjacent-pair census (generalised from S5 census.sh): rebuild adjacent first-parent commits as parallel branches, classify textually.
# each pair textually. Zero LLM. Runs only inside the scratch clone.
set -u
R="${1:?usage: census-adjacent.sh <repo> [branch] [N]}"; BR="${2:-main}"
N="${3:-all}"; [ "$N" = all ] && N=$(( $(git -C "$R" rev-list --count --first-parent "$BR") - 1 ))   # exclude the root commit (no parent)
OUT="$(dirname "$R")/pairs.tsv"
WT="$(dirname "$R")/wt"
cd "$R" || exit 1
git worktree remove --force "$WT" 2>/dev/null; rm -rf "$WT"
C=($(git log --first-parent --format=%h -n "$N" "$BR" | tail -r))   # oldest→newest
printf 'idx\tolder\tnewer\tfiles_older\tfiles_newer\toverlap\tcherry\tconflict_files\tmerge_tree\tsubj_older\tsubj_newer\n' > "$OUT"
git worktree add -q --detach "$WT" "${C[0]}^" || exit 1
for ((i=0; i<${#C[@]}-1; i++)); do
  A="${C[$i]}"; B="${C[$((i+1))]}"; BASE="$A^"
  fa=$(git diff --name-only "$BASE" "$A" | sort); fb=$(git diff --name-only "$A" "$B" | sort)
  ov=$(comm -12 <(echo "$fa") <(echo "$fb") | grep -c . || true)
  git -C "$WT" checkout -q --detach "$BASE"
  mflag=""; [ "$(git rev-list --parents -n1 "$B" | wc -w)" -gt 2 ] && mflag="-m 1"   # merge commit: take its first-parent diff
  if git -C "$WT" cherry-pick --no-commit $mflag "$B" >/dev/null 2>&1 && ! git -C "$WT" diff --name-only --diff-filter=U | grep -q .; then
    cherry=clean; cf="-"
    git -C "$WT" commit -q -m "census B: $B" --no-verify
    Bref=$(git -C "$WT" rev-parse HEAD); git update-ref "refs/census/$i/B" "$Bref"; git update-ref "refs/census/$i/A" "$A"; git update-ref "refs/census/$i/base" "$(git rev-parse "$BASE")"
    if git merge-tree --write-tree "$A" "$Bref" >/tmp/mt.$$ 2>/dev/null; then mt=clean; git update-ref "refs/census/$i/M" "$(git commit-tree "$(head -1 /tmp/mt.$$)" -p "$A" -m "census merge $i")"; else mt=conflict; fi
  else
    cherry=conflict; cf=$(git -C "$WT" diff --name-only --diff-filter=U | tr '\n' ',' ); mt=n/a
    git -C "$WT" cherry-pick --abort 2>/dev/null || git -C "$WT" reset -q --hard
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "$A" "$B" "$(echo "$fa"|grep -c .)" "$(echo "$fb"|grep -c .)" "$ov" "$cherry" "${cf:--}" "$mt" "$(git log -1 --format=%s "$A" | cut -c1-50)" "$(git log -1 --format=%s "$B" | cut -c1-50)" >> "$OUT"
done
git worktree remove --force "$WT"; rm -f /tmp/mt.$$
echo "wrote $OUT"
