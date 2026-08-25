#!/usr/bin/env python3
"""Maintain plans/<plan>/orchestration-state.json for the orchestrate skill.

Usage (run from the project root):
  orch-state.py <plan> init [--step STEP]            create a fresh in-progress state
  orch-state.py <plan> done <step> --next STEP       mark <step> completed, move on
  orch-state.py <plan> retry <step>                  bump retry_counts[<step>]
  orch-state.py <plan> fail <step>                   append to failed_steps
  orch-state.py <plan> status <in-progress|blocked|completed> [--step STEP]
  orch-state.py <plan> reopen <step>                 resume: status in-progress, retry 0,
                                                     remove <step> from completed_steps
  orch-state.py <plan> show                          print the state

Every mutating command stamps updated_at and prints the resulting state.
"""
import argparse, datetime, json, pathlib, sys

STEPS = ["e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests",
         "e2e-validate", "review"]

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("cmd", choices=["init", "done", "retry", "fail", "status", "reopen", "show"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--step")
    ap.add_argument("--next")
    a = ap.parse_args()

    path = pathlib.Path("plans") / a.plan / "orchestration-state.json"
    if a.cmd == "init":
        if path.exists():
            sys.exit(f"{path} already exists — use reopen/status, not init")
        s = {"plan_name": a.plan, "status": "in-progress",
             "current_step": a.step or STEPS[0],
             "retry_counts": {k: 0 for k in STEPS},
             "completed_steps": [], "failed_steps": [],
             "started_at": now(), "updated_at": now()}
    else:
        if not path.exists():
            sys.exit(f"{path} not found — run init first")
        s = json.loads(path.read_text())
        if a.cmd == "show":
            print(json.dumps(s, indent=2)); return
        need = a.cmd in ("done", "retry", "fail", "reopen", "status")
        if need and not a.arg:
            sys.exit(f"{a.cmd} needs an argument")
        if a.cmd in ("done", "retry", "fail", "reopen") and a.arg not in STEPS:
            sys.exit(f"unknown step {a.arg!r}; one of {STEPS}")
        if a.cmd == "done":
            if not a.next:
                sys.exit("done needs --next STEP (use 'completed' after review)")
            if a.arg not in s["completed_steps"]:
                s["completed_steps"].append(a.arg)
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
        elif a.cmd == "reopen":
            s["status"] = "in-progress"
            s["current_step"] = a.arg
            s["retry_counts"][a.arg] = 0
            s["completed_steps"] = [x for x in s["completed_steps"] if x != a.arg]
        s["updated_at"] = now()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(s, indent=2) + "\n")
    print(json.dumps(s, indent=2))

if __name__ == "__main__":
    main()
