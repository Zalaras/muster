//go:build renderfix

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/Zalaras/muster/internal/gitdiff"
)

func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"diff", diffScenario(driveDiff)},
		renderScenario{"diff-light", diffScenario(withPrefs(driveDiff, map[string]any{"theme": "light"}))},
		renderScenario{"diff-dark", diffScenario(withPrefs(driveDiff, map[string]any{"theme": "dark"}))},
		renderScenario{"diff-branch-only", diffScenario(driveDiffBranchOnly)},
		renderScenario{"diff-clean", diffScenario(driveDiffClean)},
		renderScenario{"diff-ended", diffScenario(driveDiffEnded)},
		renderScenario{"diff-pair", diffScenario(driveDiffPair)},
		renderScenario{"diff-long-header", diffScenario(driveDiffLongHeader)},
		renderScenario{"diff-tiles", diffScenario(withPrefs(driveDiff, map[string]any{"view": "tiles", "density": "2x2"}))},
		renderScenario{"diff-terminals", diffScenario(driveDiffTerminals)},
	)
}

const renderDiffDate = "2026-01-01T00:00:00Z"

const (
	diffPraiseBase = `import { words } from "./words";

export function pickPraise(score: number): string {
  const list = words(score);
  let lastPraise = "";
  const count = list.length;
  const index = score % count;
  // pick a praise word that is not the previous one, so repeated rounds never read as a stutter to the player
  return list[index] ?? lastPraise;
}
`
	diffPraiseNew = `import { words } from "./words";

export function pickPraise(score: number): string {
  const list = words(score);
  const previous = lastPraiseFor(score);
  const fresh = list.filter((w) => w !== previous);
  const count = fresh.length;
  const index = score % count;
  // pick a praise word that is not the previous one, so repeated rounds never read as a stammer to the player
  return fresh[index] ?? previous;
}
`
	diffUtilBase = "export function clamp(n: number, lo: number, hi: number): number {\n" +
		"  return Math.min(hi, Math.max(lo, n));\n}\n\nexport const ZERO = 0;\nexport const ONE = 1;\n"
	diffHelpersNew = "export function clamp(n: number, lo: number, hi: number): number {\n" +
		"  return Math.min(hi, Math.max(lo, n));\n}\n\nexport const ZERO = 0;\nexport const ONE = 1;\nexport const TWO = 2;\n"
	diffLegacy      = "export const legacy = true;\nexport const oldFlag = false;\n"
	diffReadmeBase  = "# Engine\n\nA small game engine.\n"
	diffReadmeNew   = "# Engine\n\nA small game engine.\n\nRun the tests with npm test.\n"
	diffNotesUntrk  = "# Notes\n\n- check the fallback word\n- ask about the retry budget\n"
	diffPraisePath  = "src/praise.ts"
	diffBranchOnlyA = "export const version = 1;\n"
	diffBranchOnlyB = "export const version = 2;\nexport const channel = \"stable\";\n"
)

func diffScenario(drive func(context.Context, *renderRig) error) func(context.Context, *renderRig) error {
	return func(ctx context.Context, r *renderRig) error {
		r.recordDiff = true
		return drive(ctx, r)
	}
}

func (r *renderRig) gitPinned(ctx context.Context, dir string, args ...string) error {
	return r.gitEnv(ctx, dir, []string{"GIT_AUTHOR_DATE=" + renderDiffDate, "GIT_COMMITTER_DATE=" + renderDiffDate}, args...)
}

func (r *renderRig) diffRepo(ctx context.Context, name string, files map[string]string) (string, error) {
	dir := filepath.Join(r.root, name)
	if err := os.Mkdir(dir, 0o755); err != nil {
		return "", err
	}
	if err := r.git(ctx, dir, "init", "-q", "-b", "main"); err != nil {
		return "", err
	}
	for rel, body := range files {
		if err := r.writeDoc(dir, rel, body); err != nil {
			return "", err
		}
	}
	if err := r.git(ctx, dir, "add", "."); err != nil {
		return "", err
	}
	return dir, r.gitPinned(ctx, dir, "commit", "-q", "-m", "base")
}

