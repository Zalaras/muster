package queue

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

var cliBin string

// TestMain roots all scratch repos under ~/.muster-spikes/s3-queue (never /tmp) and
// builds the CLI once for the crash-restart matrix.
func TestMain(m *testing.M) {
	home, _ := os.UserHomeDir()
	root := filepath.Join(home, ".muster-spikes", "s3-queue", "tmp")
	_ = os.RemoveAll(root)
	if err := os.MkdirAll(root, 0o700); err != nil {
		panic(err)
	}
	os.Setenv("TMPDIR", root)
	cliBin = filepath.Join(root, "queue-cli")
	if out, err := exec.Command("go", "build", "-o", cliBin, "../cmd/queue").CombinedOutput(); err != nil {
		panic(string(out))
	}
	os.Exit(m.Run())
}

func run(t *testing.T, dir string, args ...string) string {
	t.Helper()
	out, err := git(dir, args...)
	if err != nil {
		t.Fatalf("%v", err)
	}
	return out
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func commitAll(t *testing.T, dir, msg string) {
	t.Helper()
	run(t, dir, "add", "-A")
	run(t, dir, "commit", "-q", "-m", msg)
}

// newRepo builds: main {f.txt, g.txt, ok.txt}; branches off the initial main:
//
//	clean            adds new.txt                         (merges cleanly)
//	conflict         f.txt line 2 -> X                    (conflicts with main's M)
//	conflict-twin    same f.txt change + y.txt            (identical conflict, for rerere)
//	conflict-breaks  same f.txt change, deletes ok.txt    (rerere replay then verify fails)
//	breaks           deletes ok.txt                       (verify fails, no conflict)
//
// then main advances with f.txt line 2 -> M. Primary worktree stays on main.
func newRepo(t *testing.T) string {
	t.Helper()
	repo := filepath.Join(t.TempDir(), "repo")
	if _, err := git(".", "init", "-q", "-b", "main", repo); err != nil {
		t.Fatal(err)
	}
	run(t, repo, "config", "user.name", "spike")
	run(t, repo, "config", "user.email", "spike@x")
	write(t, repo, "f.txt", "a\nb\nc\n")
	write(t, repo, "g.txt", "1\n2\n3\n")
	write(t, repo, "ok.txt", "ok\n")
	commitAll(t, repo, "base")
	branch := func(name string, edit func()) {
		run(t, repo, "checkout", "-q", "-b", name, "main")
		edit()
		commitAll(t, repo, name)
	}
	branch("clean", func() { write(t, repo, "new.txt", "new\n") })
	branch("conflict", func() { write(t, repo, "f.txt", "a\nX\nc\n") })
	branch("conflict-twin", func() { write(t, repo, "f.txt", "a\nX\nc\n"); write(t, repo, "y.txt", "y\n") })
	branch("conflict-breaks", func() { write(t, repo, "f.txt", "a\nX\nc\n"); os.Remove(filepath.Join(repo, "ok.txt")) })
	branch("breaks", func() { os.Remove(filepath.Join(repo, "ok.txt")) })
	run(t, repo, "checkout", "-q", "main")
	write(t, repo, "f.txt", "a\nM\nc\n")
	commitAll(t, repo, "main moves")
	return repo
}

const verifyOK = "test -f ok.txt"

func open(t *testing.T, repo, verify string) *Queue {
	t.Helper()
	q, err := Open(&Queue{Repo: repo, VerifyCmd: verify, Logf: t.Logf})
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func mustClean(t *testing.T, q *Queue) {
	t.Helper()
	if ok, why := isClean(q.Worktree()); !ok {
		t.Fatalf("integration worktree not clean: %s", why)
	}
}

func wantState(t *testing.T, e *Entry, s State) {
	t.Helper()
	if e.State != s {
		t.Fatalf("state = %s, want %s (reason=%q log=%v)", e.State, s, e.Reason, e.Log)
	}
}

func sha(t *testing.T, repo, rev string) string {
	t.Helper()
	return run(t, repo, "rev-parse", rev)
}

func TestCleanMergeFastForwardsCheckedOutMain(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e, err := q.Run("clean")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if sha(t, repo, "main^") != before {
		t.Fatalf("main should advance by exactly one commit")
	}
	if e.VerifiedTree == "" || e.VerifiedTree != e.MergeTree || e.TreeMismatch {
		t.Fatalf("verified_tree=%s merge_tree=%s mismatch=%v", e.VerifiedTree, e.MergeTree, e.TreeMismatch)
	}
	if sha(t, repo, "main^{tree}") != e.MergeTree {
		t.Fatal("main's tree is not the merge tree")
	}
	// The primary worktree has main checked out: its files must follow the fast-forward.
	if _, err := os.Stat(filepath.Join(repo, "new.txt")); err != nil {
		t.Fatal("primary worktree did not receive new.txt")
	}
	if out := run(t, repo, "status", "--porcelain"); out != "" {
		t.Fatalf("primary worktree dirty after ff: %s", out)
	}
	if *e.VerifyExit != 0 {
		t.Fatalf("verify exit %d", *e.VerifyExit)
	}
}

func TestCleanMergeWhenMainNotCheckedOut(t *testing.T) {
	repo := newRepo(t)
	run(t, repo, "checkout", "-q", "clean") // the user's worktree owns the candidate branch
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e, err := q.Run("clean")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if sha(t, repo, "main^") != before || sha(t, repo, "main^{tree}") != e.MergeTree {
		t.Fatal("main not fast-forwarded via update-ref")
	}
	if run(t, repo, "branch", "--show-current") != "clean" {
		t.Fatal("primary worktree was disturbed")
	}
}

func TestVerifyFailureLeavesMainUntouched(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e, err := q.Run("breaks")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Failed)
	mustClean(t, q)
	if sha(t, repo, "main") != before {
		t.Fatal("main moved on verify failure")
	}
	if e.VerifyExit == nil || *e.VerifyExit == 0 || !strings.Contains(e.Reason, "verify exited") {
		t.Fatalf("verify failure not captured: exit=%v reason=%q", e.VerifyExit, e.Reason)
	}
	if _, err := os.Stat(filepath.Join(q.entryDir("breaks"), "verify.log")); err != nil {
		t.Fatal("verify.log missing")
	}
	if e.MergeCommit != "" {
		t.Fatal("must not squash-commit on verify failure")
	}
}

func TestEmptyVerifyStopsAtAwaitingConfirm(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, "")
	e, err := q.Run("clean")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, AwaitingConfirm)
	mustClean(t, q)
	if sha(t, repo, "main") != before {
		t.Fatal("main moved without confirm")
	}
	// A second Run without confirm is a no-op.
	if e, _ = q.Run("clean"); e.State != AwaitingConfirm {
		t.Fatalf("unconfirmed entry progressed to %s", e.State)
	}
	if err := q.Confirm("clean"); err != nil {
		t.Fatal(err)
	}
	if e, err = q.Run("clean"); err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if sha(t, repo, "main^") != before || e.MergeTree != e.VerifiedTree {
		t.Fatal("confirmed merge did not land as verified tree")
	}
}

