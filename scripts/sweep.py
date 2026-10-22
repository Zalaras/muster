#!/usr/bin/env python3
"""sweep.py — the /fix sweep loop (kb:adr/process-fix-sweep-soft-batch-cap).

  scripts/sweep.py start  <sweep> [--parallel N]   run every pending batch, N at a time, land each
  scripts/sweep.py resume <sweep> [--parallel N]   failed → pending, then start
  scripts/sweep.py status <sweep>                  one line per batch
  scripts/sweep.py tick   <plan> <title>...        tick entries on main by title (what landing does)

Reads plans/<sweep>/sweep.json — the interview's output, committed on main before the loop starts —
and keeps plans/<sweep>/sweep-state.json, the runtime record (`/land --sweep` commits it).

Each batch is one fresh process, `claude -p "/fix-batch <sweep> <n>"`, in its own sibling
worktree ../<repo>-<sweep>-<n> on plan/<sweep>-<n>, so a batch never sees another's context. Its
result is plans/<sweep>-<n>/batch-result.json in that tree. Landing is this loop's job and serial:
squash the completed branch onto local main with the batch's subject, tick its entries into the
history file, remove the tree and the branch. Nothing here pushes — /land --sweep does, once.

Runs from the primary checkout, on main. The child environment drops every CLAUDE* and
MUSTER_SESSION variable: a session launched from inside a Claude session or a Muster-managed pane
would otherwise report its hooks as the parent's. A fresh tree is an untrusted workspace, which
ignores the project's permissions.allow list, so the tools are allowed on the command line
(kb:fact/print-mode-untrusted-workspace-loads-skills-but-not-allow-list); stdin is /dev/null
because print mode otherwise waits 3 s for piped input. Print mode stops background subagents after
10 min of idle waiting once the main turn ends, and a batch routinely waits longer than that on its
reviewers, so the child gets a longer ceiling (kb:fact/print-mode-background-wait-ceiling).
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
POLL_SECONDS = 30
LOCK_WAIT = "45m"          # a queued batch waits for another's Playwright sweep, never times out on it
BG_WAIT_CEILING_MS = "3600000"  # print mode's idle wait on background subagents; its 10 min default kills reviewers
ALLOWED_TOOLS = "Bash,Read,Edit,Write,Glob,Grep,Agent,ToolSearch,SendMessage,TaskStop,WebFetch"


def now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today():
    return dt.date.today().isoformat()


def git(*args, cwd=ROOT, check=True, capture=True):
    r = subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=capture)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {(r.stderr or r.stdout).strip()}")
    return r


def die(msg):
    sys.exit(f"sweep: {msg}")


# --- state ---------------------------------------------------------------------------------

def sweep_dir(sweep):
    return ROOT / "plans" / sweep


def load_sweep(sweep):
    p = sweep_dir(sweep) / "sweep.json"
    if not p.exists():
        die(f"{p} not found — /fix writes it")
    return json.loads(p.read_text())


def state_path(sweep):
    return sweep_dir(sweep) / "sweep-state.json"


def load_state(sweep, spec):
    p = state_path(sweep)
    if p.exists():
        return json.loads(p.read_text())
    repo = ROOT.name
    batches = []
    for b in spec["batches"]:
        name = f"{sweep}-{b['n']}"
        batches.append({
            "n": b["n"], "name": name, "entries": b["entries"], "work_type": b.get("work_type", ""),
            "status": "pending", "worktree": str(ROOT.parent / f"{repo}-{name}"),
            "branch": f"plan/{name}", "pid": None, "log": f"plans/{sweep}/batch-{b['n']}.log",
            "started_at": None, "finished_at": None, "subject": None, "closes": [],
            "landed_sha": None, "error": None, "question": None,
        })
    return {"sweep": sweep, "parallel": spec.get("parallel", 1), "started_at": now(),
            "updated_at": now(), "batches": batches}


def save_state(sweep, state):
    state["updated_at"] = now()
    state_path(sweep).write_text(json.dumps(state, indent=2) + "\n")


def entry_by_id(spec, eid):
    for e in spec["entries"]:
        if e["id"] == eid:
            return e
    die(f"sweep.json names no entry {eid}")


# --- pre-flight -----------------------------------------------------------------------------

def require_primary_on_main():
    if git("rev-parse", "--git-common-dir").stdout.strip() != ".git":
        die("run from the primary checkout, not a worktree")
    if git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() != "main":
        die("the primary must be on main")


def dirty_tracked():
    """Tracked files with changes in the primary. Landing refuses on any: a squash plus a reset
    on a dirty tree can take the developer's live edits with it."""
    out = git("status", "--porcelain", "--untracked-files=no").stdout
    return [ln[3:] for ln in out.splitlines() if ln.strip()]


