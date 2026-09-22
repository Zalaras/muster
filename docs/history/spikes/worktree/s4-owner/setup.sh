#!/usr/bin/env bash
# S4 setup — scratch repo (outside ~/Documents, so no CLAUDE.md inheritance) with:
#   main: verify.sh + lib.sh          branch A: rewrites greet() to take a name
#   branch B (in worktree wt-B): adds a caller of greet() with the OLD signature
# Landing A then rebasing B conflicts textually in lib.sh AND semantically (B's call site).
set -eu
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s4-owner"; rm -rf "$D/repo" "$D/wt-B"; mkdir -p "$D"
git init -q "$D/repo"; cd "$D/repo"; git config user.email s4@x; git config user.name s4
cat > lib.sh <<'L'
#!/usr/bin/env bash
greet() { echo "hello"; }
L
cat > main.sh <<'M'
#!/usr/bin/env bash
. ./lib.sh
greet
M
cat > verify.sh <<'V'
#!/usr/bin/env bash
set -e; out=$(bash ./main.sh); [ "$out" = "hello world" ] || [ "$out" = "hello" ] || { echo "verify FAIL: $out"; exit 1; }; echo "verify OK"
V
chmod +x *.sh; git add -A; git commit -qm "init"; git branch -M main
git checkout -qb A; cat > lib.sh <<'L'
#!/usr/bin/env bash
# greet now requires a name
greet() { local who="$1"; echo "hello $who"; }
L
sed -i '' 's/^greet$/greet world/' main.sh; git commit -qam "A: greet takes a name; main passes world"
git checkout -q main; git worktree add -q -b B "$D/wt-B"; cd "$D/wt-B"
cat > lib.sh <<'L'
#!/usr/bin/env bash
greet() { echo "hello"; }
farewell() { echo "bye"; }
L
printf '#!/usr/bin/env bash\n. ./lib.sh\ngreet\nfarewell\n' > main.sh
cat > verify.sh <<'V'
#!/usr/bin/env bash
set -e; out=$(bash ./main.sh | tr '\n' ' '); case "$out" in "hello bye "|"hello world bye ") echo "verify OK";; *) echo "verify FAIL: $out"; exit 1;; esac
V
git commit -qam "B: add farewell and call it after greet"
if [ "${FAIL_VERIFY:-}" = 1 ]; then  # failure arm: verify can never pass (simulates an environment fault the owner cannot fix)
  cd "$D/repo"; git checkout -q main; printf '#!/usr/bin/env bash\necho "verify FAIL: integration lockfile drift (see CI)"; exit 1\n' > verify.sh; git commit -qam "main: verify hardened"; echo "FAIL_VERIFY arm: main's verify.sh always fails"
fi
echo "ready: repo=$D/repo (main, A)  owner worktree=$D/wt-B (B)"