func TestConflictParksEntryThenResolutionLands(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e, err := q.Run("conflict")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, AwaitingResolution)
	mustClean(t, q)
	if sha(t, repo, "main") != before {
		t.Fatal("main moved on conflict")
	}
	if strings.Join(e.Conflicts, ",") != "f.txt" || strings.Join(e.MergeTreeConflicts, ",") != "f.txt" {
		t.Fatalf("conflicts=%v merge_tree_conflicts=%v", e.Conflicts, e.MergeTreeConflicts)
	}
	if e.RerereIDs["f.txt"] == "" {
		t.Fatalf("rr-cache id not captured: %v", e.RerereIDs)
	}
	blob, err := os.ReadFile(filepath.Join(q.entryDir("conflict"), "conflicts", "f.txt"))
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range []string{"<<<<<<<", "=======", ">>>>>>>", "\nM\n", "\nX\n"} {
		if !strings.Contains(string(blob), m) {
			t.Fatalf("conflict blob lacks %q:\n%s", m, blob)
		}
	}
	// Second Run without a resolution stays parked.
	if e, _ = q.Run("conflict"); e.State != AwaitingResolution {
		t.Fatalf("parked entry progressed to %s", e.State)
	}
	if err := q.Resolve("conflict", "f.txt", []byte("a\nXM\nc\n")); err != nil {
		t.Fatal(err)
	}
	if e, err = q.Run("conflict"); err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if got := run(t, repo, "show", "main:f.txt"); got != "a\nXM\nc" {
		t.Fatalf("main f.txt = %q", got)
	}
	if sha(t, repo, "main^") != before || len(e.ResolutionsApplied) != 1 {
		t.Fatalf("resolution landing wrong: applied=%v", e.ResolutionsApplied)
	}
}

