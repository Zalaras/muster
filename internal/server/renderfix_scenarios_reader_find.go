//go:build renderfix

package server

import (
	"context"
	"fmt"
	"strings"

	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
)

// The reader-find scenarios (web/render/reader-find.spec.ts): one idle session whose
// checkout holds every find document the E2E suite wrote with `writeFindFixtures`
// (web/render/helpers/reader-find.ts, FIND_FILES), under each host the find bar is measured
// in — Focus, Tiles at both densities, a pair of tiles — and under each theme. The bodies
// below are the TypeScript helper's, byte for byte, so the recorded documents are the ones
// the E2E tests searched; web/render/reader-find.spec.ts asserts that identity at run time.
func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"find-docs", driveFindDocs},
		renderScenario{"find-docs-tiles-2x2", withPrefs(driveFindDocs, map[string]any{"view": "tiles"})},
		renderScenario{"find-docs-tiles-3x2", withPrefs(driveFindDocs, map[string]any{"view": "tiles", "density": "3x2"})},
		renderScenario{"find-docs-pair-2x2", withPrefs(driveFindDocsPair, map[string]any{"view": "tiles"})},
		// The dashboard adopts a theme only from the prefs broadcast (web/src/features/theme.ts),
		// as it does density, so each theme the tokens are checked under is its own fixture.
		renderScenario{"find-docs-instrument", withPrefs(driveFindDocs, map[string]any{"theme": "instrument"})},
		renderScenario{"find-docs-dark", withPrefs(driveFindDocs, map[string]any{"theme": "dark"})},
		renderScenario{"find-docs-light", withPrefs(driveFindDocs, map[string]any{"theme": "light"})},
	)
}

// driveFindDocs is one idle session, titled `find`, on a checkout holding every find document.
func driveFindDocs(ctx context.Context, r *renderRig) error {
	return driveFindSession(ctx, r, "find")
}

// driveFindDocsPair is two such sessions, `find-a` and `find-b`, each on its own checkout —
// the two-tile-readers state (E16, E17).
func driveFindDocsPair(ctx context.Context, r *renderRig) error {
	for _, name := range []string{"find-a", "find-b"} {
		if err := driveFindSession(ctx, r, name); err != nil {
			return err
		}
	}
	return nil
}

func driveFindSession(ctx context.Context, r *renderRig, name string) error {
	dir, err := r.dir(ctx, name, "main")
	if err != nil {
		return err
	}
	for _, doc := range findDocs() {
		if err = r.writeDoc(dir, doc.name, doc.body); err != nil {
			return err
		}
	}
	claudeID := "cs-" + name
	s, err := r.bind(ctx, dir, claudeID, renderModelSonnet, launchOpts{title: name})
	if err != nil {
		return err
	}
	if err = r.promptSubmit(ctx, s, claudeID); err != nil {
		return err
	}
	return r.hookStamped(ctx, claudecodetest.RawStop(claudeID, claudecodetest.StopOpts{}))
}

type findDoc struct {
	name, body string
}

const findFiller = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor"

// findLines joins lines with "\n" exactly as the TypeScript helper's `[...].join("\n")` does:
// a trailing empty element gives the file its final newline.
func findLines(lines ...string) string { return strings.Join(lines, "\n") }

// findTallBody is `tallBody(heading, count, needles)`: `count` paragraphs, each index in
// `needles` carrying the word `Needle`.
func findTallBody(heading string, count int, needles ...int) string {
	lines := []string{"# " + heading, ""}
	for i := 1; i <= count; i++ {
		word := "filler"
		for _, n := range needles {
			if n == i {
				word = "Needle"
			}
		}
		lines = append(lines, fmt.Sprintf("Paragraph %d holds a %s amid %s %s.", i, word, findFiller, findFiller), "")
	}
	return findLines(lines...)
}

// findDocs is `writeFindFixtures` (web/render/helpers/reader-find.ts) in Go: the same
// twelve documents with the same bytes.
func findDocs() []findDoc {
	crowdWords := make([]string, 40)
	for i := range crowdWords {
		crowdWords[i] = "heron"
	}
	crowdHeading := strings.Join(crowdWords, " ")

	columns := make([]string, 60)
	cells := make([]string, 60)
	dashes := make([]string, 60)
	for i := range columns {
		columns[i] = fmt.Sprintf("c%d", i+1)
		cells[i] = fmt.Sprintf("v%d", i+1)
		dashes[i] = "---"
	}
	cells[59] = "tablefar"
	words := make([]string, 75)
	for i := range words {
		words[i] = fmt.Sprintf("word%d", i+1)
	}

	lateLines := []string{"# Late diagram document", ""}
	for i := 1; i <= 30; i++ {
		lateLines = append(lateLines, fmt.Sprintf("Paragraph %d holds filler amid %s %s.\n", i, findFiller, findFiller))
	}
	lateLines = append(lateLines,
		"```mermaid",
		"flowchart TD",
		"  A[Zorblax] --> B[Plain node]",
		"```",
		"",
		"After the diagram one: zorblax.",
		"",
		"After the diagram two: ZORBLAX.",
		"",
	)

	return []findDoc{
		{"find-fixture.md", findLines(
			"---",
			"animal: quokka",
			"status: draft",
			"---",
			"# Find fixture",
			"",
			"A QUOKKA sat on the log beside the river.",
			"",
			"The notes live in find-fixture.md and FIND-FIXTURE.MD names the same file.",
			"",
			"```text",
			`const pet = "Quokka";`,
			"```",
			"",
		)},
		{"tall.md", findTallBody("Tall document", 80, 3, 40, 78)},
		{"deep.md", findTallBody("Deep document", 90, 50, 70)},
		{"literal.md", findLines(
			"# Literal document",
			"",
			"The strings abc and a.c and A.C and a*c and (x) all sit here.",
			"",
		)},
		{"plain.md", findLines("# Plain document", "", "Alpha beta ALPHA gamma alpha.", "")},
		{"fm-flat.md", findLines(
			"---",
			"animal: quokka",
			"status: draft",
			"---",
			"# Flat document",
			"",
			"The quokka waits here.",
			"",
		)},
		{"fm-raw.md", findLines(
			"---",
			"tags:",
			"  - a",
			"  - b",
			"notes: |",
			"  the quokka hides in the raw block",
			"---",
			"# Raw document",
			"",
			"A quokka in the body too.",
			"",
		)},
		{"diagram-find.md", findLines(
			"# Diagram document",
			"",
			"```mermaid",
			"flowchart TD",
			"  A[Zorblax] --> B[Plain node]",
			"```",
			"",
		)},
		{"crowd.md", findLines("# "+crowdHeading, "", "A closing paragraph with no match in it.", "")},
		{"frontline.md", findLines(
			"---",
			"animal: heron",
			"status: draft",
			"---",
			"# Frontline document",
			"",
			"The heron waits here.",
			"",
		)},
		{"wide.md", findLines(
			"# Wide document",
			"",
			"A short paragraph before the wide parts.",
			"",
			"```text",
			strings.Join(words, " ")+" codefar",
			"```",
			"",
			"| "+strings.Join(columns, " | ")+" |",
			"| "+strings.Join(dashes, " | ")+" |",
			"| "+strings.Join(cells, " | ")+" |",
			"",
			"A short paragraph after the wide parts.",
			"",
		)},
		{"late-diagram.md", findLines(lateLines...)},
	}
}