func (r *renderRig) diffBranch(ctx context.Context, dir, branch string) error {
	return r.git(ctx, dir, "checkout", "-q", "-b", branch)
}

func (r *renderRig) diffCommit(ctx context.Context, dir, message string) error {
	if err := r.git(ctx, dir, "add", "."); err != nil {
		return err
	}
	return r.gitPinned(ctx, dir, "commit", "-q", "-m", message)
}

func (r *renderRig) diffCheckout(ctx context.Context, name, branch string) (string, error) {
	dir, err := r.diffRepo(ctx, name, map[string]string{
		diffPraisePath:    diffPraiseBase,
		"src/legacy.ts":   diffLegacy,
		"src/util.ts":     diffUtilBase,
		"assets/logo.bin": "BIN\x00\x01\x02\x03",
		"README.md":       diffReadmeBase,
	})
	if err != nil {
		return "", err
	}
	if err = r.diffBranch(ctx, dir, branch); err != nil {
		return "", err
	}
	if err = r.writeDoc(dir, "README.md", diffReadmeNew); err != nil {
		return "", err
	}
	if err = r.diffCommit(ctx, dir, "document the tests"); err != nil {
		return "", err
	}
	if err = r.writeDoc(dir, diffPraisePath, diffPraiseNew); err != nil {
		return "", err
	}
	if err = os.Remove(filepath.Join(dir, "src/legacy.ts")); err != nil {
		return "", err
	}
	if err = r.git(ctx, dir, "mv", "src/util.ts", "src/helpers.ts"); err != nil {
		return "", err
	}
	if err = r.writeDoc(dir, "src/helpers.ts", diffHelpersNew); err != nil {
		return "", err
	}
	if err = r.writeDoc(dir, "assets/logo.bin", "BIN\x00\x09\x09\x09"); err != nil {
		return "", err
	}
	return dir, r.writeDoc(dir, "src/notes.md", diffNotesUntrk)
}

func (r *renderRig) putDiffComment(ctx context.Context, s renderSession, id, path string, start, end diffPos, quote []string, body string, resolved bool) error {
	_, err := r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/diff/comments/%s", s.id, id), map[string]any{
		"path":     path,
		"start":    map[string]any{"side": start.side, "line": start.line},
		"end":      map[string]any{"side": end.side, "line": end.line},
		"quote":    quote,
		"body":     body,
		"resolved": resolved,
	})
	return err
}

type diffPos struct {
	side string
	line int
}

func (r *renderRig) diffReviewFull(ctx context.Context, s renderSession, dir string) error {
	previous := "  const previous = lastPraiseFor(score);"
	fresh := "  const fresh = list.filter((w) => w !== previous);"
	if err := r.putDiffComment(ctx, s, "c-single", diffPraisePath, diffPos{"new", 10}, diffPos{"new", 10},
		[]string{"  return fresh[index] ?? previous;"}, "Should this fall back to the previous word?", false); err != nil {
		return err
	}
	if err := r.putDiffComment(ctx, s, "c-range", diffPraisePath, diffPos{"new", 5}, diffPos{"new", 6},
		[]string{previous, fresh}, "Why look the previous word up by score?", false); err != nil {
		return err
	}
	if err := r.putDiffComment(ctx, s, "c-resolved", diffPraisePath, diffPos{"old", 5}, diffPos{"old", 5},
		[]string{`  let lastPraise = "";`}, "This let is never reassigned.", true); err != nil {
		return err
	}
	if err := r.putDiffComment(ctx, s, "c-outdated", diffPraisePath, diffPos{"new", 40}, diffPos{"new", 40},
		[]string{"  return PRAISE[index];"}, "This line has since gone.", false); err != nil {
		return err
	}
	keys, err := r.diffTickKeys(ctx, dir)
	if err != nil {
		return err
	}
	_, err = r.api(ctx, http.MethodPost, fmt.Sprintf("/api/sessions/%d/diff/ticks", s.id), map[string]any{"add": keys, "remove": []string{}})
	return err
}