// parkAndResolve drives branch to awaiting-resolution, supplies the hand resolution for
// f.txt and runs again, so that the rebase records the resolution in rerere.
func parkAndResolve(t *testing.T, q *Queue, branch string) *Entry {
	t.Helper()
	if e, _ := q.Run(branch); e.State != AwaitingResolution {
		t.Fatalf("setup: %s", e.State)
	}
	if err := q.Resolve(branch, "f.txt", []byte("a\nXM\nc\n")); err != nil {
		t.Fatal(err)
	}
	e, err := q.Run(branch)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

// TestRerereReplaysIdenticalConflict: conflict-breaks is hand-resolved (rerere records
// it) but fails verify. Against the same main, (1) the owner fixes verify and requeues
// the branch — rerere pre-resolves the identical conflict with no human; (2) a twin
// branch with the same conflict is also pre-resolved and lands.
func TestRerereReplaysIdenticalConflict(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e := parkAndResolve(t, q, "conflict-breaks")
	wantState(t, e, Failed) // verify: ok.txt missing
	if len(e.RerereReplayed) != 0 || len(e.RerereForgotten) != 0 || len(e.ResolutionsApplied) != 1 {
		t.Fatalf("hand resolution must not be counted as a replay or forgotten: %+v", e)
	}
	// (1) owner fixes verify on top of the same first commit, requeues.
	run(t, repo, "checkout", "-q", "conflict-breaks")
	write(t, repo, "ok.txt", "ok\n")
	commitAll(t, repo, "restore ok.txt")
	run(t, repo, "checkout", "-q", "main")
	if err := q.Requeue("conflict-breaks"); err != nil {
		t.Fatal(err)
	}
	e, err := q.Run("conflict-breaks")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if strings.Join(e.RerereReplayed, ",") != "f.txt" || len(e.ResolutionsApplied) != 0 {
		t.Fatalf("replayed=%v applied=%v", e.RerereReplayed, e.ResolutionsApplied)
	}
	if got := run(t, repo, "show", "main:f.txt"); got != "a\nXM\nc" || sha(t, repo, "main^") != before {
		t.Fatalf("main f.txt = %q", got)
	}
}

func TestRerereReplaysForTwinBranch(t *testing.T) {
	repo := newRepo(t)
	q := open(t, repo, verifyOK)
	wantState(t, parkAndResolve(t, q, "conflict-breaks"), Failed) // resolution recorded, main untouched
	before := sha(t, repo, "main")
	e, err := q.Run("conflict-twin")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if strings.Join(e.RerereReplayed, ",") != "f.txt" || sha(t, repo, "main^") != before {
		t.Fatalf("replayed=%v", e.RerereReplayed)
	}
	if run(t, repo, "show", "main:f.txt") != "a\nXM\nc" || run(t, repo, "show", "main:y.txt") != "y" {
		t.Fatal("twin content wrong on main")
	}
}

// TestVerifyFailureAfterReplayForgetsRerere: a replayed resolution that then fails
// verify is forgotten, so the next attempt asks a human again instead of replaying.
func TestVerifyFailureAfterReplayForgetsRerere(t *testing.T) {
	repo := newRepo(t)
	q := open(t, repo, verifyOK)
	wantState(t, parkAndResolve(t, q, "conflict-breaks"), Failed)
	before := sha(t, repo, "main")
	if err := q.Requeue("conflict-breaks"); err != nil {
		t.Fatal(err)
	}
	e, err := q.Run("conflict-breaks") // replay resolves f.txt, verify fails again
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Failed)
	mustClean(t, q)
	if strings.Join(e.RerereReplayed, ",") != "f.txt" || strings.Join(e.RerereForgotten, ",") != "f.txt" {
		t.Fatalf("replayed=%v forgotten=%v", e.RerereReplayed, e.RerereForgotten)
	}
	if sha(t, repo, "main") != before {
		t.Fatal("main moved")
	}
	// The forgotten resolution must no longer replay: the twin now parks.
	e, err = q.Run("conflict-twin")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, AwaitingResolution)
	mustClean(t, q)
	if len(e.RerereReplayed) != 0 {
		t.Fatalf("resolution still replayed after forget: %v", e.RerereReplayed)
	}
}