def require_committed(sweep):
    p = f"plans/{sweep}/sweep.json"
    if git("ls-files", "--error-unmatch", p, check=False).returncode != 0:
        die(f"{p} is not committed on main — every batch tree branches from main and must see it")
    if git("diff", "--quiet", "--", p, check=False).returncode != 0:
        die(f"{p} has uncommitted changes — commit them first")


# --- processes ------------------------------------------------------------------------------

def child_env():
    env = {k: v for k, v in os.environ.items()
           if not k.startswith("CLAUDE") and k != "MUSTER_SESSION"}
    env["GATES_LOCK_WAIT"] = LOCK_WAIT
    env["CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS"] = BG_WAIT_CEILING_MS
    return env


def alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    # A reaped-by-nobody zombie answers kill 0; ps tells them apart.
    r = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], text=True, capture_output=True)
    return r.returncode == 0 and "Z" not in r.stdout


def spawn(sweep, state, b):
    name = b["name"]
    r = subprocess.run(["make", "worktree", f"NAME={name}"], cwd=ROOT, text=True, capture_output=True)
    if r.returncode != 0:
        b["status"], b["error"] = "failed", f"make worktree: {(r.stderr or r.stdout).strip()[-800:]}"
        b["finished_at"] = now()
        return None
    log = ROOT / b["log"]
    log.parent.mkdir(parents=True, exist_ok=True)
    fh = open(log, "a")
    fh.write(f"\n=== {now()} start batch {b['n']} in {b['worktree']}\n")
    fh.flush()
    proc = subprocess.Popen(
        ["claude", "-p", f"/fix-batch {sweep} {b['n']}",
         "--output-format", "stream-json", "--verbose",
         "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS],
        cwd=b["worktree"], env=child_env(), stdin=subprocess.DEVNULL, stdout=fh, stderr=fh,
        start_new_session=True)
    b.update(status="running", pid=proc.pid, started_at=now(), error=None, question=None)
    return proc


def read_result(b):
    p = pathlib.Path(b["worktree"]) / "plans" / b["name"] / "batch-result.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        return {"status": "failed", "error": f"batch-result.json unreadable: {e}"}


def finish(sweep, spec, state, b, returncode):
    b["finished_at"] = now()
    res = read_result(b)
    if res is None:
        b["status"] = "failed"
        b["error"] = f"no batch-result.json (claude exit {returncode}); see {b['log']}"
    elif res.get("status") != "completed":
        b["status"] = "failed"
        b["error"] = res.get("error")
        b["question"] = res.get("question")
    else:
        b["subject"], b["closes"] = res.get("subject"), res.get("closes", [])
        b["status"] = "completed"
        land(sweep, spec, state, b)
    save_state(sweep, state)


# --- landing --------------------------------------------------------------------------------

def branch_file(branch, path):
    r = git("show", f"{branch}:{path}", check=False)
    return r.stdout if r.returncode == 0 else ""


def land(sweep, spec, state, b):
    br = b["branch"]
    if dirty_tracked():
        b["error"] = "primary has uncommitted tracked changes — landing deferred; resume once it is clean"
        return
    review = branch_file(br, f"plans/{b['name']}/review.md")
    st = branch_file(br, f"plans/{b['name']}/orchestration-state.json")
    if "**Verdict**: approved" not in review or '"status": "completed"' not in st:
        b["status"], b["error"] = "failed", "branch is not review-approved and completed; not landed"
        return
    if not b["subject"] or not re.match(r"^(fix|perf|refactor|chore|docs|test)\([^)]+\): ", b["subject"]):
        b["status"], b["error"] = "failed", f"batch wrote no usable subject: {b['subject']!r}"
        return
    tree_before = git("rev-parse", "main^{tree}").stdout.strip()
    merged = git("merge-tree", "--write-tree", "main", br, check=False)
    if merged.returncode == 0 and merged.stdout.split("\n", 1)[0].strip() == tree_before:
        b["status"], b["error"] = "failed", "nothing to land: the branch adds nothing main lacks"
        return
    r = git("merge", "--squash", br, check=False)
    if r.returncode != 0:
        files = git("diff", "--name-only", "--diff-filter=U", check=False).stdout.split()
        git("reset", "--merge", check=False)
        b["status"], b["error"] = "failed", f"conflict with main in: {' '.join(files) or '(unknown)'}"
        return
    r = git("commit", "-q", "-m", b["subject"], check=False)
    if r.returncode != 0:
        git("reset", "--merge", check=False)
        b["status"], b["error"] = "failed", f"commit refused: {(r.stderr or r.stdout).strip()[-600:]}"
        return
    b["landed_sha"] = git("rev-parse", "--short", "HEAD").stdout.strip()
    titles = [entry_by_id(spec, eid)["title"] for eid in b["entries"]]
    ticked = tick_entries(b["name"], titles)
    if ticked:
        git("add", "--", "TODO.md", "docs/history/todo-done.md")
        git("commit", "-q", "-m", f"docs({b['name']}): tick {len(ticked)} backlog entr{'y' if len(ticked) == 1 else 'ies'}")
    b["status"] = "landed"
    # The tree and branch hold nothing main lacks now; the same test /land step 6 uses.
    after = git("merge-tree", "--write-tree", "main", br, check=False)
    if after.returncode == 0 and after.stdout.split("\n", 1)[0].strip() == git("rev-parse", "main^{tree}").stdout.strip():
        rm = subprocess.run(["make", "worktree-rm", f"NAME={b['name']}"], cwd=ROOT, text=True, capture_output=True)
        if rm.returncode == 0:
            git("branch", "-D", br, check=False)
        else:
            b["error"] = f"landed; worktree-rm refused: {(rm.stderr or rm.stdout).strip()[-300:]}"
    else:
        b["error"] = "landed; branch still differs from main — tree and branch kept for a look"


# --- ticking --------------------------------------------------------------------------------

ENTRY_RE = re.compile(r"^- \[ \] \*\*(?P<title>[^*]+)\*\*(?P<link> \(\[#\d+\]\([^)]+\)\))?")


def tick_entries(plan, titles):
    """Move each titled open entry from TODO.md to docs/history/todo-done.md under the same
    `## ` heading, ticked and stamped. Returns the titles it moved."""
    todo_p, done_p = ROOT / "TODO.md", ROOT / "docs" / "history" / "todo-done.md"
    lines = todo_p.read_text().split("\n")
    done = done_p.read_text().rstrip("\n").split("\n")
    moved = []
    for title in titles:
        start = section = None
        for i, ln in enumerate(lines):
            if ln.startswith("## "):
                section = ln[3:].strip()
            m = ENTRY_RE.match(ln)
            if m and m.group("title").strip() == title.strip():
                start, link = i, m.group("link") or ""
                break
        if start is None:
            print(f"  tick: no open entry titled {title!r} in TODO.md", file=sys.stderr)
            continue
        end = start + 1
        while end < len(lines) and not (lines[end].startswith("- [") or lines[end].startswith("#")):
            end += 1
        block = lines[start:end]
        while block and not block[-1].strip():
            block.pop()
        head = f"- [x] **{title}**{link} ✅ done {today()} (plan `{plan}`, via `/fix`)"
        block[0] = head + lines[start][len(f"- [ ] **{title}**{link}"):]
        del lines[start:end]
        # Place under the same heading in the history file, creating it at the end if absent.
        heading = f"## {section}"
        if heading in done:
            at = done.index(heading) + 1
            while at < len(done) and not done[at].startswith("## "):
                at += 1
            while at > 0 and not done[at - 1].strip():
                at -= 1
            done[at:at] = [""] + block
        else:
            done += ["", heading, ""] + block
        moved.append(title)
    if moved:
        todo_p.write_text("\n".join(lines))
        done_p.write_text("\n".join(done) + "\n")
    return moved


# --- commands -------------------------------------------------------------------------------

def run_loop(sweep, parallel):
    require_primary_on_main()
    require_committed(sweep)
    spec = load_sweep(sweep)
    state = load_state(sweep, spec)
    if parallel:
        state["parallel"] = parallel
    procs = {}
    save_state(sweep, state)
    stop = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: stop.update(now=True))
    while True:
        for b in state["batches"]:
            if b["status"] != "running":
                continue
            p = procs.get(b["n"])
            if p is not None:
                if p.poll() is not None:
                    finish(sweep, spec, state, b, p.returncode)
                    procs.pop(b["n"])
            elif not alive(b["pid"]):          # a batch an earlier loop started
                finish(sweep, spec, state, b, -1)
        running = [b for b in state["batches"] if b["status"] == "running"]
        pending = [b for b in state["batches"] if b["status"] == "pending"]
        if stop["now"]:
            print("sweep: stop requested; running batches continue on their own, resume later")
            break
        while len(running) < state["parallel"] and pending:
            b = pending.pop(0)
            p = spawn(sweep, state, b)
            if p is not None:
                procs[b["n"]] = p
                running.append(b)
            save_state(sweep, state)
            print(f"sweep: batch {b['n']} {b['status']}" + (f" — {b['error']}" if b["error"] else ""))
        if not running and not pending:
            break
        save_state(sweep, state)
        time.sleep(POLL_SECONDS)
    save_state(sweep, state)
    print_status(state)
    failed = [b for b in state["batches"] if b["status"] not in ("landed",)]
    return 1 if failed else 0