func (r *renderRig) diffTickKeys(ctx context.Context, dir string) ([]string, error) {
	d, err := gitdiff.NewReader().Read(ctx, dir, gitdiff.ScopeUncommitted)
	if err != nil {
		return nil, err
	}
	var keys []string
	for _, path := range []string{"src/helpers.ts", diffPraisePath} {
		for _, f := range d.Files {
			if f.Path != path {
				continue
			}
			changes := diffChangeKeys(f)
			if len(changes) == 0 {
				return nil, fmt.Errorf("no change in %s", path)
			}
			keys = append(keys, changes[0])
		}
	}
	if len(keys) != 2 {
		return nil, fmt.Errorf("want 2 tick keys, got %d", len(keys))
	}
	return keys, nil
}

func diffChangeKeys(f gitdiff.File) []string {
	var keys []string
	for _, h := range f.Hunks {
		var dels, adds []string
		flush := func() {
			if len(dels)+len(adds) > 0 {
				keys = append(keys, diffChangeKey(f.Path, dels, adds))
			}
			dels, adds = nil, nil
		}
		for _, l := range h.Lines {
			switch l.Kind {
			case "context":
				flush()
			case "del":
				dels = append(dels, l.Text)
			default:
				adds = append(adds, l.Text)
			}
		}
		flush()
	}
	return keys
}

func diffChangeKey(path string, dels, adds []string) string {
	text := path + "\n" + strings.Join(dels, "\n") + "\n\u0000\n" + strings.Join(adds, "\n")
	h1, h2 := uint32(0xdeadbeef), uint32(0x41c6ce57)
	for _, unit := range utf16.Encode([]rune(text)) {
		code := uint32(unit)
		h1 = (h1 ^ code) * 2654435761
		h2 = (h2 ^ code) * 1597334677
	}
	h1 = (h1^(h1>>16))*2246822507 ^ (h2^(h2>>13))*3266489909
	h2 = (h2^(h2>>16))*2246822507 ^ (h1^(h1>>13))*3266489909
	return fmt.Sprintf("k1:%08x%08x", h2, h1)
}

func (r *renderRig) diffSession(ctx context.Context, name string, withReview bool) (renderSession, error) {
	dir, err := r.diffCheckout(ctx, name, "feature")
	if err != nil {
		return renderSession{}, err
	}
	s, err := r.idleSessionIn(ctx, dir, name, name)
	if err != nil {
		return s, err
	}
	if withReview {
		err = r.diffReviewFull(ctx, s, dir)
	}
	return s, err
}

func driveDiff(ctx context.Context, r *renderRig) error {
	_, err := r.diffSession(ctx, "diff-app", true)
	return err
}

func driveDiffTerminals(ctx context.Context, r *renderRig) error {
	s, err := r.diffSession(ctx, "diff-app", true)
	if err != nil {
		return err
	}
	return r.driveTerminalsOn(ctx, s, 2, map[int]string{2: "build"}, map[int]bool{2: true})
}

func driveDiffEnded(ctx context.Context, r *renderRig) error {
	s, err := r.diffSession(ctx, "diff-app", true)
	if err != nil {
		return err
	}
	return r.markDead(ctx, s.id)
}

func driveDiffBranchOnly(ctx context.Context, r *renderRig) error {
	dir, err := r.diffRepo(ctx, "diff-branch-only", map[string]string{"src/version.ts": diffBranchOnlyA})
	if err != nil {
		return err
	}
	if err = r.diffBranch(ctx, dir, "feature"); err != nil {
		return err
	}
	if err = r.writeDoc(dir, "src/version.ts", diffBranchOnlyB); err != nil {
		return err
	}
	if err = r.diffCommit(ctx, dir, "bump the version"); err != nil {
		return err
	}
	_, err = r.idleSessionIn(ctx, dir, "diff-branch-only", "diff-branch-only")
	return err
}