func TestTreeMismatchRefusesFastForward(t *testing.T) {
	repo := newRepo(t)
	before := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	// Forge an entry that claims verify ran on a different tree than the squash produces.
	e, _ := q.Enqueue("clean")
	e.BranchSHA, e.BaseTarget = sha(t, repo, "clean"), before
	e.RebasedSHA = e.BranchSHA // clean rebases to itself... but its parent is not main; the
	// squash therefore yields clean's tree merged onto main, not the forged verified tree.
	e.VerifiedTree, e.TargetBefore = sha(t, repo, "main^{tree}"), before
	if err := q.transition(e, Merging); err != nil {
		t.Fatal(err)
	}
	e, err := q.Run("clean")
	if !e.TreeMismatch || e.State != Failed || err == nil {
		t.Fatalf("mismatch=%v state=%s err=%v", e.TreeMismatch, e.State, err)
	}
	if sha(t, repo, "main") != before {
		t.Fatal("main moved despite tree mismatch")
	}
	mustClean(t, q)
}

// runCLI runs the built CLI against repo/branch with the given crash point.
func runCLI(t *testing.T, repo, branch, crashAt string) (int, string) {
	t.Helper()
	cmd := exec.Command(cliBin, "-verify", verifyOK, repo, branch)
	cmd.Env = append(os.Environ(), "MUSTER_QUEUE_CRASH_AFTER="+crashAt)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return 0, string(out)
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode(), string(out)
	}
	t.Fatal(err)
	return -1, ""
}

// TestCrashRestartMatrix kills the queue at every crash point (after a state is
// persisted, or after a side effect but before the next persist), then restarts it and
// requires the same end result as an uninterrupted run.
func TestCrashRestartMatrix(t *testing.T) {
	points := []struct {
		at        string
		persisted State
	}{
		{"rebasing", Rebasing},
		{"rebased", Rebasing}, // rebase done, verifying not yet persisted
		{"verifying", Verifying},
		{"verified", Verifying}, // verify passed, merging not yet persisted
		{"merging", Merging},
		{"committed", Merging}, // squash commit exists, main not yet moved
		{"ff", Merging},        // main moved, done not yet persisted
	}
	for _, p := range points {
		t.Run(p.at, func(t *testing.T) {
			repo := newRepo(t)
			before := sha(t, repo, "main")
			code, out := runCLI(t, repo, "clean", p.at)
			if code != 3 {
				t.Fatalf("expected crash exit 3, got %d:\n%s", code, out)
			}
			q := open(t, repo, verifyOK) // Open resets the worktree, as the daemon would on start
			e, err := q.Load("clean")
			if err != nil || e == nil || e.State != p.persisted {
				t.Fatalf("persisted state after crash = %v (err %v), want %s", e, err, p.persisted)
			}
			if p.at == "ff" && sha(t, repo, "main") == before {
				t.Fatal("ff crash point should have moved main already")
			}
			if p.at != "ff" && sha(t, repo, "main") != before {
				t.Fatal("main moved before the ff step")
			}
			code, out = runCLI(t, repo, "clean", "")
			if code != 0 {
				t.Fatalf("restart failed (%d):\n%s", code, out)
			}
			e, _ = q.Load("clean")
			wantState(t, e, Done)
			mustClean(t, q)
			if sha(t, repo, "main^") != before {
				t.Fatalf("main should be exactly one commit past %s", before)
			}
			if sha(t, repo, "main^{tree}") != e.VerifiedTree || e.MergeTree != e.VerifiedTree {
				t.Fatal("landed tree differs from verified tree")
			}
			if run(t, repo, "show", "main:new.txt") != "new" {
				t.Fatal("clean's change missing from main")
			}
			t.Logf("%s: recovered via %v", p.at, e.Log)
		})
	}
}

func TestMainMovedDuringMergeRequeues(t *testing.T) {
	repo := newRepo(t)
	code, out := runCLI(t, repo, "clean", "merging")
	if code != 3 {
		t.Fatalf("expected crash, got %d:\n%s", code, out)
	}
	// Someone else lands on main while we are down.
	write(t, repo, "other.txt", "other\n")
	commitAll(t, repo, "someone else")
	other := sha(t, repo, "main")
	q := open(t, repo, verifyOK)
	e, err := q.Run("clean")
	if err != nil {
		t.Fatal(err)
	}
	wantState(t, e, Done)
	mustClean(t, q)
	if sha(t, repo, "main^") != other || e.Attempt != 2 {
		t.Fatalf("expected a re-rebase onto the moved main (attempt=%d)", e.Attempt)
	}
	if run(t, repo, "show", "main:other.txt") != "other" || run(t, repo, "show", "main:new.txt") != "new" {
		t.Fatal("main lacks one of the two changes")
	}
}