def print_status(state):
    print(f"sweep {state['sweep']} — parallel {state['parallel']}, updated {state['updated_at']}")
    print("| batch | entries | status | started | finished | landed | note |")
    print("|---|---|---|---|---|---|---|")
    for b in state["batches"]:
        note = b.get("question") or b.get("error") or ""
        print(f"| {b['n']} | {', '.join(b['entries'])} | {b['status']} | {b['started_at'] or ''} | "
              f"{b['finished_at'] or ''} | {b['landed_sha'] or ''} | {note} |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["start", "resume", "status", "tick"])
    ap.add_argument("name", help="sweep name (tick: plan name)")
    ap.add_argument("rest", nargs="*", help="tick: entry titles")
    ap.add_argument("--parallel", type=int)
    a = ap.parse_args()
    if a.cmd == "tick":
        require_primary_on_main()
        moved = tick_entries(a.name, a.rest)
        print(f"ticked {len(moved)}: " + "; ".join(moved))
        return 0 if len(moved) == len(a.rest) else 1
    if a.cmd == "status":
        spec = load_sweep(a.name)
        print_status(load_state(a.name, spec))
        return 0
    if a.cmd == "resume":
        spec = load_sweep(a.name)
        state = load_state(a.name, spec)
        for b in state["batches"]:
            if b["status"] == "failed" or (b["status"] == "running" and not alive(b["pid"])):
                b.update(status="pending", error=None, question=None, pid=None)
            if b["status"] == "completed":     # landed nothing last time (dirty primary) — try again
                b.update(status="running", pid=None)
        save_state(a.name, state)
    return run_loop(a.name, a.parallel)


if __name__ == "__main__":
    sys.exit(main())
