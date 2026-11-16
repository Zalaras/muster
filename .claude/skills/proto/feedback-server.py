#!/usr/bin/env python3
"""Prototype feedback receiver (kb:adr/process-prototype-first-track), started by `make proto-run`.

  feedback-server.py serve  --port N --dashboard-port M --out <file.jsonl> --state-dir <dir>
  feedback-server.py inject --port N <built .html>...

`serve` listens on 127.0.0.1 only and takes the batches feedback-overlay.js posts from a
prototype's dashboard. Each batch becomes one JSON line in --out, one summary line in
<state-dir>/feedback-events.log (the file the session's Monitor tails), and `sent <n>` in
<state-dir>/feedback-status; the session writes `done <n>` there once the change is rebuilt and
the overlay offers a reload.

What a batch says reaches the session as the developer's words, so who may post is the whole
security of this file: a request is taken only when its Origin is the prototype dashboard's and
its Host is this listener's. A page on any other site cannot forge Origin from a browser, and a
rebound hostname fails the Host check. Bodies are capped and every string clipped.

`inject` adds the overlay's script tag to built pages, once; `make proto-web` runs it after
each dashboard build, in a proto/ tree only, so the shipped dashboard never carries it.
"""
import argparse, datetime, json, pathlib, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
MAX_BODY = 256 * 1024
MARK = "data-proto-feedback"

def inject(port, files):
    tag = f'<script src="http://127.0.0.1:{port}/overlay.js" defer {MARK}></script>\n'
    for f in files:
        p = pathlib.Path(f); text = p.read_text()
        at = text.rfind("</body>")
        if MARK in text or at < 0:
            continue
        p.write_text(text[:at] + tag + text[at:])

def clip(v, depth=0):
    """The posted value with every string, list and dict bounded, or None past the depth cap."""
    if isinstance(v, str):
        return v[:2000]
    if isinstance(v, (bool, int, float)) or v is None:
        return v
    if depth >= 5:
        return None
    if isinstance(v, list):
        return [clip(x, depth + 1) for x in v[:50]]
    if isinstance(v, dict):
        return {str(k)[:60]: clip(x, depth + 1) for k, x in list(v.items())[:30]}
    return None

def clean(payload):
    """A batch worth writing — a dict whose `notes` is a list of dicts each carrying a note — or None."""
    if not isinstance(payload, dict):
        return None
    data = clip(payload)
    notes = data.get("notes")
    if not isinstance(notes, list) or not notes:
        return None
    if not all(isinstance(n, dict) and isinstance(n.get("note"), str) and n["note"].strip() for n in notes):
        return None
    return data

def summary(batch, data):
    parts = []
    for n in data["notes"]:
        where = (n.get("element") or {}).get("selector") or "page"
        parts.append(f'"{" ".join(n["note"].split())[:120]}" @ {where[:80]}')
    return f"batch {batch}: {len(parts)} note(s) — " + " | ".join(parts)

class Handler(BaseHTTPRequestHandler):
    server_version = "proto-feedback"

    def log_message(self, *args):
        pass   # notes are the developer's text: nothing is echoed to a log

    def origin(self):
        o = self.headers.get("Origin", "")
        return o if o in self.server.origins and self.headers.get("Host", "") in self.server.hosts else None

    def reply(self, code, body=b"", ctype="application/json", origin=None, extra=()):
        self.send_response(code)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        for k, v in extra:
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        o = self.origin()
        if not o:
            return self.reply(403)
        self.reply(204, origin=o, extra=[("Access-Control-Allow-Methods", "GET, POST"),
                                         ("Access-Control-Allow-Headers", "Content-Type"),
                                         ("Access-Control-Max-Age", "600")])

    def do_GET(self):
        if self.headers.get("Host", "") not in self.server.hosts:
            return self.reply(403)
        if self.path == "/overlay.js":   # a script tag sends no Origin; the file holds nothing private
            return self.reply(200, (HERE / "feedback-overlay.js").read_bytes(), "text/javascript; charset=utf-8")
        o = self.origin()
        if self.path == "/status" and o:
            return self.reply(200, json.dumps(self.server.status()).encode(), origin=o)
        self.reply(403 if self.path == "/status" else 404)

    def do_POST(self):
        o = self.origin()
        if not o:
            return self.reply(403)
        if self.path != "/feedback":
            return self.reply(404, origin=o)
        try:
            size = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            size = 0
        if size <= 0 or size > MAX_BODY:
            return self.reply(413, origin=o)
        try:
            data = clean(json.loads(self.rfile.read(size)))
        except ValueError:
            data = None
        if data is None:
            return self.reply(400, origin=o)
        batch = self.server.record(data)
        self.reply(200, json.dumps({"batch": batch}).encode(), origin=o)

class Receiver(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, dashboard_port, out, state_dir):
        super().__init__(("127.0.0.1", port), Handler)
        port = self.server_address[1]
        self.hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        self.origins = {f"http://127.0.0.1:{dashboard_port}", f"http://localhost:{dashboard_port}"}
        self.out = pathlib.Path(out)
        self.state = pathlib.Path(state_dir)
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.state.mkdir(parents=True, exist_ok=True)
        self.events = self.state / "feedback-events.log"
        self.events.touch()
        self.lock = threading.Lock()
        self.batch = len(self.out.read_text().splitlines()) if self.out.exists() else 0

    def record(self, data):
        with self.lock:
            self.batch += 1
            row = {"batch": self.batch,
                   "received_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **data}
            with self.out.open("a") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            (self.state / "feedback-status").write_text(f"sent {self.batch}\n")
            with self.events.open("a") as f:
                f.write(summary(self.batch, data) + "\n")
            return self.batch

    def status(self):
        try:
            state, n = (self.state / "feedback-status").read_text().split()[:2]
            return {"state": state, "batch": int(n)}
        except (OSError, ValueError):
            return {"state": "idle", "batch": 0}

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--port", type=int, required=True)
    s.add_argument("--dashboard-port", type=int, required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--state-dir", required=True)
    i = sub.add_parser("inject")
    i.add_argument("--port", type=int, required=True)
    i.add_argument("files", nargs="+")
    a = ap.parse_args()
    if a.cmd == "inject":
        return inject(a.port, a.files)
    try:
        srv = Receiver(a.port, a.dashboard_port, a.out, a.state_dir)
    except OSError as e:
        sys.exit(f"feedback: cannot listen on 127.0.0.1:{a.port} ({e}) — the overlay will not send")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
