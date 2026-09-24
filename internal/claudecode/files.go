package claudecode

import "encoding/json"

// FileSignal is the neutral file-change vocabulary the reader feature (kb:spec/reader)
// derives from one persisted event's payload: internal/server never reads
// transcript_path, tool_name or tool_input.file_path directly (CLAUDE.md hard rule) —
// only these fields.
type FileSignal struct {
	// TranscriptPath is the event's own transcript_path — every hook carries it
	// (kb:fact/hook-payload-fields).
	TranscriptPath string
	// WrittenPath is tool_input.file_path for a PostToolUse Write, Edit or MultiEdit —
	// "" for every other event (kb:fact/plan-file-path-in-transcript's "plans are
	// written with Write" measurement, applied here to Edit/MultiEdit by inference).
	WrittenPath string
	// PlanMaybeReady is true on SessionStart, on PreToolUse/PostToolUse of
	// ExitPlanMode, and on a WrittenPath under the default plans directory — the
	// reader's bounded scan triggers (kb:spec/reader), never on every hook.
	PlanMaybeReady bool
}

// InterpretFiles derives FileSignal for one persisted event. eventType is the event
// type column's value (a hook_event_name verbatim); payload is its verbatim inner JSON.
// This and LocatePlanFile are the only functions that read transcript_path, tool_name or
// tool_input.file_path.
func InterpretFiles(eventType string, payload []byte) FileSignal {
	var f struct {
		TranscriptPath string `json:"transcript_path"`
		ToolName       string `json:"tool_name"`
		ToolInput      struct {
			FilePath string `json:"file_path"`
		} `json:"tool_input"`
	}
	_ = json.Unmarshal(payload, &f)

	sig := FileSignal{TranscriptPath: f.TranscriptPath}

	switch eventType {
	case "SessionStart":
		sig.PlanMaybeReady = true
	case "PreToolUse", "PostToolUse":
		if f.ToolName == "ExitPlanMode" {
			sig.PlanMaybeReady = true
		}
		if eventType == "PostToolUse" {
			switch f.ToolName {
			case "Write", "Edit", "MultiEdit":
				sig.WrittenPath = f.ToolInput.FilePath
			}
		}
	}
	if sig.WrittenPath != "" && IsUnderDefaultPlansDir(sig.WrittenPath) {
		sig.PlanMaybeReady = true
	}
	return sig
}
