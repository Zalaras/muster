"""Unit tests for feedback-server.py: who may post, what is written, and the one-time inject.
Run by `make hooks-test`."""
import http.client, importlib.util, json, pathlib, tempfile, threading, unittest
spec = importlib.util.spec_from_file_location("fb", pathlib.Path(__file__).with_name("feedback-server.py"))
fb = importlib.util.module_from_spec(spec); spec.loader.exec_module(fb)

DASH = 8799
GOOD = {"notes": [{"n": 1, "note": "make this smaller", "element": {"selector": "#mainhead > span.name"}}], "url": "http://127.0.0.1:8799/"}

class Server(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = pathlib.Path(self.tmp.name)
        self.out, self.state = d / "plans" / "x" / "prototype-feedback.jsonl", d / "state"
        self.srv = fb.Receiver(0, DASH, self.out, self.state)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); self.tmp.cleanup()

    def call(self, method, path, body=None, origin=f"http://127.0.0.1:{DASH}", host=None, length=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Host": host or f"127.0.0.1:{self.port}"}
        if origin:
            headers["Origin"] = origin
        raw = json.dumps(body).encode() if body is not None else None
        if raw is not None:
            headers["Content-Type"] = "application/json"
        if length is not None:   # a claimed size, so the too-large case needs no large body
            headers["Content-Length"] = str(length)
        c.request(method, path, body=raw, headers=headers)
        r = c.getresponse(); data = r.read(); c.close()
        return r.status, data, r.getheader("Access-Control-Allow-Origin")

    def test_a_batch_from_the_dashboard_is_written(self):
        status, data, acao = self.call("POST", "/feedback", GOOD)
        self.assertEqual((status, json.loads(data), acao), (200, {"batch": 1}, f"http://127.0.0.1:{DASH}"))
        row = json.loads(self.out.read_text().splitlines()[0])
        self.assertEqual((row["batch"], row["notes"][0]["note"]), (1, "make this smaller"))
        self.assertEqual((self.state / "feedback-status").read_text(), "sent 1\n")
        self.assertIn('batch 1: 1 note(s) — "make this smaller" @ #mainhead > span.name', (self.state / "feedback-events.log").read_text())
        self.assertEqual(json.loads(self.call("GET", "/status")[1]), {"state": "sent", "batch": 1})
        self.assertEqual(json.loads(self.call("POST", "/feedback", GOOD)[1]), {"batch": 2})

    def test_other_origins_and_hosts_are_refused(self):
        for origin in ("http://evil.example", "http://127.0.0.1:8765", f"https://127.0.0.1:{DASH}", None):
            self.assertEqual(self.call("POST", "/feedback", GOOD, origin=origin)[0], 403, origin)
        self.assertEqual(self.call("POST", "/feedback", GOOD, host=f"evil.example:{self.port}")[0], 403)
        self.assertEqual(self.call("OPTIONS", "/feedback", origin="http://evil.example")[0], 403)
        self.assertEqual(self.call("GET", "/status", origin="http://evil.example")[0], 403)
        self.assertFalse(self.out.exists())

    def test_bad_bodies_are_refused(self):
        for body in ({}, {"notes": []}, {"notes": [{"note": "  "}]}, {"notes": "x"}, [1]):
            self.assertEqual(self.call("POST", "/feedback", body)[0], 400, body)
        self.assertEqual(self.call("POST", "/feedback", GOOD, length=fb.MAX_BODY + 1)[0], 413)
        self.assertFalse(self.out.exists())

    def test_strings_are_clipped_and_the_overlay_is_served(self):
        self.call("POST", "/feedback", {"notes": [{"note": "y" * 5000}]})
        self.assertEqual(len(json.loads(self.out.read_text())["notes"][0]["note"]), 2000)
        status, data, _ = self.call("GET", "/overlay.js", origin=None)
        self.assertEqual(status, 200)
        self.assertIn(b"__protoFeedback", data)

class Inject(unittest.TestCase):
    def test_the_tag_goes_in_once(self):
        with tempfile.TemporaryDirectory() as d:
            page, bare = pathlib.Path(d) / "index.html", pathlib.Path(d) / "bare.html"
            page.write_text("<html><body><p>x</p></body></html>"); bare.write_text("<p>no body tag</p>")
            fb.inject(8798, [page, bare]); fb.inject(8798, [page, bare])
            self.assertEqual(page.read_text().count("http://127.0.0.1:8798/overlay.js"), 1)
            self.assertLess(page.read_text().index("overlay.js"), page.read_text().index("</body>"))
            self.assertEqual(bare.read_text(), "<p>no body tag</p>")

if __name__ == "__main__":
    unittest.main()
