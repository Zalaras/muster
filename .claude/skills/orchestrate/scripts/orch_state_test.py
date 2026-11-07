"""Unit tests for orch-state.py's review filtering (critic strikes, confidence thresholds).
Run by `make hooks-test`."""
import importlib.util, pathlib, tempfile, unittest
spec = importlib.util.spec_from_file_location("orch", pathlib.Path(__file__).with_name("orch-state.py"))
orch = importlib.util.module_from_spec(spec); spec.loader.exec_module(orch)

PART = """# Correctness review: x

**Verdict**: needs-changes

## Issues

### Critical
1. **[daemon-impl]** gate red `internal/a.go:10` — must be green
   id: internal/a.go:run:gate red | confidence: 95

### Major
1. **[web-impl]** second copy of setText `web/src/x.ts:40`
   id: web/src/x.ts:setText:duplicate helper | confidence: 90
2. **[web-impl]** maybe a race in the ticker `web/src/t.ts:12`
   id: web/src/t.ts:tick:possible race | confidence: 55
3. **[orchestrator]** TODO.md tick missing
   id: TODO.md:entry:tick missing | confidence: 40
4. **[daemon-impl]** old format issue without an id line

### Minor
1. **[web-impl]** naming nit `web/src/x.ts:3`
   id: web/src/x.ts:name:nit | confidence: 30

### Notes
1. **[note]** fine
"""

class Filter(unittest.TestCase):
    def test_strikes_and_thresholds(self):
        body, struck, below = orch.filter_part(PART, {"web/src/x.ts:setText:duplicate helper"})
        self.assertEqual([s for s, _ in struck], ["Major"])
        self.assertEqual(sorted(s for s, _ in below), ["Major", "Minor"])        # 55 < 80, 30 < 60
        self.assertIn("gate red", body)                                           # Critical has no threshold
        self.assertIn("TODO.md tick missing", body)                               # orchestrator items are never demoted
        self.assertIn("old format issue", body)                                   # no id line: kept
        self.assertNotIn("second copy of setText", body)
        self.assertNotIn("possible race", body)
        self.assertTrue(orch.has_blocking_issue(body))                            # the Critical still blocks
    def test_no_strikes_keeps_high_confidence(self):
        body, struck, below = orch.filter_part(PART, set())
        self.assertEqual(struck, [])
        self.assertIn("second copy of setText", body)
    def test_critic_table_parse(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d); (p / "review.critic.md").write_text(
                "# Review critic: x\n\n## Struck\n\n| id | part | reason | hunk |\n|---|---|---|---|\n| `web/src/x.ts:setText:duplicate helper` | code | imported, not copied | `x.ts:40` |\n\n## Kept\n3 findings stand.\n")
            self.assertEqual(orch.critic_strikes(p), {"web/src/x.ts:setText:duplicate helper"})
            self.assertEqual(orch.critic_strikes(pathlib.Path(d) / "nope"), set())

if __name__ == "__main__":
    unittest.main()
