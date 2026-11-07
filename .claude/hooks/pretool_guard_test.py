import importlib.util, json, io, sys, unittest, pathlib
spec = importlib.util.spec_from_file_location("guard", pathlib.Path(__file__).with_name("pretool-guard.py"))
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)

def run(payload):
    sys.stdin = io.StringIO(json.dumps(payload)); out = io.StringIO(); sys.stdout = out
    try:
        guard.main()
    finally:
        sys.stdin = sys.__stdin__; sys.stdout = sys.__stdout__
    s = out.getvalue().strip()
    return json.loads(s)["hookSpecificOutput"]["permissionDecisionReason"] if s else None

class Bash(unittest.TestCase):
    def test_stash_denied_for_everyone(self):
        self.assertIn("stash", run({"tool_name": "Bash", "tool_input": {"command": "git stash push"}}))
    def test_local_identity_denied_global_allowed(self):
        self.assertIn("identity", run({"tool_name": "Bash", "tool_input": {"command": "git config user.email a@b"}}))
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": "git config --global user.email a@b"}}))
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": "git config --get user.email"}}))
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": "git -c user.name=t -c user.email=t@x commit -m x"}}))
    def test_push_denied_for_agents_only(self):
        self.assertIn("push", run({"tool_name": "Bash", "agent_type": "daemon-impl", "tool_input": {"command": "git -C . push origin HEAD"}}))
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": "git push"}}))
    def test_add_all_and_destructive_denied_for_agents(self):
        for c in ("git add -A", "git add .", "git add --all", "git reset --hard HEAD", "git clean -fd", "git checkout -- web/src/a.ts", "git rebase main"):
            self.assertIsNotNone(run({"tool_name": "Bash", "agent_type": "web-tests", "tool_input": {"command": c}}), c)
        self.assertIsNone(run({"tool_name": "Bash", "agent_type": "web-tests", "tool_input": {"command": "git add web/src/a.test.ts && git commit -- web/src/a.test.ts -m 'test(x): y'"}}))
        self.assertIsNone(run({"tool_name": "Bash", "agent_type": "web-tests", "tool_input": {"command": "git checkout plan/x"}}))

    def test_literals_are_not_commands(self):
        banned = "git " + "stash"   # spelled apart so this file itself never trips the guard
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": f"cat > x.md <<'EOF'\nnever run {banned} here\nEOF\necho done"}}))
        self.assertIsNone(run({"tool_name": "Bash", "agent_type": "web-impl", "tool_input": {"command": "git commit -m 'docs: why git push is the developer''s' -- a.md"}}))
        self.assertIsNone(run({"tool_name": "Bash", "tool_input": {"command": "echo \"git config user.email is never set here\""}}))
        self.assertIsNotNone(run({"tool_name": "Bash", "tool_input": {"command": f"echo start && {banned} && echo end"}}))

class Writes(unittest.TestCase):
    def w(self, agent, path, cwd="/repo"):
        return run({"tool_name": "Edit", "agent_type": agent, "cwd": cwd, "tool_input": {"file_path": path}})
    def test_impl_cannot_touch_tests_or_protocol(self):
        self.assertIsNotNone(self.w("daemon-impl", "/repo/internal/session/a_test.go"))
        self.assertIsNotNone(self.w("web-impl", "web/src/features/x.test.ts"))
        self.assertIsNotNone(self.w("web-impl", "web/e2e/x.spec.ts"))
        self.assertIsNotNone(self.w("daemon-impl", "docs/protocol.md"))
        self.assertIsNotNone(self.w("daemon-impl", "plans/x/plan.md"))
        self.assertIsNone(self.w("daemon-impl", "internal/session/a.go"))
        self.assertIsNone(self.w("daemon-impl", "plans/x/daemon-implementation.md"))
    def test_testers_write_only_their_tier(self):
        self.assertIsNone(self.w("daemon-tests", "internal/session/a_test.go"))
        self.assertIsNotNone(self.w("daemon-tests", "internal/session/a.go"))
        self.assertIsNone(self.w("web-tests", "web/src/features/x.test.ts"))
        self.assertIsNotNone(self.w("web-tests", "web/src/features/x.ts"))
        self.assertIsNone(self.w("render-tests", "web/render/x.spec.ts"))
        self.assertIsNotNone(self.w("render-tests", "web/e2e/x.spec.ts"))
        self.assertIsNone(self.w("e2e-specs", "web/e2e/helpers/fixtures.ts"))
        self.assertIsNotNone(self.w("e2e-specs", "web/src/main.ts"))
        self.assertIsNone(self.w("web-tests", "plans/x/web-tests.md"))
    def test_reviewers_write_only_their_part(self):
        self.assertIsNone(self.w("review-work", "plans/x/review.code.md"))
        self.assertIsNotNone(self.w("review-work", "internal/a.go"))
        self.assertIsNotNone(self.w("review-browser", "plans/x/review.code.md"))
    def test_main_session_and_unknown_roles_unrestricted(self):
        self.assertIsNone(self.w("", "docs/protocol.md"))
        self.assertIsNone(self.w("Explore", "internal/a_test.go"))
    def test_outside_tree_ignored(self):
        self.assertIsNone(self.w("daemon-impl", "/tmp/scratch/a_test.go"))

if __name__ == "__main__":
    unittest.main()
