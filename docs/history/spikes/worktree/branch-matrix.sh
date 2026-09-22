#!/usr/bin/env bash
# Live branch matrix (radar tier 2 on a real repo): every remote branch not yet merged into
# <target> is classified against <target> with merge-tree: clean | conflict, plus how far
# behind it is and how old its tip is. Zero LLM, read-only. Output: <repo>/../branch-matrix.tsv
set -u
R="$1"; T="${2:-develop}"; OUT="$(dirname "$R")/branch-matrix.tsv"; cd "$R" || exit 1
printf 'branch\ttip_date\tahead\tbehind\tfiles_changed\tmt_status\tconflict_files\tmt_ms\n' > "$OUT"
for b in $(git branch -r --no-merged "origin/$T" | grep -v HEAD | sed 's/^ *//'); do
  base=$(git merge-base "origin/$T" "$b" 2>/dev/null) || continue
  ahead=$(git rev-list --count "$base..$b"); behind=$(git rev-list --count "$base..origin/$T")
  nf=$(git diff --name-only "$base" "$b" | wc -l | tr -d ' ')
  t0=$(python3 -c 'import time;print(int(time.time()*1000))')
  if out=$(git merge-tree --write-tree "origin/$T" "$b" 2>/dev/null); then st=clean; cf="-"; else st=conflict; cf=$(echo "$out" | awk '/^[0-9]+ [0-9a-f]+ [123]\t/{print $NF}' | sort -u | tr '\n' ','); fi
  t1=$(python3 -c 'import time;print(int(time.time()*1000))')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${b#origin/}" "$(git log -1 --format=%cs "$b")" "$ahead" "$behind" "$nf" "$st" "${cf:--}" "$((t1-t0))" >> "$OUT"
done; echo "wrote $OUT"
