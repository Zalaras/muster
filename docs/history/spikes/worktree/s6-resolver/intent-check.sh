#!/usr/bin/env bash
# S6 intent check — verify passing is necessary, not sufficient. Grep each resolved tree
# for BOTH tasks' intent. Prints pair/arm → intent flags.
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s6-resolver/pairs"
for p in p1 p2 p3; do for arm in ctx diff; do
  R="$D/$p/$arm"; [ -d "$R" ] || continue; cd "$R"
  case $p in
    p1) a=$(grep -q 'len(a) != len(b)' list.go && echo A-order-ok || echo A-order-LOST); b=$(grep -q '"af-south"' list.go && echo B-region-ok || echo B-region-LOST); c=$(grep -q '"ap-southeast"' list.go && echo A-region-ok || echo A-region-LOST); extra="$c";;
    p2) a=$(grep -q 'func Load(id int)' svc.go && ! grep -q 'func Fetch' svc.go && echo A-rename-ok || echo A-rename-LOST); b=$(grep -c 'Load([123])' svc.go | xargs -I{} sh -c '[ {} -ge 3 ] && echo B-3items-ok || echo B-3items-LOST'); extra="";;
    p3) a=$(! grep -q 'Legacy' flags.go && echo A-legacy-removed || echo A-legacy-KEPT); b=$(grep -q 'TestVerboseIgnoredWhenModern' flags_test.go && echo B-test-kept || echo B-test-DELETED); extra=$(grep -q 'var Verbose' flags.go && echo B-verbose-var-ok || echo B-verbose-var-gone);;
  esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$p" "$arm" "$a" "$b" "${extra:--}" "$(git log --oneline main..HEAD | wc -l | tr -d ' ') commits beyond main"
done; done
