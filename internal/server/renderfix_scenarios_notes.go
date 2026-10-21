//go:build renderfix

package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

func init() {
	renderScenarios = append(renderScenarios,
		renderScenario{"notes", driveNotes},
		renderScenario{"notes-tiles", withPrefs(driveNotes, map[string]any{"view": "tiles", "density": "2x2"})},
		renderScenario{"notes-strip", withPrefs(driveNotesStrip, map[string]any{"view": "tiles", "density": "2x2"})},
	)
}

const renderNoteShort = "Waiting on review.\nNext: ask about the **retry** budget."

var renderNoteLong = "---\ntitle: Rostering retry plan\nstatus: draft\n---\n\n" +
	"# Where I am\n\n" +
	"The retry budget is the open question.\n\n" +
	"```mermaid\nflowchart LR\n  A[Request] --> B{Retry?}\n  B -->|yes| A\n  B -->|no| C[Fail]\n```\n\n" +
	strings.Join(numberedNoteLines(24), "\n") + "\n"

const renderNoteEnded = "Session ended mid-review.\nResume after the weekend."

func numberedNoteLines(n int) []string {
	lines := make([]string, n)
	for i := range lines {
		lines[i] = fmt.Sprintf("%d. Follow-up item number %d for the next prompt", i+1, i+1)
	}
	return lines
}

func (r *renderRig) setNote(ctx context.Context, s renderSession, note string) error {
	_, err := r.api(ctx, http.MethodPut, fmt.Sprintf("/api/sessions/%d/note", s.id), map[string]any{"note": note})
	return err
}

func driveNotes(ctx context.Context, r *renderRig) error {
	if _, err := r.idleSession(ctx, "notes-plain"); err != nil {
		return err
	}
	short, err := r.idleSession(ctx, "notes-short")
	if err != nil {
		return err
	}
	if err = r.setNote(ctx, short, renderNoteShort); err != nil {
		return err
	}
	long, err := r.idleSession(ctx, "notes-long")
	if err != nil {
		return err
	}
	if err = r.setNote(ctx, long, renderNoteLong); err != nil {
		return err
	}
	ended, err := r.idleSession(ctx, "notes-ended")
	if err != nil {
		return err
	}
	if err = r.setNote(ctx, ended, renderNoteEnded); err != nil {
		return err
	}
	if err = r.markDead(ctx, ended.id); err != nil {
		return err
	}
	return r.pin(ctx, short)
}

func driveNotesStrip(ctx context.Context, r *renderRig) error {
	for _, name := range []string{"grid-plain-1", "grid-noted", "grid-plain-2", "grid-plain-3", "strip-noted", "strip-plain"} {
		s, err := r.idleSession(ctx, name)
		if err != nil {
			return err
		}
		if !strings.HasSuffix(name, "-noted") {
			continue
		}
		if err = r.setNote(ctx, s, renderNoteShort); err != nil {
			return err
		}
	}
	return nil
}
