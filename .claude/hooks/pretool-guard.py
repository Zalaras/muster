#!/usr/bin/env python3
"""PreToolUse guard (.claude/settings.json): the hard rules that used to be prose, refused at the
tool call. Reads the hook payload on stdin and prints a permissionDecision; exit 0 always, so the
only way to block is the JSON (onFailure: block covers a crash).

Bash — denied for every caller: `git stash`, a repo-local git identity (`git config user.*`).
Denied for subagents (payload carries agent_type): `git push`, `git add -A` / `git add .`,
`git reset --hard`, `git clean`, `git checkout -- <path>`, `git rebase` — the worker rules say why
(a shared index, files other agents hold); the main session keeps them for /land.

Edit/Write — ownership by role, from the file kinds each pipeline role may write (OWNERSHIP). The
main session (no agent_type) and roles not listed are unrestricted; every role may write its own
plans/<plan>/ logs. A denied call returns the rule as the reason so the agent reads it.

Tested by .claude/hooks/pretool_guard_test.py (python3 -m unittest, run by make check-kb? no —
run it by hand or let the pre-commit hook's kb check stay unrelated; see Makefile hooks-test).
"""
import json, re, sys, os, fnmatch

TEST_GO = ["*_test.go"]
TEST_TS = ["web/src/**/*.test.ts", "web/src/*.test.ts"]
E2E = ["web/e2e/**", "web/e2e/*"]
RENDER = ["web/render/**", "web/render/*"]
PLANS = ["plans/**", "plans/*"]
DOCS_FEATURES = ["docs/features/**", "docs/protocol.md", "docs/features/*"]
PLAN_FILE = ["plans/*/plan.md"]
PROTOCOL = ["docs/protocol.md"]

# role -> (allowed globs or None for "anything not denied", denied globs)
OWNERSHIP = {
    "daemon-impl": (None, TEST_GO + TEST_TS + E2E + RENDER + PLAN_FILE + PROTOCOL),
    "web-impl":    (None, TEST_GO + TEST_TS + E2E + RENDER + PLAN_FILE + PROTOCOL),
    "daemon-tests": (TEST_GO + PLANS + ["internal/**/testdata/**", "test/**"], PLAN_FILE),
    "web-tests":    (TEST_TS + PLANS, PLAN_FILE),
    "render-tests": (RENDER + PLANS, PLAN_FILE),
    "e2e-specs":    (E2E + PLANS + ["web/playwright.config.ts", "web/scripts/**"], PLAN_FILE),
    "review-work": (["plans/*/review.code.md"], []),
    "review-browser": (["plans/*/review.browser.md"], []),
    "review-maintainability": (["plans/*/review.maintainability.md"], []),
    "review-critic": (["plans/*/review.critic.md"], []),
    "doc-reconcile": (DOCS_FEATURES + PLANS + ["docs/diagrams/**", "docs/INDEX.md", ".claude/rules/**", "**/CLAUDE.md"], PLAN_FILE),
}

GIT = r"\bgit\b(?:\s+-[-\w=./]+(?:\s+[^-\s]\S*)?)*\s+"   # `git`, any leading options such as -C . or --no-pager, then the subcommand
BASH_DENY_ALL = [
    (GIT + r"stash\b", "git stash is never run here: it touches files other agents hold (worker rules § Git; CLAUDE.md hard rules)"),
    (GIT + r"config\b(?!.*--global)(?!.*--get)(?=.*\buser\.(name|email)\b)", "a repo-local git identity is never set: worktrees share .git/config (CLAUDE.md hard rules); pass -c user.name=… per command in a scratch repo"),
]
BASH_DENY_AGENT = [
    (GIT + r"push\b", "agents never push; /land pushes from the primary checkout (worker rules § Git)"),
    (GIT + r"add\s+(-A\b|--all\b|\.\s*$|\.\s)", "git add names changed files individually; never -A or . — the index is shared (worker rules § Git)"),
    (GIT + r"reset\s+--hard\b", "git reset --hard touches files other agents hold; edit your own change back instead (worker rules § Git)"),
    (GIT + r"clean\b", "git clean removes other agents' untracked work (worker rules § Git)"),
    (GIT + r"checkout\s+(--|\.)\s", "git checkout -- <path> discards edits other agents may hold; edit your own change back (worker rules § Git)"),
    (GIT + r"rebase\b", "agents never rebase a plan branch (worker rules § Git)"),
]

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": reason}}))

def match_any(path, globs):
    for g in globs:
        if fnmatch.fnmatch(path, g):
            return True
        # fnmatch's * crosses '/', so `plans/*/plan.md` and `web/src/**/*.test.ts` behave as intended
    return False

def rel(path, cwd):
    p = path
    if os.path.isabs(p):
        root = cwd or os.getcwd()
        try:
            p = os.path.relpath(p, root)
        except ValueError:
            return p
    return p.replace("\\", "/")

HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n(.*?)\n\s*\2\s*(?=\n|$)", re.S)
QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")

def strip_literals(cmd):
    """Drop heredoc bodies and quoted strings: a commit message, an echo or a file being written
    may *mention* a banned command; only a command runs it. Measured 2026-11-07: the first version
    denied the main session writing an ADR whose text named the rule."""
    cmd = HEREDOC.sub(lambda m: m.group(0).split("\n", 1)[0], cmd)
    return QUOTED.sub("''", cmd)

def check_bash(cmd, agent):
    cmd = strip_literals(cmd)
    for pat, why in BASH_DENY_ALL:
        if re.search(pat, cmd):
            return why
    if agent:
        for pat, why in BASH_DENY_AGENT:
            if re.search(pat, cmd):
                return why
    return None

def check_write(path, agent, cwd):
    if not agent or agent not in OWNERSHIP:
        return None
    p = rel(path, cwd)
    if p.startswith("../"):
        return None   # outside the tree (scratch repos, $TMPDIR): not this guard's business
    allowed, denied = OWNERSHIP[agent]
    if match_any(p, denied):
        return f"{agent} may not write {p}: that file kind belongs to another role (worker rules § Git; the plan's Affected Files owners)"
    if allowed is not None and not match_any(p, allowed):
        return f"{agent} may only write its own file kinds ({', '.join(allowed[:3])}…) and plans/<plan>/ logs; {p} is not one of them"
    return None

def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        return 0            # malformed payload: nothing to judge (onFailure: block guards a crash, not this)
    tool = d.get("tool_name") or ""
    agent = d.get("agent_type") or ""
    inp = d.get("tool_input") or {}
    cwd = d.get("cwd") or ""
    why = None
    if tool == "Bash":
        why = check_bash(inp.get("command") or "", agent)
    elif tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        why = check_write(inp.get("file_path") or inp.get("notebook_path") or "", agent, cwd)
    if why:
        deny(why)
    return 0

if __name__ == "__main__":
    sys.exit(main())
