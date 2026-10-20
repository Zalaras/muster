//go:build renderfix

package server

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The reader scenarios (web/render/reader.spec.ts): the docs surface's display for the
// documents the reader E2E suite wrote — `buildMarkdownFixtureTree`, the inline documents
// of web/e2e/reader.spec.ts, `buildLargeMarkdownFixtureTree` and `writeMermaidFixture`
// (web/e2e/helpers/reader.ts, whose bytes now live in web/render/helpers/reader.ts) — under
// each host the reader is measured in. Every checkout is a plain directory, not a git
// repository, as the E2E scratch directories are, so the listing is the dot-directory-skipping
// walk. The bodies below are the TypeScript helper's, byte for byte;
// web/render/reader.spec.ts asserts that identity against each fixture's reader recording.
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"reader-docs", driveReaderDocs},
		renderScenario{"reader-docs-tiles-2x2", withPrefs(driveReaderDocs, map[string]any{"view": "tiles"})},
		renderScenario{"reader-docs-tiles-3x2", withPrefs(driveReaderDocs, map[string]any{"view": "tiles", "density": "3x2"})},
		// The same checkout bound through a transcript naming a plan file, so the listing's plan
		// slot is filled (kb:fact/plan-file-path-in-transcript) and the recording carries the plan.
		renderScenario{"reader-docs-plan", driveReaderDocsPlan},
		// The same checkout on an ended session: the plan slot and its header row are absent.
		renderScenario{"reader-docs-ended", driveReaderDocsEnded},
		// A tree taller than the nav: twenty files and a thirty-heading document.
		renderScenario{"reader-docs-large", driveReaderDocsLarge},
		renderScenario{"reader-docs-large-tiles-2x2", withPrefs(driveReaderDocsLarge, map[string]any{"view": "tiles"})},
		// The mermaid documents, on their own checkout: `unsafe.md` exists in both trees.
		renderScenario{"reader-diagrams", driveReaderDiagrams},
		renderScenario{"reader-diagrams-tiles-3x2", withPrefs(driveReaderDiagrams, map[string]any{"view": "tiles", "density": "3x2"})},
		renderScenario{"reader-diagrams-pair-2x2", withPrefs(driveReaderDiagramsPair, map[string]any{"view": "tiles"})},
	)
}

// readerDirName is long enough that its absolute path, which the nav's Files header shows,
// wraps inside the panel — the E2E scratch directories under the system temp root were.
const readerDirName = "reader-checkout-whose-folder-name-is-long-enough-to-wrap-the-files-header"

// driveReaderDocs is one idle session, titled `reader`, on a plain directory holding every
// reader document.
func driveReaderDocs(ctx context.Context, r *renderRig) error {
	_, err := driveReaderSession(ctx, r, readerDirName, "reader", readerDocs())
	return err
}

// driveReaderDocsPlan is driveReaderDocs bound with a SessionStart whose transcript names an
// existing plan file under the rig root, written as the E2E's `writeFakeTranscript` wrote it.
func driveReaderDocsPlan(ctx context.Context, r *renderRig) error {
	dir, err := r.dir(ctx, readerDirName, "")
	if err != nil {
		return err
	}
	for _, doc := range readerDocs() {
		if err = r.writeDoc(dir, doc.name, doc.body); err != nil {
			return err
		}
	}
	planPath := filepath.Join(r.root, "_plans", "reader-plan-slug.md")
	if err = r.writeDoc(filepath.Dir(planPath), filepath.Base(planPath), readerPlanBody); err != nil {
		return err
	}
	transcript := filepath.Join(r.root, "_transcripts", "reader.jsonl")
	if err = os.MkdirAll(filepath.Dir(transcript), 0o755); err != nil {
		return err
	}
	lines := []string{`{"type":"system","subtype":"init"}`, claudecodetest.PlanAttachmentLine("plan_mode", planPath, true)}
	if err = os.WriteFile(transcript, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		return err
	}
	const claudeID = "cs-reader-plan"
	s, err := r.launch(ctx, dir, launchOpts{title: "reader"})
	if err != nil {
		return err
	}
	if err = r.hook(ctx, claudecodetest.EnvelopedSessionStartTranscript(claudeID, transcript, claudecodetest.SessionStartOpts{
		MusterSession: int(s.id), TmuxPane: s.pane, ModelID: renderModelSonnet, Cwd: dir,
	})); err != nil {
		return err
	}
	if err = r.promptSubmit(ctx, s, claudeID); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
}

// driveReaderDocsEnded is driveReaderDocs ended the way a liveness tick would end it.
func driveReaderDocsEnded(ctx context.Context, r *renderRig) error {
	s, err := driveReaderSession(ctx, r, readerDirName, "reader", readerDocs())
	if err != nil {
		return err
	}
	return r.markDead(ctx, s.id)
}

func driveReaderDocsLarge(ctx context.Context, r *renderRig) error {
	_, err := driveReaderSession(ctx, r, "reader-large", "reader", readerLargeDocs())
	return err
}

