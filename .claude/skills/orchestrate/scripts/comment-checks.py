#!/usr/bin/env python3
"""comment-checks.py <role> | --gates — lines this branch adds must not carry comment classes review keeps filing.

Scope: lines added against `git merge-base main HEAD`, committed or not, plus untracked files,
limited to the paths the role owns:

  daemon-impl   cmd/ internal/, not *_test.go      plan IDs, review labels, dead references
  web-impl      web/src/, not *.test.ts            plan IDs, review labels, dead references
  daemon-tests  *_test.go under cmd/ internal/     review labels, dead references
  web-tests     web/src/**/*.test.ts               review labels, dead references
  e2e-specs     web/e2e/                           review labels, dead references
  --gates       both impl roles' paths             plan IDs, review labels (gates.sh runs dead-refs --all itself)

- **Plan IDs** (`REQ-4`, `INV-2`, `D8`, `W6`, `E5`) inside a production comment point into a
  plans/ directory a reader outside the branch can't follow. Test titles keep them by convention.
- **Review labels** (`Fix Attempt 1`, `browser Minor 1`, `review cycle 2`, soak runs) narrate how
  the branch got here, which `docs/conventions.md` § Comments rules out everywhere.
- **Dead references**: dead-refs.py over the role's changed files.

Why (settings-update-failures retro, 2026-09-25): the comments rule was reworded twice in the
impl agents, yet cycle 1 filed 45 plan-ID comments across 12 files and cycle 3 filed one the
cycle-2 fix wave had written, which cost a fourth review cycle. The SubagentStop hook runs this
per role when an agent finishes; gates.sh runs --gates as the backstop. Exit 0 clean, 1 on hits.
"""
import pathlib, re, subprocess, sys

ROLES = {
    "daemon-impl":  (("cmd/", "internal/"), lambda p: not p.endswith("_test.go"), True),
    "web-impl":     (("web/src/",), lambda p: not p.endswith(".test.ts"), True),
    "daemon-tests": (("cmd/", "internal/"), lambda p: p.endswith("_test.go"), False),
    "web-tests":    (("web/src/",), lambda p: p.endswith(".test.ts"), False),
    "e2e-specs":    (("web/e2e/",), lambda p: True, False),
}
CODE = (".go", ".ts", ".css", ".js", ".mjs", ".html")
PLAN_ID = re.compile(r"\b(?:REQ|INV)-\d+\b|\b[DWE]\d{1,2}\b")
REVIEW_LABEL = re.compile(r"\bFix Attempt \d|\b[Rr]eview cycle \d|\b(?:Critical|Major|Minor) \d+\b|\b[Ss]oak runs?\b")
COMMENT = re.compile(r"//(.*)$|/\*(.*)$|^\s*\*(.*)$|^\s*#(.*)$|<!--(.*)$")

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout

def added_lines(prefixes, keep):
    """(path, line_number, text) for every line added since the merge base, untracked files whole."""
    base = git("merge-base", "main", "HEAD").strip() or "HEAD"
    out, path, n = [], None, 0
    for line in git("diff", "--unified=0", base, "--", *prefixes).splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            n = int(re.search(r"\+(\d+)", line).group(1))
        elif line.startswith("+") and path:
            out.append((path, n, line[1:])); n += 1
    for path in git("ls-files", "--others", "--exclude-standard", "--", *prefixes).splitlines():
        try:
            out += [(path, i, t) for i, t in enumerate(pathlib.Path(path).read_text().splitlines(), 1)]
        except (OSError, UnicodeDecodeError):
            pass
    return [(p, i, t) for p, i, t in out if p.endswith(CODE) and keep(p)]

def comment_text(line):
    m = COMMENT.search(line)
    return next((g for g in m.groups() if g is not None), "") if m else ""

def check(roles, plan_ids, dead_refs):
    hits, files = [], set()
    for role in roles:
        prefixes, keep, ids = ROLES[role]
        for path, n, text in added_lines(prefixes, keep):
            files.add(path)
            if ids and plan_ids and PLAN_ID.search(comment_text(text)):
                hits.append(f"{path}:{n}: plan ID in a comment — state the why, or cite its kb:adr/ record: {text.strip()[:110]}")
            if REVIEW_LABEL.search(text):
                hits.append(f"{path}:{n}: review/fix-attempt label — say what the code guarantees, not how the branch got here: {text.strip()[:110]}")
    if dead_refs and files:
        r = subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name("dead-refs.py")), *sorted(files)],
                           capture_output=True, text=True)
        if r.returncode:
            hits.append((r.stdout + r.stderr).strip())
    return hits

def main():
    if len(sys.argv) != 2 or (sys.argv[1] not in ROLES and sys.argv[1] != "--gates"):
        sys.exit(f"usage: comment-checks.py <{'|'.join(ROLES)}> | --gates")
    arg = sys.argv[1]
    hits = check(["daemon-impl", "web-impl"], True, False) if arg == "--gates" else check([arg], True, True)
    for h in hits:
        print(h)
    if hits:
        print("docs/conventions.md § Comments: keep only a non-obvious why, citing kb:<type>/<slug> where a record exists.")
        sys.exit(1)
    print("comment-checks: clean")

if __name__ == "__main__":
    main()
