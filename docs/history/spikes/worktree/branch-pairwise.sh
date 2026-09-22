#!/usr/bin/env bash
# Pairwise matrix among live branches (radar among concurrent worktrees): for every pair of
# remote branches whose tips are newer than <since>, merge-tree them against their merge
# base. Answers "how often do two in-flight branches collide with EACH OTHER (not develop)?"
# Usage: branch-pairwise.sh <repo> <target> <since YYYY-MM-DD>  → <repo>/../pairwise.tsv
set -u
R="$1"; T="$2"; SINCE="$3"; OUT="$(dirname "$R")/pairwise.tsv"; cd "$R" || exit 1
br=(); for b in $(git branch -r --no-merged "origin/$T" | grep -v HEAD | sed 's/^ *//'); do [ "$(git log -1 --format=%cs "$b")" \> "$SINCE" ] && br+=("$b"); done
printf 'a\tb\tbase\toverlap\tmt_status\tconflict_files\tmt_ms\n' > "$OUT"
for ((i=0;i<${#br[@]};i++)); do for ((j=i+1;j<${#br[@]};j++)); do a="${br[$i]}"; b="${br[$j]}"
  base=$(git merge-base "$a" "$b") || continue
  ov=$(comm -12 <(git diff --name-only "$base" "$a" | sort) <(git diff --name-only "$base" "$b" | sort) | grep -c . || true)
  t0=$(python3 -c 'import time;print(int(time.time()*1000))')
  if out=$(git merge-tree --write-tree --merge-base="$base" "$a" "$b" 2>/dev/null); then st=clean; cf="-"; else st=conflict; cf=$(echo "$out" | awk '/^[0-9]+ [0-9a-f]+ [123]\t/{print $NF}' | sort -u | tr '\n' ','); fi
  t1=$(python3 -c 'import time;print(int(time.time()*1000))')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${a#origin/}" "${b#origin/}" "${base:0:7}" "$ov" "$st" "${cf:--}" "$((t1-t0))" >> "$OUT"
done; done; echo "wrote $OUT (${#br[@]} branches)"
