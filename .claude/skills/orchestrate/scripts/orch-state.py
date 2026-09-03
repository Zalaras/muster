#!/usr/bin/env python3
"""Maintain plans/<plan>/orchestration-state.json for the orchestrate skill.

Usage (run from the project root):
  orch-state.py <plan> init [--step STEP]            create a fresh in-progress state
  orch-state.py <plan> start <step>                  stamp step_started_at[<step>] (every spawn, fix re-spawns too)
  orch-state.py <plan> finish <step>                 stamp step_finished_at[<step>] only — for a fix-mode re-spawn that
                                                     reports; leaves completed_steps/current_step alone
  orch-state.py <plan> done <step> --next STEP       mark <step> completed, move on
  orch-state.py <plan> retry <step>                  bump retry_counts[<step>]
  orch-state.py <plan> fail <step>                   append to failed_steps
  orch-state.py <plan> status <in-progress|blocked|completed> [--step STEP]
  orch-state.py <plan> reopen <step>                 resume: status in-progress, retries kept (--reset-retries zeroes),
                                                     remove <step> from completed_steps
  orch-state.py <plan> closes [N ...]                set closes_issues (no N clears it)
  orch-state.py <plan> show                          print the state
  orch-state.py <plan> timings                       per-step wall-clock table (from step_finished_at)

Every mutating command stamps updated_at and prints the resulting state. `done` and `finish`
stamp step_finished_at[<step>] so a retro can see where the wall-clock went. `timings` reports
finish − start, so a fix-mode re-spawn needs both `start` (at spawn) and `finish` (when it
reports): fix-auto-mode-select called only `start` for its web-impl fix wave and the row read
-41m21s. Without a start stamp the fallback is the gap since the previous finish, which is
wrong for parallel steps.
"""
import argparse, datetime, json, pathlib, sys

STEPS = ["e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests",
         "e2e-validate", "review"]

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def parse(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)

def print_timings(s):
    """Wall-clock per step, in finish order. Duration = finish − start when the step has a
    `start` stamp (the normal case); otherwise the gap since the previous finish (started_at
    for the first), marked `~` because that fallback is wrong for parallel steps. Retries are
    folded into the step whose verdict ended them. Total is run start → last finish, not the
    column sum (parallel steps overlap). Prints a Markdown table the summary can paste."""
    stamps = s.get("step_finished_at") or {}
    starts = s.get("step_started_at") or {}
    if not stamps:
        print("no step_finished_at stamps (state predates timings, or no step is done yet)"); return
    prev = parse(s["started_at"])
    rows = sorted(stamps.items(), key=lambda kv: kv[1])
    print("| Step | Started (UTC) | Finished (UTC) | Wall-clock | Retries |")
    print("|---|---|---|---|---|")
    for step, ts in rows:
        t = parse(ts)
        if step in starts:
            st = parse(starts[step]); dur = fmt(t - st); started = starts[step][11:16]
        else:
            dur = "~" + fmt(t - prev); started = "—"
        prev = t
        print(f"| {step} | {started} | {ts[11:16]} | {dur} | {s['retry_counts'].get(step, 0)} |")
    total = parse(rows[-1][1]) - parse(s["started_at"])
    print(f"| **run** | {s['started_at'][11:16]} | {rows[-1][1][11:16]} | **{fmt(total)}** | |")
    if any(step not in starts for step, _ in rows):
        print("\n`~` = no start stamp; gap since the previous finish (unreliable for parallel steps).")

def fmt(td):
    m, sec = divmod(int(td.total_seconds()), 60)
    return f"{m}m{sec:02d}s"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("cmd", choices=["init", "start", "finish", "done", "retry", "fail", "status", "reopen",
                                   "show", "closes", "timings"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("rest", nargs="*", help="closes: any further issue numbers")
    ap.add_argument("--step")
    ap.add_argument("--next")
    ap.add_argument("--reset-retries", action="store_true",
                    help="reopen only: zero the step's retry count (a fresh budget the user granted)")
    a = ap.parse_args()

    path = pathlib.Path("plans") / a.plan / "orchestration-state.json"
    if a.cmd == "init":
        if path.exists():
            sys.exit(f"{path} already exists — use reopen/status, not init")
        s = {"plan_name": a.plan, "status": "in-progress",
             "current_step": a.step or STEPS[0],
             "retry_counts": {k: 0 for k in STEPS},
             "completed_steps": [], "failed_steps": [],
             "step_started_at": {}, "step_finished_at": {},
             "started_at": now(), "updated_at": now()}
    else:
        if not path.exists():
            sys.exit(f"{path} not found — run init first")
        s = json.loads(path.read_text())
        if a.cmd == "show":
            print(json.dumps(s, indent=2)); return
        if a.cmd == "timings":
            print_timings(s); return
        need = a.cmd in ("start", "finish", "done", "retry", "fail", "reopen", "status")
        if need and not a.arg:
            sys.exit(f"{a.cmd} needs an argument")
        if a.cmd in ("start", "finish", "done", "retry", "fail", "reopen") and a.arg not in STEPS:
            sys.exit(f"unknown step {a.arg!r}; one of {STEPS}")
        if a.cmd == "start":
            s.setdefault("step_started_at", {})[a.arg] = now()
        elif a.cmd == "finish":
            s.setdefault("step_finished_at", {})[a.arg] = now()
        elif a.cmd == "done":
            if not a.next:
                sys.exit("done needs --next STEP (use 'completed' after review)")
            if a.arg not in s["completed_steps"]:
                s["completed_steps"].append(a.arg)
            s.setdefault("step_finished_at", {})[a.arg] = now()
            s["current_step"] = a.next
        elif a.cmd == "retry":
            s["retry_counts"][a.arg] = s["retry_counts"].get(a.arg, 0) + 1
        elif a.cmd == "fail":
            s["failed_steps"].append({"step": a.arg, "at": now()})
        elif a.cmd == "status":
            if a.arg not in ("in-progress", "blocked", "completed"):
                sys.exit("status must be in-progress|blocked|completed")
            s["status"] = a.arg
            if a.step:
                s["current_step"] = a.step
            if a.arg == "completed":
                s["current_step"] = "completed"
        elif a.cmd == "closes":
            nums = ([a.arg] if a.arg else []) + list(a.rest)
            issues = []
            for n in nums:
                n = n.lstrip("#")
                if not n.isdigit():
                    sys.exit(f"closes takes issue numbers, got {n!r}")
                if int(n) not in issues:
                    issues.append(int(n))
            s["closes_issues"] = issues
        elif a.cmd == "reopen":
            s["status"] = "in-progress"
            s["current_step"] = a.arg
            if a.reset_retries:
                s["retry_counts"][a.arg] = 0
            s["completed_steps"] = [x for x in s["completed_steps"] if x != a.arg]
        s["updated_at"] = now()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(s, indent=2) + "\n")
    print(json.dumps(s, indent=2))

if __name__ == "__main__":
    main()