func driveDiffClean(ctx context.Context, r *renderRig) error {
	dir, err := r.diffRepo(ctx, "diff-clean", map[string]string{"src/version.ts": diffBranchOnlyA})
	if err != nil {
		return err
	}
	if _, err = r.idleSessionIn(ctx, dir, "diff-clean", "diff-clean"); err != nil {
		return err
	}
	plain, err := r.dir(ctx, "diff-plain", "")
	if err != nil {
		return err
	}
	_, err = r.idleSessionIn(ctx, plain, "diff-plain", "diff-plain")
	return err
}

func driveDiffPair(ctx context.Context, r *renderRig) error {
	for _, name := range []string{"diff-first", "diff-second"} {
		dir, err := r.diffCheckout(ctx, name, "feature")
		if err != nil {
			return err
		}
		s, err := r.idleSessionIn(ctx, dir, name, name)
		if err != nil {
			return err
		}
		err = r.putDiffComment(ctx, s, "c-"+name, diffPraisePath, diffPos{"new", 10}, diffPos{"new", 10},
			[]string{"  return fresh[index] ?? previous;"}, "Comment on "+name+".", false)
		if err != nil {
			return err
		}
	}
	return nil
}

func driveDiffLongHeader(ctx context.Context, r *renderRig) error {
	folder := padName("a-project-folder-whose-name-runs-on", 60)
	branch := padName("feature/a-branch-name-that-keeps-going-well-past-the-card", 80)
	dir, err := r.diffCheckout(ctx, folder, branch)
	if err != nil {
		return err
	}
	s, err := r.bind(ctx, dir, "cs-fit-diff", renderModelHaiku, launchOpts{title: renderFitTitle})
	if err != nil {
		return err
	}
	if err = r.promptSubmit(ctx, s, "cs-fit-diff"); err != nil {
		return err
	}
	return r.diffReviewFull(ctx, s, dir)
}

func (r *renderRig) captureDiff(ctx context.Context) (any, error) {
	if !r.recordDiff {
		return nil, nil
	}
	rows, err := r.st.ListSessions(ctx)
	if err != nil {
		return nil, err
	}
	sortedIDs := make([]int64, 0, len(rows))
	for _, row := range rows {
		sortedIDs = append(sortedIDs, row.ID)
	}
	slices.Sort(sortedIDs)
	recordings := []any{}
	for _, id := range sortedIDs {
		entry, ok, err := r.captureDiffOf(ctx, id)
		if err != nil {
			return nil, err
		}
		if ok {
			recordings = append(recordings, entry)
		}
	}
	return recordings, nil
}

func (r *renderRig) captureDiffOf(ctx context.Context, id int64) (map[string]any, bool, error) {
	base := fmt.Sprintf("/api/sessions/%d/diff", id)
	raw, err := r.api(ctx, http.MethodGet, base+"/summary", nil)
	if err != nil {
		if strings.Contains(err.Error(), ": 409 ") {
			return nil, false, nil
		}
		return nil, false, err
	}
	summary, err := decodeFaithful(raw)
	if err != nil {
		return nil, false, err
	}
	if m, _ := summary.(map[string]any); m["repo"] != true {
		return nil, false, nil
	}
	entry := map[string]any{"sessionId": json.Number(strconv.FormatInt(id, 10)), "summary": summary}
	for key, path := range map[string]string{
		"uncommitted": base + "?scope=uncommitted",
		"branch":      base + "?scope=branch",
		"review":      base + "/review",
	} {
		body, err := r.api(ctx, http.MethodGet, path, nil)
		if err != nil {
			return nil, false, err
		}
		if entry[key], err = decodeFaithful(body); err != nil {
			return nil, false, err
		}
	}
	return entry, true, nil
}