func driveReaderDiagrams(ctx context.Context, r *renderRig) error {
	_, err := driveReaderSession(ctx, r, "reader-diagrams", "reader", readerMermaidDocs())
	return err
}

// driveReaderDiagramsPair is two mermaid sessions, `reader-a` and `reader-b`, each on its own
// checkout — the two-tile-readers state (mermaid E9).
func driveReaderDiagramsPair(ctx context.Context, r *renderRig) error {
	for _, name := range []string{"reader-a", "reader-b"} {
		if _, err := driveReaderSession(ctx, r, name, name, readerMermaidDocs()); err != nil {
			return err
		}
	}
	return nil
}

// driveReaderSession writes docs into a plain directory named dirName and binds one idle
// session titled title to it.
func driveReaderSession(ctx context.Context, r *renderRig, dirName, title string, docs []findDoc) (renderSession, error) {
	dir, err := r.dir(ctx, dirName, "")
	if err != nil {
		return renderSession{}, err
	}
	for _, doc := range docs {
		if err = r.writeDoc(dir, doc.name, doc.body); err != nil {
			return renderSession{}, err
		}
	}
	claudeID := "cs-" + title
	s, err := r.bind(ctx, dir, claudeID, renderModelSonnet, launchOpts{title: title})
	if err != nil {
		return s, err
	}
	if err = r.promptSubmit(ctx, s, claudeID); err != nil {
		return s, err
	}
	return s, r.hookStamped(ctx, claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
}

// readerPlanBody is the plan the E2E's "opens it automatically" test wrote.
const readerPlanBody = "# The Plan\n\nDo the thing.\n"

// readerFiller is the E2E's `filler` for long.md: n paragraphs joined by a blank line.
func readerFiller(n int) string {
	lines := make([]string, n)
	for i := range lines {
		lines[i] = fmt.Sprintf("Paragraph line %d of filler text to force a scrollable body.", i)
	}
	return strings.Join(lines, "\n\n")
}

// readerDocs is `MARKDOWN_TREE_DOCUMENTS` plus `READER_DOCUMENTS` (web/render/helpers/reader.ts)
// in Go: `buildMarkdownFixtureTree`'s four files and every document web/e2e/reader.spec.ts
// wrote inline, with the same bytes.
func readerDocs() []findDoc {
	const longFolder = "a-very-long-folder-name-that-overflows-the-nav"
	const longFile = "a-very-long-file-name-that-overflows-the-nav-panel.md"
	const longHeading = "A very long heading that is far wider than the outline panel can show"
	const rawInner = "tags:\n  - a\n  - b\nnotes: |\n  # Not a real heading\n  just text\n"
	filler := readerFiller(80)
	return []findDoc{
		// buildMarkdownFixtureTree
		{"TODO.md", "# TODO\n\n- [ ] one\n"},
		{"docs/adr/x.md", "# ADR X\n\nBody.\n"},
		{"notes.txt", "not markdown\n"},
		{".hidden/secret.md", "# hidden\n"},
		// reader.spec.ts inline documents
		{"gfm.md", findLines(
			"# GFM",
			"",
			"| a | b |",
			"|---|---|",
			"| 1 | 2 |",
			"",
			"- [ ] todo one",
			"- [x] todo two",
			"",
			"```js",
			"console.log('hi');",
			"```",
			"",
		)},
		{"unsafe.md", findLines(
			"# Unsafe",
			"",
			"<script>window.__readerXss = true;</script>",
			"",
			`<img src="x" onerror="window.__readerXss = true" />`,
			"",
			"[click me](javascript:window.__readerXss=true)",
			"",
		)},
		{"long.md", "# Top\n\n" + filler + "\n\n## Middle\n\n" + filler + "\n\n## Bottom\n\n" + filler + "\n"},
		{"dup.md", "# Top\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.\n"},
		{longFolder + "/" + longFile, "# Top\n\n## " + longHeading + "\n\nBody.\n"},
		{"front.md", findLines(
			"---",
			"id: reader-plan-located-by-transcript-scan",
			"tags: [claude-code-format, store]",
			"status: accepted",
			"---",
			"# Real Heading",
			"",
			"Body text.",
			"",
			"## Second Heading",
			"",
			"More text.",
			"",
		)},
		{"only-front.md", findLines("---", "solo: value", "---", "")},
		{"fm-unsafe.md", findLines(
			"---",
			`title: <img src=x onerror="window.__fmXss = true">`,
			"note: <script>window.__fmXss = true;</script>",
			"---",
			"# Heading",
			"",
			"Body text.",
			"",
		)},
		{"fm-raw.md", "---\n" + rawInner + "---\n# Real Heading\n\nBody text.\n"},
		{"wide-key.md", findLines(
			"---",
			"verified_claude_code_version: 2.1.3",
			"an_extremely_long_frontmatter_key_used_to_test_line_wrapping: value",
			"---",
			"# Heading",
			"",
			"Body text.",
			"",
		)},
	}
}

// readerLargeDocs is `buildLargeMarkdownFixtureTree` in Go: twenty top-level files and a
// thirty-heading outline document that sorts before them.
func readerLargeDocs() []findDoc {
	docs := make([]findDoc, 0, 21)
	for i := 1; i <= 20; i++ {
		docs = append(docs, findDoc{
			fmt.Sprintf("file-%02d.md", i),
			fmt.Sprintf("# File %d\n\nBody text for file %d.\n", i, i),
		})
	}
	sections := make([]string, 30)
	for i := range sections {
		h := fmt.Sprintf("Section %d", i+1)
		sections[i] = "## " + h + "\n\nParagraph text for " + h + ".\n"
	}
	docs = append(docs, findDoc{"0-outline.md", "# Outline\n\n" + strings.Join(sections, "\n\n") + "\n"})
	return docs
}

// readerMermaidDocs is `writeMermaidFixture` in Go plus the REQ-12 `interleaved.md`
// web/e2e/reader-mermaid.spec.ts wrote inline.
func readerMermaidDocs() []findDoc {
	chain := make([]string, 40)
	for i := range chain {
		chain[i] = fmt.Sprintf("N%d", i)
	}
	filler := readerFiller(40)
	return []findDoc{
		{"flow.md", "# Flow\n\n```mermaid\nflowchart TD\n  A --> B\n```\n"},
		{"broken.md", findLines(
			"# Broken",
			"",
			"```mermaid",
			"flowchart TD",
			"  A -->",
			"```",
			"",
			"```mermaid",
			"flowchart TD",
			"  C --> D",
			"```",
			"",
		)},
		{"unsafe.md", findLines(
			"# Unsafe",
			"",
			"```mermaid",
			`%%{init: {"securityLevel": "loose", "flowchart": {"htmlLabels": true}}}%%`,
			"flowchart TD",
			`  A["<script>window.__readerXss = true;</script>"]`,
			`  B["<img src=x onerror='window.__readerXss = true' />"]`,
			"  A --> B",
			`  click A "javascript:window.__readerXss=true" "click"`,
			"```",
			"",
		)},
		{"kinds.md", findLines(
			"# Kinds",
			"",
			"```mermaid",
			"C4Context",
			`  Person(user, "User")`,
			`  System(sys, "System")`,
			`  Rel(user, sys, "Uses")`,
			"```",
			"",
			"```mermaid",
			"C4Container",
			`  Person(user, "User")`,
			`  Container(app, "App", "Go")`,
			`  Rel(user, app, "Uses")`,
			"```",
			"",
			"```mermaid",
			"C4Component",
			`  Person(user, "User")`,
			`  Component(comp, "Component")`,
			`  Rel(user, comp, "Uses")`,
			"```",
			"",
			"```mermaid",
			"classDiagram",
			"  class Animal",
			"  Animal : +String name",
			"```",
			"",
			"```mermaid",
			"stateDiagram-v2",
			"  [*] --> Idle",
			"  Idle --> Done",
			"```",
			"",
			"```mermaid",
			"sequenceDiagram",
			"  Alice->>Bob: Hello",
			"```",
			"",
			"```mermaid",
			"erDiagram",
			"  CUSTOMER ||--o{ ORDER : places",
			"```",
			"",
			"```mermaid",
			"flowchart TD",
			"  E --> F",
			"```",
			"",
			"```Mermaid",
			"flowchart TD",
			"  G --> H",
			"```",
			"",
			"```mermaid title=x",
			"flowchart TD",
			"  I --> J",
			"```",
			"",
			"> ```mermaid",
			"> flowchart TD",
			"> K --> L",
			"> ```",
			"",
			"```mermaid",
			"flowchart TD",
			"  M --> N",
			"```",
			"",
			"```mermaid",
			"flowchart TD",
			"  M --> N",
			"```",
			"",
		)},
		{"elk.md", findLines(
			"# ELK",
			"",
			"```mermaid",
			"---",
			"config:",
			"  layout: elk",
			"---",
			"flowchart TD",
			"  A --> B --> C",
			"```",
			"",
			"```mermaid",
			"flowchart TD",
			"  X --> Y",
			"```",
			"",
		)},
		{"wide.md", "# Wide\n\n```mermaid\nflowchart LR\n  " + strings.Join(chain, " --> ") + "\n```\n"},
		{"plain.md", "# Plain\n\nNo diagrams here.\n"},
		{"interleaved.md", findLines(
			"# Top",
			"",
			"## Alpha",
			"",
			filler,
			"",
			"```mermaid",
			"flowchart TD",
			"  A --> B",
			"```",
			"",
			"## Beta",
			"",
			filler,
			"",
			"```mermaid",
			"flowchart TD",
			"  C -->",
			"```",
			"",
			"## Gamma",
			"",
			filler,
			"",
		)},
	}
}
